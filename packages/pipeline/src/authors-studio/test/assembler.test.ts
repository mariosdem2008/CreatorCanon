import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assembleBlockTree } from '../assembler';
import type { ArtifactBundle, PagePlan } from '../types';

const SAMPLE_PLAN: PagePlan = {
  pageId: 'pb_test',
  pageType: 'lesson',
  pageTitle: 'Test page',
  thesis: 'A thesis.',
  arc: [{ beat: 'beat one', canonNodeIds: ['cn_a'] }, { beat: 'beat two', canonNodeIds: ['cn_b'] }],
  voiceMode: 'reader_second_person',
  voiceNotes: { tone: 'practitioner', creatorTermsToUse: ['blueprint'], avoidPhrases: [] },
  artifacts: [{ kind: 'cited_prose', canonNodeIds: ['cn_a'], intent: '...' }],
  siblingPagesToReference: [],
  workbench: {
    readerJob: 'build',
    outcome: 'Build a repeatable validation pass for assembled pages.',
    useWhen: ['When turning cited notes into a practical page.', 'When checking unsupported claims before publishing.'],
    artifactRequests: [
      {
        type: 'workflow',
        title: 'Assembler validation workflow',
        intent: 'Turn the page into a reusable publishing checklist.',
        canonNodeIds: ['cn_a'],
      },
    ],
    nextStepHints: [
      { title: 'Validate citations', reason: 'Confirm the rendered page only uses supported segments.' },
      { title: 'Prepare follow-up artifact', reason: 'Convert the lesson into a reusable workbench item.' },
    ],
  },
  costCents: 5,
};

const SAMPLE_BUNDLE: ArtifactBundle = {
  prose: {
    kind: 'cited_prose',
    paragraphs: [
      { body: 'Para one body, long enough to be meaningful.', citationIds: ['seg_a'] },
      { body: 'Para two body, also of substantive length.', citationIds: ['seg_b'] },
    ],
    costCents: 5,
  },
};

describe('assembleBlockTree', () => {
  it('produces a blockTreeJson with prose paragraphs as overview/paragraph blocks', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: SAMPLE_BUNDLE,
      validSegmentIds: new Set(['seg_a', 'seg_b']),
    });
    assert.equal(result.blocks.length, 2);
    assert.equal(result.blocks[0]!.type, 'overview');
    assert.equal(result.blocks[1]!.type, 'paragraph');
  });

  it('omits diagram block when bundle.diagram is missing', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: SAMPLE_BUNDLE,
      validSegmentIds: new Set(['seg_a', 'seg_b']),
    });
    const hasDiagram = result.blocks.some((b) => b.type === 'diagram');
    assert.equal(hasDiagram, false);
  });

  it('drops citationIds that don\'t resolve to valid segments', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: SAMPLE_BUNDLE,
      validSegmentIds: new Set(['seg_a']), // seg_b missing
    });
    const allCites = result.blocks.flatMap((b) => b.citations ?? []);
    assert.ok(!allCites.includes('seg_b'));
  });

  it('persists page workbench metadata with empty artifacts when no artifact drafts are present', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: SAMPLE_BUNDLE,
      validSegmentIds: new Set(['seg_a', 'seg_b']),
    });

    assert.deepEqual(result.atlasMeta.workbench, {
      readerJob: 'build',
      outcome: 'Build a repeatable validation pass for assembled pages.',
      useWhen: ['When turning cited notes into a practical page.', 'When checking unsupported claims before publishing.'],
      artifacts: [],
      nextStepHints: [
        { title: 'Validate citations', reason: 'Confirm the rendered page only uses supported segments.' },
        { title: 'Prepare follow-up artifact', reason: 'Convert the lesson into a reusable workbench item.' },
      ],
    });
  });

  it('persists supported workbench artifact citations and drops unsupported artifact drafts', () => {
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: {
        ...SAMPLE_BUNDLE,
        workbenchArtifacts: [
          {
            type: 'workflow',
            title: 'Supported workflow',
            body: 'Do the supported thing.',
            citationIds: ['seg_a', 'seg_missing'],
          },
          {
            type: 'template',
            title: 'Unsupported template',
            body: 'This should not persist.',
            citationIds: ['seg_missing'],
          },
        ],
      },
      validSegmentIds: new Set(['seg_a', 'seg_b']),
    });

    assert.deepEqual(result.atlasMeta.workbench, {
      readerJob: 'build',
      outcome: 'Build a repeatable validation pass for assembled pages.',
      useWhen: ['When turning cited notes into a practical page.', 'When checking unsupported claims before publishing.'],
      artifacts: [
        {
          id: 'art_pb_test_0',
          type: 'workflow',
          title: 'Supported workflow',
          body: 'Do the supported thing.',
          citationIds: ['seg_a'],
        },
      ],
      nextStepHints: [
        { title: 'Validate citations', reason: 'Confirm the rendered page only uses supported segments.' },
        { title: 'Prepare follow-up artifact', reason: 'Convert the lesson into a reusable workbench item.' },
      ],
    });
  });

  it('dedupes nested workbench artifacts already collected into the bundle', () => {
    const duplicateArtifact = {
      type: 'workflow' as const,
      title: 'Collected workflow',
      body: 'Use the collected workflow.',
      citationIds: ['seg_a'],
    };
    const result = assembleBlockTree({
      plan: SAMPLE_PLAN,
      bundle: {
        ...SAMPLE_BUNDLE,
        roadmap: {
          kind: 'roadmap',
          title: 'Roadmap',
          steps: [{ index: 1, title: 'Step one', body: 'Do it.', citationIds: ['seg_a'] }],
          workbenchArtifact: duplicateArtifact,
          costCents: 1,
        },
        workbenchArtifacts: [duplicateArtifact],
      },
      validSegmentIds: new Set(['seg_a', 'seg_b']),
    });

    assert.deepEqual(result.atlasMeta.workbench, {
      readerJob: 'build',
      outcome: 'Build a repeatable validation pass for assembled pages.',
      useWhen: ['When turning cited notes into a practical page.', 'When checking unsupported claims before publishing.'],
      artifacts: [
        {
          id: 'art_pb_test_0',
          type: 'workflow',
          title: 'Collected workflow',
          body: 'Use the collected workflow.',
          citationIds: ['seg_a'],
        },
      ],
      nextStepHints: [
        { title: 'Validate citations', reason: 'Confirm the rendered page only uses supported segments.' },
        { title: 'Prepare follow-up artifact', reason: 'Convert the lesson into a reusable workbench item.' },
      ],
    });
  });
});
