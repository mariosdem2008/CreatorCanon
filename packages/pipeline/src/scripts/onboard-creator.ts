/**
 * Generic creator-onboarding pipeline. Replaces the hardcoded Hormozi mappings
 * with a config-driven flow:
 *
 *   - reads a creator JSON config (videos + YouTube URLs)
 *   - uploads MP4s to R2
 *   - creates project + video_set + generation_run
 *   - links YouTube IDs onto the video rows for citation deep-linking
 *   - prints the dispatch + downstream phase commands
 *
 * Use this for every creator AFTER Hormozi. The only per-creator artifact is
 * the config JSON.
 *
 * Config format (saved as e.g. ./creator-configs/huberman.json):
 *
 * {
 *   "creator": "Andrew Huberman",
 *   "workspaceId": "<uuid>",
 *   "userId": "<uuid>",
 *   "channelId": "ch_uploads_<workspaceId>",
 *   "projectTitle": "Andrew Huberman — Sleep Series 2026",
 *   "projectConfig": { "audience": "Operators", "tone": "evidence-based", "length_preset": "standard" },
 *   "videos": [
 *     { "filename": "01 Sleep Architecture.mp4", "youtubeUrl": "https://www.youtube.com/watch?v=...", "title": "Sleep Architecture" },
 *     { "filename": "02 Light Exposure Protocol.mp4", "youtubeUrl": "https://www.youtube.com/watch?v=..." }
 *   ]
 * }
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/onboard-creator.ts \
 *     --config ./creator-configs/huberman.json \
 *     --videoDir "C:\path\to\Huberman MP4s" \
 *     [--dispatch]
 *
 * `--dispatch` will print the dispatch command at the end. Add `--run-dispatch`
 * to actually spawn it inline (not recommended for first run — review the
 * created run in the audit page first).
 */

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import {
  channel,
  generationRun,
  project,
  video,
  videoSet,
  videoSetItem,
  workspace,
  workspaceMember,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

interface VideoEntry {
  filename: string;
  youtubeUrl?: string;
  title?: string;
}

interface CreatorConfig {
  creator: string;
  workspaceId: string;
  userId: string;
  channelId: string;
  projectTitle: string;
  projectConfig?: { audience?: string; tone?: string; length_preset?: 'standard' | 'short' | 'deep' };
  videos: VideoEntry[];
}

interface CliArgs {
  configPath: string;
  videoDir: string;
  dispatch: boolean;
  runDispatch: boolean;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const args: Partial<CliArgs> = { dispatch: false, runDispatch: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--config') { args.configPath = argv[++i]; continue; }
    if (a === '--videoDir') { args.videoDir = argv[++i]; continue; }
    if (a === '--dispatch') { args.dispatch = true; continue; }
    if (a === '--run-dispatch') { args.runDispatch = true; args.dispatch = true; continue; }
  }
  if (!args.configPath || !args.videoDir) {
    throw new Error('Usage: see file header. Required: --config <path> --videoDir <path>');
  }
  return args as CliArgs;
}

function loadConfig(configPath: string): CreatorConfig {
  if (!fs.existsSync(configPath)) throw new Error(`Config not found: ${configPath}`);
  const raw = fs.readFileSync(configPath, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Config ${configPath} is not valid JSON: ${(e as Error).message}`);
  }
  const c = parsed as CreatorConfig;
  if (!c.creator || !c.workspaceId || !c.userId || !c.channelId || !c.projectTitle) {
    throw new Error(`Config missing required fields: creator, workspaceId, userId, channelId, projectTitle`);
  }
  if (!Array.isArray(c.videos) || c.videos.length === 0) {
    throw new Error(`Config must include videos[] (got ${typeof c.videos})`);
  }
  for (let i = 0; i < c.videos.length; i += 1) {
    if (!c.videos[i]!.filename) {
      throw new Error(`Config videos[${i}] missing filename`);
    }
  }
  return c;
}

/**
 * Extract a YouTube video ID from any of the supported URL forms:
 *   https://www.youtube.com/watch?v=<id>
 *   https://youtu.be/<id>
 *   https://www.youtube.com/embed/<id>
 *   https://www.youtube.com/shorts/<id>
 */
function youtubeIdFromUrl(url: string): string | null {
  const u = url.trim();
  const watchMatch = u.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1]!;
  const shortMatch = u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1]!;
  const embedMatch = u.match(/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1]!;
  const shortsMatch = u.match(/shorts\/([a-zA-Z0-9_-]{11})/);
  if (shortsMatch) return shortsMatch[1]!;
  return null;
}

function probeDurationSeconds(filePath: string): number | null {
  try {
    const out = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ], { encoding: 'utf8' });
    if (out.status !== 0) return null;
    const n = Number(String(out.stdout).trim());
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch {
    return null;
  }
}

function filenameToTitle(filename: string): string {
  let t = filename.replace(/\.[^.]+$/, '');
  t = t.replace(/\s*\(\d{3,4}p\)\s*$/, '');
  return t.trim().slice(0, 200);
}

async function ensureWorkspaceMember(c: CreatorConfig) {
  const db = getDb();
  const ws = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, c.workspaceId)).limit(1);
  if (!ws[0]) throw new Error(`Workspace ${c.workspaceId} not found`);
  const member = await db
    .select({ userId: workspaceMember.userId })
    .from(workspaceMember)
    .where(sql`workspace_id = ${c.workspaceId} AND user_id = ${c.userId}`)
    .limit(1);
  if (!member[0]) throw new Error(`User ${c.userId} is not a member of workspace ${c.workspaceId}`);
  const ch = await db.select({ id: channel.id }).from(channel).where(eq(channel.id, c.channelId)).limit(1);
  if (!ch[0]) throw new Error(`Channel ${c.channelId} not found`);
}

async function main() {
  loadDefaultEnvFiles();
  const cli = parseArgs();
  const config = loadConfig(cli.configPath);
  await ensureWorkspaceMember(config);

  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const db = getDb();

  console.info(`[onboard] Creator: ${config.creator}`);
  console.info(`[onboard] Workspace: ${config.workspaceId} · channel: ${config.channelId}`);
  console.info(`[onboard] Project: ${config.projectTitle}`);
  console.info(`[onboard] Videos in config: ${config.videos.length}`);

  // 1. Resolve each config video to its file on disk + upload + insert.
  const seeded: Array<{
    videoId: string;
    r2Key: string;
    title: string;
    sizeBytes: number;
    durationSec: number | null;
    youtubeId: string | null;
  }> = [];

  for (let i = 0; i < config.videos.length; i += 1) {
    const v = config.videos[i]!;
    const filePath = path.join(cli.videoDir, v.filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`[onboard] video ${i + 1}/${config.videos.length} missing on disk: ${filePath}`);
    }
    const stat = fs.statSync(filePath);
    const ext = (v.filename.match(/\.([^.]+)$/)?.[1] ?? 'mp4').toLowerCase();
    const contentType = ext === 'webm' ? 'video/webm' : ext === 'mkv' ? 'video/x-matroska' : 'video/mp4';
    const videoId = 'mu_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const r2Key = `workspaces/${config.workspaceId}/uploads/${videoId}/source.${ext}`;
    const title = (v.title ?? filenameToTitle(v.filename)).slice(0, 200);
    const durationSec = probeDurationSeconds(filePath);
    const youtubeId = v.youtubeUrl ? youtubeIdFromUrl(v.youtubeUrl) : null;
    if (v.youtubeUrl && !youtubeId) {
      console.warn(`[onboard]   video ${i + 1}: youtubeUrl provided but no ID extractable: "${v.youtubeUrl}"`);
    }

    console.info(
      `[onboard] (${i + 1}/${config.videos.length}) ${v.filename} → ` +
      `${(stat.size / 1024 / 1024).toFixed(1)} MB · ${durationSec ?? '?'}s · yt=${youtubeId ?? '(none)'}`,
    );
    const body = fs.readFileSync(filePath);
    await r2.putObject({ key: r2Key, body, contentType, metadata: { source: 'onboard-creator', creator: config.creator } });

    await db.insert(video).values({
      id: videoId,
      workspaceId: config.workspaceId,
      channelId: config.channelId,
      sourceKind: 'manual_upload',
      uploadStatus: 'uploaded',
      transcribeStatus: 'pending',
      localR2Key: r2Key,
      fileSizeBytes: stat.size,
      contentType,
      durationSeconds: durationSec,
      title,
      captionStatus: 'none',
      youtubeVideoId: youtubeId,
    });

    seeded.push({ videoId, r2Key, title, sizeBytes: stat.size, durationSec, youtubeId });
  }

  // 2. Create video_set + items.
  const videoSetId = crypto.randomUUID();
  const totalDurationSeconds = seeded.reduce((s, x) => s + (x.durationSec ?? 0), 0);
  await db.insert(videoSet).values({
    id: videoSetId,
    workspaceId: config.workspaceId,
    name: config.projectTitle,
    createdBy: config.userId,
    totalDurationSeconds,
    totalTranscriptWords: 0,
    status: 'locked',
  });
  for (let i = 0; i < seeded.length; i += 1) {
    await db.insert(videoSetItem).values({
      id: crypto.randomUUID(),
      videoSetId,
      videoId: seeded[i]!.videoId,
      position: i,
    });
  }
  console.info(`[onboard] video_set ${videoSetId} · ${seeded.length} items · totalDur=${totalDurationSeconds}s`);

  // 3. Create project.
  const projectId = crypto.randomUUID();
  const projectConfig = config.projectConfig ?? { audience: 'Operators', tone: 'practitioner', length_preset: 'standard' };
  await db.insert(project).values({
    id: projectId,
    workspaceId: config.workspaceId,
    videoSetId,
    title: config.projectTitle,
    config: projectConfig,
  });
  console.info(`[onboard] project ${projectId} "${config.projectTitle}"`);

  // 4. Create generation_run (queued, canon_v1).
  const runId = crypto.randomUUID();
  const configHash = crypto
    .createHash('sha256')
    .update(`${projectId}|${videoSetId}|canon_v1|onboard-creator|${config.creator}`)
    .digest('hex')
    .slice(0, 16);
  await db.insert(generationRun).values({
    id: runId,
    workspaceId: config.workspaceId,
    projectId,
    videoSetId,
    pipelineVersion: 'canon_v1',
    configHash,
    status: 'queued',
    selectedDurationSeconds: totalDurationSeconds,
    selectedWordCount: 0,
  });
  await db.update(project).set({ currentRunId: runId }).where(eq(project.id, projectId));

  console.info(`[onboard] run ${runId} (status=queued)`);

  await closeDb();

  const dispatchCmd = `cd packages/pipeline && PIPELINE_CONTENT_ENGINE=canon_v1 PIPELINE_QUALITY_MODE=codex_dev ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts ${runId}`;
  const followUpCommands = [
    `# After dispatch lands at audit_ready, the offline polish + QA pipeline:`,
    `./node_modules/.bin/tsx ./src/scripts/seed-visual-moments.ts ${runId}`,
    `./node_modules/.bin/tsx ./src/scripts/reconcile-sibling-slugs.ts ${runId}`,
    `./node_modules/.bin/tsx ./src/scripts/backfill-offline-stage-runs.ts ${runId}`,
    `./node_modules/.bin/tsx ./src/scripts/validate-citation-chain.ts ${runId}`,
    `./node_modules/.bin/tsx ./src/scripts/check-voice-fingerprint.ts ${runId}`,
    `./node_modules/.bin/tsx ./src/scripts/generate-qa-worksheet.ts ${runId}`,
  ];

  const summary = {
    ok: true,
    creator: config.creator,
    workspaceId: config.workspaceId,
    projectId,
    videoSetId,
    runId,
    videos: seeded.map((s) => ({
      id: s.videoId,
      title: s.title,
      sizeMB: +(s.sizeBytes / 1024 / 1024).toFixed(1),
      durationSec: s.durationSec,
      youtubeId: s.youtubeId,
    })),
    auditUrl: `http://localhost:3001/app/projects/${projectId}/runs/${runId}/audit`,
    dispatchCommand: dispatchCmd,
    followUpCommands,
  };
  console.info('[onboard] DONE');
  console.info(JSON.stringify(summary, null, 2));

  if (cli.runDispatch) {
    console.info('[onboard] --run-dispatch set; spawning dispatch inline…');
    const r = spawnSync('node', [
      './node_modules/.bin/tsx',
      './src/dispatch-queued-run.ts',
      runId,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PIPELINE_CONTENT_ENGINE: 'canon_v1',
        PIPELINE_QUALITY_MODE: 'codex_dev',
      },
      stdio: 'inherit',
    });
    if (r.status !== 0) {
      console.error(`[onboard] dispatch exited ${r.status}; resume manually with:`);
      console.error(`  ${dispatchCmd}`);
      process.exit(r.status ?? 1);
    }
  } else if (cli.dispatch) {
    console.info('[onboard] --dispatch set (advisory only); run this when ready:');
    console.info(`  ${dispatchCmd}`);
  } else {
    console.info('[onboard] Review created run in audit page, then dispatch:');
    console.info(`  ${dispatchCmd}`);
  }
}

main().catch(async (err) => {
  await closeDb();
  console.error('[onboard] FAILED', err);
  process.exit(1);
});
