import { releaseKey, artifactKey, createR2Client } from '@creatorcanon/adapters';
import { and, asc, desc, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  hub,
  page,
  project,
  release,
} from '@creatorcanon/db/schema';
import { parseServerEnv } from '@creatorcanon/core';

import { getAdapter } from './adapters';
import type { CreatorManualManifest } from './adapters/creator-manual/manifest-types';
import { parseCreatorManualManifest } from './adapters/creator-manual/schema';

export interface PublishRunAsHubInput {
  workspaceId: string;
  projectId: string;
  runId: string;
  actorUserId: string;
}

export interface PublishRunAsHubResult {
  hubId: string;
  releaseId: string;
  subdomain: string;
  publicPath: string;
  manifestR2Key: string;
  pageCount: number;
}

type HubTheme = 'paper' | 'midnight' | 'field';

type ProjectConfigWithTheme = {
  presentation_preset?: unknown;
};

export function normalizeHubTheme(value: unknown): HubTheme {
  if (value === 'midnight' || value === 'playbook') return 'midnight';
  if (value === 'field' || value === 'guided') return 'field';
  return 'paper';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 30) || 'hub';
}

async function pickSubdomain(input: {
  workspaceId: string;
  projectId: string;
  title: string;
}): Promise<string> {
  const db = getDb();
  const base = slugify(input.title);

  for (let index = 0; index < 20; index += 1) {
    const candidate = index === 0 ? base : `${base}-${index + 1}`.slice(0, 30);
    const existing = await db
      .select({ projectId: hub.projectId })
      .from(hub)
      .where(eq(hub.subdomain, candidate))
      .limit(1);

    if (existing.length === 0 || existing[0]?.projectId === input.projectId) {
      return candidate;
    }
  }

  return `${base.slice(0, 21)}-${input.projectId.slice(0, 8)}`;
}

export async function getOrCreateHub(input: {
  workspaceId: string;
  projectId: string;
  title: string;
  theme: HubTheme;
}) {
  const db = getDb();
  const existing = await db
    .select()
    .from(hub)
    .where(and(eq(hub.projectId, input.projectId), eq(hub.workspaceId, input.workspaceId)))
    .limit(1);

  if (existing[0]) {
    const updates: Partial<typeof hub.$inferInsert> = { updatedAt: new Date() };
    let shouldUpdate = false;
    if (existing[0].theme !== input.theme) {
      updates.theme = input.theme;
      shouldUpdate = true;
    }
    if (existing[0].templateKey !== 'creator_manual') {
      updates.templateKey = 'creator_manual';
      shouldUpdate = true;
    }
    if (shouldUpdate) {
      await db
        .update(hub)
        .set(updates)
        .where(eq(hub.id, existing[0].id));
      const updated = await db.select().from(hub).where(eq(hub.id, existing[0].id)).limit(1);
      return updated[0]!;
    }
    return existing[0];
  }

  const subdomain = await pickSubdomain(input);
  const hubId = crypto.randomUUID();
  const now = new Date();

  await db.insert(hub).values({
    id: hubId,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    subdomain,
    theme: input.theme,
    templateKey: 'creator_manual',
    accessMode: 'public',
    freePreview: 'all',
    createdAt: now,
    updatedAt: now,
  });

  const rows = await db.select().from(hub).where(eq(hub.id, hubId)).limit(1);
  return rows[0]!;
}

type ReleaseMetadata = {
  actorUserId?: string;
  error?: string;
  pageVersionIds?: string[];
};

async function getCurrentPageVersionIds(input: {
  runId: string;
  workspaceId: string;
}): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ currentVersionId: page.currentVersionId })
    .from(page)
    .where(and(eq(page.runId, input.runId), eq(page.workspaceId, input.workspaceId)))
    .orderBy(asc(page.position));

  return rows
    .map((row) => row.currentVersionId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}

function metadataPageVersionIdsMatch(metadata: unknown, currentPageVersionIds: string[]): boolean {
  if (typeof metadata !== 'object' || metadata === null) return false;
  const pageVersionIds = (metadata as ReleaseMetadata).pageVersionIds;
  if (!Array.isArray(pageVersionIds)) return false;
  if (pageVersionIds.length !== currentPageVersionIds.length) return false;
  return pageVersionIds.every((id, index) => id === currentPageVersionIds[index]);
}

