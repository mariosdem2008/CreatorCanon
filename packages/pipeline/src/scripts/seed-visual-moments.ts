/**
 * Operator one-off: extract visual moments from manual-upload Hormozi
 * videos using ffmpeg + Groq vision (free tier). Mirrors the production
 * visual_context stage but uses Groq's vision model so we can fill the
 * "Visual Moments (0)" gap on the Hormozi audit without spending budget.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/seed-visual-moments.ts <runId>
 *
 * Behavior:
 * - For each manual-upload video on the run with `localR2Key` populated:
 *   - skip the video if it already has visual_moment rows for (runId, videoId)
 *   - download the source MP4 from R2 to a temp dir
 *   - sample frames every SAMPLE_INTERVAL_SEC (cap at MAX_FRAMES_PER_VIDEO)
 *   - classify each frame via Groq vision (llama-4-maverick-17b-128e-instruct)
 *   - if usefulnessScore >= USEFULNESS_THRESHOLD: upload the JPG to R2 + insert visual_moment row
 *   - rate-limit between Groq calls so we stay within free-tier ~30 calls/min
 * - Errors on a single frame log a warning and continue; the video keeps going.
 * - At the end, write a `generation_stage_run` row via trackStageRun so the
 *   audit page's stage breakdown reflects this offline pass.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { and, asc, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  segment,
  video,
  videoSetItem,
  visualMoment,
} from '@creatorcanon/db/schema';

import { VISUAL_FRAME_ANALYST_PROMPT } from '../agents/specialists/prompts';
import { loadDefaultEnvFiles } from '../env-files';
import { trackStageRun } from './util/track-stage';
import { buildChain, type ChainRunner, type FrameClassification, type ProviderName } from './util/vision-providers';

const SAMPLE_INTERVAL_SEC = 10;
const MAX_FRAMES_PER_VIDEO = 60;
const USEFULNESS_THRESHOLD = 60;
const RATE_LIMIT_DELAY_MS = parseInt(process.env.VISUAL_MOMENTS_DELAY_MS ?? '', 10) || 2000;

interface SegmentRow {
  id: string;
  startMs: number;
  endMs: number;
}

function ffmpegBin(): string {
  return process.env.AUDIO_EXTRACTION_FFMPEG_BIN?.trim() || 'ffmpeg';
}

function ffprobeBin(): string {
  return process.env.AUDIO_EXTRACTION_FFPROBE_BIN?.trim() || 'ffprobe';
}

function guessExtension(contentType: string | null, fallbackKey: string): string {
  const mimeToExt: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
  };
  if (contentType && mimeToExt[contentType]) return mimeToExt[contentType]!;
  const extFromKey = path.extname(fallbackKey);
  return extFromKey || '.mp4';
}

function probeDurationSec(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffprobeBin(), [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ]);
    let out = '';
    proc.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) { resolve(0); return; }
      try {
        const parsed = JSON.parse(out) as { format?: { duration?: string } };
        const dur = parseFloat(parsed.format?.duration ?? '0');
        resolve(isFinite(dur) ? dur : 0);
      } catch {
        resolve(0);
      }
    });
    proc.on('error', () => resolve(0));
  });
}

async function extractFrame(inputPath: string, timestampSec: number, outputJpg: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    // -ss before -i is fast (input seek). Keyframe-accurate enough for sampling.
    // -update 1 is required by ffmpeg 8.x when writing to a non-pattern
    // filename. Without it the muxer warns "filename does not contain an
    // image sequence pattern" and exits with various codes depending on
    // the platform's process-handle pressure.
    const proc = spawn(ffmpegBin(), [
      '-y',
      '-ss', String(timestampSec),
      '-i', inputPath,
      '-vframes', '1',
      '-update', '1',
      '-q:v', '2',
      outputJpg,
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-300)}`));
    });
  });
}

/**
 * Extract scene-change frames using ffmpeg's `select='gt(scene,N)'` filter.
 * Frames are written to `outputDir/scene_NNNN.jpg` and paired with their
 * presentation timestamps via the `showinfo` filter (which emits one log
 * line per output frame containing `pts_time:N.N`).
 *
 * Scene threshold is 0.0-1.0:
 *   0.20 → very sensitive, catches subtle camera moves
 *   0.30 → balanced (default), catches slide changes + B-roll cuts
 *   0.45 → only dramatic cuts (fast-paced edited content)
 *
 * Override via VISUAL_MOMENTS_SCENE_THRESHOLD. Hard cap on frame count via
 * VISUAL_MOMENTS_SCENE_CAP so a fast-cut sequence doesn't explode the
 * vision-LLM call count — we stride-thin to the cap if exceeded.
 *
 * Returns [] when ffmpeg's scene filter found no scene changes (which
 * happens for purely static talking-head video) — caller should fall
 * back to fixed-interval sampling.
 */
