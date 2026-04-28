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
    readerJob: 'learn',
    outcome: 'Understand the test page.',
    useWhen: ['Use this when verifying assembler output.'],
    artifactRequests: [],
    nextStepHints: [],
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
});
