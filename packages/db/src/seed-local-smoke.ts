import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq, inArray } from 'drizzle-orm';

import { closeDb, getDb } from './client';
import {
  account,
  channel,
  generationRun,
  generationStageRun,
  hub,
  normalizedTranscriptVersion,
  page,
  pageBlock,
  pageVersion,
  project,
  release,
  segment,
  transcriptAsset,
  user,
  video,
  videoSet,
  videoSetItem,
  workspace,
  workspaceMember,
} from './schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const IDS = {
  user: 'local-smoke-user',
  workspace: 'local-smoke-workspace',
  channel: 'local-smoke-channel',
  videoSet: 'local-smoke-video-set',
  project: 'local-smoke-project',
  run: 'local-smoke-run',
};

const VIDEOS = [
  {
    id: 'local-smoke-video-1',
    youtubeVideoId: 'local-smoke-youtube-1',
    title: 'Building a Focused Creator Archive',
    durationSeconds: 540,
    transcript: [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:30.000',
      'A useful creator archive starts with selecting the strongest recurring ideas, not every possible clip.',
      '',
      '00:00:30.000 --> 00:01:20.000',
      'The archive should organize lessons around audience intent, clear titles, and practical next steps.',
      '',
      '00:01:20.000 --> 00:02:15.000',
      'When the source material is clean, a knowledge hub can turn scattered videos into a guided reference.',
      '',
    ].join('\n'),
  },
  {
    id: 'local-smoke-video-2',
    youtubeVideoId: 'local-smoke-youtube-2',
    title: 'Turning Transcripts into Lessons',
    durationSeconds: 620,
    transcript: [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:35.000',
      'Transcript segments work best when each section keeps one coherent idea with enough context.',
      '',
      '00:00:35.000 --> 00:01:25.000',
      'The first draft should be deterministic so operators can debug the pipeline before adding richer generation.',
      '',
      '00:01:25.000 --> 00:02:40.000',
      'A review page gives the creator a simple place to confirm themes, summaries, and page direction.',
      '',
    ].join('\n'),
  },
  {
    id: 'local-smoke-video-3',
    youtubeVideoId: 'local-smoke-youtube-3',
    title: 'Operating an Alpha Pipeline',
    durationSeconds: 700,
    transcript: [
      'WEBVTT',
      '',
      '00:00:00.000 --> 00:00:45.000',
      'An alpha product needs admin rescue tools because paid runs can stall for infrastructure reasons.',
      '',
      '00:00:45.000 --> 00:01:35.000',
      'Local smoke tests should avoid third party dependencies so engineers can reproduce failures quickly.',
      '',
      '00:01:35.000 --> 00:02:50.000',
      'Once the pipeline creates draft pages, the next iteration can focus on editing and publishing quality.',
      '',
    ].join('\n'),
  },
] as const;

function loadEnvFile(filePath: string, opts?: { override?: boolean }) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!opts?.override && process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function transcriptKey(workspaceId: string, videoId: string): string {
  return `workspaces/${workspaceId}/transcripts/${videoId}/canonical.vtt`;
}

