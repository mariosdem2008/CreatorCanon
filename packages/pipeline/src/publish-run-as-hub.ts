import { releaseKey, artifactKey, createR2Client } from '@creatorcanon/adapters';
import { and, desc, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  hub,
  project,
  release,
} from '@creatorcanon/db/schema';
import { parseServerEnv } from '@creatorcanon/core';

import type { EditorialAtlasManifest } from './adapters/editorial-atlas/manifest-types';

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

/** Minimal runtime validation that the adapt-stage produced a v1 manifest. */
function assertEditorialAtlasV1(value: unknown): asserts value is EditorialAtlasManifest {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 'editorial_atlas_v1'
  ) {
    throw new Error(
      `publish: adapt-stage manifest has unexpected schemaVersion='${
        (value as { schemaVersion?: unknown } | null)?.schemaVersion ?? 'missing'
      }'. Expected 'editorial_atlas_v1'.`,
    );
  }
}

type ReleaseMetadata = {
  actorUserId?: string;
  error?: string;
};

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

  // 1. Read the editorial_atlas_v1 manifest written by the adapt stage.
  const r2 = createR2Client(parseServerEnv(process.env));
  const adaptManifestKey = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'adapt',
    name: 'manifest.json',
  });

  const manifestObject = await r2.getObject(adaptManifestKey);
  const rawManifest: unknown = JSON.parse(new TextDecoder().decode(manifestObject.body));
  // Validate schema version before doing anything irreversible.
  assertEditorialAtlasV1(rawManifest);
  const adaptManifest: EditorialAtlasManifest = rawManifest;

  // 2. Idempotency: if there is already a live release for this exact run, return it.
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
      pageCount: adaptManifest.pages.length,
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
  const finalManifest: EditorialAtlasManifest = {
    ...adaptManifest,
    releaseId,
    publishedAt: now.toISOString(),
  };
  const manifestR2Key = releaseKey({
    hubId: hubRow.id,
    releaseId,
    path: 'manifest.json',
  });

  const releaseMetadata: ReleaseMetadata = {
    actorUserId: input.actorUserId,
  };

  // 5. Insert the release row (status: 'building') — this is the only place a
  //    release row is created for a given run.
  await db.insert(release).values({
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

  try {
    // 6. Write the release-keyed manifest to R2.
    await r2.putObject({
      key: manifestR2Key,
      body: JSON.stringify(finalManifest, null, 2),
      contentType: 'application/json',
    });

    // 7. Archive any prior live release for this hub.
    await db
      .update(release)
      .set({ status: 'archived', archivedAt: now, updatedAt: now })
      .where(and(eq(release.hubId, hubRow.id), eq(release.status, 'live')));

    // 8. Flip the new release to live.
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

    // 9. Update hub.liveReleaseId.
    await db
      .update(hub)
      .set({ liveReleaseId: releaseId, updatedAt: now })
      .where(eq(hub.id, hubRow.id));

    // 10. Update project.publishedHubId.
    await db
      .update(project)
      .set({ publishedHubId: hubRow.id, updatedAt: now })
      .where(eq(project.id, input.projectId));

    // 11. Mark run as published.
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
          ...releaseMetadata,
          error: error instanceof Error ? error.message : 'Unknown publish error',
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
    pageCount: finalManifest.pages.length,
  };
}
