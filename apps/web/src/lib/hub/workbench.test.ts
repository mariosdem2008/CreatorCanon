import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveHubWorkbench, deriveWorkbenchPageView } from './workbench';
import { mockManifest } from './manifest/mockManifest';

test('deriveHubWorkbench produces the three command-center paths', () => {
  const workbench = deriveHubWorkbench(mockManifest);
  assert.equal(workbench.startPath.pages.length, 3);
  assert.equal(workbench.buildPath.pages.length, 3);
  assert.equal(workbench.copyPath.pages.length, 3);
  assert.equal(workbench.quickWins.length, 4);
});

test('deriveHubWorkbench extracts reusable artifacts from current section kinds', () => {
  const workbench = deriveHubWorkbench(mockManifest);
  assert.ok(workbench.artifacts.length > 0);
  assert.ok(workbench.artifacts.every((artifact) => artifact.body.length > 0));
  assert.ok(workbench.artifacts.some((artifact) => artifact.typeLabel === 'Workflow'));
});

test('deriveHubWorkbench renders singular citation labels', () => {
  const pageWithOneCitation = mockManifest.pages.find((candidate) => candidate.citationCount === 1);
  assert.ok(pageWithOneCitation);
  const manifest = {
    ...mockManifest,
    pages: [
      {
        ...pageWithOneCitation,
        status: 'published' as const,
        type: 'playbook' as const,
      },
    ],
  };

  const workbench = deriveHubWorkbench(manifest);

  assert.equal(workbench.buildPath.pages[0]?.citationLabel, '1 citation');
});

test('deriveHubWorkbench extracts source moments with safe display fields', () => {
  const workbench = deriveHubWorkbench(mockManifest);
  assert.ok(workbench.sourceMoments.length > 0);
  assert.ok(workbench.sourceMoments.every((moment) => moment.sourceTitle.length > 0));
  assert.ok(workbench.sourceMoments.every((moment) => moment.timestampLabel.includes(':')));
});

test('deriveHubWorkbench prefers native v2 guided paths and workbench data', () => {
  const [startPage, buildPage, copyPage, extraPage, fifthPage] = mockManifest.pages.filter(
    (candidate) => candidate.status === 'published',
  );
  assert.ok(startPage);
  assert.ok(buildPage);
  assert.ok(copyPage);
  assert.ok(extraPage);
  assert.ok(fifthPage);

  const manifest = {
    ...mockManifest,
    schemaVersion: 'editorial_atlas_v2' as const,
    pages: [
      { ...startPage, readerJob: 'learn' as const, outcome: 'Learn the core loop.' },
      { ...buildPage, readerJob: 'build' as const, outcome: 'Build the system.' },
      { ...copyPage, readerJob: 'copy' as const, outcome: 'Copy the reusable asset.' },
      extraPage,
      fifthPage,
    ],
    sources: [
      { ...mockManifest.sources[0]!, id: 'native_source', youtubeId: null, title: 'Untitled video' },
    ],
    workbench: {
      primaryAction: { label: 'Start' },
      guidedPaths: [
        {
          id: 'native-start',
          title: 'Native start path',
          body: 'Use the native workbench path.',
          outcome: 'A clearer first session.',
          timeLabel: '20 min',
          pageIds: [startPage.id, buildPage.id, copyPage.id, extraPage.id, fifthPage.id],
          artifactIds: ['native_artifact'],
          sourceMomentIds: ['native_moment'],
        },
        {
          id: 'native-build',
          title: 'Native build path',
          body: 'Build from native data.',
          outcome: 'A working system.',
          timeLabel: '30 min',
          pageIds: [buildPage.id],
          artifactIds: [],
          sourceMomentIds: [],
        },
        {
          id: 'native-copy',
          title: 'Native copy path',
          body: 'Copy from native data.',
          outcome: 'A reusable prompt.',
          timeLabel: '10 min',
          pageIds: [copyPage.id],
          artifactIds: [],
          sourceMomentIds: [],
        },
      ],
      artifacts: [
        {
          id: 'native_artifact',
          type: 'schema' as const,
          title: 'Native schema',
          body: 'Use this schema.',
          pageId: buildPage.id,
          citationIds: [],
        },
        {
          id: 'missing_page_artifact',
          type: 'prompt' as const,
          title: 'Missing page artifact',
          body: 'This should be filtered.',
          pageId: 'missing_page',
          citationIds: [],
        },
      ],
      sourceMoments: [
        {
          id: 'native_moment',
          title: 'Untitled source',
          sourceVideoId: 'native_source',
          timestampStart: 90,
          timestampLabel: '1:30',
          excerpt: 'A native source moment.',
          pageIds: [startPage.id],
        },
      ],
    },
  };

  const workbench = deriveHubWorkbench(manifest);

  assert.equal(workbench.startPath.id, 'native-start');
  assert.equal(workbench.startPath.pages.length, 4);
  assert.deepEqual(workbench.startPath.pages.map((page) => page.id), [
    startPage.id,
    buildPage.id,
    copyPage.id,
    extraPage.id,
  ]);
  assert.equal(workbench.startPath.body, 'Use the native workbench path.');
  assert.equal(workbench.artifacts.length, 1);
  assert.equal(workbench.artifacts[0]?.pageSlug, buildPage.slug);
  assert.equal(workbench.artifacts[0]?.typeLabel, 'Template');
  assert.equal(workbench.sourceMoments.length, 1);
  assert.equal(workbench.sourceMoments[0]?.pageSlug, startPage.slug);
  assert.equal(workbench.sourceMoments[0]?.sourceTitle, 'Source 1');
  assert.equal(workbench.sourceMoments[0]?.href, null);
});

