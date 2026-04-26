import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../env-files';
import { runSynthesisStage } from '../synthesis';
import { _resetRegistryForTests, registerAllTools } from '../../agents/tools/registry';
import { proposeTopicTool, proposeFrameworkTool, proposeLessonTool } from '../../agents/tools/propose';
import { seedTestRun, teardownTestRun, makeCtx, type SeedResult } from '../../../test-helpers/fixtures';
import type { AgentProvider, ChatResponse } from '../../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';

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

/** Provider that calls one propose tool then exits. */
function buildAutoProposingProvider(): AgentProvider {
  return {
    name: 'openai',
    async chat({ tools }): Promise<ChatResponse> {
      const proposeTool = tools.find((t) => t.name.startsWith('propose'));
      if (!proposeTool) {
        return { message: { role: 'assistant', content: 'Done', toolCalls: [] }, toolCalls: [], usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r' };
      }
      const args = buildArgsFor(proposeTool.name);
      const tcs = [{ id: 'tc_1', name: proposeTool.name, arguments: args }];
      return { message: { role: 'assistant', content: '', toolCalls: tcs }, toolCalls: tcs, usage: { inputTokens: 10, outputTokens: 10 }, rawId: 'r' };
    },
  };
}

function buildArgsFor(toolName: string): Record<string, unknown> {
  const ev3 = [{ segmentId: 'seg_s_a' }, { segmentId: 'seg_s_b' }, { segmentId: 'seg_s_c' }];
  const ev1 = { segmentId: 'seg_s_a' };
  switch (toolName) {
    case 'proposePlaybook':
      return { title: 'Daily review', summary: 'A daily reflection system.', principles: [{ title: 'Reflect', body: 'Review notes' }], evidence: ev3 };
    case 'proposeQuote':
      return { text: 'Discipline equals freedom.', evidence: ev1 };
    case 'proposeAhaMoment':
      return { quote: 'Discipline equals freedom.', context: 'Names the unifying paradox of self-governance.', evidence: ev1 };
    case 'proposeSourceRanking':
      return { topicId: 'fnd_x', videoIds: ['vid_s_v1'] };
    default:
      throw new Error(`buildArgsFor: unknown ${toolName}`);
  }
}

describe('runSynthesisStage', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    _resetRegistryForTests();
    registerAllTools();
    seed = await seedTestRun({
      videos: [{ id: 'vid_s_v1', title: 'Test', durationSec: 600 }],
      segments: [
        { id: 'seg_s_a', videoId: 'vid_s_v1', startMs: 0, endMs: 30_000, text: 'A' },
        { id: 'seg_s_b', videoId: 'vid_s_v1', startMs: 30_000, endMs: 60_000, text: 'B' },
        { id: 'seg_s_c', videoId: 'vid_s_v1', startMs: 60_000, endMs: 90_000, text: 'C' },
      ],
    });
    // Pre-seed a topic + framework + lesson so synthesis specialists have something to read.
    await proposeTopicTool.handler({
      title: 'Discipline', description: 'd', iconKey: 'mindset', accentColor: 'slate',
      evidence: [{ segmentId: 'seg_s_a' }],
    }, makeCtx(seed, 'topic_spotter', 'gpt-5.5'));
    await proposeFrameworkTool.handler({
      title: 'Daily Review', summary: 's', principles: [{ title: 'p', body: 'b' }],
      evidence: [{ segmentId: 'seg_s_a' }, { segmentId: 'seg_s_b' }],
    }, makeCtx(seed, 'framework_extractor', 'gpt-5.5'));
    await proposeLessonTool.handler({
      title: 'On reflection', summary: 's', idea: 'A long enough idea passage to satisfy the schema minimum length requirement.',
      evidence: [{ segmentId: 'seg_s_a' }],
    }, makeCtx(seed, 'lesson_extractor', 'gpt-5.5'));
  });

  after(async () => { await teardownTestRun(seed); });

  it('runs all 4 synthesis specialists and aggregates findings', async () => {
    const r2 = makeStubR2();
    const provider = buildAutoProposingProvider();
    const result = await runSynthesisStage({
      runId: seed.runId, workspaceId: seed.workspaceId,
      providerOverride: () => provider,
      r2Override: r2,
    });
    assert.equal(result.specialistsCompleted, 4);
    assert.ok(result.findingCount >= 4);
    const agentNames = result.perAgent.map((p) => p.agent).sort();
    assert.deepEqual(agentNames, ['aha_moment_detector', 'playbook_extractor', 'quote_finder', 'source_ranker']);
  });
});
