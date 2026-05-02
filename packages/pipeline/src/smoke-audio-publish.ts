import path from 'node:path';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv, PIPELINE_VERSION } from '@creatorcanon/core';
import { and, eq, getDb, inArray } from '@creatorcanon/db';
import { closeDb } from '@creatorcanon/db/client';
import {
  generationRun,
  generationStageRun,
  hub,
  mediaAsset,
  normalizedTranscriptVersion,
  page,
  project,
  release,
  segment,
  transcriptAsset,
  video,
  videoSet,
  videoSetItem,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles, repoRoot } from './env-files';
import type { CreatorManualManifest } from './adapters/creator-manual/manifest-types';
import { publishRunAsHub } from './publish-run-as-hub';
import { runGenerationPipeline } from './run-generation-pipeline';

const WORKSPACE_ID = 'local-smoke-workspace';
const ACTOR_USER_ID = 'local-smoke-user';
const VIDEO_SET_ID = 'audio-fixture-publish-video-set';
const PROJECT_ID = 'audio-fixture-publish-project';
const HUB_ID = 'audio-fixture-publish-hub';
const HUB_SUBDOMAIN = 'audio-fixture-publish';
const RUN_ID = 'audio-fixture-publish-run';
const PROJECT_TITLE = 'Audio Fixture Evidence Hub';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseCreatorManualManifest(manifest: unknown): CreatorManualManifest {
  const parsed = manifest as CreatorManualManifest;
  assert(
    parsed.schemaVersion === 'creator_manual_v1',
    `Expected creator_manual_v1 manifest, got ${parsed.schemaVersion}.`,
  );
  return parsed;
}

function manifestEvidenceRefCount(manifest: CreatorManualManifest): number {
  return manifest.nodes.reduce((sum, node) => sum + node.evidence.length, 0);
}

async function resetDedicatedRows(videoIds: string[]) {
  const db = getDb();

  await db.delete(release).where(eq(release.runId, RUN_ID));
  await db.delete(hub).where(eq(hub.projectId, PROJECT_ID));
  await db.delete(page).where(eq(page.runId, RUN_ID));
  await db.delete(generationStageRun).where(eq(generationStageRun.runId, RUN_ID));
  await db.delete(segment).where(eq(segment.runId, RUN_ID));
  await db.delete(normalizedTranscriptVersion).where(and(
    eq(normalizedTranscriptVersion.workspaceId, WORKSPACE_ID),
    inArray(normalizedTranscriptVersion.videoId, videoIds),
  ));
  await db.delete(transcriptAsset).where(and(
    eq(transcriptAsset.workspaceId, WORKSPACE_ID),
    inArray(transcriptAsset.videoId, videoIds),
  ));
  await db.delete(generationRun).where(eq(generationRun.id, RUN_ID));
  await db.delete(project).where(eq(project.id, PROJECT_ID));
  await db.delete(videoSetItem).where(eq(videoSetItem.videoSetId, VIDEO_SET_ID));
  await db.delete(videoSet).where(eq(videoSet.id, VIDEO_SET_ID));
}

