import { eq, getDb } from '@creatorcanon/db';
import { hub, release, project } from '@creatorcanon/db/schema';
import type { EditorialAtlasManifest } from '../../../../apps/web/src/lib/hub/manifest/schema';
import type { AdapterFn } from '../types';
import { projectCreator } from './project-creator';
import { projectStats } from './project-stats';
import { projectTopics } from './project-topics';
import { projectPages } from './project-pages';
import { projectSources } from './project-sources';
import { projectNavigation } from './project-navigation';
import { projectTrust } from './project-trust';
import { projectHighlights } from './project-highlights';

export const adaptArchiveToEditorialAtlas: AdapterFn = async ({ runId, hubId, releaseId }) => {
  const db = getDb();

  const hubRow = (await db.select().from(hub).where(eq(hub.id, hubId)).limit(1))[0];
  const releaseRow = (
    await db.select().from(release).where(eq(release.id, releaseId)).limit(1)
  )[0];
  if (!hubRow || !releaseRow) {
    throw new Error(
      `Adapter: hub or release not found (hubId=${hubId}, releaseId=${releaseId})`,
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
  const sources = await projectSources({ runId, db, pages: pagesWithInternal });

  // Strip _internal from pages and cast citations to the correct (empty) shape.
  const pages = pagesWithInternal.map(({ _internal: _dropped, ...rest }) => ({
    ...rest,
    citations: [] as EditorialAtlasManifest['pages'][number]['citations'],
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
    publishedAt: releaseRow.liveAt?.toISOString() ?? null,
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
