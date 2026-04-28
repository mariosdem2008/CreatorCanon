import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateWorkbenchChecks, sumBodyChars } from '../page-quality';

test('evaluateWorkbenchChecks passes action-first metadata', () => {
  const checks = evaluateWorkbenchChecks({
    workbench: {
      readerJob: 'build',
      outcome: 'Build a reusable workflow from cited channel evidence.',
      useWhen: ['You need a repeatable process', 'You want source-backed next steps'],
      artifacts: [
        {
          title: 'Build checklist',
          body: 'Use this checklist to turn the cited material into an implementation plan.',
          citationIds: ['seg_a'],
        },
      ],
    },
  });

  assert.deepEqual(checks, {
    readerJobPresent: true,
    workbenchOutcomePresent: true,
    useWhenPresent: true,
    artifactPresent: true,
  });
});

test('evaluateWorkbenchChecks fails encyclopedia-only metadata', () => {
  const checks = evaluateWorkbenchChecks({});

  assert.deepEqual(checks, {
    readerJobPresent: false,
    workbenchOutcomePresent: false,
    useWhenPresent: false,
    artifactPresent: false,
  });
});

test('sumBodyChars counts action-first structured block content', () => {
  const roadmapStepOne = 'Collect the source-backed requirements before drafting.';
  const roadmapStepTwo = 'Publish the workflow only after the evidence check passes.';
  const setup = 'Maya needs to convert source notes into an implementation plan.';
  const exampleStepOne = 'She groups the notes by task.';
  const exampleStepTwo = 'She turns each task into a reusable checklist item.';
  const outcome = 'The resulting page gives the reader a concrete workflow to copy.';
  const caption =
    'The decision point belongs before drafting, so weak evidence cannot leak into the final artifact.';

  const total = sumBodyChars([
    {
      type: 'roadmap',
      content: {
        steps: [
          { title: 'Collect inputs', body: roadmapStepOne },
          { title: 'Ship the workflow', body: roadmapStepTwo },
        ],
      },
    },
    {
      type: 'hypothetical_example',
      content: {
        setup,
        stepsTaken: [exampleStepOne, exampleStepTwo],
        outcome,
      },
    },
    {
      type: 'diagram',
      content: {
        caption,
      },
    },
  ]);

  assert.equal(
    total,
    [
      roadmapStepOne,
      roadmapStepTwo,
      setup,
      exampleStepOne,
      exampleStepTwo,
      outcome,
      caption,
    ].reduce((sum, value) => sum + value.length, 0),
  );
});