export async function publishRunAsHub(
  input: PublishRunAsHubInput,
): Promise<PublishRunAsHubResult> {
  const db = getDb();
  const now = new Date();

  const projectRows = await db
    .select()
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.workspaceId, input.workspaceId)))
    .limit(1);
  const projectRow = projectRows[0];
  if (!projectRow) throw new Error('Project was not found for this workspace.');

  const runRows = await db
    .select()
    .from(generationRun)
    .where(and(eq(generationRun.id, input.runId), eq(generationRun.workspaceId, input.workspaceId)))
    .limit(1);
  const runRow = runRows[0];
  if (!runRow || runRow.projectId !== input.projectId) {
    throw new Error('Generation run was not found for this project.');
  }
  if (runRow.status !== 'awaiting_review' && runRow.status !== 'published') {
    throw new Error(`Cannot publish a run with status ${runRow.status}.`);
  }

  // 1. Read and validate the creator_manual_v1 manifest written by the adapt
  //    stage before mutating hub/release state.
  const r2 = createR2Client(parseServerEnv(process.env));
  const adaptManifestKey = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'adapt',
    name: 'manifest.json',
  });

  const manifestObject = await r2.getObject(adaptManifestKey);
  const rawManifest: unknown = JSON.parse(new TextDecoder().decode(manifestObject.body));
  // Validate the full public contract before doing anything irreversible.
  parseCreatorManualManifest(rawManifest, 'Adapt-stage manifest');
  const currentPageVersionIds = await getCurrentPageVersionIds({
    runId: input.runId,
    workspaceId: input.workspaceId,
  });

  const projectConfig = projectRow.config as ProjectConfigWithTheme | null;
  const theme = normalizeHubTheme(projectConfig?.presentation_preset);
  const hubRow = await getOrCreateHub({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    title: projectRow.title,
    theme,
  });

  // 2. Idempotency: return a live release for this run only when the editable
  //    page snapshot has not changed since that release was built.
  const existingLive = await db
    .select()
    .from(release)
    .where(
      and(
        eq(release.hubId, hubRow.id),
        eq(release.runId, input.runId),
        eq(release.status, 'live'),
      ),
    )
    .limit(1);

  if (
    existingLive[0]?.manifestR2Key &&
    metadataPageVersionIdsMatch(existingLive[0].metadata, currentPageVersionIds)
  ) {
    const existingManifestObject = await r2.getObject(existingLive[0].manifestR2Key);
    const existingManifest = parseCreatorManualManifest(JSON.parse(
      new TextDecoder().decode(existingManifestObject.body),
    ), 'Existing live release manifest');
    return {
      hubId: hubRow.id,
      releaseId: existingLive[0].id,
      subdomain: hubRow.subdomain,
      publicPath: `/h/${hubRow.subdomain}`,
      manifestR2Key: existingLive[0].manifestR2Key,
      pageCount: existingManifest.stats.nodeCount,
    };
  }

  // 3. Compute next release number and generate a fresh release ID.
  const latestRelease = await db
    .select({ releaseNumber: release.releaseNumber })
    .from(release)
    .where(eq(release.hubId, hubRow.id))
    .orderBy(desc(release.releaseNumber))
    .limit(1);
  const releaseNumber = (latestRelease[0]?.releaseNumber ?? 0) + 1;
  const releaseId = crypto.randomUUID();

  // 4. Stamp the real releaseId and publishedAt into the manifest, then write to
  //    the release-keyed R2 path.
  const adapter = getAdapter(hubRow.templateKey);
  const currentManifest = await adapter({
    runId: input.runId,
    hubId: hubRow.id,
    releaseId: 'unpublished',
  });
  const validatedCurrentManifest = parseCreatorManualManifest(currentManifest, 'Fresh adapter manifest');
  const finalManifest: CreatorManualManifest = parseCreatorManualManifest({
    ...validatedCurrentManifest,
    releaseId,
    publishedAt: now.toISOString(),
  }, 'Final release manifest');
  const manifestR2Key = releaseKey({
    hubId: hubRow.id,
    releaseId,
    path: 'manifest.json',
  });

  const releaseMetadata: ReleaseMetadata = {
    actorUserId: input.actorUserId,
    pageVersionIds: currentPageVersionIds,
  };

  // 5. Write the release-keyed manifest before promoting DB state. If the
  //    transaction fails afterward, the old live release remains intact.
  await r2.putObject({
    key: manifestR2Key,
    body: JSON.stringify(finalManifest, null, 2),
    contentType: 'application/json',
  });

  await db.transaction(async (tx) => {
    // 6. Insert and promote the release atomically with hub/project/run updates.
    await tx.insert(release).values({
      id: releaseId,
      workspaceId: input.workspaceId,
      hubId: hubRow.id,
      runId: input.runId,
      releaseNumber,
      status: 'building',
      metadata: releaseMetadata,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(release)
      .set({ status: 'archived', archivedAt: now, updatedAt: now })
      .where(and(eq(release.hubId, hubRow.id), eq(release.status, 'live')));

    await tx
      .update(release)
      .set({
        status: 'live',
        manifestR2Key,
        builtAt: now,
        liveAt: now,
        updatedAt: now,
      })
      .where(eq(release.id, releaseId));

    await tx
      .update(hub)
      .set({ liveReleaseId: releaseId, updatedAt: now })
      .where(eq(hub.id, hubRow.id));

    await tx
      .update(project)
      .set({ publishedHubId: hubRow.id, updatedAt: now })
      .where(eq(project.id, input.projectId));

    await tx
      .update(generationRun)
      .set({ status: 'published', updatedAt: now })
      .where(eq(generationRun.id, input.runId));
  });

  return {
    hubId: hubRow.id,
    releaseId,
    subdomain: hubRow.subdomain,
    publicPath: `/h/${hubRow.subdomain}`,
    manifestR2Key,
    pageCount: finalManifest.stats.nodeCount,
  };
}
