import { z } from 'zod';
import { and, asc, eq, gte, sql } from '@creatorcanon/db';
import {
  channelProfile,
  videoIntelligenceCard,
  canonNode,
  pageBrief,
  visualMoment,
  segment,
} from '@creatorcanon/db/schema';
import type { ToolDef } from './types';

// ---------------------------------------------------------------------------
// Channel profile
// ---------------------------------------------------------------------------

const channelProfileRowSchema = z.object({
  id: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
});

export const getChannelProfileTool: ToolDef<Record<string, never>, z.infer<typeof channelProfileRowSchema> | null> = {
  name: 'getChannelProfile',
  description: 'Read the channel profile for this run, or null if not yet generated.',
  input: z.object({}).strict(),
  output: channelProfileRowSchema.nullable(),
  handler: async (_input, ctx) => {
    const rows = await ctx.db
      .select({ id: channelProfile.id, payload: channelProfile.payload, createdAt: channelProfile.createdAt })
      .from(channelProfile)
      .where(and(eq(channelProfile.runId, ctx.runId), eq(channelProfile.workspaceId, ctx.workspaceId)))
      .limit(1);
    if (!rows[0]) return null;
    return { id: rows[0].id, payload: rows[0].payload, createdAt: rows[0].createdAt.toISOString() };
  },
};

// ---------------------------------------------------------------------------
// Video intelligence card
// ---------------------------------------------------------------------------

const vicRowSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  payload: z.unknown(),
  evidenceSegmentIds: z.array(z.string()),
  createdAt: z.string(),
});

export const getVideoIntelligenceCardTool: ToolDef<{ videoId: string }, z.infer<typeof vicRowSchema> | null> = {
  name: 'getVideoIntelligenceCard',
  description: 'Read the video-intelligence card for one video in this run, or null if not yet generated.',
  input: z.object({ videoId: z.string().min(1) }).strict(),
  output: vicRowSchema.nullable(),
  handler: async ({ videoId }, ctx) => {
    const rows = await ctx.db
      .select({
        id: videoIntelligenceCard.id,
        videoId: videoIntelligenceCard.videoId,
        payload: videoIntelligenceCard.payload,
        evidenceSegmentIds: videoIntelligenceCard.evidenceSegmentIds,
        createdAt: videoIntelligenceCard.createdAt,
      })
      .from(videoIntelligenceCard)
      .where(and(
        eq(videoIntelligenceCard.runId, ctx.runId),
        eq(videoIntelligenceCard.workspaceId, ctx.workspaceId),
        eq(videoIntelligenceCard.videoId, videoId),
      ))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      videoId: rows[0].videoId,
      payload: rows[0].payload,
      evidenceSegmentIds: rows[0].evidenceSegmentIds ?? [],
      createdAt: rows[0].createdAt.toISOString(),
    };
  },
};

const vicListItemSchema = z.object({ videoId: z.string(), id: z.string(), createdAt: z.string() });

export const listVideoIntelligenceCardsTool: ToolDef<Record<string, never>, z.infer<typeof vicListItemSchema>[]> = {
  name: 'listVideoIntelligenceCards',
  description: 'List every video-intelligence card persisted in this run.',
  input: z.object({}).strict(),
  output: z.array(vicListItemSchema),
  handler: async (_input, ctx) => {
    const rows = await ctx.db
      .select({ id: videoIntelligenceCard.id, videoId: videoIntelligenceCard.videoId, createdAt: videoIntelligenceCard.createdAt })
      .from(videoIntelligenceCard)
      .where(and(eq(videoIntelligenceCard.runId, ctx.runId), eq(videoIntelligenceCard.workspaceId, ctx.workspaceId)))
      .orderBy(asc(videoIntelligenceCard.createdAt));
    return rows.map((r) => ({ id: r.id, videoId: r.videoId, createdAt: r.createdAt.toISOString() }));
  },
};

// ---------------------------------------------------------------------------
// Canon nodes
// ---------------------------------------------------------------------------

const canonNodeRowSchema = z.object({
  id: z.string(),
  type: z.string(),
  origin: z.string(),
  payload: z.unknown(),
  evidenceSegmentIds: z.array(z.string()),
  sourceVideoIds: z.array(z.string()),
  evidenceQuality: z.string(),
  confidenceScore: z.number().int(),
  citationCount: z.number().int(),
  sourceCoverage: z.number().int(),
  pageWorthinessScore: z.number().int(),
  specificityScore: z.number().int(),
  creatorUniquenessScore: z.number().int(),
  createdAt: z.string(),
});

