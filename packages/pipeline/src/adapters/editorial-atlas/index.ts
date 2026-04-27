import { eq, getDb, inArray } from '@creatorcanon/db';
import { hub, release, project, segment, video as videoTable } from '@creatorcanon/db/schema';
import type { EditorialAtlasManifest } from './manifest-types';
import type { AdapterFn } from '../types';
import { projectCreator } from './project-creator';
import { projectStats } from './project-stats';
import { projectTopics } from './project-topics';
import { projectPages } from './project-pages';
import { projectSources } from './project-sources';
import { projectNavigation } from './project-navigation';
import { projectTrust } from './project-trust';
import { projectHighlights } from './project-highlights';
import { buildPageCitations } from './project-citations';

export const adaptArchiveToEditorialAtlas: AdapterFn = async ({ runId, hubId, releaseId }) => {
  const db = getDb();

  const hubRow = (await db.select().from(hub).where(eq(hub.id, hubId)).limit(1))[0];
  // releaseId='unpublished' is a sentinel meaning the manifest is being
  // generated before a release row exists (publishRunAsHub will overwrite
  // releaseId in the published copy of this manifest). Treat as missing.
  const releaseRow =
    releaseId === 'unpublished'
      ? undefined
      : (
          await db.select().from(release).where(eq(release.id, releaseId)).limit(1)
        )[0];
  if (!hubRow) {
    throw new Error(`Adapter: hub not found (hubId=${hubId})`);
  }
  if (releaseId !== 'unpublished' && !releaseRow) {
    throw new Error(
      `Adapter: release not found (hubId=${hubId}, releaseId=${releaseId})`,
    );
  }
  const projectRow = (
    await db.select().from(project).where(eq(project.id, hubRow.projectId)).limit(1)
  )[0];
  if (!projectRow) {
    throw new Error(`Adapter: project not found for hub '${hubId}'`);
  }

  const creator = await projectCreator({ workspaceId: hubRow.workspaceId, db });
  const topics = await projectTopics({ runId, db });
  const pagesWithInternal = await projectPages({ runId, db, topics });

  const publishedPageFindingIds = new Set<string>(
    pagesWithInternal.map((p) => p._internal.primaryFindingId),
  );
  const highlights = await projectHighlights({ runId, db, publishedPageFindingIds });
  const sources = await projectSources({
    runId,
    db,
    pages: pagesWithInternal,
    creatorName: creator.name,
  });

  // Build per-page citations from segment + video lookups so the manifest
  // carries real evidence references (matches the citationSchema in apps/web).
  const allSegmentIds = new Set<string>();
  for (const p of pagesWithInternal) {
    for (const id of p._internal.evidenceSegmentIds) allSegmentIds.add(id);
  }
  const segmentRows = allSegmentIds.size
    ? await db
        .select({
          id: segment.id,
          videoId: segment.videoId,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
        })
        .from(segment)
        .where(inArray(segment.id, [...allSegmentIds]))
    : [];
  const citationVideoIds = [...new Set(segmentRows.map((s) => s.videoId))];
  const citationVideoRows = citationVideoIds.length
    ? await db
        .select({ id: videoTable.id, title: videoTable.title, youtubeVideoId: videoTable.youtubeVideoId })
        .from(videoTable)
        .where(inArray(videoTable.id, citationVideoIds))
    : [];
  const citationsByPage = buildPageCitations({
    pages: pagesWithInternal.map((p) => ({
      id: p.id,
      evidenceSegmentIds: p._internal.evidenceSegmentIds,
    })),
    segments: segmentRows,
    videos: citationVideoRows,
  });
  const pages = pagesWithInternal.map(({ _internal: _dropped, ...rest }) => ({
    ...rest,
    citations: (citationsByPage.get(rest.id) ?? []) as EditorialAtlasManifest['pages'][number]['citations'],
  }));

  const stats = await projectStats({
    runId,
    db,
    pageCount: pages.length,
    sourceCount: sources.length,
  });
  const navigation = projectNavigation({ hasHighlights: highlights.length > 0 });
  const trust = projectTrust({ hubMetadata: hubRow.metadata });

  // Map visibility: 'public' → 'public', everything else → 'unlisted'.
  const visibility: 'public' | 'unlisted' =
    hubRow.accessMode === 'public' ? 'public' : 'unlisted';

  const manifest: EditorialAtlasManifest = {
    schemaVersion: 'editorial_atlas_v1',
    templateKey: 'editorial_atlas',
    hubId,
    releaseId,
    hubSlug: hubRow.subdomain,
    visibility,
    publishedAt: releaseRow?.liveAt?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
    title: projectRow.title,
    tagline:
      (hubRow.metadata as { tagline?: string } | null)?.tagline ??
      'A research-grade hub of published findings.',
    creator,
    stats,
    // Strip internal evidenceSegmentIds from topics before output.
    topics: topics.map(({ evidenceSegmentIds: _dropped, ...rest }) => rest),
    pages,
    sources,
    navigation,
    trust,
    highlights: highlights.length > 0 ? highlights : undefined,
  };

  return manifest;
};
