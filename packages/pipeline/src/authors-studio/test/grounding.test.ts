import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectAllCitationIds, voiceConsistencyScore } from '../grounding';
import type { ArtifactBundle } from '../types';

const SAMPLE_BUNDLE: ArtifactBundle = {
  prose: {
    kind: 'cited_prose',
    paragraphs: [
      { body: 'Para one.', citationIds: ['seg_a', 'seg_b'] },
      { body: 'Para two.', citationIds: ['seg_b', 'seg_c'] },
    ],
    costCents: 1,
  },
  roadmap: {
    kind: 'roadmap',
    title: 'How',
    steps: [
      { index: 1, title: 'A', body: 'b', citationIds: ['seg_d'] },
      { index: 2, title: 'B', body: 'c', citationIds: ['seg_e'] },
    ],
    costCents: 1,
  },
};

describe('collectAllCitationIds', () => {
  it('aggregates segments from prose paragraphs and roadmap steps', () => {
    const ids = collectAllCitationIds(SAMPLE_BUNDLE);
    assert.deepEqual(new Set(ids), new Set(['seg_a', 'seg_b', 'seg_c', 'seg_d', 'seg_e']));
  });
});

describe('voiceConsistencyScore', () => {
  it('reader_second_person: text with "you" and no "I" scores high', () => {
    const score = voiceConsistencyScore('reader_second_person', 'You should embed phase 2 hooks. You can do this by...');
    assert.ok(score >= 0.9, `score was ${score}`);
  });

  it('reader_second_person: text with mostly "I" scores low', () => {
    const score = voiceConsistencyScore('reader_second_person', 'I built the proposal generator. I learned that...');
    assert.ok(score <= 0.3, `score was ${score}`);
  });

  it('creator_first_person: text with "I" scores high', () => {
    const score = voiceConsistencyScore('creator_first_person', 'I built the proposal generator. I learned that...');
    assert.ok(score >= 0.9, `score was ${score}`);
  });
});
