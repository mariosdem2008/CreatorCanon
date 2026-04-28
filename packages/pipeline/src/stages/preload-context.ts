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

/**
 * Visual-moment fields the canon_architect agent needs in its prompt.
 * Includes videoId (canon spans multiple videos) AND hubUse (the agent
 * uses it to decide whether a moment is worth attaching to a canon node).
 */
export interface CanonVisualMoment {
  visualMomentId: string;
  videoId: string;
  timestampMs: number;
  type: string;
  description: string;
  hubUse: string;
  usefulnessScore: number;
}

/**
 * VIC fields the canon_architect agent needs. The full payload is
 * stringified into the prompt so the agent sees frameworks, lessons,
 * quotes, etc. without round-tripping back to read tools.
 */
export interface CanonVicRow {
  id: string;
  videoId: string;
  evidenceSegmentIds: string[];
  payload: unknown;
}

/**
 * Compact one-line format for a visual moment used in the canon_architect
 * prompt. Includes videoId (cross-video disambiguation) and hubUse (the
 * agent's signal that this moment is worth attaching to a canon node).
 */
export function formatVisualMomentForCanon(v: CanonVisualMoment): string {
  return `[${v.visualMomentId}] videoId=${v.videoId} @${v.timestampMs}ms ${v.type} (score=${v.usefulnessScore}): ${v.description} — hubUse: ${v.hubUse}`;
}

/**
 * Format one VIC into a `## VIC ${id} (videoId=...)` markdown block with
 * its evidenceSegmentIds and full payload. Compact JSON.stringify (no
 * pretty-print) keeps input tokens lean.
 */
export function formatVicForCanon(v: CanonVicRow): string {
  return (
    `## VIC ${v.id} (videoId=${v.videoId})\n` +
    `evidenceSegmentIds: ${JSON.stringify(v.evidenceSegmentIds)}\n` +
    `payload: ${JSON.stringify(v.payload)}`
  );
}

/**
 * Build the structured user message for canon_architect. Channel profile,
 * every VIC payload, and every visual moment are pre-loaded — the agent
 * does NOT need to call read tools.
 *
 * NOTE on prompt size: at canon_v1's 20-video cap with ~3-5KB VIC payloads,
 * this prompt lands at 60-100KB — comfortable for gpt-5.5 (128-200K context)
 * but tight if the cap grows. VIC payloads themselves embed visual-moment
 * references; this prompt also lists visual moments separately. To trim if
 * context-window pressure hits: drop visual-moment refs from VIC payloads
 * before stringification (single source of truth becomes the # VISUAL MOMENTS
 * section).
 */
export function buildCanonArchitectUserMessage(
  channelProfilePayload: unknown,
  vicRows: CanonVicRow[],
  vmRows: CanonVisualMoment[],
): string {
  const vicLines = vicRows.map(formatVicForCanon).join('\n\n');
  const vmLines =
    vmRows.length > 0
      ? vmRows.map(formatVisualMomentForCanon).join('\n')
      : '(none)';

  return (
    `# CHANNEL PROFILE\n${JSON.stringify(channelProfilePayload)}\n\n` +
    `# VIDEO INTELLIGENCE CARDS (${vicRows.length})\n` +
    vicLines +
    `\n\n# VISUAL MOMENTS (${vmRows.length})\n` +
    vmLines +
    `\n\nSynthesize the canon. Make a proposeCanonNode call for each curated node.`
  );
}

/**
 * Canon-node row fields page_brief_planner needs in its prompt. Only
 * page-worthy nodes (pageWorthinessScore >= 60) are passed to the planner,
 * filtered at the SQL boundary so the prompt stays compact.
 */
export interface PageWorthyCanonNode {
  id: string;
  type: string;
  origin: string;
  pageWorthinessScore: number;
  sourceVideoIds: string[];
  payload: unknown;
}

/**
 * Format one page-worthy canon node into a compact `## ${id} (...)` block
 * for page_brief_planner. Includes type/score/sources/origin metadata in
 * the header line plus the full payload for the agent's reading.
 */
export function formatCanonNodeForPageBriefs(n: PageWorthyCanonNode): string {
  return (
    `## ${n.id} (type=${n.type}, pageWorthiness=${n.pageWorthinessScore}, sources=${n.sourceVideoIds.length}, origin=${n.origin})\n` +
    `payload: ${JSON.stringify(n.payload)}`
  );
}

/**
 * Build the structured user message for page_brief_planner. Channel profile,
 * every page-worthy canon node, and high-score visual moments are
 * pre-loaded — the agent does NOT need to call read tools.
 *
 * The header counts (frameworks/lessons/playbooks) help the agent gauge
 * the canon's shape without iterating.
 */
export function buildPageBriefPlannerUserMessage(
  channelProfilePayload: unknown,
  nodes: PageWorthyCanonNode[],
  vmRows: CanonVisualMoment[],
): string {
  const frameworkCount = nodes.filter((n) => n.type === 'framework').length;
  const lessonCount = nodes.filter((n) => n.type === 'lesson').length;
  const playbookCount = nodes.filter((n) => n.type === 'playbook').length;

  const nodeLines = nodes.map(formatCanonNodeForPageBriefs).join('\n\n');
  const vmLines =
    vmRows.length > 0
      ? vmRows.map(formatVisualMomentForCanon).join('\n')
      : '(none)';

  return (
    `# CHANNEL PROFILE\n${JSON.stringify(channelProfilePayload)}\n\n` +
    `# PAGE-WORTHY CANON NODES (${nodes.length}: ${frameworkCount} frameworks, ${lessonCount} lessons, ${playbookCount} playbooks)\n` +
    nodeLines +
    `\n\n# VISUAL MOMENTS (${vmRows.length})\n` +
    vmLines +
    `\n\nPick 8-15 page-worthy anchors. Make a proposePageBrief call per page.`
  );
}
