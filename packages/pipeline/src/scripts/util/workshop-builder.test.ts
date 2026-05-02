import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { filterCandidates, filterAndOrderCandidates } from './workshop-builder';

// ---------------------------------------------------------------------------
// filterCandidates
// ---------------------------------------------------------------------------

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
    ['s4', mkSegment('s4')],
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
    // s1 = high+verified+workshop-role → accepted
    // s2 = claim (not a workshop role) → rejected
    // s3 = medium+verified+workshop-role → accepted (Task 10.3: medium now passes)
    assert.equal(out.length, 2);
    const ids = out.map((c) => c.segmentId).sort();
    assert.deepEqual(ids, ['s1', 's3']);
  });

  test('accepts needs_review verification status (Task 10.3)', () => {
    // Phase 8: thin-content creators have evidence entries with verificationStatus='needs_review'
    const canon = {
      title: 'X',
      _index_evidence_registry: {
        s1: { evidenceType: 'example', confidence: 'high', relevanceScore: 85, verificationStatus: 'needs_review', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
      },
    } as any;
    const out = filterCandidates(phase, new Map([['cn_1', canon]]), segmentMap);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.segmentId, 's1');
    assert.equal(out[0]!.confidence, 'high');
  });

  test('accepts needs_review confidence + needs_review verification (Task 10.3)', () => {
    const canon = {
      title: 'X',
      _index_evidence_registry: {
        s1: { evidenceType: 'mistake', confidence: 'needs_review', relevanceScore: 82, verificationStatus: 'needs_review', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
      },
    } as any;
    const out = filterCandidates(phase, new Map([['cn_1', canon]]), segmentMap);
    assert.equal(out.length, 1);
    assert.equal(out[0]!.confidence, 'needs_review');
  });

  test('rejects low and unsupported confidence', () => {
    const canon = {
      title: 'X',
      _index_evidence_registry: {
        s1: { evidenceType: 'framework_step', confidence: 'low', relevanceScore: 90, verificationStatus: 'verified', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
        s2: { evidenceType: 'tool', confidence: 'unsupported', relevanceScore: 90, verificationStatus: 'verified', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
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

  test('rejects unverified (status=unverified) even at high score', () => {
    const canon = {
      title: 'X',
      _index_evidence_registry: {
        s1: { evidenceType: 'framework_step', confidence: 'high', relevanceScore: 90, verificationStatus: 'unverified', supportingPhrase: 'p', whyThisSegmentFits: 'w' },
      },
    } as any;
    const out = filterCandidates(phase, new Map([['cn_1', canon]]), segmentMap);
    assert.equal(out.length, 0);
  });
});

// ---------------------------------------------------------------------------
// filterAndOrderCandidates (Task 10.3 — new pure helper)
// ---------------------------------------------------------------------------

describe('filterAndOrderCandidates', () => {
  test('accepts high+medium+needs_review, rejects low+unsupported', () => {
    const cands = [
      { confidence: 'high' as const },
      { confidence: 'low' as const },
      { confidence: 'needs_review' as const },
      { confidence: 'unsupported' as const },
      { confidence: 'medium' as const },
    ];
    const result = filterAndOrderCandidates(cands, { min: 1, max: 5 });
    assert.equal(result.length, 3);
    // Order: high, medium, needs_review
    assert.deepEqual(result.map((c) => c.confidence), ['high', 'medium', 'needs_review']);
  });

  test('returns empty array when no usable candidates (below min)', () => {
    const cands = [{ confidence: 'low' as const }];   // 0 usable
    const result = filterAndOrderCandidates(cands, { min: 1, max: 5 });
    assert.equal(result.length, 0);
  });

  test('returns empty array for empty input', () => {
    const result = filterAndOrderCandidates([], { min: 1, max: 5 });
    assert.equal(result.length, 0);
  });

  test('caps at max', () => {
    const cands = Array.from({ length: 10 }, () => ({ confidence: 'high' as const }));
    const result = filterAndOrderCandidates(cands, { min: 1, max: 5 });
    assert.equal(result.length, 5);
  });

  test('respects min=1 threshold: 1 usable candidate passes', () => {
    const cands = [{ confidence: 'needs_review' as const }];
    const result = filterAndOrderCandidates(cands, { min: 1, max: 5 });
    assert.equal(result.length, 1);
  });

  test('ordering: high > medium > needs_review', () => {
    const cands = [
      { confidence: 'needs_review' as const },
      { confidence: 'high' as const },
      { confidence: 'medium' as const },
    ];
    const result = filterAndOrderCandidates(cands, { min: 1, max: 5 });
    assert.deepEqual(result.map((c) => c.confidence), ['high', 'medium', 'needs_review']);
  });
});
