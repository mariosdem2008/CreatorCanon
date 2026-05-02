import assert from 'node:assert/strict';
import test from 'node:test';

import type { PublicYouTubeVideo } from '@creatorcanon/adapters';

import { selectVideosForAudit } from './sampling';

test('selectVideosForAudit returns all videos for small channels', () => {
  const videos = makeVideos(3);
  assert.deepEqual(
    selectVideosForAudit(videos, 10).map((video) => video.id),
    ['v0', 'v1', 'v2'],
  );
});

test('selectVideosForAudit returns a stable mixed sample with no duplicates', () => {
  const videos = makeVideos(20);
  const selected = selectVideosForAudit(videos, 8);
  const ids = selected.map((video) => video.id);

  assert.equal(selected.length, 8);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('v19'), 'recent high-signal video should be included');
  assert.ok(ids.includes('v12'), 'sampler should backfill beyond overlapping top videos');
});

function makeVideos(count: number): PublicYouTubeVideo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `v${index}`,
    title: index % 2 === 0 ? `Pricing system ${index}` : `Hiring playbook ${index}`,
    description: '',
    publishedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    durationSeconds: 300 + index * 60,
    viewCount: index * 100,
  }));
}
