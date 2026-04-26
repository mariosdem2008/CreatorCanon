import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../env-files';
import { runDiscoveryStage } from '../discovery';
import { _resetRegistryForTests, registerAllTools } from '../../agents/tools/registry';
import { seedTestRun, teardownTestRun, type SeedResult } from '../../../test-helpers/fixtures';
import type { AgentProvider, ChatResponse } from '../../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';

/** A capturing R2 stub for the harness's transcript putObject calls. */
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

/** A provider that always proposes one finding then exits. */
function buildAutoProposingProvider(): AgentProvider {
  return {
    name: 'openai',
    async chat({ tools }): Promise<ChatResponse> {
      const proposeTool = tools.find((t) => t.name.startsWith('propose'));
      if (!proposeTool) {
        return { message: { role: 'assistant', content: 'Done', toolCalls: [] }, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r' };
      }
      const args = buildMinimalArgsFor(proposeTool.name);
      const tcs = [{ id: 'tc_1', name: proposeTool.name, arguments: args }];
      return { message: { role: 'assistant', content: '', toolCalls: tcs }, toolCalls: tcs, usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r' };
    },
  };
}

function buildMinimalArgsFor(toolName: string): Record<string, unknown> {
  const ev = [{ segmentId: 'seg_d_a' }];
  switch (toolName) {
    case 'proposeTopic': return { title: 'Focus', description: 'd', iconKey: 'productivity', accentColor: 'mint', evidence: ev };
    case 'proposeFramework': return { title: 'Pomodoro', summary: 'Time-boxed focus', principles: [{ title: 'p', body: 'b' }], evidence: [{ segmentId: 'seg_d_a' }, { segmentId: 'seg_d_b' }] };
    case 'proposeLesson': return { title: 'Writing as thinking', summary: 's', idea: 'A long enough idea passage to satisfy the schema minimum length requirement.', evidence: ev };
    default: throw new Error(`buildMinimalArgsFor: unknown tool ${toolName}`);
  }
}

describe('runDiscoveryStage', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();
    seed = await seedTestRun({
      videos: [{ id: 'vid_d_v1', title: 'Test', durationSec: 600 }],
      segments: [
        { id: 'seg_d_a', videoId: 'vid_d_v1', startMs: 0, endMs: 30_000, text: 'A' },
        { id: 'seg_d_b', videoId: 'vid_d_v1', startMs: 30_000, endMs: 60_000, text: 'B' },
      ],
    });
  });

  after(async () => { await teardownTestRun(seed); });

  it('runs all 3 specialists in parallel and aggregates result', async () => {
    const r2 = makeStubR2();
    const provider = buildAutoProposingProvider();
    const result = await runDiscoveryStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      providerOverride: () => provider,
      r2Override: r2,
    });
    assert.equal(result.specialistsCompleted, 3);
    assert.ok(result.findingCount >= 3);
    assert.equal(result.perAgent.length, 3);
    const agentNames = result.perAgent.map((p) => p.agent).sort();
    assert.deepEqual(agentNames, ['framework_extractor', 'lesson_extractor', 'topic_spotter']);
  });

  it('continues other specialists even if one fails', async () => {
    const r2 = makeStubR2();
    let callCount = 0;
    const flakyProvider: AgentProvider = {
      name: 'openai',
      async chat() {
        callCount++;
        if (callCount === 1) throw new Error('Simulated provider failure on first call');
        return { message: { role: 'assistant', content: 'Done', toolCalls: [] }, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r' };
      },
    };
    // Discovery returns aggregated info; one specialist fails but the stage shouldn't crash.
    // Implementation note: per-specialist errors are caught and reported; the overall
    // stage doesn't throw unless ALL specialists fail.
    await assert.doesNotReject(() => runDiscoveryStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      providerOverride: () => flakyProvider,
      r2Override: r2,
    }));
  });
});
