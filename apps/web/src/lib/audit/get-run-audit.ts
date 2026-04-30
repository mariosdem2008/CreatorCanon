import { eq, getDb, sql as drizzleSql } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  generationStageRun,
  pageBrief,
  project,
  segment,
  video,
  videoIntelligenceCard,
  videoSetItem,
  visualMoment,
} from '@creatorcanon/db/schema';
import type {
  CanonNodeView,
  ChannelProfileView,
  PageBriefView,
  RunAuditView,
  VideoIntelligenceCardView,
  VisualMomentView,
} from './types';

/**
 * Server-side loader for the run audit view. Aggregates EVERY pipeline
 * artifact tied to the run (channel_profile, visual_moment,
 * video_intelligence_card, canon_node, page_brief, plus per-stage cost) into
 * a single object the audit page renders in full.
 *
 * Returns null when the run does not exist.
 */
export async function getRunAudit(runId: string): Promise<RunAuditView | null> {
  const db = getDb();
  const runRows = await db
    .select({
      id: generationRun.id,
      projectId: generationRun.projectId,
      status: generationRun.status,
      videoSetId: generationRun.videoSetId,
    })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = runRows[0];
  if (!run) return null;

  const projectRows = await db
    .select({ title: project.title })
    .from(project)
    .where(eq(project.id, run.projectId))
    .limit(1);
  const projectTitle = projectRows[0]?.title ?? null;

  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, runId))
    .limit(1);
  const channelProfileView = shapeChannelProfile(
    (cpRows[0]?.payload as Record<string, unknown> | undefined) ?? null,
  );

  // Pull only the videos in this run's video_set so we can title-resolve
  // visual moments, VICs, canon node sourceVideoIds, and page brief refs.
  const videoRows = run.videoSetId
    ? await db
        .select({ id: video.id, title: video.title })
        .from(video)
        .innerJoin(videoSetItem, eq(videoSetItem.videoId, video.id))
        .where(eq(videoSetItem.videoSetId, run.videoSetId))
    : [];
  const titleByVideoId = new Map(videoRows.map((v) => [v.id, v.title ?? '(Untitled)']));

  const vmRows = await db
    .select({
      id: visualMoment.id,
      videoId: visualMoment.videoId,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
      hubUse: visualMoment.hubUse,
      usefulnessScore: visualMoment.usefulnessScore,
      extractedText: visualMoment.extractedText,
    })
    .from(visualMoment)
    .where(eq(visualMoment.runId, runId));
  const visualMomentsView: VisualMomentView[] = vmRows.map((m) => ({
    id: m.id,
    videoId: m.videoId,
    videoTitle: titleByVideoId.get(m.videoId) ?? '(Untitled)',
    timestampMs: m.timestampMs,
    type: m.type,
    description: m.description,
    hubUse: m.hubUse ?? null,
    usefulnessScore: m.usefulnessScore ?? null,
    extractedText: m.extractedText ?? null,
  }));

  const vicRows = await db
    .select({
      videoId: videoIntelligenceCard.videoId,
      payload: videoIntelligenceCard.payload,
      evidenceSegmentIds: videoIntelligenceCard.evidenceSegmentIds,
    })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));
  const vicView: VideoIntelligenceCardView[] = vicRows.map((row) => ({
    videoId: row.videoId,
    videoTitle: titleByVideoId.get(row.videoId) ?? '(Untitled)',
    evidenceSegmentCount: Array.isArray(row.evidenceSegmentIds) ? row.evidenceSegmentIds.length : 0,
    payload: (row.payload as Record<string, unknown>) ?? {},
  }));

  const cnRows = await db
    .select({
      id: canonNode.id,
      type: canonNode.type,
      payload: canonNode.payload,
      sourceVideoIds: canonNode.sourceVideoIds,
      evidenceQuality: canonNode.evidenceQuality,
      origin: canonNode.origin,
      confidenceScore: canonNode.confidenceScore,
      pageWorthinessScore: canonNode.pageWorthinessScore,
      specificityScore: canonNode.specificityScore,
      creatorUniquenessScore: canonNode.creatorUniquenessScore,
      citationCount: canonNode.citationCount,
      sourceCoverage: canonNode.sourceCoverage,
    })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));
  const canonNodesView: CanonNodeView[] = cnRows.map((row) => {
    const ids = Array.isArray(row.sourceVideoIds) ? row.sourceVideoIds : [];
    return shapeCanonNode({
      id: row.id,
      type: row.type,
      payload: (row.payload as Record<string, unknown>) ?? {},
      sourceVideoIds: ids,
      sourceVideoTitles: ids.map((id) => titleByVideoId.get(id) ?? '(unknown)'),
      evidenceQuality: row.evidenceQuality ?? null,
      origin: row.origin ?? null,
      confidenceScore: row.confidenceScore,
      pageWorthinessScore: row.pageWorthinessScore,
      specificityScore: row.specificityScore,
      creatorUniquenessScore: row.creatorUniquenessScore,
      citationCount: row.citationCount,
      sourceCoverage: row.sourceCoverage,
    });
  });

  const pbRows = await db
    .select({
      id: pageBrief.id,
      position: pageBrief.position,
      payload: pageBrief.payload,
      pageWorthinessScore: pageBrief.pageWorthinessScore,
    })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .orderBy(pageBrief.position);
  const pageBriefsView: PageBriefView[] = pbRows.map((row) =>
    shapePageBrief({
      id: row.id,
      position: row.position,
      payload: (row.payload as Record<string, unknown>) ?? {},
      pageWorthinessScore: row.pageWorthinessScore,
    }),
  );

  // Sum stage costs for display, plus per-stage breakdown.
  const stageCostRows = await db
    .select({
      stage: generationStageRun.stageName,
      total: drizzleSql<string>`COALESCE(SUM(${generationStageRun.costCents}), 0)::text`,
    })
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, runId))
    .groupBy(generationStageRun.stageName);
  const costByStage = stageCostRows
    .map((r) => ({ stage: r.stage as string, costCents: Number(r.total ?? 0) }))
    .filter((r) => r.costCents > 0)
    .sort((a, b) => b.costCents - a.costCents);
  const costCents = costByStage.reduce((sum, r) => sum + r.costCents, 0);

  const videoTitleById: Record<string, string> = {};
  for (const [k, v] of titleByVideoId.entries()) videoTitleById[k] = v;

  // Load all segments for this run, indexed by id → { videoId, startMs }.
  const segmentRows = await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs })
    .from(segment)
    .where(eq(segment.runId, runId));
  const segmentMap: Record<string, { videoId: string; startMs: number }> = {};
  for (const s of segmentRows) segmentMap[s.id] = { videoId: s.videoId, startMs: s.startMs };

  // Load YouTube IDs for the run's videos.
  const ytRows = run.videoSetId
    ? await db
        .select({ id: video.id, youtubeId: video.youtubeVideoId })
        .from(video)
        .innerJoin(videoSetItem, eq(videoSetItem.videoId, video.id))
        .where(eq(videoSetItem.videoSetId, run.videoSetId))
    : [];
  const youtubeIdByVideoId: Record<string, string | null> = {};
  for (const v of ytRows) youtubeIdByVideoId[v.id] = v.youtubeId ?? null;

  return {
    runId: run.id,
    projectId: run.projectId,
    projectTitle,
    status: run.status as RunAuditView['status'],
    channelProfile: channelProfileView,
    visualMoments: visualMomentsView,
    videoIntelligenceCards: vicView,
    canonNodes: canonNodesView,
    pageBriefs: pageBriefsView,
    costCents,
    costByStage,
    videoTitleById,
    segmentMap,
    youtubeIdByVideoId,
  };
}

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function shapeChannelProfile(payload: Record<string, unknown> | null): ChannelProfileView | null {
  if (!payload) return null;
  return {
    payload,
    creatorName: asString(payload.creatorName),
    niche: asString(payload.niche),
    audience: asString(payload.audience),
    dominantTone: asString(payload.dominantTone),
    recurringPromise: asString(payload.recurringPromise),
    whyPeopleFollow: asString(payload.whyPeopleFollow),
    expertiseCategory: asString(payload.expertiseCategory),
    monetizationAngle: asString(payload.monetizationAngle),
    positioningSummary: asString(payload.positioningSummary),
    contentFormats: asStringArray(payload.contentFormats),
    recurringThemes: asStringArray(payload.recurringThemes),
    creatorTerminology: asStringArray(payload.creatorTerminology),
  };
}

