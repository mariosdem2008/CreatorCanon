import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runStrategist } from '../strategist';
import type { AgentProvider } from '../../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';

const strategistPlan = {
  pageId: 'pb_test',
  pageType: 'playbook',
  pageTitle: 'Source-backed Workbench',
  thesis: 'A source-backed workbench page should help readers produce a concrete reusable output from canon evidence.',
  arc: [
    { beat: 'Frame the source-backed reader job', canonNodeIds: ['cn_a'] },
    { beat: 'Turn source evidence into reusable output', canonNodeIds: ['cn_b'] },
  ],
  voiceMode: 'reader_second_person',
  voiceNotes: {
    tone: 'practitioner',
    creatorTermsToUse: [],
    avoidPhrases: [],
  },
  artifacts: [
    { kind: 'cited_prose', canonNodeIds: ['cn_a'], intent: 'Explain why the workbench artifact matters.' },
  ],
  siblingPagesToReference: [],
  workbench: {
    readerJob: 'build',
    outcome: 'Build a source-backed workflow that can be reused on the next similar page.',
    useWhen: [
      'You need to turn canon evidence into an implementation path.',
      'You are planning a page that must produce reusable output.',
      'You need source-backed guidance beyond explanatory prose.',
      'You want to connect this page to logical follow-up pages.',
      'This extra condition should be accepted and sliced away.',
    ],
    artifactRequests: [
      { type: 'workflow', title: 'Evidence workflow', intent: 'Turn source-backed claims into a reusable work sequence.', canonNodeIds: ['cn_a'] },
      { type: 'checklist', title: 'Source checklist', intent: 'Check that each reusable step cites supporting canon.', canonNodeIds: ['cn_b'] },
      { type: 'template', title: 'Page template', intent: 'Give the reader a reusable structure for future pages.', canonNodeIds: ['cn_a'] },
      { type: 'schema', title: 'Extra schema', intent: 'This extra artifact should be accepted and sliced away.', canonNodeIds: ['cn_b'] },
    ],
    nextStepHints: [
      { title: 'First follow-up', reason: 'Extends the source-backed workflow.' },
      { title: 'Second follow-up', reason: 'Covers the next implementation choice.' },
      { title: 'Third follow-up', reason: 'Helps debug weak source support.' },
      { title: 'Extra follow-up', reason: 'This extra hint should be accepted and sliced away.' },
    ],
  },
};

test('runStrategist normalizes workbench plan arrays to page limits', async () => {
  process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/test';

  const objects = new Map<string, Uint8Array>();
  const r2 = {
    async putObject(input: { key: string; body: Uint8Array }) {
      objects.set(input.key, input.body);
    },
    async getObject(key: string) {
      const body = objects.get(key);
      if (!body) throw new Error(`missing object ${key}`);
      return { body };
    },
  } as unknown as R2Client;

  const provider: AgentProvider = {
    name: 'openai',
    async chat() {
      return {
        message: { role: 'assistant', content: JSON.stringify(strategistPlan) },
        toolCalls: [],
        usage: { inputTokens: 1, outputTokens: 1 },
        rawId: 'test-response',
      };
    },
  };

  const plan = await runStrategist({
    runId: 'run_test',
    workspaceId: 'ws_test',
    voiceMode: 'reader_second_person',
    channelProfilePayload: {},
    brief: { id: 'pb_test', payload: { pageTitle: 'Source-backed Workbench', pageType: 'playbook' } },
    primaryCanonNodes: [],
    supportingCanonNodes: [],
    siblingBriefs: [],
    provider,
    fallbacks: [],
    r2,
    modelId: 'test-model',
  });

  assert.equal(plan.workbench.useWhen.length, 4);
  assert.equal(plan.workbench.artifactRequests.length, 3);
  assert.equal(plan.workbench.nextStepHints.length, 3);
  assert.equal(plan.workbench.useWhen.at(-1), 'You want to connect this page to logical follow-up pages.');
  assert.equal(plan.workbench.artifactRequests.at(-1)?.title, 'Page template');
  assert.equal(plan.workbench.nextStepHints.at(-1)?.title, 'Third follow-up');
});
