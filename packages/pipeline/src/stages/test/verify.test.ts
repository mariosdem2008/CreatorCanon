import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runVerifyStage } from '../verify';
import { _resetRegistryForTests, registerAllTools } from '../../agents/tools/registry';
import { proposeTopicTool } from '../../agents/tools/propose';
import { seedTestRun, teardownTestRun, makeCtx, type SeedResult } from '../../../test-helpers/fixtures';
import type { AgentProvider, ChatResponse, ToolCallRequest } from '../../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';
import { eq, getDb } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';

function makeStubR2(): R2Client {
  return {
    bucket: 'stub',
    async putObject(input: any) { return { key: input.key, etag: 'stub' }; },
    async getObject() { throw new Error('stub'); },
    async getSignedUrl() { throw new Error('stub'); },
    async deleteObject() { throw new Error('stub'); },
    async headObject() { throw new Error('stub'); },
    async listObjects() { throw new Error('stub'); },
  } as any;
}

/**
 * Stub grounder provider:
 * - Turn 1: call listFindings({ type: 'topic' })
 * - Turn 2: for each finding ID seen in the previous tool result, call markFindingEvidence(verdict='strong')
 * - Turn 3: exit (no tool calls)
 */
function makeGrounderProvider(): AgentProvider {
  let turn = 0;
  let findingIds: string[] = [];
  return {
    name: 'openai',
    async chat({ messages }): Promise<ChatResponse> {
      turn++;
      if (turn === 1) {
        const tcs: ToolCallRequest[] = [{ id: 'tc_1', name: 'listFindings', arguments: { type: 'topic' } }];
        return { message: { role: 'assistant', content: '', toolCalls: tcs }, toolCalls: tcs, usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r1' };
      }
      if (turn === 2) {
        // The previous turn was a tool result. Find it in the messages.
        const lastTool = [...messages].reverse().find((m) => m.role === 'tool');
        const parsed = lastTool ? JSON.parse(lastTool.content) : [];
        if (Array.isArray(parsed)) findingIds = parsed.map((f: any) => f.id);
        const tcs: ToolCallRequest[] = findingIds.map((id, i) => ({
          id: `tc_2_${i}`, name: 'markFindingEvidence', arguments: { findingId: id, verdict: 'strong' },
        }));
        return { message: { role: 'assistant', content: '', toolCalls: tcs }, toolCalls: tcs, usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r2' };
      }
      return { message: { role: 'assistant', content: 'Done', toolCalls: [] }, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r3' };
    },
  };
}

const skipIfNoEnv = !process.env.DATABASE_URL || !process.env.GEMINI_API_KEY || !process.env.OPENAI_API_KEY;

describe('runVerifyStage', { skip: skipIfNoEnv ? 'DATABASE_URL/GEMINI_API_KEY/OPENAI_API_KEY not set' : false }, () => {
  let seed: SeedResult;

  before(async () => {
    _resetRegistryForTests();
    registerAllTools();
    seed = await seedTestRun({
      videos: [{ id: 'vid_v_v1', title: 'X', durationSec: 600 }, { id: 'vid_v_v2', title: 'Y', durationSec: 600 }],
      segments: [
        { id: 'seg_v_a', videoId: 'vid_v_v1', startMs: 0, endMs: 30_000, text: 'A' },
        { id: 'seg_v_b', videoId: 'vid_v_v2', startMs: 0, endMs: 30_000, text: 'B' },
      ],
    });
    // Seed two topic findings.
    await proposeTopicTool.handler({
      title: 'Focus', description: 'd', iconKey: 'productivity', accentColor: 'mint',
      evidence: [{ segmentId: 'seg_v_a' }, { segmentId: 'seg_v_b' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    await proposeTopicTool.handler({
      title: 'Habits', description: 'd', iconKey: 'habits', accentColor: 'sage',
      evidence: [{ segmentId: 'seg_v_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
  });

  after(async () => { await teardownTestRun(seed); });

  it('updates evidenceQuality on findings via markFindingEvidence', async () => {
    const r2 = makeStubR2();
    const provider = makeGrounderProvider();
    const result = await runVerifyStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      providerOverride: () => provider,
      r2Override: r2,
    });
    assert.equal(result.specialistsCompleted, 1);
    // Both topic findings should now be 'strong'.
    const rows = await getDb().select().from(archiveFinding).where(eq(archiveFinding.runId, seed.runId));
    const topics = rows.filter((r) => r.type === 'topic');
    assert.equal(topics.length, 2);
    assert.ok(topics.every((t) => t.evidenceQuality === 'strong'), `expected all topics to be 'strong', got: ${topics.map((t) => t.evidenceQuality).join(', ')}`);
  });
});