async function extractSceneChangeFrames(
  inputPath: string,
  outputDir: string,
): Promise<Array<{ timestampSec: number; jpgPath: string }>> {
  const threshold = parseFloat(process.env.VISUAL_MOMENTS_SCENE_THRESHOLD ?? '0.3');
  const frameCap = parseInt(process.env.VISUAL_MOMENTS_SCENE_CAP ?? '40', 10);

  // showinfo writes pts_time:N.N to stderr per emitted frame. We capture
  // stderr and parse it to recover the timestamp for each scene_NNNN.jpg.
  const stderr = await new Promise<string>((resolve, reject) => {
    const proc = spawn(ffmpegBin(), [
      '-y',
      '-i', inputPath,
      '-vf', `select='gt(scene\\,${threshold})',showinfo`,
      '-vsync', 'vfr',
      '-q:v', '2',
      path.join(outputDir, 'scene_%04d.jpg'),
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let buf = '';
    proc.stderr?.on('data', (d: Buffer) => { buf += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      // ffmpeg returns 0 even when the scene filter emits zero frames.
      if (code !== 0) reject(new Error(`ffmpeg scene-extract exit ${code}: ${buf.slice(-300)}`));
      else resolve(buf);
    });
  });

  const ptsRe = /pts_time:(\d+(?:\.\d+)?)/g;
  const timestamps: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = ptsRe.exec(stderr)) !== null) {
    timestamps.push(parseFloat(m[1]!));
  }

  // Pair each extracted timestamp with its filename (scene_0001.jpg,
  // scene_0002.jpg, ...). Skip pairs whose .jpg didn't materialize.
  const frames: Array<{ timestampSec: number; jpgPath: string }> = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const idx = String(i + 1).padStart(4, '0');
    const jpgPath = path.join(outputDir, `scene_${idx}.jpg`);
    if (await fileExists(jpgPath)) {
      frames.push({ timestampSec: timestamps[i]!, jpgPath });
    }
  }

  // Cap if a fast-cut sequence produced too many — stride-thin uniformly
  // so we keep coverage of the whole timeline.
  if (frames.length > frameCap) {
    const stride = Math.ceil(frames.length / frameCap);
    const thinned = frames.filter((_, i) => i % stride === 0).slice(0, frameCap);
    console.info(`[visual-moments]   scene detector emitted ${frames.length} frames; stride-thinning to ${thinned.length}`);
    return thinned;
  }
  return frames;
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Fallback to fixed-interval sampling when scene-detect is disabled or yields too few frames. */
function buildFixedIntervalSamples(
  tempDir: string,
  durationSec: number,
): Array<{ timestampSec: number; jpgPath: string; preExtracted: boolean }> {
  const totalFrames = Math.min(
    MAX_FRAMES_PER_VIDEO,
    Math.max(1, Math.floor(durationSec / SAMPLE_INTERVAL_SEC)),
  );
  return Array.from({ length: totalFrames }, (_, i) => {
    const tsSec = i * SAMPLE_INTERVAL_SEC;
    return {
      timestampSec: tsSec,
      jpgPath: path.join(tempDir, `frame_${tsSec}.jpg`),
      preExtracted: false,
    };
  });
}

