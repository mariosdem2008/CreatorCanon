import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { computeVerificationStatus } from './evidence-tagger';

describe('computeVerificationStatus', () => {
  const baseEntry = {
    segmentId: 'a',
    supportingPhrase: 'foo bar',
    evidenceType: 'claim' as const,
    supports: '',
    relevanceScore: 0,
    confidence: 'high' as const,
    roleEvidence: '',
    whyThisSegmentFits: '',
    verificationStatus: 'verified' as const,
  };

  test('returns unsupported when supportingPhrase not in segment text', () => {
    assert.equal(
      computeVerificationStatus({ ...baseEntry, relevanceScore: 95 }, 'lorem ipsum'),
      'unsupported',
    );
  });

  test('returns unsupported when score < 40 even if substring matches', () => {
    assert.equal(
      computeVerificationStatus({ ...baseEntry, relevanceScore: 30 }, 'foo bar baz'),
      'unsupported',
    );
  });

  test('returns verified when substring matches and score >= 70 and confidence high', () => {
    assert.equal(
      computeVerificationStatus({ ...baseEntry, relevanceScore: 80 }, 'foo bar baz'),
      'verified',
    );
  });

  test('returns verified when substring matches and score >= 70 and confidence medium', () => {
    assert.equal(
      computeVerificationStatus(
        { ...baseEntry, relevanceScore: 80, confidence: 'medium' },
        'foo bar baz',
      ),
      'verified',
    );
  });

  test('returns needs_review when substring matches and score 70+ but confidence low', () => {
    assert.equal(
      computeVerificationStatus(
        { ...baseEntry, relevanceScore: 80, confidence: 'low' },
        'foo bar baz',
      ),
      'needs_review',
    );
  });

  test('returns needs_review when substring matches and 40 <= score < 70', () => {
    assert.equal(
      computeVerificationStatus({ ...baseEntry, relevanceScore: 50 }, 'foo bar baz'),
      'needs_review',
    );
  });
});