export function shapeCanonNode(row: {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  sourceVideoIds: string[];
  sourceVideoTitles: string[];
  evidenceQuality: string | null;
  origin: string | null;
  confidenceScore: number | null;
  pageWorthinessScore: number | null;
  specificityScore: number | null;
  creatorUniquenessScore: number | null;
  citationCount: number | null;
  sourceCoverage: number | null;
}): CanonNodeView {
  const p = row.payload ?? {};
  const title = asString(p.title) ?? asString(p.name) ?? asString(p.term);
  return {
    id: row.id,
    type: row.type,
    title,
    payload: p,
    sourceVideoIds: row.sourceVideoIds,
    sourceVideoTitles: row.sourceVideoTitles,
    evidenceQuality: row.evidenceQuality,
    origin: row.origin,
    confidenceScore: row.confidenceScore,
    pageWorthinessScore: row.pageWorthinessScore,
    specificityScore: row.specificityScore,
    creatorUniquenessScore: row.creatorUniquenessScore,
    citationCount: row.citationCount,
    sourceCoverage: row.sourceCoverage,
  };
}

export function shapePageBrief(row: {
  id: string;
  position: number;
  payload: Record<string, unknown>;
  pageWorthinessScore: number | null;
}): PageBriefView {
  const p = row.payload ?? {};
  return {
    id: row.id,
    position: row.position,
    pageType: asString(p.pageType) ?? 'lesson',
    pageTitle: asString(p.pageTitle) ?? '(Untitled)',
    slug: asString(p.slug),
    audienceQuestion: asString(p.audienceQuestion),
    openingHook: asString(p.openingHook),
    pageWorthinessScore: row.pageWorthinessScore,
    primaryCanonNodeIds: asStringArray(p.primaryCanonNodeIds),
    supportingCanonNodeIds: asStringArray(p.supportingCanonNodeIds),
    payload: p,
  };
}