export const getCanonNodeTool: ToolDef<{ id: string }, z.infer<typeof canonNodeRowSchema> | null> = {
  name: 'getCanonNode',
  description: 'Read one canon node by id (within this run).',
  input: z.object({ id: z.string().min(1) }).strict(),
  output: canonNodeRowSchema.nullable(),
  handler: async ({ id }, ctx) => {
    const rows = await ctx.db
      .select()
      .from(canonNode)
      .where(and(eq(canonNode.runId, ctx.runId), eq(canonNode.workspaceId, ctx.workspaceId), eq(canonNode.id, id)))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      type: r.type,
      origin: r.origin,
      payload: r.payload,
      evidenceSegmentIds: r.evidenceSegmentIds ?? [],
      sourceVideoIds: r.sourceVideoIds ?? [],
      evidenceQuality: r.evidenceQuality,
      confidenceScore: r.confidenceScore,
      citationCount: r.citationCount,
      sourceCoverage: r.sourceCoverage,
      pageWorthinessScore: r.pageWorthinessScore,
      specificityScore: r.specificityScore,
      creatorUniquenessScore: r.creatorUniquenessScore,
      createdAt: r.createdAt.toISOString(),
    };
  },
};

const canonNodeListItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  origin: z.string(),
  pageWorthinessScore: z.number().int(),
  evidenceQuality: z.string(),
  citationCount: z.number().int(),
});

export const listCanonNodesTool: ToolDef<{ type?: string; minPageWorthiness?: number }, z.infer<typeof canonNodeListItemSchema>[]> = {
  name: 'listCanonNodes',
  description: 'List canon nodes in this run, optionally filtered by type and minimum page-worthiness score.',
  input: z.object({
    type: z.string().optional(),
    minPageWorthiness: z.number().int().min(0).max(100).optional(),
  }).strict(),
  output: z.array(canonNodeListItemSchema),
  handler: async ({ type, minPageWorthiness }, ctx) => {
    const conditions = [eq(canonNode.runId, ctx.runId), eq(canonNode.workspaceId, ctx.workspaceId)];
    if (type) conditions.push(eq(canonNode.type, type));
    if (typeof minPageWorthiness === 'number') conditions.push(gte(canonNode.pageWorthinessScore, minPageWorthiness));
    const rows = await ctx.db
      .select({
        id: canonNode.id,
        type: canonNode.type,
        origin: canonNode.origin,
        pageWorthinessScore: canonNode.pageWorthinessScore,
        evidenceQuality: canonNode.evidenceQuality,
        citationCount: canonNode.citationCount,
      })
      .from(canonNode)
      .where(and(...conditions))
      .orderBy(asc(canonNode.id));
    return rows;
  },
};

// ---------------------------------------------------------------------------
// Page briefs
// ---------------------------------------------------------------------------

const pageBriefRowSchema = z.object({
  id: z.string(),
  payload: z.unknown(),
  pageWorthinessScore: z.number().int(),
  position: z.number().int(),
  createdAt: z.string(),
});

export const getPageBriefTool: ToolDef<{ id: string }, z.infer<typeof pageBriefRowSchema> | null> = {
  name: 'getPageBrief',
  description: 'Read one page brief by id (within this run).',
  input: z.object({ id: z.string().min(1) }).strict(),
  output: pageBriefRowSchema.nullable(),
  handler: async ({ id }, ctx) => {
    const rows = await ctx.db
      .select()
      .from(pageBrief)
      .where(and(eq(pageBrief.runId, ctx.runId), eq(pageBrief.workspaceId, ctx.workspaceId), eq(pageBrief.id, id)))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      payload: r.payload,
      pageWorthinessScore: r.pageWorthinessScore,
      position: r.position,
      createdAt: r.createdAt.toISOString(),
    };
  },
};

const pageBriefListItemSchema = z.object({
  id: z.string(),
  position: z.number().int(),
  pageWorthinessScore: z.number().int(),
});

export const listPageBriefsTool: ToolDef<Record<string, never>, z.infer<typeof pageBriefListItemSchema>[]> = {
  name: 'listPageBriefs',
  description: 'List every page brief in this run, ordered by position.',
  input: z.object({}).strict(),
  output: z.array(pageBriefListItemSchema),
  handler: async (_input, ctx) => {
    const rows = await ctx.db
      .select({ id: pageBrief.id, position: pageBrief.position, pageWorthinessScore: pageBrief.pageWorthinessScore })
      .from(pageBrief)
      .where(and(eq(pageBrief.runId, ctx.runId), eq(pageBrief.workspaceId, ctx.workspaceId)))
      .orderBy(asc(pageBrief.position));
    return rows;
  },
};

// ---------------------------------------------------------------------------
// Visual moments
// ---------------------------------------------------------------------------

const visualMomentListItemSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  segmentId: z.string().nullable(),
  timestampMs: z.number().int(),
  type: z.string(),
  description: z.string(),
  hubUse: z.string(),
  usefulnessScore: z.number().int(),
  frameR2Key: z.string().nullable(),
});

