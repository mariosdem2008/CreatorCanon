import { and, asc, eq } from '@creatorcanon/db';
import { segment, visualMoment } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';

export interface PreloadedSegment {
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface PreloadedVisualMoment {
  visualMomentId: string;
  timestampMs: number;
  type: string;
  description: string;
  hubUse: string;
  usefulnessScore: number;
}

export interface VideoContext {
  segments: PreloadedSegment[];
  visualMoments: PreloadedVisualMoment[];
}

/**
 * Compact one-line format for a transcript segment used inside agent user
 * messages. Stable across canon_v1 stages (video_intelligence, canon,
 * page_briefs) so the agents see one consistent shape.
 */
export function formatSegmentForPrompt(s: PreloadedSegment): string {
  return `[${s.segmentId}] ${s.startMs}ms-${s.endMs}ms: ${s.text}`;
}

/**
 * Load every transcript segment + every persisted visual moment for one
 * video in one round-trip pair. Returns empty arrays — never null — so the
 * caller can branch on `segments.length === 0`.
 */
export async function loadVideoContext(
  db: AtlasDb,
  runId: string,
  videoId: string,
): Promise<VideoContext> {
  const segments = await db
    .select({
      segmentId: segment.id,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    })
    .from(segment)
    .where(and(eq(segment.runId, runId), eq(segment.videoId, videoId)))
    .orderBy(asc(segment.startMs));

  const visualMoments = await db
    .select({
      visualMomentId: visualMoment.id,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
      hubUse: visualMoment.hubUse,
      usefulnessScore: visualMoment.usefulnessScore,
    })
    .from(visualMoment)
    .where(and(eq(visualMoment.runId, runId), eq(visualMoment.videoId, videoId)));

  return { segments, visualMoments };
}

/**
 * Build the structured user message the video_analyst agent receives. The
 * channel profile, transcript, and visual moments are all pre-loaded — the
 * agent does NOT need to call read tools.
 *
 * NOTE: channelProfilePayload is stringified WITHOUT pretty-print indentation
 * to keep input tokens lean (LLMs parse compact JSON identically; 2-space
 * indent inflates by ~15-25%).
 */
export function buildVideoAnalystUserMessage(
  channelProfilePayload: unknown,
  videoId: string,
  segments: PreloadedSegment[],
  visualMoments: PreloadedVisualMoment[],
): string {
  const transcriptLines = segments.map(formatSegmentForPrompt).join('\n');
  const visualLines =
    visualMoments.length > 0
      ? visualMoments
          .map(
            (v) =>
              `[${v.visualMomentId}] @${v.timestampMs}ms ${v.type} (score=${v.usefulnessScore}): ${v.description} — hubUse: ${v.hubUse}`,
          )
          .join('\n')
      : '(none)';

  return (
    `# CHANNEL PROFILE\n${JSON.stringify(channelProfilePayload)}\n\n` +
    `# VIDEO ${videoId} — TRANSCRIPT (${segments.length} segments)\n` +
    transcriptLines +
    `\n\n# VISUAL MOMENTS for ${videoId} (${visualMoments.length})\n` +
    visualLines +
    `\n\nProduce one proposeVideoIntelligenceCard call for video ${videoId}. The card's evidenceSegmentIds MUST be drawn only from the segmentIds shown above.`
  );
}
