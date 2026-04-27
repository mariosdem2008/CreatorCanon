import { and, eq } from '@creatorcanon/db';
import { segment, visualMoment } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import { selectModel } from '../agents/providers/selectModel';
import { parseServerEnv } from '@creatorcanon/core';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import { extractFrames } from '../visual/frame-extractor';
import { uploadFrame } from '../visual/upload-frame';
import { resolveLocalMp4Source } from '../visual/resolve-mp4-source';
import { analyzeFrameWithGemini } from '../visual/gemini-vision';
import { persistVisualMoment } from '../visual/persist-visual-moment';
import { VISUAL_LIMITS } from '../canon-limits';
import { VISUAL_FRAME_ANALYST_PROMPT } from '../agents/specialists/prompts';
import type { StageContext } from '../harness';

export interface VisualContextStageInput {
  runId: string;
  workspaceId: string;
  /** Test override for an R2 client (otherwise built from env). */
  r2Override?: R2Client;
}

export interface VisualContextStageOutput {
  videosProcessed: number;
  videosFailed: number;
  videosWithMp4Source: number;
  videosSkippedNoMp4: number;
  framesSampled: number;
  visualMomentsCreated: number;
  warnings: string[];
}

const TEACHING_CUE_PHRASES = [
  'look at', 'as you can see', 'on screen', 'this chart', 'this dashboard', 'this example',
  'the code', 'the slide', 'this setup', 'before and after', 'watch', 'shown here',
];

export async function runVisualContextStage(
  input: VisualContextStageInput,
): Promise<VisualContextStageOutput> {
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  const out: VisualContextStageOutput = {
    videosProcessed: 0,
    videosFailed: 0,
    videosWithMp4Source: 0,
    videosSkippedNoMp4: 0,
    framesSampled: 0,
    visualMomentsCreated: 0,
    warnings: [],
  };

  if (process.env.PIPELINE_VISUAL_CONTEXT_ENABLED === 'false') {
    out.warnings.push('PIPELINE_VISUAL_CONTEXT_ENABLED=false; stage skipped.');
    return out;
  }

  // Resolve and clamp limits from env (env can tighten, never loosen past plan caps).
  const envFrames = Number(process.env.PIPELINE_VISUAL_MAX_FRAMES_PER_VIDEO ?? VISUAL_LIMITS.maxFramesPerVideo);
  const maxFrames = Math.max(1, Math.min(envFrames, VISUAL_LIMITS.maxFramesPerVideo));
  const envScore = Number(process.env.PIPELINE_VISUAL_MIN_USEFULNESS_SCORE ?? VISUAL_LIMITS.minUsefulnessScore);
  const minScore = Math.max(VISUAL_LIMITS.minUsefulnessScore, Math.min(envScore, 100));

  // Distinct videoIds in this run.
  const segs = await db
    .selectDistinct({ videoId: segment.videoId })
    .from(segment)
    .where(eq(segment.runId, input.runId));
  const videoIds = segs.map((s) => s.videoId);
  if (videoIds.length === 0) return out;

  // Idempotency: clear prior visual moments for this run before re-extracting.
  await db.delete(visualMoment).where(eq(visualMoment.runId, input.runId));

  const visionModel = selectModel('visual_frame_analyst', process.env);
  const apiKey = env.GEMINI_API_KEY ?? '';

  for (const videoId of videoIds) {
    let mp4Source: { mp4Path: string; cleanup: () => Promise<void> } | null = null;
    let frameCleanup: (() => Promise<void>) | null = null;
    try {
      mp4Source = await resolveLocalMp4Source(db, r2, videoId);
      if (!mp4Source) {
        out.videosSkippedNoMp4 += 1;
        out.warnings.push(`videoId=${videoId}: no video_mp4 mediaAsset; skipped (transcript-only).`);
        continue;
      }
      out.videosWithMp4Source += 1;

      const cueSegments = await db
        .select({
          id: segment.id,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
        })
        .from(segment)
        .where(and(eq(segment.runId, input.runId), eq(segment.videoId, videoId)))
        .orderBy(segment.startMs);

      const timestamps = pickFrameTimestamps(cueSegments, { maxFrames });
      out.framesSampled += timestamps.length;

      const extraction = await extractFrames({ mp4Path: mp4Source.mp4Path, timestampsMs: timestamps });
      frameCleanup = extraction.cleanup;
      const frames = extraction.frames;

      let saved = 0;
      for (const frame of frames) {
        if (saved >= VISUAL_LIMITS.maxVisualMomentsPerVideo) break;
        try {
          const v = await analyzeFrameWithGemini({
            apiKey,
            modelId: visionModel.modelId,
            prompt: VISUAL_FRAME_ANALYST_PROMPT,
            imageBytes: frame.bytes,
            timestampMs: frame.timestampMs,
          });
          if (!v.isUseful || v.usefulnessScore < minScore) continue;

          const frameR2Key = await uploadFrame({
            r2,
            workspaceId: input.workspaceId,
            runId: input.runId,
            videoId,
            timestampMs: frame.timestampMs,
            bytes: frame.bytes,
          });
          const nearest = nearestSegmentId(cueSegments, frame.timestampMs);

          const result = await persistVisualMoment({
            db,
            workspaceId: input.workspaceId,
            runId: input.runId,
            videoId,
            segmentId: nearest,
            timestampMs: frame.timestampMs,
            frameR2Key,
            type: v.type,
            description: v.description,
            extractedText: v.extractedText,
            hubUse: v.hubUse,
            usefulnessScore: v.usefulnessScore,
            payload: v as unknown as Record<string, unknown>,
            minUsefulnessScore: minScore,
          });

          if (result.ok) {
            saved += 1;
            out.visualMomentsCreated += 1;
          } else if (result.reason !== 'below_threshold') {
            out.warnings.push(
              `videoId=${videoId} ts=${frame.timestampMs}: persist failed (${result.error})`,
            );
          }
        } catch (frameErr) {
          out.warnings.push(
            `videoId=${videoId} ts=${frame.timestampMs}: vision call failed (${(frameErr as Error).message}); continuing.`,
          );
        }
      }
      out.videosProcessed += 1;
    } catch (videoErr) {
      out.videosFailed += 1;
      out.warnings.push(`videoId=${videoId}: ${(videoErr as Error).message}`);
    } finally {
      if (frameCleanup) await frameCleanup();
      if (mp4Source) await mp4Source.cleanup();
    }
  }

  return out;
}

