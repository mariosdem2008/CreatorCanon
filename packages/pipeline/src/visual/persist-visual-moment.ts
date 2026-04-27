import { and, eq } from '@creatorcanon/db';
import { segment, visualMoment } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';

const VALID_TYPES = [
  'screen_demo', 'slide', 'chart', 'whiteboard', 'code',
  'product_demo', 'physical_demo', 'diagram', 'talking_head', 'other',
] as const;

export type VisualMomentType = typeof VALID_TYPES[number];

export interface PersistVisualMomentInput {
  db: AtlasDb;
  workspaceId: string;
  runId: string;
  videoId: string;
  segmentId?: string | null;
  timestampMs: number;
  frameR2Key?: string | null;
  thumbnailR2Key?: string | null;
  type: VisualMomentType;
  description: string;
  extractedText?: string | null;
  hubUse: string;
  usefulnessScore: number;
  payload: Record<string, unknown>;
  /** Below this score, the moment is dropped (returns ok=false, reason='below_threshold'). */
  minUsefulnessScore: number;
}

export type PersistResult =
  | { ok: true; id: string }
  | {
      ok: false;
      error: string;
      reason?: 'below_threshold' | 'video_not_in_run' | 'segment_not_in_video' | 'segment_not_in_run' | 'insert_failed';
    };

/**
 * Single source of truth for persisting visual_moment rows. Used by both:
 * - the `proposeVisualMoment` agent tool (for agents that produce moments via the harness)
 * - the `visual-context` stage (direct call after Gemini vision analysis)
 *
 * Validation gates (in order):
 *   1. videoId belongs to the run (>=1 segment with this run/video)
 *   2. segmentId (if given) belongs to {runId, videoId}
 *   3. usefulnessScore >= minUsefulnessScore
 */
export async function persistVisualMoment(input: PersistVisualMomentInput): Promise<PersistResult> {
  // 1) videoId in run
  const segOfVideo = await input.db
    .select({ id: segment.id })
    .from(segment)
    .where(and(eq(segment.runId, input.runId), eq(segment.videoId, input.videoId)))
    .limit(1);
  if (segOfVideo.length === 0) {
    return {
      ok: false,
      error: `videoId ${input.videoId} has no segments in run ${input.runId}.`,
      reason: 'video_not_in_run',
    };
  }

  // 2) segment ownership
  if (input.segmentId) {
    const s = await input.db
      .select({ id: segment.id, videoId: segment.videoId })
      .from(segment)
      .where(and(eq(segment.runId, input.runId), eq(segment.id, input.segmentId)))
      .limit(1);
    if (!s[0]) {
      return { ok: false, error: `segmentId ${input.segmentId} not in run.`, reason: 'segment_not_in_run' };
    }
    if (s[0].videoId !== input.videoId) {
      return { ok: false, error: `segmentId ${input.segmentId} belongs to a different video.`, reason: 'segment_not_in_video' };
    }
  }

  // 3) score threshold
  if (input.usefulnessScore < input.minUsefulnessScore) {
    return {
      ok: false,
      error: `usefulnessScore ${input.usefulnessScore} below ${input.minUsefulnessScore}; not persisted.`,
      reason: 'below_threshold',
    };
  }

  // 4) insert
  const id = `vm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  try {
    await input.db.insert(visualMoment).values({
      id,
      workspaceId: input.workspaceId,
      runId: input.runId,
      videoId: input.videoId,
      segmentId: input.segmentId ?? null,
      timestampMs: input.timestampMs,
      frameR2Key: input.frameR2Key ?? null,
      thumbnailR2Key: input.thumbnailR2Key ?? null,
      type: input.type,
      description: input.description,
      extractedText: input.extractedText ?? null,
      hubUse: input.hubUse,
      usefulnessScore: input.usefulnessScore,
      payload: input.payload,
    });
  } catch (err) {
    return { ok: false, error: `visual_moment insert failed: ${(err as Error).message}`, reason: 'insert_failed' };
  }
  return { ok: true, id };
}
