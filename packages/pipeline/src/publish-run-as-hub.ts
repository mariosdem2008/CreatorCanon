import { releaseKey, createR2Client } from '@creatorcanon/adapters';
import { and, asc, desc, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  hub,
  page,
  pageVersion,
  project,
  release,
} from '@creatorcanon/db/schema';
import { parseServerEnv } from '@creatorcanon/core';

import {
  type ReleaseManifestV0,
  type ReleaseManifestV0Page,
  releaseManifestV0Schema,
} from './contracts';

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

type BlockTree = {
  blocks: Array<{
    type: string;
    id: string;
    content: unknown;
    citations?: string[];
  }>;
};

type HubTheme = 'paper' | 'midnight' | 'field';

type ProjectConfigWithTheme = {
  presentation_preset?: unknown;
};

function normalizeHubTheme(value: unknown): HubTheme {
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

async function getOrCreateHub(input: {
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
    if (existing[0].theme !== input.theme) {
      await db
        .update(hub)
        .set({ theme: input.theme, updatedAt: new Date() })
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
    accessMode: 'public',
    freePreview: 'all',
    createdAt: now,
    updatedAt: now,
  });

  const rows = await db.select().from(hub).where(eq(hub.id, hubId)).limit(1);
  return rows[0]!;
}

async function loadPages(input: {
  workspaceId: string;
  runId: string;
}): Promise<ReleaseManifestV0Page[]> {
  const db = getDb();
  const pageRows = await db
    .select({
      id: page.id,
      slug: page.slug,
      position: page.position,
      currentVersionId: page.currentVersionId,
    })
    .from(page)
    .where(and(eq(page.runId, input.runId), eq(page.workspaceId, input.workspaceId)))
    .orderBy(asc(page.position));

  const versionIds = pageRows
    .map((item) => item.currentVersionId)
    .filter((value): value is string => Boolean(value));

  if (pageRows.length === 0 || versionIds.length === 0) {
    throw new Error('Cannot publish before draft pages exist for this run.');
  }

  const versions = await db
    .select({
      id: pageVersion.id,
      title: pageVersion.title,
      summary: pageVersion.summary,
      blockTreeJson: pageVersion.blockTreeJson,
    })
    .from(pageVersion)
    .where(inArray(pageVersion.id, versionIds));
  const versionMap = new Map(versions.map((version) => [version.id, version]));

  return pageRows.map((pageRow) => {
    const version = pageRow.currentVersionId
      ? versionMap.get(pageRow.currentVersionId)
      : undefined;
    if (!version) {
      throw new Error(`Page ${pageRow.id} is missing its current version.`);
    }

    const blockTree = version.blockTreeJson as BlockTree;
    return {
      slug: pageRow.slug,
      title: version.title,
      summary: version.summary,
      position: pageRow.position,
      blocks: blockTree.blocks ?? [],
    };
  });
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

  const projectConfig = projectRow.config as ProjectConfigWithTheme | null;
  const theme = normalizeHubTheme(projectConfig?.presentation_preset);
  const hubRow = await getOrCreateHub({
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    title: projectRow.title,
    theme,
  });

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

  if (existingLive[0]?.manifestR2Key) {
    return {
      hubId: hubRow.id,
      releaseId: existingLive[0].id,
      subdomain: hubRow.subdomain,
      publicPath: `/h/${hubRow.subdomain}`,
      manifestR2Key: existingLive[0].manifestR2Key,
      pageCount: (await loadPages(input)).length,
    };
  }

  const pages = await loadPages(input);
  const latestRelease = await db
    .select({ releaseNumber: release.releaseNumber })
    .from(release)
    .where(eq(release.hubId, hubRow.id))
    .orderBy(desc(release.releaseNumber))
    .limit(1);
  const releaseNumber = (latestRelease[0]?.releaseNumber ?? 0) + 1;
  const releaseId = crypto.randomUUID();
  const manifestR2Key = releaseKey({
    hubId: hubRow.id,
    releaseId,
    path: 'manifest.json',
  });

  await db.insert(release).values({
    id: releaseId,
    workspaceId: input.workspaceId,
    hubId: hubRow.id,
    runId: input.runId,
    releaseNumber,
    status: 'building',
    createdAt: now,
    updatedAt: now,
  });

  const manifest: ReleaseManifestV0 = releaseManifestV0Schema.parse({
    schemaVersion: 'release_manifest_v0',
    hubId: hubRow.id,
    releaseId,
    projectId: input.projectId,
    runId: input.runId,
    generatedAt: now.toISOString(),
    title: projectRow.title,
    subdomain: hubRow.subdomain,
    pages,
  });

  try {
    const r2 = createR2Client(parseServerEnv(process.env));
    await r2.putObject({
      key: manifestR2Key,
      body: JSON.stringify(manifest, null, 2),
      contentType: 'application/json',
    });

    await db
      .update(release)
      .set({ status: 'archived', archivedAt: now, updatedAt: now })
      .where(and(eq(release.hubId, hubRow.id), eq(release.status, 'live')));

    await db
      .update(release)
      .set({
        status: 'live',
        manifestR2Key,
        builtAt: now,
        liveAt: now,
        updatedAt: now,
      })
      .where(eq(release.id, releaseId));

    await db
      .update(hub)
      .set({ liveReleaseId: releaseId, updatedAt: now })
      .where(eq(hub.id, hubRow.id));

    await db
      .update(project)
      .set({ publishedHubId: hubRow.id, updatedAt: now })
      .where(eq(project.id, input.projectId));

    await db
      .update(generationRun)
      .set({ status: 'published', updatedAt: now })
      .where(eq(generationRun.id, input.runId));
  } catch (error) {
    await db
      .update(release)
      .set({
        status: 'failed',
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown publish error',
          actorUserId: input.actorUserId,
        },
        updatedAt: new Date(),
      })
      .where(eq(release.id, releaseId));
    throw error;
  }

  return {
    hubId: hubRow.id,
    releaseId,
    subdomain: hubRow.subdomain,
    publicPath: `/h/${hubRow.subdomain}`,
    manifestR2Key,
    pageCount: pages.length,
  };
}
