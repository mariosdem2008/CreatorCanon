// apps/web/src/lib/hub/manifest/schema.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  editorialAtlasManifestSchema,
  pageSectionSchema,
  citationSchema,
} from './schema';

test('citation schema: minimal valid', () => {
  const result = citationSchema.safeParse({
    id: 'cit_1', sourceVideoId: 'vid_1', videoTitle: 'How I plan',
    timestampStart: 261, timestampEnd: 318, timestampLabel: '04:21',
    excerpt: 'Planning your week removes decision fatigue.',
  });
  assert.equal(result.success, true);
});

test('citation schema: rejects negative timestamp', () => {
  const result = citationSchema.safeParse({
    id: 'c', sourceVideoId: 'v', videoTitle: 't',
    timestampStart: -1, timestampEnd: 10, timestampLabel: '0:00',
    excerpt: 'x',
  });
  assert.equal(result.success, false);
});

test('page section: overview kind round-trips', () => {
  const result = pageSectionSchema.safeParse({
    kind: 'overview',
    body: 'A quick mental model.',
    citationIds: ['cit_1', 'cit_2'],
  });
  assert.equal(result.success, true);
});

test('page section: workflow schedule round-trips', () => {
  const result = pageSectionSchema.safeParse({
    kind: 'workflow',
    schedule: [
      { day: 'Monday', items: ['Plan the week', 'Review priorities'] },
      { day: 'Friday', items: ['Wrap-up review'] },
    ],
  });
  assert.equal(result.success, true);
});

test('page section: rejects unknown kind', () => {
  const result = pageSectionSchema.safeParse({ kind: 'mystery', body: 'x' });
  assert.equal(result.success, false);
});

test('top-level manifest: schemaVersion is fixed', () => {
  const result = editorialAtlasManifestSchema.safeParse({
    schemaVersion: 'wrong_version',
    hubId: 'h', releaseId: 'r', hubSlug: 'ali',
    templateKey: 'editorial_atlas', visibility: 'public',
    publishedAt: null, generatedAt: '2026-04-25T10:00:00Z',
    title: 'x', tagline: 'y',
    creator: { name: 'A', handle: '@a', avatarUrl: '', bio: '', youtubeChannelUrl: '' },
    stats: { videoCount: 0, sourceCount: 0, transcriptPercent: 0, archiveYears: 0, pageCount: 0 },
    topics: [], pages: [], sources: [],
    navigation: { primary: [], secondary: [] },
    trust: { methodologySummary: '', qualityPrinciples: [], creationProcess: [], faq: [] },
  });
  assert.equal(result.success, false);
});
