import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { collectHighlights } from '../highlights-collector';

describe('collectHighlights', () => {
  it('collects orphan quotes (no supports relation to a published page)', () => {
    const out = collectHighlights({
      findings: [
        { id: 'q1', type: 'quote', payload: { text: 'orphan quote' }, evidenceSegmentIds: ['s1'] } as any,
        { id: 'q2', type: 'quote', payload: { text: 'embedded quote' }, evidenceSegmentIds: ['s2'] } as any,
      ],
      relations: [{ fromFindingId: 'q2', toFindingId: 'lesson_1', type: 'supports', evidenceSegmentIds: ['s2'] } as any],
      publishedPageFindingIds: new Set(['lesson_1']),
      segmentLookup: { s1: { videoId: 'v1', startMs: 30_000 }, s2: { videoId: 'v1', startMs: 60_000 } },
    });
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, 'hl_q1');
  });

  it('formats timestamps as M:SS', () => {
    const out = collectHighlights({
      findings: [{ id: 'a1', type: 'aha_moment', payload: { quote: 'aha line', context: 'why' }, evidenceSegmentIds: ['s5'] } as any],
      relations: [],
      publishedPageFindingIds: new Set(),
      segmentLookup: { s5: { videoId: 'v1', startMs: 90_000 } },
    });
    assert.equal(out[0]?.evidence.timestampStart, 90);
    assert.equal(out[0]?.evidence.timestampLabel, '1:30');
  });

  it('skips findings with no evidence segments or unknown segment lookup', () => {
    const out = collectHighlights({
      findings: [
        { id: 'q1', type: 'quote', payload: { text: 'x' }, evidenceSegmentIds: [] } as any,
        { id: 'q2', type: 'quote', payload: { text: 'y' }, evidenceSegmentIds: ['unknown'] } as any,
      ],
      relations: [],
      publishedPageFindingIds: new Set(),
      segmentLookup: { },
    });
    assert.equal(out.length, 0);
  });
});