async function classifyFrame(
  chain: ChainRunner,
  jpgPath: string,
): Promise<{ classification: FrameClassification; provider: ProviderName }> {
  return chain.classify(jpgPath, VISUAL_FRAME_ANALYST_PROMPT);
}

function nearestSegmentId(segments: SegmentRow[], timestampMs: number): string | null {
  if (segments.length === 0) return null;
  // Prefer the segment that contains the timestamp.
  for (const s of segments) {
    if (s.startMs <= timestampMs && timestampMs < s.endMs) return s.id;
  }
  // Fall back to closest by midpoint.
  let best: string | null = null;
  let bestDist = Infinity;
  for (const s of segments) {
    const center = (s.startMs + s.endMs) / 2;
    const d = Math.abs(center - timestampMs);
    if (d < bestDist) {
      bestDist = d;
      best = s.id;
    }
  }
  return best;
}

async function processVideo(args: {
  v: { id: string; workspaceId: string; localR2Key: string; contentType: string | null; title: string | null; durationSeconds: number | null };
  runId: string;
  visionChain: ChainRunner;
}): Promise<{ framesAttempted: number; framesKept: number; providerCounts: Record<string, number> }> {
  const { v, runId, visionChain } = args;
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const db = getDb();

  // 1. Idempotency check: skip if this video already has visual moments for this run.
  const existing = await db
    .select({ id: visualMoment.id })
    .from(visualMoment)
    .where(and(eq(visualMoment.runId, runId), eq(visualMoment.videoId, v.id)))
    .limit(1);
  if (existing.length > 0) {
    console.info(`[visual-moments] ${v.id}: already has visual_moment rows; skipping`);
    return { framesAttempted: 0, framesKept: 0, providerCounts: {} };
  }

  // 2. Pull segments once for nearest-segment lookup.
  const segRows = await db
    .select({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs })
    .from(segment)
    .where(and(eq(segment.runId, runId), eq(segment.videoId, v.id)))
    .orderBy(asc(segment.startMs));

  // 3. Download MP4 to a temp file.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-visual-moments-'));
  let framesAttempted = 0;
  let framesKept = 0;
  try {
    const obj = await r2.getObject(v.localR2Key);
    const ext = guessExtension(v.contentType, v.localR2Key);
    const localMp4 = path.join(tempDir, `source${ext}`);
    await fs.writeFile(localMp4, obj.body);

    // 4. Determine duration. Prefer the value already in DB (populated by
    //    seed-hormozi-and-dispatch.ts via ffprobe at upload time); fall back
    //    to a fresh ffprobe of the local file if the DB value is missing or
    //    non-positive. The local-ffprobe path can fail on Windows when the
    //    binary isn't on PATH for the spawn (no shell:true).
    let durationSec = typeof v.durationSeconds === 'number' && v.durationSeconds > 0
      ? v.durationSeconds
      : 0;
    if (durationSec <= 0) {
      durationSec = await probeDurationSec(localMp4);
    }
    if (durationSec <= 0) {
      console.warn(`[visual-moments] ${v.id}: could not determine duration (DB + ffprobe both failed); skipping`);
      return { framesAttempted: 0, framesKept: 0, providerCounts: {} };
    }

    // 5. Build the frame list. Prefer scene-change extraction (gives us
    //    the meaningful frames — slide transitions, B-roll cuts, demo
    //    screens — while skipping near-duplicate talking-head shots).
    //    Fall back to fixed-interval sampling when the scene detector
    //    finds <3 frames (purely static talking-head video).
    interface FrameSample { timestampSec: number; jpgPath: string; preExtracted: boolean }
    const useSceneDetect = (process.env.VISUAL_MOMENTS_SCENE_DETECT ?? 'true').toLowerCase() !== 'false';
    let sampleList: FrameSample[];
    let strategy: 'scene-change' | 'fixed-interval';
    if (useSceneDetect) {
      try {
        const scenes = await extractSceneChangeFrames(localMp4, tempDir);
        if (scenes.length >= 3) {
          sampleList = scenes.map((s) => ({ timestampSec: s.timestampSec, jpgPath: s.jpgPath, preExtracted: true }));
          strategy = 'scene-change';
        } else {
          console.info(`[visual-moments]   scene detector found only ${scenes.length} frames; falling back to fixed-interval`);
          sampleList = buildFixedIntervalSamples(tempDir, durationSec);
          strategy = 'fixed-interval';
        }
      } catch (err) {
        console.warn(`[visual-moments]   scene-detect failed (${(err as Error).message.slice(0, 200)}); falling back to fixed-interval`);
        sampleList = buildFixedIntervalSamples(tempDir, durationSec);
        strategy = 'fixed-interval';
      }
    } else {
      sampleList = buildFixedIntervalSamples(tempDir, durationSec);
      strategy = 'fixed-interval';
    }

    console.info(
      `[visual-moments] ${v.id} (${v.title ?? 'no title'}): ` +
      `duration=${durationSec.toFixed(0)}s · ${strategy} · ${sampleList.length} frames`,
    );

    const providerCounts: Record<string, number> = {};
    for (let i = 0; i < sampleList.length; i += 1) {
      const { timestampSec: tsSec, jpgPath, preExtracted } = sampleList[i]!;
      const tsMs = Math.round(tsSec * 1000);
      framesAttempted += 1;
      try {
        if (!preExtracted) await extractFrame(localMp4, tsSec, jpgPath);
        const { classification: cls, provider } = await classifyFrame(visionChain, jpgPath);
        providerCounts[provider] = (providerCounts[provider] ?? 0) + 1;

        if (cls.usefulnessScore >= USEFULNESS_THRESHOLD) {
          const frameKey = `workspaces/${v.workspaceId}/runs/${runId}/visual-moments/${v.id}/${tsMs}.jpg`;
          const jpgBytes = await fs.readFile(jpgPath);
          await r2.putObject({
            key: frameKey,
            body: jpgBytes,
            contentType: 'image/jpeg',
            metadata: {
              source: 'seed-visual-moments',
              runId,
              videoId: v.id,
              timestampMs: String(tsMs),
            },
          });

          const segId = nearestSegmentId(segRows, tsMs);
          await db.insert(visualMoment).values({
            id: crypto.randomUUID(),
            workspaceId: v.workspaceId,
            runId,
            videoId: v.id,
            segmentId: segId,
            timestampMs: tsMs,
            frameR2Key: frameKey,
            type: cls.type,
            description: cls.description,
            extractedText: cls.extractedText || null,
            hubUse: cls.hubUse,
            usefulnessScore: cls.usefulnessScore,
            payload: cls as unknown as Record<string, unknown>,
          });
          framesKept += 1;
          const desc = cls.description.length > 70 ? cls.description.slice(0, 67) + '...' : cls.description;
          console.info(`[visual-moments]   t=${tsSec.toFixed(1)}s · KEEP · ${cls.type} · score=${cls.usefulnessScore} · ${desc}`);
        }
        // else: low usefulness, drop silently to keep logs readable.
      } catch (err) {
        console.warn(`[visual-moments]   t=${tsSec.toFixed(1)}s · WARN · ${(err as Error).message.slice(0, 200)}`);
      } finally {
        // Clean up frame file even on error so we don't blow up tempdir.
        await fs.rm(jpgPath, { force: true }).catch(() => undefined);
      }

      // Rate-limit between vision-LLM calls. Skip the sleep on the last
      // frame. Local Ollama doesn't need this but the chain may be using
      // a remote provider, so keep the throttle in place.
      if (i < sampleList.length - 1) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS));
      }
    }

    const providerSummary = Object.keys(providerCounts).length > 0
      ? ` · classifier mix: ${Object.entries(providerCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`
      : '';
    console.info(`[visual-moments] ${v.id}: extracted ${framesAttempted} frames, kept ${framesKept} with score >= ${USEFULNESS_THRESHOLD}${providerSummary}`);
    return { framesAttempted, framesKept, providerCounts };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function main() {
  loadDefaultEnvFiles();
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-visual-moments.ts <runId>');

  const startedAt = new Date();
  const db = getDb();
  const runRows = await db
    .select({ id: generationRun.id, videoSetId: generationRun.videoSetId, workspaceId: generationRun.workspaceId })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = runRows[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  const itemRows = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, run.videoSetId));
  const videoIds = itemRows.map((r) => r.videoId);
  if (videoIds.length === 0) throw new Error('Run has no videos');

  const vids = await db
    .select({
      id: video.id,
      workspaceId: video.workspaceId,
      localR2Key: video.localR2Key,
      contentType: video.contentType,
      title: video.title,
      sourceKind: video.sourceKind,
      durationSeconds: video.durationSeconds,
    })
    .from(video)
    .where(inArray(video.id, videoIds));

  // Manual uploads only — that's where localR2Key is populated.
  const targets = vids.filter(
    (x) => x.sourceKind === 'manual_upload' && x.localR2Key,
  ) as Array<{ id: string; workspaceId: string; localR2Key: string; contentType: string | null; title: string | null; durationSeconds: number | null }>;

  console.info(`[visual-moments] Run ${runId}: ${vids.length} videos in set, ${targets.length} manual-upload videos with localR2Key`);

  const visionChain = buildChain();
  console.info(`[visual-moments] vision chain: ${visionChain.describe()}`);
  if (visionChain.chain.length === 0) {
    throw new Error('No vision provider is available. Set GEMINI_API_KEY, GROQ_API_KEY, or run a local Ollama with the configured model.');
  }

  let totalAttempted = 0;
  let totalKept = 0;
  let videosProcessed = 0;
  const aggregateProviderCounts: Record<string, number> = {};
  const failures: Array<{ id: string; title: string | null; error: string }> = [];

  for (let i = 0; i < targets.length; i += 1) {
    const v = targets[i]!;
    console.info(`[visual-moments] (${i + 1}/${targets.length}) ${v.id} ${v.title ?? ''}`);
    try {
      const res = await processVideo({ v, runId, visionChain });
      totalAttempted += res.framesAttempted;
      totalKept += res.framesKept;
      videosProcessed += 1;
      for (const [k, n] of Object.entries(res.providerCounts)) {
        aggregateProviderCounts[k] = (aggregateProviderCounts[k] ?? 0) + n;
      }
    } catch (err) {
      failures.push({ id: v.id, title: v.title, error: (err as Error).message });
      console.error(`[visual-moments] ${v.id} permanently failed: ${(err as Error).message}`);
    }
  }

  const completedAt = new Date();
  await trackStageRun({
    runId,
    stageName: 'visual_context',
    startedAt,
    completedAt,
    summary: {
      providerChain: visionChain.chain.map((p) => p.name),
      providerCounts: aggregateProviderCounts,
      providerExhausted: [...visionChain.exhausted],
      videosProcessed,
      videosFailed: failures.length,
      framesSampled: totalAttempted,
      visualMomentsCreated: totalKept,
      sampleIntervalSec: SAMPLE_INTERVAL_SEC,
      maxFramesPerVideo: MAX_FRAMES_PER_VIDEO,
      usefulnessThreshold: USEFULNESS_THRESHOLD,
    },
  });

  await closeDb();

  const providerSummary = Object.keys(aggregateProviderCounts).length > 0
    ? ` · classifier mix: ${Object.entries(aggregateProviderCounts).map(([k, v]) => `${k}=${v}`).join(', ')}`
    : '';
  console.info(`[visual-moments] DONE — ${videosProcessed} videos, ${totalAttempted} frames sampled, ${totalKept} visual_moment rows written${providerSummary}.`);
  if (failures.length > 0) {
    console.error(`[visual-moments] ${failures.length} video(s) failed:`);
    for (const f of failures) console.error(`  - ${f.id} ${f.title}: ${f.error}`);
    process.exit(2);
  }
}

main().catch(async (err) => {
  await closeDb();
  console.error('[visual-moments] FAILED', err);
  process.exit(1);
});
