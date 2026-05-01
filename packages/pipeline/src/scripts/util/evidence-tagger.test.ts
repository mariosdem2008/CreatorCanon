import { describe, it, expect } from 'vitest';
import { computeVerificationStatus } from './evidence-tagger';

describe('computeVerificationStatus', () => {
  const baseEntry = {
    segmentId: 'a', supportingPhrase: 'foo bar', evidenceType: 'claim' as const,
    supports: '', relevanceScore: 0, confidence: 'high' as const,
    roleEvidence: '', whyThisSegmentFits: '', verificationStatus: 'verified' as const,
  };

  it('returns unsupported when supportingPhrase not in segment text', () => {
    expect(computeVerificationStatus({ ...baseEntry, relevanceScore: 95 }, 'lorem ipsum')).toBe('unsupported');
  });
  it('returns unsupported when score < 40 even if substring matches', () => {
    expect(computeVerificationStatus({ ...baseEntry, relevanceScore: 30 }, 'foo bar baz')).toBe('unsupported');
  });
  it('returns verified when substring matches and score >= 70 and confidence high', () => {
    expect(computeVerificationStatus({ ...baseEntry, relevanceScore: 80 }, 'foo bar baz')).toBe('verified');
  });
  it('returns verified when substring matches and score >= 70 and confidence medium', () => {
    expect(computeVerificationStatus({ ...baseEntry, relevanceScore: 80, confidence: 'medium' }, 'foo bar baz')).toBe('verified');
  });
  it('returns needs_review when substring matches and score 70+ but confidence low', () => {
    expect(computeVerificationStatus({ ...baseEntry, relevanceScore: 80, confidence: 'low' }, 'foo bar baz')).toBe('needs_review');
  });
  it('returns needs_review when substring matches and 40 <= score < 70', () => {
    expect(computeVerificationStatus({ ...baseEntry, relevanceScore: 50 }, 'foo bar baz')).toBe('needs_review');
  });
});
