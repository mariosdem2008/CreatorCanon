import { getDb, eq } from '@creatorcanon/db';
import {
  user,
  workspace,
  channel,
  video,
  videoSet,
  project,
  generationRun,
  transcriptAsset,
  normalizedTranscriptVersion,
  segment,
} from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import type { ToolCtx } from '../src/agents/tools/types';

/** Short random string for unique IDs in test fixtures. */
function nano(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export interface SeedInput {
  videos: Array<{ id: string; title?: string; durationSec?: number }>;
  segments: Array<{ id: string; videoId: string; startMs: number; endMs: number; text: string }>;
}

export interface SeedResult {
  runId: string;
  workspaceId: string;
  projectId: string;
  videoSetId: string;
  channelId: string;
  userId: string;
}

/**
 * Seed a fresh, isolated FK chain for tool tests.
 *
 * Isolation guarantee: each call mints a NEW workspace, channel, project,
 * videoSet, and run via `nano()` IDs. No two `seedTestRun` calls share rows.
 * This is what makes the workspace-scoped deletes in `teardownTestRun` safe
 * under parallel test execution.
 *
 * Caller-supplied `input.videos[].id` and `input.segments[].id` MUST be
 * globally unique (they become primary keys). Tests that run in parallel
 * MUST not pass the same caller-supplied IDs across calls.
 *
 * Seed the minimal FK chain needed for tool tests:
 * user → workspace → (channel, project, videoSet) → video → transcriptAsset → ntv → segment
 * + a generationRun rooted at the workspace/project/videoSet.
 *
 * Returns IDs the test can use. Each call creates a fresh, isolated graph.
 * All inserts run inside a single transaction for atomicity and speed.
 */
export async function seedTestRun(input: SeedInput): Promise<SeedResult> {
  const db = getDb();
  const userId = `usr_${nano()}`;
  const workspaceId = `ws_${nano()}`;
  const channelId = `ch_${nano()}`;
  const videoSetId = `vs_${nano()}`;
  const projectId = `proj_${nano()}`;
  const runId = `run_${nano()}`;

  await db.transaction(async (tx) => {
    // 1. user (FK target for workspace.ownerUserId, videoSet.createdBy)
    await tx.insert(user).values({
      id: userId,
      email: `test-${nano()}@example.com`,
      name: 'Test User',
    });

    // 2. workspace
    await tx.insert(workspace).values({
      id: workspaceId,
      ownerUserId: userId,
      name: 'test-ws',
      slug: `t-${nano()}`,
    });

    // 3. channel
    await tx.insert(channel).values({
      id: channelId,
      workspaceId,
      youtubeChannelId: `UC${nano()}`,
      title: 'Test channel',
    });

    // 4. videoSet (createdBy FK to user)
    await tx.insert(videoSet).values({
      id: videoSetId,
      workspaceId,
      name: 'fixture-set',
      createdBy: userId,
    });

    // 5. project (title NOT NULL)
    await tx.insert(project).values({
      id: projectId,
      workspaceId,
      videoSetId,
      title: 'Fixture project',
    });

    // 6. videos
    for (const v of input.videos) {
      await tx.insert(video).values({
        id: v.id,
        workspaceId,
        channelId,
        youtubeVideoId: `yt_${v.id}`,
        title: v.title ?? 'Test video',
        durationSeconds: v.durationSec ?? 600,
        publishedAt: new Date('2024-01-01T00:00:00Z'),
      });
    }

    // 7. generationRun
    await tx.insert(generationRun).values({
      id: runId,
      workspaceId,
      projectId,
      videoSetId,
      pipelineVersion: 'test',
      configHash: 'test-config-hash',
      status: 'running',
    });

    // 8. transcriptAsset + normalizedTranscriptVersion per video, then segment rows
    for (const v of input.videos) {
      const taId = `ta_${nano()}`;
      await tx.insert(transcriptAsset).values({
        id: taId,
        workspaceId,
        videoId: v.id,
        provider: 'youtube_captions',
        r2Key: `test/${taId}.vtt`,
      });

      const ntvId = `ntv_${nano()}`;
      await tx.insert(normalizedTranscriptVersion).values({
        id: ntvId,
        workspaceId,
        videoId: v.id,
        transcriptAssetId: taId,
        r2Key: `test/${ntvId}.json`,
      });

      const segs = input.segments.filter((s) => s.videoId === v.id);
      for (const s of segs) {
        await tx.insert(segment).values({
          id: s.id,
          workspaceId,
          runId,
          videoId: v.id,
          normalizedTranscriptVersionId: ntvId,
          startMs: s.startMs,
          endMs: s.endMs,
          text: s.text,
        });
      }
    }
  });

  return { runId, workspaceId, projectId, videoSetId, channelId, userId };
}

/**
 * Delete rows seeded by a previous `seedTestRun` call, in reverse FK order.
 *
 * Idempotent: calling on already-deleted IDs is a no-op (each delete uses
 * `WHERE id = ?` or `WHERE workspaceId = seed.workspaceId`; missing rows
 * delete nothing).
 *
 * Workspace-scoped deletes (video, transcriptAsset, normalizedTranscriptVersion)
 * ONLY hit rows seeded under this call's workspace because workspace IDs are
 * unique per `seedTestRun` (see invariant on that function). If a caller ever
 * reuses a workspace ID across seed calls, this teardown will over-delete.
 */
export async function teardownTestRun(seed: SeedResult): Promise<void> {
  const db = getDb();

  await db.transaction(async (tx) => {
    // 1. segments (FK → generationRun via runId)
    await tx.delete(segment).where(eq(segment.runId, seed.runId));
    // 2. normalizedTranscriptVersion (scoped by workspace; no direct seed tracking)
    await tx.delete(normalizedTranscriptVersion).where(
      eq(normalizedTranscriptVersion.workspaceId, seed.workspaceId),
    );
    // 3. transcriptAsset
    await tx.delete(transcriptAsset).where(eq(transcriptAsset.workspaceId, seed.workspaceId));
    // 4. generationRun
    await tx.delete(generationRun).where(eq(generationRun.id, seed.runId));
    // 5. video
    await tx.delete(video).where(eq(video.workspaceId, seed.workspaceId));
    // 6. project
    await tx.delete(project).where(eq(project.id, seed.projectId));
    // 7. videoSet
    await tx.delete(videoSet).where(eq(videoSet.id, seed.videoSetId));
    // 8. channel
    await tx.delete(channel).where(eq(channel.id, seed.channelId));
    // 9. workspace
    await tx.delete(workspace).where(eq(workspace.id, seed.workspaceId));
    // 10. user
    await tx.delete(user).where(eq(user.id, seed.userId));
  });
}

/** Stub R2 client for tests that don't need R2 access. Throws if any method is called. */
function makeStubR2Client(): ReturnType<typeof createR2Client> {
  const throwUnused = (method: string): never => {
    throw new Error(
      `Test fixture: stub R2 client method '${method}' called. Pass an explicit r2 to makeCtx({ r2: ... }).`,
    );
  };
  const stub = {
    bucket: 'stub',
    putObject: () => throwUnused('putObject'),
    getObject: () => throwUnused('getObject'),
    getSignedUrl: () => throwUnused('getSignedUrl'),
    deleteObject: () => throwUnused('deleteObject'),
    headObject: () => throwUnused('headObject'),
    listObjects: () => throwUnused('listObjects'),
  } satisfies ReturnType<typeof createR2Client>;
  return stub;
}

/**
 * Build a ToolCtx for tests. Pass agent/model overrides when the tool is
 * sensitive to those (e.g., propose* records the agent name on the row).
 *
 * R2 is lazy: if no `options.r2` is supplied a stub is used that throws if
 * any R2 method is called. Tools that genuinely need R2 should pass a real
 * client via `options.r2`.
 */
export function makeCtx(
  seed: SeedResult,
  agent = 'test_agent',
  model = 'gpt-5.5',
  options?: { r2?: ReturnType<typeof createR2Client> },
): ToolCtx {
  const r2 = options?.r2 ?? makeStubR2Client();
  return {
    runId: seed.runId,
    workspaceId: seed.workspaceId,
    agent,
    model,
    db: getDb(),
    r2,
  };
}
