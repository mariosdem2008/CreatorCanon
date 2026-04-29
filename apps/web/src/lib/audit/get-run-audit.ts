import { eq, getDb, sql as drizzleSql } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  generationStageRun,
  pageBrief,
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
 * Server-side loader for the run audit view. Aggregates channel_profile,
 * visual_moment, video_intelligence_card, canon_node, and page_brief rows
 * into a single shape ready for the audit page to render.
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

  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, runId))
    .limit(1);
  const channelProfileView = shapeChannelProfile(
    (cpRows[0]?.payload as Record<string, unknown> | undefined) ?? null,
  );

  // Pull only the videos in this run's video_set so we can title-resolve
  // visual moments and VICs.
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
  }));

  const vicRows = await db
    .select({
      videoId: videoIntelligenceCard.videoId,
      payload: videoIntelligenceCard.payload,
    })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));
  const vicView: VideoIntelligenceCardView[] = vicRows.map((row) => {
    const p = (row.payload as Record<string, unknown>) ?? {};
    const arr = (k: string) => (Array.isArray(p[k]) ? (p[k] as unknown[]).length : 0);
    return {
      videoId: row.videoId,
      videoTitle: titleByVideoId.get(row.videoId) ?? '(Untitled)',
      mainIdeaCount: arr('mainIdeas'),
      frameworkCount: arr('frameworks'),
      lessonCount: arr('lessons'),
      exampleCount: arr('examples'),
      mistakeCount: arr('mistakesToAvoid'),
      quoteCount: arr('quotes'),
    };
  });

  const cnRows = await db
    .select({ id: canonNode.id, type: canonNode.type, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));
  const canonNodesView: CanonNodeView[] = cnRows.map((row) =>
    shapeCanonNode({
      id: row.id,
      type: row.type,
      payload: (row.payload as Record<string, unknown>) ?? {},
    }),
  );

  const pbRows = await db
    .select({ id: pageBrief.id, position: pageBrief.position, payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .orderBy(pageBrief.position);
  const pageBriefsView: PageBriefView[] = pbRows.map((row) =>
    shapePageBrief({
      id: row.id,
      position: row.position,
      payload: (row.payload as Record<string, unknown>) ?? {},
    }),
  );

  // Sum stage costs for display.
  const costRows = await db
    .select({
      total: drizzleSql<number>`COALESCE(SUM(${generationStageRun.costCents}), 0)::int`,
    })
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, runId));
  const costCents = Number(costRows[0]?.total ?? 0);

  return {
    runId: run.id,
    projectId: run.projectId,
    status: run.status as RunAuditView['status'],
    channelProfile: channelProfileView,
    visualMoments: visualMomentsView,
    videoIntelligenceCards: vicView,
    canonNodes: canonNodesView,
    pageBriefs: pageBriefsView,
    costCents,
  };
}

export function shapeChannelProfile(payload: Record<string, unknown> | null): ChannelProfileView | null {
  if (!payload) return null;
  const get = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : null);
  const terminology = Array.isArray(payload.creatorTerminology)
    ? (payload.creatorTerminology as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return {
    creatorName: get('creatorName'),
    niche: get('niche'),
    audience: get('audience'),
    dominantTone: get('dominantTone'),
    recurringPromise: get('recurringPromise'),
    positioningSummary: get('positioningSummary'),
    creatorTerminology: terminology,
  };
}

export function shapeCanonNode(row: { id: string; type: string; payload: Record<string, unknown> }): CanonNodeView {
  const p = row.payload ?? {};
  const get = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const score = typeof p.pageWorthinessScore === 'number' ? (p.pageWorthinessScore as number) : null;
  return {
    id: row.id,
    type: row.type,
    title: get('title'),
    whenToUse: get('whenToUse'),
    pageWorthinessScore: score,
  };
}

export function shapePageBrief(row: { id: string; position: number; payload: Record<string, unknown> }): PageBriefView {
  const p = row.payload ?? {};
  const get = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const ids = Array.isArray(p.primaryCanonNodeIds)
    ? (p.primaryCanonNodeIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id: row.id,
    pageType: get('pageType') ?? 'lesson',
    pageTitle: get('pageTitle') ?? '(Untitled)',
    audienceQuestion: get('audienceQuestion'),
    primaryCanonNodeIds: ids,
    position: row.position,
  };
}
