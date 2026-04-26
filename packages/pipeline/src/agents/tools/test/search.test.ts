import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadDefaultEnvFiles } from '../../../env-files';
import { searchSegmentsTool } from '../search';
import { seedTestRun, teardownTestRun, makeCtx, type SeedResult } from '../../../../test-helpers/fixtures';

describe('searchSegments BM25', () => {
  let seed: SeedResult;

  before(async () => {
    loadDefaultEnvFiles();
    seed = await seedTestRun({
      videos: [
        { id: 'vid_v1', title: 'Productivity', durationSec: 600 },
        { id: 'vid_v2', title: 'Habits', durationSec: 600 },
      ],
      segments: [
        { id: 'seg_s1', videoId: 'vid_v1', startMs: 0, endMs: 30_000, text: 'The Pomodoro technique helps you focus deeply on a task.' },
        { id: 'seg_s2', videoId: 'vid_v1', startMs: 30_000, endMs: 60_000, text: 'Take a five minute break and stretch.' },
        { id: 'seg_s3', videoId: 'vid_v2', startMs: 0, endMs: 30_000, text: 'Habits compound over time when you focus on consistency.' },
      ],
    });
  });

  after(async () => { await teardownTestRun(seed); });

  it('returns matches ranked by relevance', async () => {
    const out = await searchSegmentsTool.handler({ query: 'focus pomodoro' }, makeCtx(seed));
    assert.ok(out.length >= 1);
    assert.equal(out[0]?.segmentId, 'seg_s1');
    assert.ok(out[0]?.score > 0);
  });

  it('respects videoIds filter', async () => {
    const out = await searchSegmentsTool.handler({ query: 'focus', videoIds: ['vid_v2'] }, makeCtx(seed));
    assert.ok(out.length >= 1);
    assert.ok(out.every((r) => r.videoId === 'vid_v2'));
  });

  it('returns empty for a non-matching query', async () => {
    const out = await searchSegmentsTool.handler({ query: 'zzzqqqxxxnomatch' }, makeCtx(seed));
    assert.equal(out.length, 0);
  });

  it('caps topK at 50', async () => {
    const out = await searchSegmentsTool.handler({ query: 'focus', topK: 999 }, makeCtx(seed));
    assert.ok(out.length <= 50);
  });

  it('clamps negative topK to 1 (does not crash Postgres)', async () => {
    const out = await searchSegmentsTool.handler({ query: 'focus', topK: -5 }, makeCtx(seed));
    // -5 should be clamped to 1, returning at most one match.
    assert.ok(out.length >= 0 && out.length <= 1);
  });

  it('returns [] on tsquery syntax error (does not throw)', async () => {
    // Stub the db.execute on this ctx to throw a PostgresError with code 22P02.
    const ctx = makeCtx(seed);
    const realExecute = ctx.db.execute.bind(ctx.db);
    let throwCount = 0;
    ctx.db.execute = (async (...args: unknown[]) => {
      throwCount++;
      const err = new Error('mocked tsquery syntax error') as Error & { code: string };
      err.code = '22P02';
      throw err;
    }) as typeof ctx.db.execute;
    try {
      const out = await searchSegmentsTool.handler({ query: 'focus pomodoro' }, ctx);
      assert.deepEqual(out, []);
      assert.equal(throwCount, 1);
    } finally {
      ctx.db.execute = realExecute;
    }
  });

  it('does not return segments from other workspaces', async () => {
    // Seed a SECOND fully-isolated graph with the same query string.
    const otherSeed = await seedTestRun({
      videos: [{ id: 'vid_other', title: 'Other workspace', durationSec: 300 }],
      segments: [{ id: 'seg_other', videoId: 'vid_other', startMs: 0, endMs: 30_000, text: 'Pomodoro is a focus technique.' }],
    });
    try {
      // Query against `seed` workspace must NOT return seg_other.
      const out = await searchSegmentsTool.handler({ query: 'pomodoro focus' }, makeCtx(seed));
      assert.ok(out.every((r) => r.segmentId !== 'seg_other'));
    } finally {
      await teardownTestRun(otherSeed);
    }
  });
});
