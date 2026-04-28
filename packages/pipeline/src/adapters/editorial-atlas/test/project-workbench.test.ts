import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { projectWorkbench, projectWorkbenchPageFields } from '../project-workbench';
import type { Citation, Page } from '../manifest-types';
import type { ProjectedPageWithInternal } from '../project-pages';

function citation(id: string, overrides: Partial<Citation> = {}): Citation {
  return {
    id,
    sourceVideoId: `video_${id}`,
    videoTitle: `Video ${id}`,
    timestampStart: 75,
    timestampEnd: 90,
    timestampLabel: '1:15',
    excerpt: `Excerpt ${id}`,
    ...overrides,
  };
}

function page(
  id: string,
  overrides: Partial<Page & ProjectedPageWithInternal> = {},
): Page & ProjectedPageWithInternal {
  const citations = overrides.citations ?? [citation(`cite_${id}`)];
  return {
    id,
    slug: id,
    type: 'lesson',
    status: 'published',
    title: `Page ${id}`,
    summary: `Summary ${id}`,
    summaryPlainText: `Summary ${id}`,
    searchKeywords: [],
    topicSlugs: [],
    estimatedReadMinutes: 4,
    publishedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    citationCount: citations.length,
    sourceCoveragePercent: 1,
    evidenceQuality: 'strong',
    sections: [{ kind: 'paragraph', body: `Body ${id}` }],
    citations,
    relatedPageIds: [],
    artifactIds: [],
    sourceMomentIds: [],
    nextStepPageIds: [],
    _internal: {
      evidenceSegmentIds: [],
      primaryFindingId: `finding_${id}`,
      workbench: undefined,
    },
    ...overrides,
  };
}

describe('projectWorkbench', () => {
  it('projects reader-job paths with real artifact and source moment references', () => {
    const learn = page('learn', {
      readerJob: 'learn',
      citations: [citation('cite_seg_learn')],
      _internal: {
        evidenceSegmentIds: [],
        primaryFindingId: 'finding_learn',
        workbench: {
          readerJob: 'learn',
          artifacts: [
            {
              id: 'artifact_learn',
              type: 'checklist',
              title: 'Learning checklist',
              body: 'Read this first.',
              citationIds: ['seg_learn', 'missing_seg'],
            },
          ],
        },
      },
    });
    const build = page('build', {
      readerJob: 'build',
      citations: [citation('cite_seg_build', { timestampStart: 130, timestampLabel: '' })],
      _internal: {
        evidenceSegmentIds: [],
        primaryFindingId: 'finding_build',
        workbench: {
          readerJob: 'build',
          artifacts: [
            {
              id: 'artifact_build',
              type: 'workflow',
              title: 'Build workflow',
              body: 'Build this.',
              citationIds: ['seg_build'],
            },
          ],
        },
      },
    });
    const copy = page('copy', {
      readerJob: 'copy',
      citations: [citation('cite_seg_copy')],
      _internal: {
        evidenceSegmentIds: [],
        primaryFindingId: 'finding_copy',
        workbench: {
          readerJob: 'copy',
          artifacts: [
            {
              id: 'artifact_copy',
              type: 'prompt',
              title: 'Reusable prompt',
              body: 'Copy this prompt.',
              citationIds: ['cite_seg_copy'],
            },
          ],
        },
      },
    });

    const workbench = projectWorkbench({ pages: [build, copy, learn] });

    assert.deepEqual(
      workbench.guidedPaths.map((path) => path.id),
      ['path_start', 'path_build', 'path_copy'],
    );
    assert.deepEqual(workbench.guidedPaths[0]!.pageIds, ['learn']);
    assert.deepEqual(workbench.guidedPaths[1]!.pageIds, ['build']);
    assert.deepEqual(workbench.guidedPaths[2]!.pageIds, ['copy']);

    assert.deepEqual(
      workbench.artifacts.map((artifact) => artifact.id).sort(),
      ['artifact_build', 'artifact_copy', 'artifact_learn'],
    );
    assert.deepEqual(
      workbench.artifacts.find((artifact) => artifact.id === 'artifact_learn')?.citationIds,
      ['cite_seg_learn'],
    );
    assert.deepEqual(
      workbench.artifacts.find((artifact) => artifact.id === 'artifact_copy')?.citationIds,
      ['cite_seg_copy'],
    );
    assert.equal(workbench.artifacts.find((artifact) => artifact.id === 'artifact_build')?.pageId, 'build');

    const artifactIds = new Set(workbench.artifacts.map((artifact) => artifact.id));
    const sourceMomentIds = new Set(workbench.sourceMoments.map((moment) => moment.id));
    for (const path of workbench.guidedPaths) {
      assert.ok(path.pageIds.length > 0);
      assert.ok(path.artifactIds.every((id) => artifactIds.has(id)));
      assert.ok(path.sourceMomentIds.every((id) => sourceMomentIds.has(id)));
    }

    const buildMoment = workbench.sourceMoments.find((moment) => moment.pageIds.includes('build'));
    assert.ok(buildMoment);
    assert.equal(buildMoment.timestampLabel, '2:10');
    assert.equal(buildMoment.sourceVideoId, 'video_cite_seg_build');
  });

  it('projects page-level source moments and next steps from native workbench metadata', () => {
    const start = page('start', {
      title: 'Start Here',
      citations: [citation('cite_seg_start')],
      _internal: {
        evidenceSegmentIds: [],
        primaryFindingId: 'finding_start',
        workbench: {
          nextStepHints: [
            { title: 'Build System', reason: 'Implementation follows the overview.' },
            { title: 'Missing Page', reason: 'This should not resolve.' },
            { title: 'Start Here', reason: 'Self references should be ignored.' },
          ],
        },
      },
    });
    const build = page('build', {
      title: 'Build System',
      citations: [citation('cite_seg_build')],
    });
    const copy = page('copy', {
      title: 'Copy Assets',
      citations: [citation('cite_seg_copy')],
    });
    const workbench = projectWorkbench({ pages: [start, build, copy] });

    const pages = projectWorkbenchPageFields({
      pages: [start, build, copy],
      sourceMoments: workbench.sourceMoments,
    });

    assert.deepEqual(pages.find((candidate) => candidate.id === 'start')?.nextStepPageIds, ['build']);
    assert.deepEqual(pages.find((candidate) => candidate.id === 'start')?.sourceMomentIds, ['start_cite_seg_start']);
    assert.deepEqual(pages.find((candidate) => candidate.id === 'build')?.sourceMomentIds, ['build_cite_seg_build']);
  });

  it('fills guided paths from fallback pages when a reader-job group is missing', () => {
    const onlyBuild = page('only-build', { readerJob: 'build', type: 'playbook' });

    const workbench = projectWorkbench({ pages: [onlyBuild] });

    assert.deepEqual(
      workbench.guidedPaths.map((path) => path.pageIds),
      [['only-build'], ['only-build'], ['only-build']],
    );
    assert.equal(workbench.primaryAction.pageId, 'only-build');
  });

  it('handles empty page input without throwing', () => {
    const workbench = projectWorkbench({ pages: [] });

    assert.deepEqual(workbench.guidedPaths, []);
    assert.deepEqual(workbench.artifacts, []);
    assert.deepEqual(workbench.sourceMoments, []);
    assert.deepEqual(workbench.primaryAction, { label: 'Start exploring', href: '/' });
  });
});