async function seedDedicatedRun(videoIds: string[]) {
  const db = getDb();
  const now = new Date();

  const videos = await db
    .select({
      id: video.id,
      durationSeconds: video.durationSeconds,
    })
    .from(video)
    .where(and(eq(video.workspaceId, WORKSPACE_ID), inArray(video.id, videoIds)));

  assert(videos.length === videoIds.length, 'Could not load every audio fixture video.');

  await db.insert(videoSet).values({
    id: VIDEO_SET_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Audio Fixture Evidence Selection',
    createdBy: ACTOR_USER_ID,
    totalDurationSeconds: videos.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0),
    totalTranscriptWords: 0,
    status: 'locked',
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(videoSetItem).values(videoIds.map((videoId, index) => ({
    id: `audio-fixture-publish-video-set-item-${index + 1}`,
    videoSetId: VIDEO_SET_ID,
    videoId,
    position: index,
    createdAt: now,
  })));

  await db.insert(project).values({
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    videoSetId: VIDEO_SET_ID,
    title: PROJECT_TITLE,
    config: {
      audience: 'builders',
      tone: 'direct',
      length_preset: 'standard',
      chat_enabled: false,
      presentation_preset: 'field',
    },
    currentRunId: RUN_ID,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(hub).values({
    id: HUB_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    subdomain: HUB_SUBDOMAIN,
    theme: 'field',
    templateKey: 'creator_manual',
    accessMode: 'public',
    freePreview: 'all',
    metadata: {},
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(generationRun).values({
    id: RUN_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    videoSetId: VIDEO_SET_ID,
    pipelineVersion: PIPELINE_VERSION,
    configHash: 'audio-fixture-publish-smoke',
    status: 'queued',
    selectedDurationSeconds: videos.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0),
    selectedWordCount: 0,
    priceCents: 4900,
    stripePaymentIntentId: 'pi_audio_fixture_publish_smoke',
    createdAt: now,
    updatedAt: now,
  });
}

async function audioFixtureVideoIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({
      videoId: mediaAsset.videoId,
    })
    .from(mediaAsset)
    .innerJoin(video, eq(video.id, mediaAsset.videoId))
    .where(and(
      eq(mediaAsset.workspaceId, WORKSPACE_ID),
      eq(mediaAsset.type, 'audio_m4a'),
    ))
    .limit(3);

  const ids = rows.map((row) => row.videoId);
  assert(ids.length > 0, 'No audio_m4a fixture rows found. Run pnpm dev:seed:audio-fixtures first.');
  return ids;
}

async function assertTranscribed(videoIds: string[]) {
  const db = getDb();
  const rows = await db
    .select({
      id: transcriptAsset.id,
      provider: transcriptAsset.provider,
      videoId: transcriptAsset.videoId,
      r2Key: transcriptAsset.r2Key,
    })
    .from(transcriptAsset)
    .where(and(
      eq(transcriptAsset.workspaceId, WORKSPACE_ID),
      inArray(transcriptAsset.videoId, videoIds),
      eq(transcriptAsset.provider, 'gpt-4o-mini-transcribe'),
      eq(transcriptAsset.isCanonical, true),
    ));

  assert(rows.length > 0, 'Expected at least one canonical transcript from gpt-4o-mini-transcribe.');
  return rows;
}

async function main() {
  const explicitEnv = {
    artifactStorage: process.env.ARTIFACT_STORAGE,
    localArtifactDir: process.env.LOCAL_ARTIFACT_DIR,
    databaseUrl: process.env.DATABASE_URL,
  };

  loadDefaultEnvFiles();

  if (explicitEnv.artifactStorage) process.env.ARTIFACT_STORAGE = explicitEnv.artifactStorage;
  if (explicitEnv.localArtifactDir) process.env.LOCAL_ARTIFACT_DIR = explicitEnv.localArtifactDir;
  if (explicitEnv.databaseUrl) process.env.DATABASE_URL = explicitEnv.databaseUrl;

  process.env.ARTIFACT_STORAGE ??= 'local';
  process.env.LOCAL_ARTIFACT_DIR ??= '.local/artifacts';
  if (process.env.ARTIFACT_STORAGE === 'local' && !path.isAbsolute(process.env.LOCAL_ARTIFACT_DIR)) {
    process.env.LOCAL_ARTIFACT_DIR = path.resolve(repoRoot, process.env.LOCAL_ARTIFACT_DIR);
  }

  assert(process.env.ARTIFACT_STORAGE === 'local', 'smoke:audio-publish only runs with ARTIFACT_STORAGE=local.');
  assert(
    process.env.DATABASE_URL?.includes('localhost:54329'),
    'smoke:audio-publish refuses to run unless DATABASE_URL points at local Docker Postgres on port 54329.',
  );

  const videoIds = await audioFixtureVideoIds();
  await resetDedicatedRows(videoIds);
  await seedDedicatedRun(videoIds);

  const result = await runGenerationPipeline({
    runId: RUN_ID,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    videoSetId: VIDEO_SET_ID,
    pipelineVersion: PIPELINE_VERSION,
  });
  assert(result.transcriptsFetched > 0, 'Expected the pipeline to fetch at least one audio-backed transcript.');
  assert(result.segmentsCreated > 0, 'Expected audio-backed transcript to create segments.');

  const transcribedRows = await assertTranscribed(videoIds);
  const publishResult = await publishRunAsHub({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    actorUserId: ACTOR_USER_ID,
  });

  const db = getDb();
  const runs = await db
    .select({ status: generationRun.status })
    .from(generationRun)
    .where(eq(generationRun.id, RUN_ID))
    .limit(1);
  assert(runs[0]?.status === 'published', `Expected run published, got ${runs[0]?.status ?? 'missing'}.`);

  const hubs = await db
    .select({ theme: hub.theme, subdomain: hub.subdomain })
    .from(hub)
    .where(eq(hub.projectId, PROJECT_ID))
    .limit(1);
  assert(hubs[0]?.theme === 'field', `Expected Studio Manual field theme, got ${hubs[0]?.theme ?? 'missing'}.`);

  const r2 = createR2Client(parseServerEnv(process.env));
  const manifestObject = await r2.getObject(publishResult.manifestR2Key);
  const manifest = parseCreatorManualManifest(JSON.parse(new TextDecoder().decode(manifestObject.body)));
  const evidenceRefCount = manifestEvidenceRefCount(manifest);
  assert(evidenceRefCount > 0, 'Expected published manifest to include source evidence refs from audio transcription.');

  await closeDb();

  console.info(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    videoCount: videoIds.length,
    transcribedVideoCount: transcribedRows.length,
    nodeCount: manifest.stats.nodeCount,
    sourceCount: manifest.stats.sourceCount,
    evidenceRefCount,
    publicPath: publishResult.publicPath,
    theme: hubs[0].theme,
    manifestR2Key: publishResult.manifestR2Key,
  }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[smoke-audio-publish] failed', error);
  process.exit(1);
});
