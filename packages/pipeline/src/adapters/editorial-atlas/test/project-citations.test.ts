import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPageCitations } from '../project-citations';

describe('buildPageCitations', () => {
  it('builds one citation per evidence segment, joined to video metadata', () => {
    const pages = [
      { id: 'pg_1', evidenceSegmentIds: ['seg_a', 'seg_b'] },
    ];
    const segments = [
      { id: 'seg_a', videoId: 'vid_1', startMs: 12_000, endMs: 18_000, text: 'first cited line' },
      { id: 'seg_b', videoId: 'vid_2', startMs: 90_000, endMs: 95_000, text: 'second cited line' },
    ];
    const videos = [
      { id: 'vid_1', title: 'Video One', youtubeVideoId: null },
      { id: 'vid_2', title: 'Video Two', youtubeVideoId: 'yt_xyz' },
    ];

    const result = buildPageCitations({ pages, segments, videos });

    assert.equal(result.size, 1);
    const cites = result.get('pg_1')!;
    assert.equal(cites.length, 2);
    assert.equal(cites[0]!.id, 'cite_seg_a');
    assert.equal(cites[0]!.sourceVideoId, 'vid_1');
    assert.equal(cites[0]!.videoTitle, 'Video One');
    assert.equal(cites[0]!.timestampStart, 12);
    assert.equal(cites[0]!.timestampEnd, 18);
    assert.equal(cites[0]!.timestampLabel, '0:12');
    assert.equal(cites[0]!.excerpt, 'first cited line');
    assert.equal(cites[0]!.url, undefined);
    assert.equal(cites[1]!.url, 'https://www.youtube.com/watch?v=yt_xyz&t=90s');
  });

  it('returns empty list for a page with no evidence segments', () => {
    const result = buildPageCitations({
      pages: [{ id: 'pg_empty', evidenceSegmentIds: [] }],
      segments: [],
      videos: [],
    });
    assert.deepEqual(result.get('pg_empty'), []);
  });

  it('skips evidence segments missing from the segments lookup (defensive)', () => {
    const result = buildPageCitations({
      pages: [{ id: 'pg_1', evidenceSegmentIds: ['seg_missing'] }],
      segments: [],
      videos: [],
    });
    assert.deepEqual(result.get('pg_1'), []);
  });

  it('skips segments whose video is missing (defensive)', () => {
    const result = buildPageCitations({
      pages: [{ id: 'pg_1', evidenceSegmentIds: ['seg_a'] }],
      segments: [{ id: 'seg_a', videoId: 'vid_missing', startMs: 0, endMs: 1000, text: 'x' }],
      videos: [],
    });
    assert.deepEqual(result.get('pg_1'), []);
  });
});
