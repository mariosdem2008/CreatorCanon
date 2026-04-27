import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sourceThumbnail } from '../source-thumbnail';

describe('sourceThumbnail', () => {
  it('uses YouTube hqdefault when youtubeVideoId is set', () => {
    const url = sourceThumbnail({ youtubeVideoId: 'abc123', thumbnails: null });
    assert.equal(url, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('prefers an explicit thumbnails.medium url when present', () => {
    const url = sourceThumbnail({
      youtubeVideoId: null,
      thumbnails: { medium: 'https://cdn.example/x.jpg' },
    });
    assert.equal(url, 'https://cdn.example/x.jpg');
  });

  it('returns a data: URL SVG fallback when nothing else available', () => {
    const url = sourceThumbnail({ youtubeVideoId: null, thumbnails: null });
    assert.match(url, /^data:image\/svg\+xml;base64,/);
  });
});