test('deriveWorkbenchPageView creates action metadata for a page without new manifest fields', () => {
  const page = mockManifest.pages.find((candidate) => candidate.status === 'published');
  assert.ok(page);
  const view = deriveWorkbenchPageView(mockManifest, page);
  assert.ok(view.outcome.includes(page.title.toLowerCase()));
  assert.equal(view.useWhen.length, 3);
  assert.ok(view.nextPages.length > 0);
});

test('deriveWorkbenchPageView prefers complete native v2 page metadata', () => {
  const [page, nextPage] = mockManifest.pages.filter((candidate) => candidate.status === 'published');
  assert.ok(page);
  assert.ok(nextPage);

  const manifest = {
    ...mockManifest,
    schemaVersion: 'editorial_atlas_v2' as const,
    pages: [
      {
        ...page,
        readerJob: 'decide' as const,
        outcome: 'Decide whether this learning loop is worth adopting.',
        useWhen: 'Use this before changing your learning system.',
        artifactIds: ['second_artifact', 'native_artifact'],
        nextStepPageIds: [nextPage.id],
      },
      nextPage,
    ],
    workbench: {
      primaryAction: { label: 'Start' },
      guidedPaths: [
        {
          id: 'native-start',
          title: 'Native start path',
          body: 'Use the native workbench path.',
          outcome: 'A clearer first session.',
          timeLabel: '20 min',
          pageIds: [page.id],
          artifactIds: ['second_artifact', 'native_artifact'],
          sourceMomentIds: [],
        },
      ],
      artifacts: [
        {
          id: 'native_artifact',
          type: 'checklist' as const,
          title: 'Manifest-first checklist',
          body: 'Run this checklist.',
          pageId: page.id,
          citationIds: [],
        },
        {
          id: 'unlisted_artifact',
          type: 'prompt' as const,
          title: 'Unlisted prompt',
          body: 'This page did not request it.',
          pageId: page.id,
          citationIds: [],
        },
        {
          id: 'second_artifact',
          type: 'template' as const,
          title: 'Page-first template',
          body: 'Use this first.',
          pageId: page.id,
          citationIds: [],
        },
      ],
      sourceMoments: [],
    },
  };

  const view = deriveWorkbenchPageView(manifest, manifest.pages[0]!);

  assert.equal(view.intent, 'learn');
  assert.equal(view.outcome, 'Decide whether this learning loop is worth adopting.');
  assert.deepEqual(view.useWhen, ['Use this before changing your learning system.']);
  assert.equal(view.primaryArtifact?.id, 'second_artifact');
  assert.equal(view.primaryArtifact?.title, 'Page-first template');
  assert.equal(view.primaryArtifact?.pageSlug, page.slug);
  assert.deepEqual(view.nextPages.map((next) => next.id), [nextPage.id]);
});

test('deriveWorkbenchPageView falls back when v2 page metadata is incomplete', () => {
  const [page, relatedPage] = mockManifest.pages.filter((candidate) => candidate.status === 'published');
  assert.ok(page);
  assert.ok(relatedPage);

  const manifest = {
    ...mockManifest,
    schemaVersion: 'editorial_atlas_v2' as const,
    pages: [
      {
        ...page,
        readerJob: 'copy' as const,
        outcome: 'Native outcome should not be used.',
        useWhen: '   ',
        artifactIds: ['missing_artifact'],
        nextStepPageIds: ['missing_page'],
        relatedPageIds: [relatedPage.id],
      },
      relatedPage,
    ],
    workbench: {
      primaryAction: { label: 'Start' },
      guidedPaths: [
        {
          id: 'native-start',
          title: 'Native start path',
          body: 'Use the native workbench path.',
          outcome: 'A clearer first session.',
          timeLabel: '20 min',
          pageIds: [page.id],
          artifactIds: [],
          sourceMomentIds: [],
        },
      ],
      artifacts: [
        {
          id: 'unlisted_artifact',
          type: 'prompt' as const,
          title: 'Unlisted prompt',
          body: 'The page did not list this artifact.',
          pageId: page.id,
          citationIds: [],
        },
      ],
      sourceMoments: [],
    },
  };

  const view = deriveWorkbenchPageView(manifest, manifest.pages[0]!);

  assert.ok(view.outcome.includes(page.title.toLowerCase()));
  assert.notEqual(view.outcome, 'Native outcome should not be used.');
  assert.equal(view.useWhen.length, 3);
  assert.deepEqual(view.nextPages.map((next) => next.id), [relatedPage.id]);
  assert.notEqual(view.primaryArtifact?.id, 'unlisted_artifact');
});
