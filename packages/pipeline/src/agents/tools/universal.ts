import { z } from 'zod';
import { and, asc, eq, gte, lte } from '@creatorcanon/db';
import { segment, video } from '@creatorcanon/db/schema';
import type { ToolDef } from './types';

const videoSummaryListItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  durationSec: z.number().int().min(0),
  publishedAt: z.string().nullable(),
  thumbnailUrl: z.string().nullable(),
});

export const listVideosTool: ToolDef<Record<string, never>, z.infer<typeof videoSummaryListItemSchema>[]> = {
  name: 'listVideos',
  description: 'List every video in this run\'s selection. Returns id, title, duration, publishedAt, thumbnail.',
  input: z.object({}).strict(),
  output: z.array(videoSummaryListItemSchema),
  handler: async (_input, ctx) => {
    const rows = await ctx.db
      .select({
        id: video.id,
        title: video.title,
        durationSec: video.durationSeconds,
        publishedAt: video.publishedAt,
        thumbnails: video.thumbnails,
      })
      .from(video)
      .innerJoin(segment, eq(segment.videoId, video.id))
      .where(eq(segment.runId, ctx.runId))
      .groupBy(video.id, video.title, video.durationSeconds, video.publishedAt, video.thumbnails);
    return rows.map((r) => ({
      id: r.id,
      title: r.title ?? '',
      durationSec: r.durationSec ?? 0,
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
      thumbnailUrl: r.thumbnails?.medium ?? r.thumbnails?.small ?? null,
    }));
  },
};

const videoSummarySchema = z.object({
  title: z.string(),
  summary: z.string().nullable(),
  durationSec: z.number().int(),
  segmentCount: z.number().int(),
});

export const getVideoSummaryTool: ToolDef<{ videoId: string }, z.infer<typeof videoSummarySchema>> = {
  name: 'getVideoSummary',
  description: 'Get title + pre-computed summary (if any) + segment count for one video.',
  input: z.object({ videoId: z.string().min(1) }).strict(),
  output: videoSummarySchema,
  handler: async ({ videoId }, ctx) => {
    const v = await ctx.db
      .selectDistinct({ title: video.title, durationSec: video.durationSeconds })
      .from(video)
      .innerJoin(segment, eq(segment.videoId, video.id))
      .where(and(eq(video.id, videoId), eq(segment.runId, ctx.runId)))
      .limit(1);
    if (!v[0]) throw new Error(`Video '${videoId}' not found in run '${ctx.runId}'`);
    const segCount = await ctx.db
      .select({ id: segment.id })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.videoId, videoId)));
    return {
      title: v[0].title ?? '',
      summary: null, // pre-computed summaries are out of scope for v1
      durationSec: v[0].durationSec ?? 0,
      segmentCount: segCount.length,
    };
  },
};

const segmentRowSchema = z.object({
  id: z.string(),
  videoId: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  text: z.string(),
});

export const listSegmentsForVideoTool: ToolDef<{ videoId: string; range?: { startSec: number; endSec: number } }, z.infer<typeof segmentRowSchema>[]> = {
  name: 'listSegmentsForVideo',
  description: 'List segments for one video, optionally filtered to a [startSec, endSec] range. Capped at 200 rows.',
  input: z.object({
    videoId: z.string().min(1),
    range: z.object({ startSec: z.number().nonnegative(), endSec: z.number().nonnegative() }).optional(),
  }).strict(),
  output: z.array(segmentRowSchema),
  handler: async ({ videoId, range }, ctx) => {
    const conditions = [eq(segment.runId, ctx.runId), eq(segment.videoId, videoId)];
    if (range) {
      conditions.push(gte(segment.startMs, range.startSec * 1000));
      conditions.push(lte(segment.endMs, range.endSec * 1000));
    }
    const rows = await ctx.db
      .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, endMs: segment.endMs, text: segment.text })
      .from(segment)
      .where(and(...conditions))
      .orderBy(asc(segment.startMs))
      .limit(200);
    return rows;
  },
};

export const getSegmentTool: ToolDef<{ segmentId: string }, z.infer<typeof segmentRowSchema>> = {
  name: 'getSegment',
  description: 'Fetch one segment by ID. Used by agents to verify or quote precisely.',
  input: z.object({ segmentId: z.string().min(1) }).strict(),
  output: segmentRowSchema,
  handler: async ({ segmentId }, ctx) => {
    const rows = await ctx.db
      .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, endMs: segment.endMs, text: segment.text })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.id, segmentId)))
      .limit(1);
    if (!rows[0]) throw new Error(`Segment '${segmentId}' not found in run '${ctx.runId}'`);
    return rows[0];
  },
};
