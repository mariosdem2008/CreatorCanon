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
    stats: { videoCount: 0, sourceCount: 0, transcriptPercent: 0, archiveYears: 0, totalDurationMinutes: 0, pageCount: 0 },
    topics: [], pages: [], sources: [],
    navigation: { primary: [], secondary: [] },
    trust: { methodologySummary: '', qualityPrinciples: [], creationProcess: [], faq: [] },
  });
  assert.equal(result.success, false);
});

test('top-level manifest: v2 native workbench fields parse', () => {
  const result = editorialAtlasManifestSchema.safeParse({
    schemaVersion: 'editorial_atlas_v2',
    hubId: 'h',
    releaseId: 'r',
    hubSlug: 'ali',
    templateKey: 'editorial_atlas',
    visibility: 'public',
    publishedAt: null,
    generatedAt: '2026-04-25T10:00:00Z',
    title: 'Hub',
    tagline: 'A source-backed hub.',
    creator: { name: 'A', handle: '@a', avatarUrl: '', bio: '', youtubeChannelUrl: '' },
    stats: { videoCount: 1, sourceCount: 1, transcriptPercent: 1, archiveYears: 1, totalDurationMinutes: 10, pageCount: 1 },
    topics: [],
    pages: [
      {
        id: 'pg_1',
        slug: 'learn-fast',
        type: 'lesson',
        status: 'published',
        title: 'Learn fast',
        summary: 'A short summary.',
        summaryPlainText: 'A short summary.',
        readerJob: 'learn',
        outcome: 'Use one better learning loop.',
        useWhen: [
          'When starting a new topic.',
          'When checking whether the learning loop applies.',
        ],
        artifactIds: ['art_1'],
        sourceMomentIds: ['mom_1'],
        nextStepPageIds: ['pg_2'],
        searchKeywords: ['learning'],
        topicSlugs: ['learning'],
        estimatedReadMinutes: 3,
        publishedAt: '2026-04-25T10:00:00Z',
        updatedAt: '2026-04-25T10:00:00Z',
        citationCount: 1,
        sourceCoveragePercent: 1,
        evidenceQuality: 'strong',
        sections: [{ kind: 'overview', body: 'Start with one clear loop.', citationIds: ['cit_1'] }],
        citations: [
          {
            id: 'cit_1',
            sourceVideoId: 'vid_1',
            videoTitle: 'Learning loop',
            timestampStart: 12,
            timestampEnd: 30,
            timestampLabel: '0:12',
            excerpt: 'Start with one clear loop.',
          },
        ],
        relatedPageIds: [],
      },
    ],
    sources: [
      {
        id: 'vid_1',
        youtubeId: 'YT1001',
        title: 'Learning loop',
        channelName: 'Creator',
        publishedAt: '2026-04-25T10:00:00Z',
        durationSec: 600,
        thumbnailUrl: 'https://example.com/thumb.jpg',
        transcriptStatus: 'available',
        topicSlugs: ['learning'],
        citedPageIds: ['pg_1'],
        keyMoments: [{ timestampStart: 12, timestampEnd: 30, label: 'The loop' }],
        transcriptExcerpts: [{ timestampStart: 12, body: 'Start with one clear loop.' }],
      },
    ],
    navigation: { primary: [], secondary: [] },
    trust: {
      methodologySummary: 'Built from cited source material.',
      qualityPrinciples: [],
      creationProcess: [],
      faq: [],
    },
    workbench: {
      primaryAction: { label: 'Start the path', pageId: 'pg_1' },
      guidedPaths: [
        {
          id: 'path_1',
          title: 'Learn the loop',
          body: 'Move from concept to practice.',
          outcome: 'A reusable learning loop.',
          timeLabel: '15 min',
          pageIds: ['pg_1'],
          artifactIds: ['art_1'],
          sourceMomentIds: ['mom_1'],
        },
      ],
      artifacts: [
        {
          id: 'art_1',
          type: 'checklist',
          title: 'Learning loop checklist',
          body: 'Choose, explain, test, revise.',
          pageId: 'pg_1',
          citationIds: ['cit_1'],
        },
      ],
      sourceMoments: [
        {
          id: 'mom_1',
          title: 'The loop',
          sourceVideoId: 'vid_1',
          timestampStart: 12,
          timestampLabel: '0:12',
          excerpt: 'Start with one clear loop.',
          pageIds: ['pg_1'],
        },
      ],
    },
  });

  assert.equal(result.success, true);
  assert.equal(result.data?.schemaVersion, 'editorial_atlas_v2');
  assert.equal(result.data?.pages[0]?.readerJob, 'learn');
  assert.equal(result.data?.workbench?.guidedPaths[0]?.pageIds[0], 'pg_1');
});

test('top-level manifest: v2 native page rejects string useWhen', () => {
  const result = editorialAtlasManifestSchema.safeParse({
    schemaVersion: 'editorial_atlas_v2',
    hubId: 'h',
    releaseId: 'r',
    hubSlug: 'ali',
    templateKey: 'editorial_atlas',
    visibility: 'public',
    publishedAt: null,
    generatedAt: '2026-04-25T10:00:00Z',
    title: 'Hub',
    tagline: 'A source-backed hub.',
    creator: { name: 'A', handle: '@a', avatarUrl: '', bio: '', youtubeChannelUrl: '' },
    stats: { videoCount: 1, sourceCount: 1, transcriptPercent: 1, archiveYears: 1, totalDurationMinutes: 10, pageCount: 1 },
    topics: [],
    pages: [
      {
        id: 'pg_1',
        slug: 'learn-fast',
        type: 'lesson',
        status: 'published',
        title: 'Learn fast',
        summary: 'A short summary.',
        summaryPlainText: 'A short summary.',
        readerJob: 'learn',
        outcome: 'Use one better learning loop.',
        useWhen: 'When starting a new topic.',
        searchKeywords: ['learning'],
        topicSlugs: ['learning'],
        estimatedReadMinutes: 3,
        publishedAt: '2026-04-25T10:00:00Z',
        updatedAt: '2026-04-25T10:00:00Z',
        citationCount: 1,
        sourceCoveragePercent: 1,
        evidenceQuality: 'strong',
        sections: [{ kind: 'overview', body: 'Start with one clear loop.', citationIds: ['cit_1'] }],
        citations: [
          {
            id: 'cit_1',
            sourceVideoId: 'vid_1',
            videoTitle: 'Learning loop',
            timestampStart: 12,
            timestampEnd: 30,
            timestampLabel: '0:12',
            excerpt: 'Start with one clear loop.',
          },
        ],
        relatedPageIds: [],
      },
    ],
    sources: [],
    navigation: { primary: [], secondary: [] },
    trust: {
      methodologySummary: 'Built from cited source material.',
      qualityPrinciples: [],
      creationProcess: [],
      faq: [],
    },
  });

  assert.equal(result.success, false);
});
