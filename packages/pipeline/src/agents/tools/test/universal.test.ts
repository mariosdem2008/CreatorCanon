import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../../env-files';
import { listVideosTool, getVideoSummaryTool, listSegmentsForVideoTool, getSegmentTool } from '../universal';
import { seedTestRun, makeCtx, teardownTestRun, type SeedResult } from '../../../../test-helpers/fixtures';

// Load DATABASE_URL (and any other vars) from the repo-root .env before any DB call.
loadDefaultEnvFiles();

describe('universal read tools', () => {
  let seed: SeedResult;

  before(async () => {
    seed = await seedTestRun({
      videos: [
        { id: 'vid_focus_v1', title: 'How to focus', durationSec: 600 },
        { id: 'vid_unused_v2', title: 'Unused (no segments)', durationSec: 400 },
      ],
      segments: [
        { id: 'seg_v1_a', videoId: 'vid_focus_v1', startMs: 0, endMs: 30_000, text: 'Hello world' },
        { id: 'seg_v1_b', videoId: 'vid_focus_v1', startMs: 30_000, endMs: 60_000, text: 'Second segment' },
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
    assert.equal(out.segmentCount, 2);
  });

  it('listSegmentsForVideo returns segments in time order', async () => {
    const out = await listSegmentsForVideoTool.handler({ videoId: 'vid_focus_v1' }, makeCtx(seed));
    assert.equal(out.length, 2);
    assert.equal(out[0]?.id, 'seg_v1_a');
    assert.equal(out[1]?.id, 'seg_v1_b');
  });

  it('listSegmentsForVideo respects time range', async () => {
    const out = await listSegmentsForVideoTool.handler({ videoId: 'vid_focus_v1', range: { startSec: 30, endSec: 60 } }, makeCtx(seed));
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, 'seg_v1_b');
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
});