export const listVisualMomentsTool: ToolDef<{ videoId?: string; minScore?: number }, z.infer<typeof visualMomentListItemSchema>[]> = {
  name: 'listVisualMoments',
  description: 'List visual moments in this run, optionally filtered by videoId and minimum usefulness score (0-100).',
  input: z.object({
    videoId: z.string().min(1).optional(),
    minScore: z.number().int().min(0).max(100).optional(),
  }).strict(),
  output: z.array(visualMomentListItemSchema),
  handler: async ({ videoId, minScore }, ctx) => {
    const conditions = [eq(visualMoment.runId, ctx.runId), eq(visualMoment.workspaceId, ctx.workspaceId)];
    if (videoId) conditions.push(eq(visualMoment.videoId, videoId));
    if (typeof minScore === 'number') conditions.push(gte(visualMoment.usefulnessScore, minScore));
    const rows = await ctx.db
      .select({
        id: visualMoment.id,
        videoId: visualMoment.videoId,
        segmentId: visualMoment.segmentId,
        timestampMs: visualMoment.timestampMs,
        type: visualMoment.type,
        description: visualMoment.description,
        hubUse: visualMoment.hubUse,
        usefulnessScore: visualMoment.usefulnessScore,
        frameR2Key: visualMoment.frameR2Key,
      })
      .from(visualMoment)
      .where(and(...conditions))
      .orderBy(asc(visualMoment.timestampMs));
    return rows;
  },
};

const visualMomentRowSchema = visualMomentListItemSchema.extend({
  thumbnailR2Key: z.string().nullable(),
  extractedText: z.string().nullable(),
  payload: z.unknown(),
});

export const getVisualMomentTool: ToolDef<{ id: string }, z.infer<typeof visualMomentRowSchema> | null> = {
  name: 'getVisualMoment',
  description: 'Read one visual moment by id (within this run).',
  input: z.object({ id: z.string().min(1) }).strict(),
  output: visualMomentRowSchema.nullable(),
  handler: async ({ id }, ctx) => {
    const rows = await ctx.db
      .select()
      .from(visualMoment)
      .where(and(eq(visualMoment.runId, ctx.runId), eq(visualMoment.workspaceId, ctx.workspaceId), eq(visualMoment.id, id)))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      videoId: r.videoId,
      segmentId: r.segmentId,
      timestampMs: r.timestampMs,
      type: r.type,
      description: r.description,
      hubUse: r.hubUse,
      usefulnessScore: r.usefulnessScore,
      frameR2Key: r.frameR2Key,
      thumbnailR2Key: r.thumbnailR2Key,
      extractedText: r.extractedText,
      payload: r.payload,
    };
  },
};

// ---------------------------------------------------------------------------
// Transcript helpers (for channel/video analysts that ingest full text)
// ---------------------------------------------------------------------------

const fullTranscriptSchema = z.object({
  videoId: z.string(),
  text: z.string(),
  segmentCount: z.number().int(),
});

export const getFullTranscriptTool: ToolDef<{ videoId: string; maxChars?: number }, z.infer<typeof fullTranscriptSchema>> = {
  name: 'getFullTranscript',
  description: 'Concatenate all segments of one video into a single transcript string. Defaults to 120K char cap; truncates with "[...]" marker.',
  input: z.object({
    videoId: z.string().min(1),
    maxChars: z.number().int().min(1000).max(500_000).optional(),
  }).strict(),
  output: fullTranscriptSchema,
  handler: async ({ videoId, maxChars }, ctx) => {
    const cap = maxChars ?? 120_000;
    const rows = await ctx.db
      .select({ text: segment.text })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.workspaceId, ctx.workspaceId), eq(segment.videoId, videoId)))
      .orderBy(asc(segment.startMs));
    if (rows.length === 0) throw new Error(`No segments for video '${videoId}' in run '${ctx.runId}'`);
    let acc = '';
    let truncated = false;
    for (const r of rows) {
      if (acc.length + r.text.length + 1 > cap) {
        acc += '\n[... transcript truncated at character cap ...]';
        truncated = true;
        break;
      }
      acc += (acc ? '\n' : '') + r.text;
    }
    return { videoId, text: acc, segmentCount: rows.length };
  },
};

const segmentedTranscriptItemSchema = z.object({
  segmentId: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  text: z.string(),
});

export const getSegmentedTranscriptTool: ToolDef<
  { videoId: string; maxSegments?: number },
  { videoId: string; segments: z.infer<typeof segmentedTranscriptItemSchema>[]; total: number }
> = {
  name: 'getSegmentedTranscript',
  description: 'Return ordered list of segments {segmentId, startMs, endMs, text} for one video. Defaults to first 400 segments.',
  input: z.object({
    videoId: z.string().min(1),
    maxSegments: z.number().int().min(10).max(2000).optional(),
  }).strict(),
  output: z.object({
    videoId: z.string(),
    segments: z.array(segmentedTranscriptItemSchema),
    total: z.number().int(),
  }),
  handler: async ({ videoId, maxSegments }, ctx) => {
    const cap = maxSegments ?? 400;
    const totalRows = await ctx.db
      .select({ c: sql<number>`count(*)::int` })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.workspaceId, ctx.workspaceId), eq(segment.videoId, videoId)));
    const total = totalRows[0]?.c ?? 0;
    if (total === 0) throw new Error(`No segments for video '${videoId}' in run '${ctx.runId}'`);
    const rows = await ctx.db
      .select({ segmentId: segment.id, startMs: segment.startMs, endMs: segment.endMs, text: segment.text })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.workspaceId, ctx.workspaceId), eq(segment.videoId, videoId)))
      .orderBy(asc(segment.startMs))
      .limit(cap);
    return { videoId, segments: rows, total };
  },
};
