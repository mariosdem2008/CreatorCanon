import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSourceMomentHref } from '../workbench';

describe('resolveSourceMomentHref', () => {
  it('returns YouTube URL when youtubeId is present', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: 'vid_abc',
      timestampStart: 90,
      source: { youtubeId: 'YT123', url: undefined },
    });
    assert.equal(result, 'https://www.youtube.com/watch?v=YT123&t=90s');
  });

  it('returns the citation.url when present and valid', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: 'vid_abc',
      timestampStart: 90,
      source: { youtubeId: null, url: 'https://example.com/watch' },
    });
    assert.equal(result, 'https://example.com/watch');
  });

  it('falls back to the internal source route when youtubeId is null', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'ai-ultimate-knowledge-hub',
      sourceVideoId: 'mu_9d970d091c38',
      timestampStart: 327,
      source: { youtubeId: null, url: undefined },
    });
    assert.equal(result, '/h/ai-ultimate-knowledge-hub/sources/mu_9d970d091c38?t=327');
  });

  it('floors fractional timestamps in the fallback', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: 'vid_abc',
      timestampStart: 327.9,
      source: { youtubeId: null, url: undefined },
    });
    assert.equal(result, '/h/demo/sources/vid_abc?t=327');
  });

  it('returns null when no sourceVideoId is available', () => {
    const result = resolveSourceMomentHref({
      hubSlug: 'demo',
      sourceVideoId: null,
      timestampStart: 0,
      source: { youtubeId: null, url: undefined },
    });
    assert.equal(result, null);
  });
});