/**
 * Materialization validator. Zero moments is valid (no mp4 sources, or
 * archive is talking-head only). When the cached output claims rows were
 * created, the DB must contain at least that many.
 */
export async function validateVisualContextMaterialization(
  output: VisualContextStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  if (output.visualMomentsCreated === 0) return true;
  const db = getDb();
  const rows = await db
    .select({ id: visualMoment.id })
    .from(visualMoment)
    .where(eq(visualMoment.runId, ctx.runId));
  return rows.length >= output.visualMomentsCreated;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function pickFrameTimestamps(
  cueSegments: Array<{ startMs: number; endMs: number; text: string }>,
  opts: { maxFrames: number },
): number[] {
  if (cueSegments.length === 0) return [];
  const totalMs = cueSegments[cueSegments.length - 1]!.endMs;
  const cueTimestamps: number[] = [];
  for (const seg of cueSegments) {
    const lower = seg.text.toLowerCase();
    if (TEACHING_CUE_PHRASES.some((phrase) => lower.includes(phrase))) {
      cueTimestamps.push(Math.floor((seg.startMs + seg.endMs) / 2));
    }
  }
  // Half the budget goes to teaching cues, the rest is even-spaced.
  const out = new Set<number>(
    cueTimestamps.slice(0, Math.min(cueTimestamps.length, Math.floor(opts.maxFrames / 2))),
  );
  const minutes = totalMs / 60_000;
  const targetCount =
    minutes < 2 ? Math.min(opts.maxFrames, 4) : minutes < 20 ? Math.min(opts.maxFrames, 8) : opts.maxFrames;
  if (out.size < targetCount && totalMs > 0) {
    const step = totalMs / (targetCount + 1);
    for (let i = 1; i <= targetCount && out.size < targetCount; i += 1) {
      out.add(Math.floor(step * i));
    }
  }
  return [...out].sort((a, b) => a - b);
}

function nearestSegmentId(
  cueSegments: Array<{ id: string; startMs: number; endMs: number }>,
  timestampMs: number,
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const s of cueSegments) {
    const center = (s.startMs + s.endMs) / 2;
    const d = Math.abs(center - timestampMs);
    if (d < bestDist) {
      bestDist = d;
      best = s.id;
    }
  }
  return best;
}