function writeLocalArtifact(key: string, body: string) {
  const localRoot = path.resolve(
    repoRoot,
    process.env.LOCAL_ARTIFACT_DIR ?? '.local/artifacts',
  );
  const target = path.resolve(localRoot, key);
  if (target !== localRoot && !target.startsWith(`${localRoot}${path.sep}`)) {
    throw new Error(`Invalid local artifact key: ${key}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  fs.writeFileSync(`${target}.meta.json`, JSON.stringify({ contentType: 'text/vtt' }, null, 2));
}

async function run() {
  loadEnvFile(path.resolve(repoRoot, '.env'));
  loadEnvFile(path.resolve(repoRoot, '.env.local'), { override: true });

  process.env.ARTIFACT_STORAGE ??= 'local';
  process.env.LOCAL_ARTIFACT_DIR ??= '.local/artifacts';

  const db = getDb();
  const now = new Date();
  const email = process.env.DEV_AUTH_BYPASS_EMAIL || 'local-smoke@creatorcanon.dev';

  await db.delete(pageBlock).where(inArray(pageBlock.pageVersionId, db
    .select({ id: pageVersion.id })
    .from(pageVersion)
    .where(eq(pageVersion.runId, IDS.run))));
  await db.delete(pageVersion).where(eq(pageVersion.runId, IDS.run));
  await db.delete(page).where(eq(page.runId, IDS.run));
  await db.delete(generationStageRun).where(eq(generationStageRun.runId, IDS.run));
  await db.delete(release).where(eq(release.runId, IDS.run));
  await db.delete(hub).where(eq(hub.projectId, IDS.project));
  await db.delete(segment).where(eq(segment.runId, IDS.run));
  await db
    .delete(normalizedTranscriptVersion)
    .where(inArray(normalizedTranscriptVersion.videoId, VIDEOS.map((item) => item.id)));
  await db
    .delete(transcriptAsset)
    .where(inArray(transcriptAsset.videoId, VIDEOS.map((item) => item.id)));

  await db.insert(user).values({
    id: IDS.user,
    email,
    name: 'Local Smoke Admin',
    emailVerified: now,
    isAdmin: true,
    lastLoginAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: user.id,
    set: {
      email,
      name: 'Local Smoke Admin',
      isAdmin: true,
      lastLoginAt: now,
      updatedAt: now,
    },
  });

  await db.insert(account).values({
    userId: IDS.user,
    type: 'oauth',
    provider: 'google',
    providerAccountId: IDS.user,
    access_token: 'local-smoke-google-token',
    refresh_token: 'local-smoke-google-refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'Bearer',
    scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
  }).onConflictDoNothing();

  await db.insert(workspace).values({
    id: IDS.workspace,
    ownerUserId: IDS.user,
    name: 'Local Smoke Workspace',
    slug: 'local-smoke-workspace',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: workspace.id,
    set: {
      ownerUserId: IDS.user,
      name: 'Local Smoke Workspace',
      updatedAt: now,
    },
  });

  await db.insert(workspaceMember).values({
    workspaceId: IDS.workspace,
    userId: IDS.user,
    role: 'owner',
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [workspaceMember.workspaceId, workspaceMember.userId],
    set: { role: 'owner', joinedAt: now, updatedAt: now },
  });

  await db.insert(channel).values({
    id: IDS.channel,
    workspaceId: IDS.workspace,
    youtubeChannelId: 'local-smoke-youtube-channel',
    title: 'Local Smoke Channel',
    handle: '@localsmoke',
    description: 'Synthetic channel for deterministic local smoke tests.',
    videoCount: VIDEOS.length,
    uploadsPlaylistId: 'local-smoke-uploads',
    metadataFetchedAt: now,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: channel.id,
    set: {
      title: 'Local Smoke Channel',
      videoCount: VIDEOS.length,
      metadataFetchedAt: now,
      updatedAt: now,
    },
  });

  for (const [index, item] of VIDEOS.entries()) {
    await db.insert(video).values({
      id: item.id,
      workspaceId: IDS.workspace,
      channelId: IDS.channel,
      youtubeVideoId: item.youtubeVideoId,
      title: item.title,
      description: `Synthetic smoke-test video ${index + 1}.`,
      publishedAt: new Date('2025-01-01T00:00:00.000Z'),
      durationSeconds: item.durationSeconds,
      viewCount: 1000 + index,
      captionStatus: 'available',
      metadataFetchedAt: now,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: video.id,
      set: {
        title: item.title,
        durationSeconds: item.durationSeconds,
        captionStatus: 'available',
        updatedAt: now,
      },
    });
  }

  await db.insert(videoSet).values({
    id: IDS.videoSet,
    workspaceId: IDS.workspace,
    name: 'Local Smoke Selection',
    createdBy: IDS.user,
    totalDurationSeconds: VIDEOS.reduce((sum, item) => sum + item.durationSeconds, 0),
    totalTranscriptWords: 240,
    status: 'locked',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: videoSet.id,
    set: {
      totalDurationSeconds: VIDEOS.reduce((sum, item) => sum + item.durationSeconds, 0),
      totalTranscriptWords: 240,
      status: 'locked',
      updatedAt: now,
    },
  });

  for (const [position, item] of VIDEOS.entries()) {
    await db.insert(videoSetItem).values({
      id: `local-smoke-video-set-item-${position + 1}`,
      videoSetId: IDS.videoSet,
      videoId: item.id,
      position,
      createdAt: now,
    }).onConflictDoNothing();
  }

  await db.insert(project).values({
    id: IDS.project,
    workspaceId: IDS.workspace,
    videoSetId: IDS.videoSet,
    title: 'Local Smoke Knowledge Hub',
    config: {
      audience: 'builders',
      tone: 'direct',
      length_preset: 'standard',
      chat_enabled: false,
      presentation_preset: 'midnight',
    },
    currentRunId: IDS.run,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: project.id,
    set: {
      videoSetId: IDS.videoSet,
      title: 'Local Smoke Knowledge Hub',
      currentRunId: IDS.run,
      publishedHubId: null,
      updatedAt: now,
    },
  });

  await db.insert(generationRun).values({
    id: IDS.run,
    workspaceId: IDS.workspace,
    projectId: IDS.project,
    videoSetId: IDS.videoSet,
    pipelineVersion: 'v1.0.0',
    configHash: 'local-smoke-config',
    status: 'queued',
    selectedDurationSeconds: VIDEOS.reduce((sum, item) => sum + item.durationSeconds, 0),
    selectedWordCount: 240,
    priceCents: 4900,
    stripePaymentIntentId: 'pi_local_smoke_paid',
    createdAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: generationRun.id,
    set: {
      status: 'queued',
      startedAt: null,
      completedAt: null,
      selectedDurationSeconds: VIDEOS.reduce((sum, item) => sum + item.durationSeconds, 0),
      selectedWordCount: 240,
      priceCents: 4900,
      updatedAt: now,
    },
  });

  for (const item of VIDEOS) {
    const key = transcriptKey(IDS.workspace, item.id);
    writeLocalArtifact(key, item.transcript);
    await db.insert(transcriptAsset).values({
      id: `local-smoke-transcript-${item.id}`,
      workspaceId: IDS.workspace,
      videoId: item.id,
      provider: 'manual_upload',
      language: 'en',
      r2Key: key,
      wordCount: item.transcript.split(/\s+/).filter(Boolean).length,
      qualityScore: 1,
      isCanonical: true,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  await closeDb();

  console.info(JSON.stringify({
    userEmail: email,
    workspaceId: IDS.workspace,
    projectId: IDS.project,
    runId: IDS.run,
    videoCount: VIDEOS.length,
  }, null, 2));
}

run().catch(async (error) => {
  await closeDb();
  console.error('[seed-local-smoke] failed', error);
  process.exit(1);
});
