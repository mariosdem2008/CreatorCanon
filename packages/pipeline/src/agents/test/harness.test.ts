import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../env-files';
import { runAgent } from '../harness';
import { _resetRegistryForTests, registerAllTools } from '../tools/registry';
import { seedTestRun, teardownTestRun, type SeedResult } from '../../../test-helpers/fixtures';
import type { AgentProvider, ChatResponse } from '../providers';
import { getDb, eq } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';

/** Build a stub R2 client that captures putObject calls. */
function makeCapturingR2() {
  const captured: Array<{ key: string; body: Uint8Array | string; contentType?: string }> = [];
  return {
    captured,
    client: {
      bucket: 'stub',
      async putObject(input: { key: string; body: Uint8Array | string; contentType?: string }) {
        captured.push({ key: input.key, body: input.body, contentType: input.contentType });
        return { key: input.key, etag: 'stub-etag' };
      },
      async getObject() { throw new Error('stub: getObject not used'); },
      async getSignedUrl() { throw new Error('stub: getSignedUrl not used'); },
      async deleteObject() { throw new Error('stub: deleteObject not used'); },
      async headObject() { throw new Error('stub: headObject not used'); },
      async listObjects() { throw new Error('stub: listObjects not used'); },
    } as any,
  };
}

/** Provider that returns scripted responses in order. */
function scriptedProvider(turns: Array<{ text?: string; toolCalls?: { name: string; arguments: unknown }[] }>): AgentProvider {
  let i = 0;
  return {
    name: 'openai',
    async chat(): Promise<ChatResponse> {
      const turn = turns[i++];
      if (!turn) throw new Error('scripted provider exhausted');
      const tcs = (turn.toolCalls ?? []).map((tc, j) => ({ id: `tc_${i}_${j}`, name: tc.name, arguments: tc.arguments }));
      return {
        message: { role: 'assistant', content: turn.text ?? '', toolCalls: tcs },
        toolCalls: tcs,
        usage: { inputTokens: 100, outputTokens: 50 },
        rawId: `r_${i}`,
      };
    },
  };
}

describe('runAgent', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();
    seed = await seedTestRun({
      videos: [{ id: 'vid_h_v1', title: 'Test', durationSec: 600 }],
      segments: [{ id: 'seg_h_a', videoId: 'vid_h_v1', startMs: 0, endMs: 30_000, text: 'Pomodoro is a focus technique.' }],
    });
  });

  after(async () => { await teardownTestRun(seed); });

  it('completes when provider returns no tool calls', async () => {
    const r2 = makeCapturingR2();
    const provider = scriptedProvider([
      { toolCalls: [{ name: 'listVideos', arguments: {} }] },
      { text: 'Done.' },
    ]);
    const summary = await runAgent({
      runId: seed.runId, workspaceId: seed.workspaceId,
      agent: 'topic_spotter', modelId: 'gemini-2.5-flash',
      provider,
      r2: r2.client,
      tools: ['listVideos','proposeTopic'],
      systemPrompt: 'Find topics.',
      userMessage: 'Do your job.',
      caps: { maxCalls: 10, maxCostCents: 1000, maxWallMs: 60_000 },
    });
    assert.equal(summary.status, 'succeeded');
    assert.equal(summary.toolCallCount, 1);
    assert.equal(summary.findingCount, 0);
    assert.equal(summary.stopReason, 'no_tool_calls');
    assert.ok(summary.transcriptR2Key.endsWith('/topic_spotter/transcript.json'));
    // Transcript was persisted exactly once.
    assert.equal(r2.captured.length, 1);
    assert.equal(r2.captured[0]?.key, summary.transcriptR2Key);
  });

  it('writes a finding via propose tool', async () => {
    const r2 = makeCapturingR2();
    const provider = scriptedProvider([
      { toolCalls: [{ name: 'proposeTopic', arguments: {
        title: 'Focus', description: 'd', iconKey: 'productivity', accentColor: 'mint',
        evidence: [{ segmentId: 'seg_h_a' }],
      } }] },
      { text: 'Done.' },
    ]);
    const summary = await runAgent({
      runId: seed.runId, workspaceId: seed.workspaceId,
      agent: 'topic_spotter', modelId: 'gemini-2.5-flash',
      provider, r2: r2.client,
      tools: ['proposeTopic'],
      systemPrompt: 'Propose a topic.',
      userMessage: 'go',
      caps: { maxCalls: 10, maxCostCents: 1000, maxWallMs: 60_000 },
    });
    assert.equal(summary.status, 'succeeded');
    assert.equal(summary.findingCount, 1);
    const rows = await getDb().select().from(archiveFinding).where(eq(archiveFinding.runId, seed.runId));
    assert.ok(rows.find((r) => r.type === 'topic'));
  });

  it('terminates on max_calls cap', async () => {
    const r2 = makeCapturingR2();
    const provider = scriptedProvider(Array(50).fill({ toolCalls: [{ name: 'listVideos', arguments: {} }] }));
    const summary = await runAgent({
      runId: seed.runId, workspaceId: seed.workspaceId,
      agent: 'topic_spotter', modelId: 'gemini-2.5-flash',
      provider, r2: r2.client,
      tools: ['listVideos'],
      systemPrompt: 's', userMessage: 'u',
      caps: { maxCalls: 3, maxCostCents: 1000, maxWallMs: 60_000 },
    });
    assert.equal(summary.stopReason, 'max_calls');
    assert.equal(summary.toolCallCount, 3);
  });

  it('handles unknown tool name without crashing', async () => {
    const r2 = makeCapturingR2();
    const provider = scriptedProvider([
      { toolCalls: [{ name: 'nonexistentTool', arguments: {} }] },
      { text: 'Stopping.' },
    ]);
    // Note: harness must filter to only the allowed tools list.
    // If the provider returns a tool name NOT in the allowed list, the harness
    // should append a tool error turn but not crash.
    const summary = await runAgent({
      runId: seed.runId, workspaceId: seed.workspaceId,
      agent: 'topic_spotter', modelId: 'gemini-2.5-flash',
      provider, r2: r2.client,
      tools: ['listVideos'],
      systemPrompt: 's', userMessage: 'u',
      caps: { maxCalls: 10, maxCostCents: 1000, maxWallMs: 60_000 },
    });
    assert.equal(summary.status, 'succeeded');
    // The harness recorded the call attempt but produced 0 findings.
    assert.equal(summary.findingCount, 0);
  });

  it('handles invalid arguments without crashing', async () => {
    const r2 = makeCapturingR2();
    const provider = scriptedProvider([
      { toolCalls: [{ name: 'proposeTopic', arguments: { /* missing required fields */ } }] },
      { text: 'Stopping.' },
    ]);
    const summary = await runAgent({
      runId: seed.runId, workspaceId: seed.workspaceId,
      agent: 'topic_spotter', modelId: 'gemini-2.5-flash',
      provider, r2: r2.client,
      tools: ['proposeTopic'],
      systemPrompt: 's', userMessage: 'u',
      caps: { maxCalls: 10, maxCostCents: 1000, maxWallMs: 60_000 },
    });
    // Implementation should append a tool error turn (Zod safeParse failure) instead of throwing.
    assert.equal(summary.status, 'succeeded');
    assert.equal(summary.findingCount, 0);
  });
});
