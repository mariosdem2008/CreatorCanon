import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichQuoteSection } from '../quote-enrichment';

describe('enrichQuoteSection', () => {
  it('attaches sourceVideoId + timestampStart from the first citation segment', () => {
    const segments = new Map([
      ['seg_a', { id: 'seg_a', videoId: 'vid_1', startMs: 90_500 }],
    ]);
    const enriched = enrichQuoteSection(
      { kind: 'quote', body: 'A real quote', citationIds: ['seg_a'] },
      segments,
    );
    assert.equal(enriched.sourceVideoId, 'vid_1');
    assert.equal(enriched.timestampStart, 90);
  });

  it('leaves the section unchanged when no citation IDs present', () => {
    const segments = new Map([['seg_a', { id: 'seg_a', videoId: 'vid_1', startMs: 0 }]]);
    const original = { kind: 'quote', body: 'Orphan quote', citationIds: [] };
    const enriched = enrichQuoteSection(original, segments);
    assert.equal(enriched.sourceVideoId, undefined);
    assert.equal(enriched.timestampStart, undefined);
    assert.equal(enriched.body, 'Orphan quote');
  });

  it('leaves non-quote sections completely untouched', () => {
    const segments = new Map([['seg_a', { id: 'seg_a', videoId: 'vid_1', startMs: 0 }]]);
    const overview = { kind: 'overview', body: 'A summary', citationIds: ['seg_a'] };
    const enriched = enrichQuoteSection(overview, segments);
    assert.deepEqual(enriched, overview);
  });
});
