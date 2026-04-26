import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aggregateEvidence } from '../evidence-aggregator';

describe('aggregateEvidence', () => {
  it('computes citationCount from unique segment IDs', () => {
    const out = aggregateEvidence({
      pages: [{ id: 'p1', sections: [{ citations: ['s1','s2'] }, { citations: ['s2','s3'] }], primaryFindingId: 'f1', supportingFindingIds: [] }],
      findings: [{ id: 'f1', evidenceQuality: 'strong', evidenceSegmentIds: [] } as any],
      relations: [],
    });
    assert.equal(out.byPageId['p1']?.citationCount, 3);
  });

  it('sourceCoveragePercent is sectionsWithCitations / total sections', () => {
    const out = aggregateEvidence({
      pages: [{
        id: 'p1',
        sections: [{ citations: ['s1'] }, { /* no citations */ }, { citations: ['s2'] }],
        primaryFindingId: 'f1', supportingFindingIds: [],
      }],
      findings: [{ id: 'f1', evidenceQuality: 'strong', evidenceSegmentIds: [] } as any],
      relations: [],
    });
    assert.ok(Math.abs((out.byPageId['p1']?.sourceCoveragePercent ?? 0) - 2 / 3) < 0.0001);
  });

  it('computes evidenceQuality as max-rule (limited dominates)', () => {
    const out = aggregateEvidence({
      pages: [{ id: 'p1', sections: [], primaryFindingId: 'f1', supportingFindingIds: ['f2'] }],
      findings: [{ id: 'f1', evidenceQuality: 'strong' } as any, { id: 'f2', evidenceQuality: 'limited' } as any],
      relations: [],
    });
    assert.equal(out.byPageId['p1']?.evidenceQuality, 'limited');
  });

  it('all strong → strong', () => {
    const out = aggregateEvidence({
      pages: [{ id: 'p1', sections: [], primaryFindingId: 'f1', supportingFindingIds: ['f2'] }],
      findings: [{ id: 'f1', evidenceQuality: 'strong' } as any, { id: 'f2', evidenceQuality: 'strong' } as any],
      relations: [],
    });
    assert.equal(out.byPageId['p1']?.evidenceQuality, 'strong');
  });

  it('computes relatedPageIds via supports/builds_on/related_to', () => {
    const out = aggregateEvidence({
      pages: [
        { id: 'p1', sections: [], primaryFindingId: 'f1', supportingFindingIds: [] },
        { id: 'p2', sections: [], primaryFindingId: 'f2', supportingFindingIds: [] },
      ],
      findings: [
        { id: 'f1', evidenceQuality: 'strong', evidenceSegmentIds: ['s1','s2'] } as any,
        { id: 'f2', evidenceQuality: 'strong', evidenceSegmentIds: ['s1'] } as any,
      ],
      relations: [{ fromFindingId: 'f1', toFindingId: 'f2', type: 'related_to', evidenceSegmentIds: ['s1'] } as any],
    });
    assert.deepEqual(out.byPageId['p1']?.relatedPageIds, ['p2']);
  });
});
