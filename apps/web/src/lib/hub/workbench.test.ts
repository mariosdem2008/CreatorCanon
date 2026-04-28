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

test('deriveWorkbenchPageView creates action metadata for a page without new manifest fields', () => {
  const page = mockManifest.pages.find((candidate) => candidate.status === 'published');
  assert.ok(page);
  const view = deriveWorkbenchPageView(mockManifest, page);
  assert.ok(view.outcome.includes(page.title.toLowerCase()));
  assert.equal(view.useWhen.length, 3);
  assert.ok(view.nextPages.length > 0);
});
