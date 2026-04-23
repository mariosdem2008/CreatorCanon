/**
 * Local-only smoke: drives the edit → republish loop end-to-end.
 *
 *  1. Reuse the audio-fixture project from smoke:audio-publish (must be run
 *     first) OR seed a fresh dedicated project.
 *  2. Publish first time. Capture releaseId/releaseNumber/manifest.
 *  3. Edit a page: create a new creator page_version carrying the same
 *     block tree with an updated title + section heading, repoint
 *     page.current_version_id at it, log an edit_action. This mirrors what
 *     the `apps/web/.../pages/actions.ts` server actions do.
 *  4. Publish second time. Expect a NEW release (different id, incremented
 *     release_number, previous archived, hub.live_release_id rotated).
 *  5. Re-fetch the new manifest. Expect edited title to appear.
 *  6. Publish a third time WITHOUT edits. Expect the SAME release id (pure
 *     idempotent return via metadata.pageVersionIds match).
 *
 * Refuses to run outside local-smoke mode to protect real alpha state.
 */

import path from 'node:path';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv, PIPELINE_VERSION } from '@creatorcanon/core';
import { and, asc, desc, eq, getDb, inArray } from '@creatorcanon/db';
import { closeDb } from '@creatorcanon/db/client';
import {
  editAction,
  generationRun,
  generationStageRun,
  hub,
  mediaAsset,
  normalizedTranscriptVersion,
  page,
  pageBlock,
  pageVersion,
  project,
  release,
  segment,
  transcriptAsset,
  video,
  videoSet,
  videoSetItem,
} from '@creatorcanon/db/schema';

import { releaseManifestV0Schema } from './contracts';
import { loadDefaultEnvFiles, repoRoot } from './env-files';
import { publishRunAsHub } from './publish-run-as-hub';
import { runGenerationPipeline } from './run-generation-pipeline';

const WORKSPACE_ID = 'local-smoke-workspace';
const ACTOR_USER_ID = 'local-smoke-user';
const VIDEO_SET_ID = 'review-edit-smoke-video-set';
const PROJECT_ID = 'review-edit-smoke-project';
const RUN_ID = 'review-edit-smoke-run';
const PROJECT_TITLE = 'Review Edit Smoke Hub';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function audioFixtureVideoIds(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ videoId: mediaAsset.videoId })
    .from(mediaAsset)
    .innerJoin(video, eq(video.id, mediaAsset.videoId))
    .where(and(eq(mediaAsset.workspaceId, WORKSPACE_ID), eq(mediaAsset.type, 'audio_m4a')))
    .limit(3);
  const ids = rows.map((row) => row.videoId);
  assert(ids.length > 0, 'No audio_m4a fixtures found. Run pnpm dev:seed:audio-fixtures first.');
  return ids;
}

