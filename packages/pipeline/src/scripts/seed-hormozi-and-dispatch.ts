/**
 * One-shot operator script: take a directory of MP4 files, upload them as
 * `manual_upload` videos to R2, wire them into a fresh project + video_set +
 * generation_run on the canon_v1 engine, and (optionally) print the dispatch
 * command so the audit phase can fire.
 *
 * This is the same plumbing as the /api/upload/init + /api/upload/complete
 * route, but driven from the CLI for batch test seeding when we don't want
 * to drag-and-drop six files through the UI.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-hormozi-and-dispatch.ts \
 *     --dir "C:\\Users\\mario\\Downloads\\YT videos\\alex hormozi" \
 *     --workspaceId e1ad6446-d463-4ee9-9451-7be5ac76f187 \
 *     --userId 89c2bff3-797a-4922-81e3-a1a4696c7f53 \
 *     --channelId ch_uploads_e1ad6446-d463-4ee9-9451-7be5ac76f187 \
 *     --projectTitle "Alex Hormozi — Business in 2026" \
 *     [--dispatch]
 *
 * Adding `--dispatch` will spawn dispatch-queued-run.ts inline once the run
 * is created. Otherwise the script just prints the runId and the command.
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

interface Args {
  dir: string;
  workspaceId: string;
  userId: string;
  channelId: string;
  projectTitle: string;
  dispatch: boolean;
}

function parseArgs(): Args {
  const args: Partial<Args> & { dispatch?: boolean } = { dispatch: false };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dispatch') {
      args.dispatch = true;
      continue;
    }
    const next = argv[i + 1];
    if (a === '--dir') { args.dir = next; i += 1; continue; }
    if (a === '--workspaceId') { args.workspaceId = next; i += 1; continue; }
    if (a === '--userId') { args.userId = next; i += 1; continue; }
    if (a === '--channelId') { args.channelId = next; i += 1; continue; }
    if (a === '--projectTitle') { args.projectTitle = next; i += 1; continue; }
  }
  if (!args.dir || !args.workspaceId || !args.userId || !args.channelId || !args.projectTitle) {
    throw new Error('Usage: see file header. Required: --dir, --workspaceId, --userId, --channelId, --projectTitle.');
  }
  return args as Args;
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
  // Drop the extension and the common YouTube-DL "(1080p)" suffix.
  let t = filename.replace(/\.[^.]+$/, '');
  t = t.replace(/\s*\(\d{3,4}p\)\s*$/, '');
  return t.trim().slice(0, 200);
}

async function ensureWorkspaceMember(args: Args) {
  const db = getDb();
  const ws = await db.select({ id: workspace.id }).from(workspace).where(eq(workspace.id, args.workspaceId)).limit(1);
  if (!ws[0]) throw new Error(`Workspace ${args.workspaceId} not found`);
  const member = await db
    .select({ userId: workspaceMember.userId })
    .from(workspaceMember)
    .where(sql`workspace_id = ${args.workspaceId} AND user_id = ${args.userId}`)
    .limit(1);
  if (!member[0]) throw new Error(`User ${args.userId} is not a member of workspace ${args.workspaceId}`);
  const ch = await db.select({ id: channel.id }).from(channel).where(eq(channel.id, args.channelId)).limit(1);
  if (!ch[0]) throw new Error(`Channel ${args.channelId} not found`);
}

async function main() {
  loadDefaultEnvFiles();
  const args = parseArgs();
  await ensureWorkspaceMember(args);

  // Discover videos in the directory.
  const dirEntries = fs.readdirSync(args.dir, { withFileTypes: true });
  const videoFiles = dirEntries
    .filter((e) => e.isFile() && /\.(mp4|m4v|mov|webm|mkv)$/i.test(e.name))
    .map((e) => e.name)
    .sort();
  if (videoFiles.length === 0) throw new Error(`No video files found in ${args.dir}`);

  console.info(`[seed-hormozi] Found ${videoFiles.length} video(s) in ${args.dir}`);
  for (const f of videoFiles) console.info(`  - ${f}`);

  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const db = getDb();

  const seeded: Array<{ videoId: string; r2Key: string; title: string; sizeBytes: number; durationSec: number | null }> = [];

  // 1. Upload each file + insert video row (matching /api/upload/init + complete shape).
  for (let i = 0; i < videoFiles.length; i += 1) {
    const filename = videoFiles[i]!;
    const filePath = path.join(args.dir, filename);
    const stat = fs.statSync(filePath);
    const ext = (filename.match(/\.([^.]+)$/)?.[1] ?? 'mp4').toLowerCase();
    const contentType = ext === 'webm' ? 'video/webm' : ext === 'mkv' ? 'video/x-matroska' : 'video/mp4';
    const videoId = 'mu_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    const r2Key = `workspaces/${args.workspaceId}/uploads/${videoId}/source.${ext}`;
    const title = filenameToTitle(filename);
    const durationSec = probeDurationSeconds(filePath);

    console.info(`[seed-hormozi] (${i + 1}/${videoFiles.length}) Uploading ${filename} (${(stat.size / 1024 / 1024).toFixed(1)} MB, ~${durationSec}s) → ${r2Key}`);
    const body = fs.readFileSync(filePath);
    await r2.putObject({ key: r2Key, body, contentType, metadata: { source: 'seed-hormozi' } });

    await db.insert(video).values({
      id: videoId,
      workspaceId: args.workspaceId,
      channelId: args.channelId,
      sourceKind: 'manual_upload',
      uploadStatus: 'uploaded',
      transcribeStatus: 'pending',
      localR2Key: r2Key,
      fileSizeBytes: stat.size,
      contentType,
      durationSeconds: durationSec,
      title,
      captionStatus: 'none',
    });

    seeded.push({ videoId, r2Key, title, sizeBytes: stat.size, durationSec });
  }

  // 2. Create video_set + items.
  const videoSetId = crypto.randomUUID();
  const totalDurationSeconds = seeded.reduce((s, v) => s + (v.durationSec ?? 0), 0);
  await db.insert(videoSet).values({
    id: videoSetId,
    workspaceId: args.workspaceId,
    name: args.projectTitle,
    createdBy: args.userId,
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
  console.info(`[seed-hormozi] Created video_set ${videoSetId} with ${seeded.length} items, totalDur=${totalDurationSeconds}s`);

  // 3. Create project pointing at the video_set.
  const projectId = crypto.randomUUID();
  await db.insert(project).values({
    id: projectId,
    workspaceId: args.workspaceId,
    videoSetId,
    title: args.projectTitle,
    config: { audience: 'Operators', tone: 'practitioner', length_preset: 'standard' },
  });
  console.info(`[seed-hormozi] Created project ${projectId} "${args.projectTitle}"`);

  // 4. Create generation_run (queued, canon_v1).
  const runId = crypto.randomUUID();
  const configHash = crypto.createHash('sha256').update(`${projectId}|${videoSetId}|canon_v1|seed-hormozi`).digest('hex').slice(0, 16);
  await db.insert(generationRun).values({
    id: runId,
    workspaceId: args.workspaceId,
    projectId,
    videoSetId,
    pipelineVersion: 'canon_v1',
    configHash,
    status: 'queued',
    selectedDurationSeconds: totalDurationSeconds,
    selectedWordCount: 0,
  });
  // Backfill project.currentRunId so the project page picks the run up.
  await db.update(project).set({ currentRunId: runId }).where(eq(project.id, projectId));

  console.info(`[seed-hormozi] Created run ${runId} (status=queued, pipelineVersion=canon_v1)`);

  await closeDb();

  const summary = {
    ok: true,
    workspaceId: args.workspaceId,
    projectId,
    videoSetId,
    runId,
    videos: seeded.map((s) => ({ id: s.videoId, title: s.title, sizeMB: +(s.sizeBytes / 1024 / 1024).toFixed(1), durationSec: s.durationSec })),
    auditUrl: `http://localhost:3000/app/projects/${projectId}/runs/${runId}/audit`,
    dispatchCommand: `cd packages/pipeline && PIPELINE_CONTENT_ENGINE=canon_v1 PIPELINE_QUALITY_MODE=codex_dev ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts ${runId}`,
  };
  console.info('[seed-hormozi] DONE');
  console.info(JSON.stringify(summary, null, 2));
}

main().catch(async (err) => {
  await closeDb();
  console.error('[seed-hormozi] FAILED', err);
  process.exit(1);
});
