import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { _resetRegistryForTests, registerAllTools } from '../agents/tools/registry';
import { runDiscoveryStage } from '../stages/discovery';
import { runSynthesisStage } from '../stages/synthesis';
import { runVerifyStage } from '../stages/verify';
import { runMergeStage } from '../stages/merge';
import { runAdaptStage } from '../stages/adapt';
import { seedTestRun, teardownTestRun, type SeedResult } from '../../test-helpers/fixtures';
import { getDb, eq } from '@creatorcanon/db';
import { hub } from '@creatorcanon/db/schema';
import type { AgentProvider, ChatResponse } from '../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';
import type { CreatorManualManifest } from '../adapters/creator-manual/manifest-types';

function makeStubR2(): R2Client {
  const objects = new Map<string, Uint8Array>();
  return {
    bucket: 'stub',
    async putObject(input: any) {
      const body = input.body instanceof Uint8Array
        ? input.body
        : new TextEncoder().encode(String(input.body));
      objects.set(input.key, body);
      return { key: input.key, etag: 'stub' };
    },
    async getObject(input: any) {
      const key = typeof input === 'string' ? input : input.key;
      const body = objects.get(key);
      if (!body) throw new Error(`stub object not found: ${key}`);
      return { body, contentType: 'application/json' };
    },
    async getSignedUrl() { throw new Error('stub'); },
    async deleteObject() { throw new Error('stub'); },
    async headObject() { throw new Error('stub'); },
    async listObjects() { throw new Error('stub'); },
  } as any;
}

/**
 * A scripted provider that produces exactly one minimal valid `propose*` call
 * per agent conversation, then exits. Detects "already proposed" by checking
 * whether any role='tool' message is already in the conversation.
 */
function buildAutoProposingProvider(): AgentProvider {
  let counter = 0;
  return {
    name: 'openai',
    async chat({ tools, messages }): Promise<ChatResponse> {
      counter++;
      // If any tool result is already in the conversation, this agent is done.
      const alreadyProposed = messages.some((m) => m.role === 'tool');
      const proposeTool = tools.find((t) => t.name.startsWith('propose'));
      if (!proposeTool || alreadyProposed) {
        return {
          message: { role: 'assistant', content: 'Done', toolCalls: [] },
          toolCalls: [],
          usage: { inputTokens: 10, outputTokens: 10 },
          rawId: `r${counter}`,
        };
      }
      const args = buildArgsFor(proposeTool.name);
      const tcs = [{ id: `tc_${counter}`, name: proposeTool.name, arguments: args }];
      return {
        message: { role: 'assistant', content: '', toolCalls: tcs },
        toolCalls: tcs,
        usage: { inputTokens: 10, outputTokens: 10 },
        rawId: `r${counter}`,
      };
    },
  };
}

function buildArgsFor(toolName: string): Record<string, unknown> {
  const segIds = ['seg_e_a', 'seg_e_b', 'seg_e_c'];
  const ev = segIds.map((id) => ({ segmentId: id }));
  const ev1 = { segmentId: segIds[0] };
  switch (toolName) {
    case 'proposeTopic':
      return { title: 'Focus', description: 'd', iconKey: 'productivity', accentColor: 'mint', evidence: ev };
    case 'proposeFramework':
      return { title: 'Pomodoro', summary: 's', principles: [{ title: 'p', body: 'b' }], evidence: ev };
    case 'proposeLesson':
      return { title: 'Treat writing as thinking', summary: 's', idea: 'A long enough idea passage to satisfy the schema minimum length requirement.', evidence: ev };
    case 'proposePlaybook':
      return { title: 'Daily review', summary: 's', principles: [{ title: 'p', body: 'b' }], evidence: ev };
    case 'proposeQuote':
      return { text: 'A useful quote.', evidence: ev1 };
    case 'proposeAhaMoment':
      return { quote: 'An aha line.', context: 'Crystallizes the lesson clearly.', evidence: ev1 };
    case 'proposeSourceRanking':
      return { topicId: 'fnd_x', videoIds: ['vid_e_v1'] };
    default:
      throw new Error(`buildArgsFor: ${toolName}`);
  }
}

const skipIfNoEnv = !process.env.DATABASE_URL || !process.env.GEMINI_API_KEY || !process.env.OPENAI_API_KEY;

describe('e2e: Creator Manual pipeline (Phase 1–5 against scripted provider)', { skip: skipIfNoEnv ? 'DATABASE_URL/GEMINI_API_KEY/OPENAI_API_KEY not set' : false }, () => {
  let seed: SeedResult;
  let hubId: string;

  before(async () => {
    _resetRegistryForTests();
    registerAllTools();

    seed = await seedTestRun({
      videos: [
        { id: 'vid_e_v1', title: 'Video 1', durationSec: 600 },
        { id: 'vid_e_v2', title: 'Video 2', durationSec: 600 },
      ],
      segments: [
        { id: 'seg_e_a', videoId: 'vid_e_v1', startMs: 0, endMs: 30_000, text: 'A' },
        { id: 'seg_e_b', videoId: 'vid_e_v1', startMs: 30_000, endMs: 60_000, text: 'B' },
        { id: 'seg_e_c', videoId: 'vid_e_v2', startMs: 0, endMs: 30_000, text: 'C' },
      ],
    });

    // Create hub with templateKey='creator_manual'.
    // The orchestrator no longer creates a release row; that is publish's responsibility.
    hubId = `hub_${seed.runId.slice(-6)}`;
    const db = getDb();
    await db.insert(hub).values({
      id: hubId,
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      subdomain: `e2e-${seed.runId.slice(-6)}`,
      templateKey: 'creator_manual',
      metadata: {} as any,
    });
  });

  after(async () => {
    const db = getDb();
    await db.delete(hub).where(eq(hub.id, hubId));
    await teardownTestRun(seed);
  });

  it('runs Phase 1–5 end-to-end and produces a manifest in R2', async () => {
    const r2 = makeStubR2();
    const provider = buildAutoProposingProvider();

    await runDiscoveryStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      providerOverride: () => provider, r2Override: r2,
    });
    await runSynthesisStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      providerOverride: () => provider, r2Override: r2,
    });
    await runVerifyStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      providerOverride: () => provider, r2Override: r2,
    });
    const merge = await runMergeStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      polishProvider: null,
    });
    const adapt = await runAdaptStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      hubId, r2Override: r2,
    });

    assert.ok(merge.pageCount >= 1, `expected at least 1 page; got ${merge.pageCount}`);
    assert.ok(adapt.manifestR2Key.includes('manifest.json'));
    assert.equal(adapt.templateKey, 'creator_manual');
    const manifestObject = await r2.getObject(adapt.manifestR2Key);
    const manifest = JSON.parse(
      new TextDecoder().decode(manifestObject.body),
    ) as CreatorManualManifest;
    assert.equal(manifest.schemaVersion, 'creator_manual_v1');
    assert.ok(manifest.nodes.length >= 1, 'at least 1 node expected');
    assert.ok(manifest.sources.length >= 1, 'at least 1 source expected');
    // The adapt-stage manifest uses 'unpublished' as a releaseId placeholder;
    // publishRunAsHub stamps the real ID when creating the release row.
  });
});