async function resetDedicatedRows(videoIds: string[]) {
  const db = getDb();
  const pageRows = await db
    .select({ id: page.id })
    .from(page)
    .where(eq(page.runId, RUN_ID));
  const pageIds = pageRows.map((r) => r.id);

  if (pageIds.length > 0) {
    const pageVersionRows = await db
      .select({ id: pageVersion.id })
      .from(pageVersion)
      .where(inArray(pageVersion.pageId, pageIds));
    const pageVersionIds = pageVersionRows.map((r) => r.id);
    if (pageVersionIds.length > 0) {
      await db.delete(editAction).where(inArray(editAction.pageVersionId, pageVersionIds));
      await db.delete(pageBlock).where(inArray(pageBlock.pageVersionId, pageVersionIds));
    }
  }

  await db.delete(release).where(eq(release.runId, RUN_ID));
  await db.delete(hub).where(eq(hub.projectId, PROJECT_ID));
  await db.delete(pageVersion).where(inArray(pageVersion.pageId, pageIds.length > 0 ? pageIds : ['__none__']));
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
    .select({ id: video.id, durationSeconds: video.durationSeconds })
    .from(video)
    .where(and(eq(video.workspaceId, WORKSPACE_ID), inArray(video.id, videoIds)));
  assert(videos.length === videoIds.length, 'Could not load every fixture video.');

  const totalDuration = videos.reduce((sum, item) => sum + (item.durationSeconds ?? 0), 0);

  await db.insert(videoSet).values({
    id: VIDEO_SET_ID,
    workspaceId: WORKSPACE_ID,
    name: 'Review Edit Smoke Selection',
    createdBy: ACTOR_USER_ID,
    totalDurationSeconds: totalDuration,
    totalTranscriptWords: 0,
    status: 'locked',
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(videoSetItem).values(videoIds.map((videoId, index) => ({
    id: `review-edit-smoke-video-set-item-${index + 1}`,
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
      audience: 'editors',
      tone: 'direct',
      length_preset: 'standard',
      chat_enabled: false,
      presentation_preset: 'paper',
    },
    currentRunId: RUN_ID,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(generationRun).values({
    id: RUN_ID,
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    videoSetId: VIDEO_SET_ID,
    pipelineVersion: PIPELINE_VERSION,
    configHash: 'review-edit-smoke',
    status: 'queued',
    selectedDurationSeconds: totalDuration,
    selectedWordCount: 0,
    priceCents: 4900,
    stripePaymentIntentId: 'pi_review_edit_smoke',
    createdAt: now,
    updatedAt: now,
  });
}

async function fetchManifest(manifestR2Key: string) {
  const r2 = createR2Client(parseServerEnv(process.env));
  const obj = await r2.getObject(manifestR2Key);
  return releaseManifestV0Schema.parse(JSON.parse(new TextDecoder().decode(obj.body)));
}

async function createCreatorEdit(input: { pageId: string; newTitle: string; newHeading: string }) {
  const db = getDb();
  const existing = await db
    .select({
      id: pageVersion.id,
      title: pageVersion.title,
      subtitle: pageVersion.subtitle,
      summary: pageVersion.summary,
      blockTreeJson: pageVersion.blockTreeJson,
      version: pageVersion.version,
      runId: pageVersion.runId,
    })
    .from(pageVersion)
    .where(and(eq(pageVersion.pageId, input.pageId), eq(pageVersion.isCurrent, true)))
    .limit(1);
  const current = existing[0];
  assert(current, `No current version for page ${input.pageId}.`);

  const blockTree = current.blockTreeJson as {
    blocks: Array<{ type: string; id: string; content: unknown; citations?: string[]; supportLabel?: string }>;
  } | null;
  const blocks = blockTree?.blocks ?? [];
  const nextBlocks = blocks.map((block) => {
    if (block.type !== 'section') return block;
    const content = (typeof block.content === 'object' && block.content ? block.content : {}) as Record<string, unknown>;
    return { ...block, content: { ...content, heading: input.newHeading } };
  });

  const nextVersionId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx
      .update(pageVersion)
      .set({ isCurrent: false })
      .where(eq(pageVersion.pageId, input.pageId));

    await tx.insert(pageVersion).values({
      id: nextVersionId,
      workspaceId: WORKSPACE_ID,
      pageId: input.pageId,
      runId: current.runId,
      version: current.version + 1,
      title: input.newTitle,
      subtitle: current.subtitle,
      summary: current.summary,
      blockTreeJson: { blocks: nextBlocks },
      authorKind: 'creator',
      isCurrent: true,
    });

    if (nextBlocks.length > 0) {
      await tx.insert(pageBlock).values(
        nextBlocks.map((block, index) => {
          const rawSupport = block.supportLabel;
          const supportLabel: 'strong' | 'review_recommended' | 'limited' =
            rawSupport === 'strong' || rawSupport === 'limited' || rawSupport === 'review_recommended'
              ? rawSupport
              : 'review_recommended';
          return {
            id: crypto.randomUUID(),
            pageVersionId: nextVersionId,
            blockId: block.id,
            blockType: block.type,
            position: index,
            content: block.content,
            citations: block.citations ?? [],
            supportLabel,
          };
        }),
      );
    }

    await tx
      .update(page)
      .set({ currentVersionId: nextVersionId, status: 'needs_review', updatedAt: new Date() })
      .where(eq(page.id, input.pageId));

    await tx.insert(editAction).values({
      id: crypto.randomUUID(),
      workspaceId: WORKSPACE_ID,
      pageVersionId: nextVersionId,
      userId: ACTOR_USER_ID,
      action: 'manual_edit',
      beforeJson: { title: current.title },
      afterJson: { title: input.newTitle, heading: input.newHeading },
    });
  });

  return nextVersionId;
}

async function main() {
  const explicit = {
    artifactStorage: process.env.ARTIFACT_STORAGE,
    localArtifactDir: process.env.LOCAL_ARTIFACT_DIR,
    databaseUrl: process.env.DATABASE_URL,
  };
  loadDefaultEnvFiles();
  if (explicit.artifactStorage) process.env.ARTIFACT_STORAGE = explicit.artifactStorage;
  if (explicit.localArtifactDir) process.env.LOCAL_ARTIFACT_DIR = explicit.localArtifactDir;
  if (explicit.databaseUrl) process.env.DATABASE_URL = explicit.databaseUrl;
  process.env.ARTIFACT_STORAGE ??= 'local';
  process.env.LOCAL_ARTIFACT_DIR ??= '.local/artifacts';
  if (process.env.ARTIFACT_STORAGE === 'local' && !path.isAbsolute(process.env.LOCAL_ARTIFACT_DIR)) {
    process.env.LOCAL_ARTIFACT_DIR = path.resolve(repoRoot, process.env.LOCAL_ARTIFACT_DIR);
  }

  assert(
    process.env.ARTIFACT_STORAGE === 'local',
    'smoke:review-edit only runs with ARTIFACT_STORAGE=local.',
  );
  assert(
    process.env.DATABASE_URL?.includes('localhost:54329'),
    'smoke:review-edit refuses to run unless DATABASE_URL points at local Docker Postgres on port 54329.',
  );

  const videoIds = await audioFixtureVideoIds();
  await resetDedicatedRows(videoIds);
  await seedDedicatedRun(videoIds);

  // Run the pipeline to generate draft pages
  const pipelineResult = await runGenerationPipeline({
    runId: RUN_ID,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    videoSetId: VIDEO_SET_ID,
    pipelineVersion: PIPELINE_VERSION,
  });
  assert(pipelineResult.segmentsCreated > 0, 'Expected segments from audio-backed transcripts.');

  // First publish
  const first = await publishRunAsHub({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    actorUserId: ACTOR_USER_ID,
  });
  const firstReleaseRows = await getDb()
    .select()
    .from(release)
    .where(eq(release.id, first.releaseId))
    .limit(1);
  const firstReleaseRow = firstReleaseRows[0];
  assert(firstReleaseRow?.status === 'live', 'First publish should be live.');
  const firstReleaseNumber = firstReleaseRow.releaseNumber;

  const firstManifest = await fetchManifest(first.manifestR2Key);
  assert(firstManifest.pages.length > 0, 'First manifest must contain pages.');
  const originalTitle = firstManifest.pages[0]!.title;

  // Creator edits one page
  const pageRowsBeforeEdit = await getDb()
    .select({ id: page.id })
    .from(page)
    .where(eq(page.runId, RUN_ID))
    .orderBy(asc(page.position));
  const firstPageId = pageRowsBeforeEdit[0]?.id;
  assert(firstPageId, 'Expected at least one page row.');
  const EDITED_TITLE = `${originalTitle} — edited by creator`;
  const EDITED_HEADING = 'Creator-edited section heading';
  await createCreatorEdit({ pageId: firstPageId, newTitle: EDITED_TITLE, newHeading: EDITED_HEADING });

  // Second publish — must produce a new release
  const second = await publishRunAsHub({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    actorUserId: ACTOR_USER_ID,
  });
  assert(second.releaseId !== first.releaseId, 'Second publish must create a new release.');

  const secondReleaseRows = await getDb()
    .select()
    .from(release)
    .where(eq(release.id, second.releaseId))
    .limit(1);
  const secondReleaseRow = secondReleaseRows[0];
  assert(secondReleaseRow?.status === 'live', 'Second publish must be live.');
  assert(
    secondReleaseRow.releaseNumber > firstReleaseNumber,
    `Second release number (${secondReleaseRow.releaseNumber}) must be greater than first (${firstReleaseNumber}).`,
  );

  const firstAfterSecond = await getDb()
    .select()
    .from(release)
    .where(eq(release.id, first.releaseId))
    .limit(1);
  assert(
    firstAfterSecond[0]?.status === 'archived',
    `First release must be archived after the second publish, got ${firstAfterSecond[0]?.status}.`,
  );

  const secondManifest = await fetchManifest(second.manifestR2Key);
  const titleMatch = secondManifest.pages.some((p) => p.title === EDITED_TITLE);
  assert(titleMatch, 'Second manifest must contain the creator-edited title.');
  const headingMatch = secondManifest.pages.some((p) => p.blocks.some((b) => {
    const content = b.content as { heading?: unknown };
    return content?.heading === EDITED_HEADING;
  }));
  assert(headingMatch, 'Second manifest must contain the creator-edited section heading.');

  // Third publish with no edits — must be idempotent and return the SAME release id
  const third = await publishRunAsHub({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    actorUserId: ACTOR_USER_ID,
  });
  assert(
    third.releaseId === second.releaseId,
    `Third publish without edits must be idempotent; got ${third.releaseId} vs ${second.releaseId}.`,
  );

  // Release-count invariant: exactly 2 releases on this hub
  const allReleases = await getDb()
    .select({ id: release.id, releaseNumber: release.releaseNumber, status: release.status })
    .from(release)
    .where(eq(release.runId, RUN_ID))
    .orderBy(desc(release.releaseNumber));
  assert(allReleases.length === 2, `Expected 2 releases on this run, got ${allReleases.length}.`);

  await closeDb();
  console.info(JSON.stringify({
    ok: true,
    runId: RUN_ID,
    firstReleaseId: first.releaseId,
    firstReleaseNumber,
    secondReleaseId: second.releaseId,
    secondReleaseNumber: secondReleaseRow.releaseNumber,
    thirdReleaseId: third.releaseId,
    idempotentOnNoEdits: third.releaseId === second.releaseId,
    archivedPrevious: firstAfterSecond[0]?.status === 'archived',
    publicPath: second.publicPath,
    editedTitle: EDITED_TITLE,
    editedHeading: EDITED_HEADING,
  }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[smoke-review-edit] failed', error);
  process.exit(1);
});
