import { getDb } from '@creatorcanon/db';
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
import { parseServerEnv } from '@creatorcanon/core';
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
 * Seed the minimal FK chain needed for tool tests:
 * user → workspace → (channel, project, videoSet) → video → transcriptAsset → ntv → segment
 * + a generationRun rooted at the workspace/project/videoSet.
 *
 * Returns IDs the test can use. Each call creates a fresh, isolated graph.
 */
export async function seedTestRun(input: SeedInput): Promise<SeedResult> {
  const db = getDb();
  const userId = `usr_${nano()}`;
  const workspaceId = `ws_${nano()}`;
  const channelId = `ch_${nano()}`;
  const videoSetId = `vs_${nano()}`;
  const projectId = `proj_${nano()}`;
  const runId = `run_${nano()}`;

  // 1. user (FK target for workspace.ownerUserId, videoSet.createdBy)
  await db.insert(user).values({
    id: userId,
    email: `test-${nano()}@example.com`,
    name: 'Test User',
  });

  // 2. workspace
  await db.insert(workspace).values({
    id: workspaceId,
    ownerUserId: userId,
    name: 'test-ws',
    slug: `t-${nano()}`,
  });

  // 3. channel
  await db.insert(channel).values({
    id: channelId,
    workspaceId,
    youtubeChannelId: `UC${nano()}`,
    title: 'Test channel',
  });

  // 4. videoSet (createdBy FK to user)
  await db.insert(videoSet).values({
    id: videoSetId,
    workspaceId,
    name: 'fixture-set',
    createdBy: userId,
  });

  // 5. project (title NOT NULL)
  await db.insert(project).values({
    id: projectId,
    workspaceId,
    videoSetId,
    title: 'Fixture project',
  });

  // 6. videos
  for (const v of input.videos) {
    await db.insert(video).values({
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
  await db.insert(generationRun).values({
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
    await db.insert(transcriptAsset).values({
      id: taId,
      workspaceId,
      videoId: v.id,
      provider: 'youtube_captions',
      r2Key: `test/${taId}.vtt`,
    });

    const ntvId = `ntv_${nano()}`;
    await db.insert(normalizedTranscriptVersion).values({
      id: ntvId,
      workspaceId,
      videoId: v.id,
      transcriptAssetId: taId,
      r2Key: `test/${ntvId}.json`,
    });

    const segs = input.segments.filter((s) => s.videoId === v.id);
    for (const s of segs) {
      await db.insert(segment).values({
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

  return { runId, workspaceId, projectId, videoSetId, channelId, userId };
}

/**
 * Build a ToolCtx for tests. Pass agent/model overrides when the tool is
 * sensitive to those (e.g., propose* records the agent name on the row).
 */
export function makeCtx(seed: SeedResult, agent = 'test_agent', model = 'gpt-5.5'): ToolCtx {
  return {
    runId: seed.runId,
    workspaceId: seed.workspaceId,
    agent,
    model,
    db: getDb(),
    r2: createR2Client(parseServerEnv(process.env)),
  };
}
