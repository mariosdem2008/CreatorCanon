import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../../env-files';
import { listVideosTool, getVideoSummaryTool, listSegmentsForVideoTool, getSegmentTool } from '../universal';
import { seedTestRun, makeCtx, teardownTestRun, type SeedResult } from '../../../../test-helpers/fixtures';

describe('universal read tools', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    seed = await seedTestRun({
      videos: [
        { id: 'vid_focus_v1', title: 'How to focus', durationSec: 600 },
        { id: 'vid_unused_v2', title: 'Unused (no segments)', durationSec: 400 },
      ],
      segments: [
        { id: 'seg_v1_a', videoId: 'vid_focus_v1', startMs: 0,       endMs: 30_000, text: 'Hello world' },
        { id: 'seg_v1_b', videoId: 'vid_focus_v1', startMs: 30_000,  endMs: 60_000, text: 'Second segment' },
        { id: 'seg_v1_span', videoId: 'vid_focus_v1', startMs: 50_000, endMs: 90_000, text: 'Spans the boundary' },
      ],
    });
  });

  after(async () => { await teardownTestRun(seed); });

  it('listVideos returns only videos with segments in this run', async () => {
    const out = await listVideosTool.handler({}, makeCtx(seed));
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, 'vid_focus_v1');
    assert.equal(out[0]?.title, 'How to focus');
    assert.equal(out[0]?.durationSec, 600);
  });

  it('getVideoSummary returns title + segmentCount', async () => {
    const out = await getVideoSummaryTool.handler({ videoId: 'vid_focus_v1' }, makeCtx(seed));
    assert.equal(out.title, 'How to focus');
    assert.equal(out.summary, null);
    assert.equal(out.durationSec, 600);
    assert.equal(out.segmentCount, 3);
  });

  it('listSegmentsForVideo returns segments in time order', async () => {
    const out = await listSegmentsForVideoTool.handler({ videoId: 'vid_focus_v1' }, makeCtx(seed));
    assert.equal(out.length, 3);
    assert.equal(out[0]?.id, 'seg_v1_a');
    assert.equal(out[1]?.id, 'seg_v1_b');
    assert.equal(out[2]?.id, 'seg_v1_span');
  });

  it('listSegmentsForVideo respects time range', async () => {
    const out = await listSegmentsForVideoTool.handler(
      { videoId: 'vid_focus_v1', range: { startSec: 30, endSec: 60 } },
      makeCtx(seed),
    );
    // Inclusive overlap: a segment ending at 30s touches the range start;
    // a segment starting at 50s touches the range end.
    assert.equal(out.length, 3);
    assert.deepEqual(out.map((s) => s.id).sort(), ['seg_v1_a', 'seg_v1_b', 'seg_v1_span']);
  });

  it('getSegment returns the row', async () => {
    const out = await getSegmentTool.handler({ segmentId: 'seg_v1_a' }, makeCtx(seed));
    assert.equal(out.text, 'Hello world');
    assert.equal(out.videoId, 'vid_focus_v1');
  });

  it('getSegment throws on unknown id', async () => {
    await assert.rejects(
      () => getSegmentTool.handler({ segmentId: 'seg_BOGUS' }, makeCtx(seed)),
      /not found/,
    );
  });

  it('listSegmentsForVideo includes segments that overlap range start', async () => {
    // range [40, 70] should include: seg_v1_b (30-60: ends in range) + seg_v1_span (50-90: starts in range)
    const out = await listSegmentsForVideoTool.handler(
      { videoId: 'vid_focus_v1', range: { startSec: 40, endSec: 70 } },
      makeCtx(seed),
    );
    const ids = out.map((s) => s.id).sort();
    assert.deepEqual(ids, ['seg_v1_b', 'seg_v1_span']);
  });

  it('listSegmentsForVideo includes a segment that fully contains the range', async () => {
    // range [55, 65] is fully inside seg_v1_span (50-90)
    const out = await listSegmentsForVideoTool.handler(
      { videoId: 'vid_focus_v1', range: { startSec: 55, endSec: 65 } },
      makeCtx(seed),
    );
    const ids = out.map((s) => s.id).sort();
    assert.deepEqual(ids, ['seg_v1_b', 'seg_v1_span']); // seg_v1_b also overlaps (30-60 vs 55-65)
  });

  it('getVideoSummary throws when videoId belongs to a different run', async () => {
    // The seed has 'vid_focus_v1' (with segments) and 'vid_unused_v2' (no segments
    // in the run — but the row still exists in the video table).
    await assert.rejects(
      () => getVideoSummaryTool.handler({ videoId: 'vid_unused_v2' }, makeCtx(seed)),
      /not found in run/,
    );
  });
});
