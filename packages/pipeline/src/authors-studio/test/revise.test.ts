import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runRevisePass } from '../revise';
import type { ArtifactBundle, PagePlan } from '../types';

const PLAN: PagePlan = {
  pageId: 'pb_test',
  pageType: 'playbook',
  pageTitle: 'Test page',
  thesis: 'A source-backed test page for preserving artifacts.',
  arc: [
    { beat: 'First beat', canonNodeIds: ['cn_a'] },
    { beat: 'Second beat', canonNodeIds: ['cn_b'] },
  ],
  voiceMode: 'reader_second_person',
  voiceNotes: { tone: 'practitioner', creatorTermsToUse: [], avoidPhrases: [] },
  artifacts: [{ kind: 'cited_prose', canonNodeIds: ['cn_a'], intent: 'Explain the core workflow.' }],
  siblingPagesToReference: [],
  workbench: {
    readerJob: 'build',
    outcome: 'Build the source-backed workflow.',
    useWhen: ['You need a repeatable implementation path.'],
    artifactRequests: [],
    nextStepHints: [],
  },
  costCents: 0,
};

test('runRevisePass preserves workbench artifacts when no specialist is reauthored', async () => {
  const artifacts: ArtifactBundle = {
    prose: {
      kind: 'cited_prose',
      paragraphs: [
        { body: 'A long enough cited paragraph for the test fixture.', citationIds: ['seg_a'] },
        { body: 'Another cited paragraph that remains unchanged.', citationIds: ['seg_b'] },
        { body: 'A third cited paragraph that remains unchanged.', citationIds: ['seg_c'] },
      ],
      costCents: 0,
    },
    workbenchArtifacts: [{
      type: 'workflow',
      title: 'Workflow artifact',
      body: 'Capture intake answers, generate structured output, and map it into the proposal template.',
      citationIds: ['seg_a'],
    }],
  };

  const revised = await runRevisePass({
    plan: PLAN,
    artifacts,
    notes: { approved: true, notes: [], costCents: 0 },
    proseInput: {
      ctx: {} as never,
      plan: PLAN,
      canonNodes: [],
      segmentExcerpts: [],
      channelProfilePayload: {},
    },
    contextByKind: () => ({} as never),
  });

  assert.deepEqual(revised.workbenchArtifacts, artifacts.workbenchArtifacts);
});
