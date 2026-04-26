import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { editorialAtlasManifestSchema } from './schema';
import { mockManifest } from './mockManifest';

function clone() {
  return JSON.parse(JSON.stringify(mockManifest)) as Record<string, any>;
}

describe('manifest.highlights', () => {
  it('accepts a manifest with no highlights', () => {
    const m = clone();
    delete m.highlights;
    assert.equal(editorialAtlasManifestSchema.safeParse(m).success, true);
  });

  it('accepts a highlight with type=quote and a SegmentRef', () => {
    const m = clone();
    m.highlights = [
      {
        id: 'hl_1',
        type: 'quote',
        text: "Don't trust the urgency monster.",
        evidence: { sourceVideoId: 'vid_1', timestampStart: 90, timestampLabel: '1:30' },
      },
    ];
    assert.equal(editorialAtlasManifestSchema.safeParse(m).success, true);
  });

  it('rejects a highlight missing evidence', () => {
    const m = clone();
    m.highlights = [{ id: 'hl_1', type: 'quote', text: 'x' }];
    assert.equal(editorialAtlasManifestSchema.safeParse(m).success, false);
  });

  it('rejects a highlight with text over 280 chars', () => {
    const m = clone();
    m.highlights = [
      {
        id: 'hl_1', type: 'quote',
        text: 'x'.repeat(281),
        evidence: { sourceVideoId: 'vid_1', timestampStart: 0, timestampLabel: '0:00' },
      },
    ];
    assert.equal(editorialAtlasManifestSchema.safeParse(m).success, false);
  });

  it('rejects a highlight with empty sourceVideoId', () => {
    const m = clone();
    m.highlights = [
      {
        id: 'hl_1', type: 'quote', text: 'ok',
        evidence: { sourceVideoId: '', timestampStart: 0, timestampLabel: '0:00' },
      },
    ];
    assert.equal(editorialAtlasManifestSchema.safeParse(m).success, false);
  });
});
