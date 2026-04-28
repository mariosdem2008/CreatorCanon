import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectWorkbenchArtifactsFromBundle } from '../page-composition';
import type { ArtifactBundle } from '../../authors-studio/types';

test('collectWorkbenchArtifactsFromBundle preserves nested specialist workbench artifacts', () => {
  const bundle: ArtifactBundle = {
    prose: {
      kind: 'cited_prose',
      paragraphs: [
        { body: 'A source-backed action paragraph for the page.', citationIds: ['seg_a'] },
        { body: 'A second source-backed action paragraph.', citationIds: ['seg_b'] },
        { body: 'A third source-backed action paragraph.', citationIds: ['seg_c'] },
      ],
      costCents: 0,
    },
    roadmap: {
      kind: 'roadmap',
      title: 'Build workflow',
      steps: [
        { index: 1, title: 'Collect', body: 'Collect inputs.', citationIds: ['seg_a'] },
        { index: 2, title: 'Draft', body: 'Draft output.', citationIds: ['seg_b'] },
        { index: 3, title: 'Verify', body: 'Verify result.', citationIds: ['seg_c'] },
      ],
      workbenchArtifact: {
        type: 'workflow',
        title: 'Build workflow',
        body: 'Collect inputs, draft the output, and verify the result using cited source evidence.',
        citationIds: ['seg_a'],
      },
      costCents: 0,
    },
    example: {
      kind: 'hypothetical_example',
      setup: 'Maya needs a source-backed template.',
      stepsTaken: ['Collect inputs', 'Copy structure', 'Verify result'],
      outcome: 'She ships a reusable template.',
      citationIds: ['seg_b'],
      workbenchArtifact: {
        type: 'template',
        title: 'Reusable template',
        body: 'Copy this structure to reuse the source-backed workflow on the next implementation page.',
        citationIds: ['seg_b'],
      },
      costCents: 0,
    },
  };

  const artifacts = collectWorkbenchArtifactsFromBundle(bundle);

  assert.deepEqual(artifacts.map((artifact) => artifact.type), ['workflow', 'template']);
});

test('collectWorkbenchArtifactsFromBundle prefers current nested artifacts over stale collected artifacts', () => {
  const bundle = {
    roadmap: {
      kind: 'roadmap',
      title: 'Revised roadmap',
      steps: [
        { index: 1, title: 'Revise', body: 'Revise the workflow.', citationIds: ['seg_revised'] },
        { index: 2, title: 'Check', body: 'Check the workflow.', citationIds: ['seg_revised'] },
        { index: 3, title: 'Ship', body: 'Ship the workflow.', citationIds: ['seg_revised'] },
      ],
      workbenchArtifact: {
        type: 'workflow',
        title: 'Revised workflow',
        body: 'Use the revised workflow after the critic changes the roadmap artifact.',
        citationIds: ['seg_revised'],
      },
      costCents: 0,
    },
    workbenchArtifacts: [{
      type: 'workflow',
      title: 'Stale workflow',
      body: 'This stale artifact was collected before the revise pass changed the roadmap.',
      citationIds: ['seg_stale'],
    }],
  } satisfies Parameters<typeof collectWorkbenchArtifactsFromBundle>[0];

  const artifacts = collectWorkbenchArtifactsFromBundle(bundle);

  assert.equal(artifacts[0]?.title, 'Revised workflow');
  assert.equal(artifacts[0]?.citationIds[0], 'seg_revised');
});
