import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { filterCandidates } from './workshop-builder';

describe('filterCandidates', () => {
  const mkSegment = (id: string) => ({
    id,
    videoId: 'v1',
    startMs: 0,
    endMs: 60_000,
    text: `text for ${id}`,
  });
  const segmentMap = new Map([
    ['s1', mkSegment('s1')],
    ['s2', mkSegment('s2')],
    ['s3', mkSegment('s3')],
  ]);

  const phase = { _index_primary_canon_node_ids: ['cn_1'] } as any;

  test('keeps high-confidence high-relevance verified entries with workshop-shaped roles', () => {
    const canon = {
      title: 'X',
      _index_evidence_registry: {
        s1: { evidenceType: 'framework_step', confidence: 'high', relevanceScore: 90, verificationStatus: 'verified', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
        s2: { evidenceType: 'claim', confidence: 'high', relevanceScore: 95, verificationStatus: 'verified', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
        s3: { evidenceType: 'tool', confidence: 'medium', relevanceScore: 90, verificationStatus: 'verified', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
      },
    } as any;
    const map = new Map([['cn_1', canon]]);
    const out = filterCandidates(phase, map, segmentMap);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.segmentId, 's1');
  });

  test('rejects unverified entries even at high score', () => {
    const canon = {
      title: 'X',
      _index_evidence_registry: {
        s1: { evidenceType: 'framework_step', confidence: 'high', relevanceScore: 90, verificationStatus: 'needs_review', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
      },
    } as any;
    const out = filterCandidates(phase, new Map([['cn_1', canon]]), segmentMap);
    assert.equal(out.length, 0);
  });

  test('rejects relevance < 80', () => {
    const canon = {
      title: 'X',
      _index_evidence_registry: {
        s1: { evidenceType: 'framework_step', confidence: 'high', relevanceScore: 75, verificationStatus: 'verified', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
      },
    } as any;
    const out = filterCandidates(phase, new Map([['cn_1', canon]]), segmentMap);
    assert.equal(out.length, 0);
  });
});
