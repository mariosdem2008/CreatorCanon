import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import {
  channelProfile,
  videoIntelligenceCard,
  canonNode,
  pageBrief,
  visualMoment,
  segment,
  generationRun,
} from '@creatorcanon/db/schema';
import type { ToolDef, ToolCtx } from './types';
import { persistVisualMoment } from '../../visual/persist-visual-moment';
import { VISUAL_LIMITS } from '../../canon-limits';

// Defense-in-depth: every propose handler asserts the run belongs to ctx.workspaceId
// before doing any work. The harness controls ctx, but this guards against future
// refactors or tests that synthesize a ctx with mismatched ids.
let runWorkspaceCache: { runId: string; workspaceId: string } | null = null;
async function assertRunInWorkspace(ctx: ToolCtx): Promise<{ ok: true } | { ok: false; error: string }> {
  if (runWorkspaceCache && runWorkspaceCache.runId === ctx.runId && runWorkspaceCache.workspaceId === ctx.workspaceId) {
    return { ok: true };
  }
  const rows = await ctx.db
    .select({ workspaceId: generationRun.workspaceId })
    .from(generationRun)
    .where(eq(generationRun.id, ctx.runId))
    .limit(1);
  if (!rows[0]) return { ok: false, error: `Run ${ctx.runId} not found` };
  if (rows[0].workspaceId !== ctx.workspaceId) {
    return { ok: false, error: `Run ${ctx.runId} does not belong to workspace ${ctx.workspaceId}` };
  }
  runWorkspaceCache = { runId: ctx.runId, workspaceId: ctx.workspaceId };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Ok = { ok: true; id: string };
type Err = { ok: false; error: string; reason?: string };
type Result = Ok | Err;

const resultSchema = z.union([
  z.object({ ok: z.literal(true), id: z.string() }),
  z.object({ ok: z.literal(false), error: z.string(), reason: z.string().optional() }),
]);

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function validateSegmentsInRun(
  segmentIds: string[],
  ctx: ToolCtx,
  expectedVideoId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (segmentIds.length === 0) return { ok: true };
  const unique = [...new Set(segmentIds)];
  const rows = await ctx.db
    .select({ id: segment.id, videoId: segment.videoId })
    .from(segment)
    .where(and(
      eq(segment.runId, ctx.runId),
      eq(segment.workspaceId, ctx.workspaceId),
      inArray(segment.id, unique),
    ));
  const found = new Map(rows.map((r) => [r.id, r.videoId]));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `Unknown segment ID(s) in this run: ${missing.join(', ')}` };
  }
  if (expectedVideoId) {
    const wrongVideo = unique.filter((id) => found.get(id) !== expectedVideoId);
    if (wrongVideo.length > 0) {
      return { ok: false, error: `Segment(s) ${wrongVideo.join(', ')} do not belong to videoId ${expectedVideoId}` };
    }
  }
  return { ok: true };
}

async function validateVisualMomentsInRun(
  ids: string[],
  ctx: ToolCtx,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true };
  const unique = [...new Set(ids)];
  const rows = await ctx.db
    .select({ id: visualMoment.id })
    .from(visualMoment)
    .where(and(
      eq(visualMoment.runId, ctx.runId),
      eq(visualMoment.workspaceId, ctx.workspaceId),
      inArray(visualMoment.id, unique),
    ));
  const found = new Set(rows.map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `Unknown visualMoment ID(s) in this run: ${missing.join(', ')}` };
  }
  return { ok: true };
}

async function validateCanonNodesInRun(
  ids: string[],
  ctx: ToolCtx,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (ids.length === 0) return { ok: true };
  const unique = [...new Set(ids)];
  const rows = await ctx.db
    .select({ id: canonNode.id })
    .from(canonNode)
    .where(and(
      eq(canonNode.runId, ctx.runId),
      eq(canonNode.workspaceId, ctx.workspaceId),
      inArray(canonNode.id, unique),
    ));
  const found = new Set(rows.map((r) => r.id));
  const missing = unique.filter((id) => !found.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `Unknown canonNode ID(s) in this run: ${missing.join(', ')}` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 1. proposeChannelProfile (upsert on runId)
// ---------------------------------------------------------------------------

const channelProfileInput = z.object({
  payload: z.record(z.unknown()),
  costCents: z.number().nonnegative().optional(),
}).strict();

export const proposeChannelProfileTool: ToolDef<z.infer<typeof channelProfileInput>, Result> = {
  name: 'proposeChannelProfile',
  description: 'Upsert the channel profile for this run. Atomic on runId — concurrent calls cannot create duplicates.',
  input: channelProfileInput,
  output: resultSchema,
  handler: async (input, ctx) => {
    const runCheck = await assertRunInWorkspace(ctx);
    if (!runCheck.ok) return { ok: false, error: runCheck.error };

    const id = makeId('cp');
    try {
      const inserted = await ctx.db
        .insert(channelProfile)
        .values({
          id,
          workspaceId: ctx.workspaceId,
          runId: ctx.runId,
          payload: input.payload,
          costCents: String(input.costCents ?? 0),
        })
        .onConflictDoUpdate({
          target: channelProfile.runId,
          set: {
            payload: input.payload,
            costCents: String(input.costCents ?? 0),
          },
        })
        .returning({ id: channelProfile.id });
      const persistedId = inserted[0]?.id ?? id;
      return { ok: true, id: persistedId };
    } catch (err) {
      return { ok: false, error: `channel_profile upsert failed: ${(err as Error).message}` };
    }
  },
};

// ---------------------------------------------------------------------------
// 2. proposeVideoIntelligenceCard (upsert on (runId, videoId))
// ---------------------------------------------------------------------------

const visualMomentRefSchema = z.object({
  visualMomentId: z.string(),
  timestampMs: z.number().int().min(0),
  type: z.string(),
  description: z.string(),
  hubUse: z.string(),
});

const videoIntelligenceCardInput = z.object({
  videoId: z.string().min(1),
  payload: z.record(z.unknown()),
  evidenceSegmentIds: z.array(z.string()).max(200),
  visualMoments: z.array(visualMomentRefSchema).max(6).optional(),
  failureModes: z.array(z.object({
    condition: z.string().min(1),
    impact: z.string().min(1),
  })).max(4).optional(),
  counterCases: z.array(z.string().min(1)).max(4).optional(),
  costCents: z.number().nonnegative().optional(),
}).strict();

export const proposeVideoIntelligenceCardTool: ToolDef<z.infer<typeof videoIntelligenceCardInput>, Result> = {
  name: 'proposeVideoIntelligenceCard',
  description:
    'Upsert the intelligence card for one video in this run. evidenceSegmentIds must all belong to {videoId}. visualMoments (if any) must reference moments persisted in this run. Any payload.visualMoments key smuggled by the agent is stripped — only the validated input.visualMoments are persisted.',
  input: videoIntelligenceCardInput,
  output: resultSchema,
  handler: async (input, ctx) => {
    const runCheck = await assertRunInWorkspace(ctx);
    if (!runCheck.ok) return { ok: false, error: runCheck.error };

    // 1) videoId must have segments in this run.
    const own = await ctx.db
      .select({ id: segment.id })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.workspaceId, ctx.workspaceId), eq(segment.videoId, input.videoId)))
      .limit(1);
    if (!own[0]) return { ok: false, error: `videoId ${input.videoId} has no segments in run ${ctx.runId}` };

    // 2) Strict segment ownership: every evidence segment must belong to {videoId}.
    const segCheck = await validateSegmentsInRun(input.evidenceSegmentIds, ctx, input.videoId);
    if (!segCheck.ok) return { ok: false, error: segCheck.error };

    // 3) Visual moment refs must exist in this run.
    if (input.visualMoments && input.visualMoments.length > 0) {
      const vmCheck = await validateVisualMomentsInRun(
        input.visualMoments.map((v) => v.visualMomentId),
        ctx,
      );
      if (!vmCheck.ok) return { ok: false, error: vmCheck.error };
    }

    // 4) Sanitize: strip any payload.visualMoments the agent might smuggle (only validated input.visualMoments allowed).
    const payloadOut: Record<string, unknown> = { ...input.payload };
    delete payloadOut.visualMoments;
    delete payloadOut.failureModes;
    delete payloadOut.counterCases;
    if (input.visualMoments) payloadOut.visualMoments = input.visualMoments;
    if (input.failureModes && input.failureModes.length > 0) payloadOut.failureModes = input.failureModes;
    if (input.counterCases && input.counterCases.length > 0) payloadOut.counterCases = input.counterCases;

    // 5) Atomic upsert on (runId, videoId).
    const id = makeId('vic');
    try {
      const inserted = await ctx.db
        .insert(videoIntelligenceCard)
        .values({
          id,
          workspaceId: ctx.workspaceId,
          runId: ctx.runId,
          videoId: input.videoId,
          payload: payloadOut,
          evidenceSegmentIds: [...new Set(input.evidenceSegmentIds)],
          costCents: String(input.costCents ?? 0),
        })
        .onConflictDoUpdate({
          target: [videoIntelligenceCard.runId, videoIntelligenceCard.videoId],
          set: {
            payload: payloadOut,
            evidenceSegmentIds: [...new Set(input.evidenceSegmentIds)],
            costCents: String(input.costCents ?? 0),
          },
        })
        .returning({ id: videoIntelligenceCard.id });
      const persistedId = inserted[0]?.id ?? id;
      return { ok: true, id: persistedId };
    } catch (err) {
      return { ok: false, error: `video_intelligence_card upsert failed: ${(err as Error).message}` };
    }
  },
};

// ---------------------------------------------------------------------------
// 3. proposeCanonNode
// ---------------------------------------------------------------------------

const canonNodeTypeEnum = z.enum([
  'topic',
  'framework',
  'lesson',
  'playbook',
  'example',
  'principle',
  'pattern',
  'tactic',
  'definition',
  'aha_moment',
  'quote',
]);

const evidenceQualityEnum = z.enum(['high', 'medium', 'low']);
const originEnum = z.enum(['single_video', 'multi_video', 'channel_profile', 'derived']);

const canonNodeInput = z.object({
  type: canonNodeTypeEnum,
  payload: z.record(z.unknown()),
  evidenceSegmentIds: z.array(z.string()).max(200),
  sourceVideoIds: z.array(z.string().min(1)).min(1).max(50),
  evidenceQuality: evidenceQualityEnum,
  origin: originEnum.optional(),
  // Scores are required (0-100). Default-zero made it impossible to distinguish
  // "agent forgot" from "explicitly low-confidence" — agents must commit a number.
  confidenceScore: z.number().int().min(0).max(100),
  pageWorthinessScore: z.number().int().min(0).max(100),
  specificityScore: z.number().int().min(0).max(100),
  creatorUniquenessScore: z.number().int().min(0).max(100),
  visualMomentIds: z.array(z.string().min(1)).max(20).optional(),
}).strict();

export const proposeCanonNodeTool: ToolDef<z.infer<typeof canonNodeInput>, Result> = {
  name: 'proposeCanonNode',
  description:
    'Persist one canon node (topic, framework, lesson, playbook, example, principle, etc.). evidenceSegmentIds and sourceVideoIds must come from this run. visualMomentIds (if present) must exist in this run.',
  input: canonNodeInput,
  output: resultSchema,
  handler: async (input, ctx) => {
    const runCheck = await assertRunInWorkspace(ctx);
    if (!runCheck.ok) return { ok: false, error: runCheck.error };

    // Segments in run (any video).
    const segCheck = await validateSegmentsInRun(input.evidenceSegmentIds, ctx);
    if (!segCheck.ok) return { ok: false, error: segCheck.error };

    // Source videos must each have at least one segment in run.
    if (input.sourceVideoIds.length > 0) {
      const rows = await ctx.db
        .select({ videoId: segment.videoId })
        .from(segment)
        .where(and(
          eq(segment.runId, ctx.runId),
          eq(segment.workspaceId, ctx.workspaceId),
          inArray(segment.videoId, input.sourceVideoIds),
        ));
      const present = new Set(rows.map((r) => r.videoId));
      const missingVideos = input.sourceVideoIds.filter((v) => !present.has(v));
      if (missingVideos.length > 0) {
        return { ok: false, error: `sourceVideoIds not in run: ${missingVideos.join(', ')}` };
      }
    }

    // Visual moments exist in run.
    if (input.visualMomentIds && input.visualMomentIds.length > 0) {
      const vmCheck = await validateVisualMomentsInRun(input.visualMomentIds, ctx);
      if (!vmCheck.ok) return { ok: false, error: vmCheck.error };
    }

    // Sanitize: agents may smuggle visualMomentIds via raw payload; only validated input.visualMomentIds count.
    const payloadOut: Record<string, unknown> = { ...input.payload };
    delete payloadOut.visualMomentIds;
    if (input.visualMomentIds && input.visualMomentIds.length > 0) {
      payloadOut.visualMomentIds = [...new Set(input.visualMomentIds)];
    }

    // Citation metrics derive from evidence + sources.
    const citationCount = new Set(input.evidenceSegmentIds).size;
    const sourceCoverage = new Set(input.sourceVideoIds).size;
    const origin = input.origin ?? (sourceCoverage > 1 ? 'multi_video' : 'single_video');

    const id = makeId('cn');
    try {
      await ctx.db.insert(canonNode).values({
        id,
        workspaceId: ctx.workspaceId,
        runId: ctx.runId,
        type: input.type,
        payload: payloadOut,
        evidenceSegmentIds: [...new Set(input.evidenceSegmentIds)],
        sourceVideoIds: [...new Set(input.sourceVideoIds)],
        evidenceQuality: input.evidenceQuality,
        origin,
        confidenceScore: input.confidenceScore,
        citationCount,
        sourceCoverage,
        pageWorthinessScore: input.pageWorthinessScore,
        specificityScore: input.specificityScore,
        creatorUniquenessScore: input.creatorUniquenessScore,
      });
    } catch (err) {
      return { ok: false, error: `canon_node insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};

// ---------------------------------------------------------------------------
// 4. proposePageBrief
// ---------------------------------------------------------------------------

const pageBriefInput = z.object({
  payload: z.record(z.unknown()),
  primaryCanonNodeIds: z.array(z.string()).min(1).max(20),
  supportingCanonNodeIds: z.array(z.string()).max(50).optional(),
  recommendedVisualMomentIds: z.array(z.string()).max(10).optional(),
  pageWorthinessScore: z.number().int().min(0).max(100).optional(),
  position: z.number().int().min(0).optional(),
}).strict();

export const proposePageBriefTool: ToolDef<z.infer<typeof pageBriefInput>, Result> = {
  name: 'proposePageBrief',
  description:
    'Persist one page brief. primaryCanonNodeIds and supportingCanonNodeIds must reference canon nodes in this run. recommendedVisualMomentIds (if any) must exist in run.',
  input: pageBriefInput,
  output: resultSchema,
  handler: async (input, ctx) => {
    const runCheck = await assertRunInWorkspace(ctx);
    if (!runCheck.ok) return { ok: false, error: runCheck.error };

    const allNodeIds = [...input.primaryCanonNodeIds, ...(input.supportingCanonNodeIds ?? [])];
    const nodeCheck = await validateCanonNodesInRun(allNodeIds, ctx);
    if (!nodeCheck.ok) return { ok: false, error: nodeCheck.error };

    if (input.recommendedVisualMomentIds && input.recommendedVisualMomentIds.length > 0) {
      const vmCheck = await validateVisualMomentsInRun(input.recommendedVisualMomentIds, ctx);
      if (!vmCheck.ok) return { ok: false, error: vmCheck.error };
    }

    // Sanitize: only validated arg-level IDs win — strip any matching keys from raw payload.
    const payloadOut: Record<string, unknown> = { ...input.payload };
    delete payloadOut.primaryCanonNodeIds;
    delete payloadOut.supportingCanonNodeIds;
    delete payloadOut.recommendedVisualMomentIds;
    payloadOut.primaryCanonNodeIds = [...new Set(input.primaryCanonNodeIds)];
    payloadOut.supportingCanonNodeIds = [...new Set(input.supportingCanonNodeIds ?? [])];
    if (input.recommendedVisualMomentIds && input.recommendedVisualMomentIds.length > 0) {
      payloadOut.recommendedVisualMomentIds = [...new Set(input.recommendedVisualMomentIds)];
    }

    const id = makeId('pb');
    try {
      await ctx.db.insert(pageBrief).values({
        id,
        workspaceId: ctx.workspaceId,
        runId: ctx.runId,
        payload: payloadOut,
        pageWorthinessScore: input.pageWorthinessScore ?? 0,
        position: input.position ?? 0,
      });
    } catch (err) {
      return { ok: false, error: `page_brief insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};

// ---------------------------------------------------------------------------
// 5. proposeVisualMoment
// ---------------------------------------------------------------------------

const visualMomentTypeEnum = z.enum([
  'screen_demo', 'slide', 'chart', 'whiteboard', 'code',
  'product_demo', 'physical_demo', 'diagram', 'talking_head', 'other',
]);

const visualMomentInput = z.object({
  videoId: z.string().min(1),
  // .min(1) prevents empty-string from sneaking past `if (input.segmentId)` later.
  segmentId: z.string().min(1).optional(),
  timestampMs: z.number().int().min(0),
  frameR2Key: z.string().min(1).optional(),
  thumbnailR2Key: z.string().min(1).optional(),
  type: visualMomentTypeEnum,
  description: z.string().min(1),
  extractedText: z.string().optional(),
  hubUse: z.string().min(1),
  usefulnessScore: z.number().int().min(0).max(100),
  payload: z.record(z.unknown()),
}).strict();

export const proposeVisualMomentTool: ToolDef<z.infer<typeof visualMomentInput>, Result> = {
  name: 'proposeVisualMoment',
  description:
    'Persist one visual moment. videoId must have segments in this run. segmentId (if provided) must belong to {videoId}. usefulnessScore < 60 is rejected — drop low-value frames instead of persisting.',
  input: visualMomentInput,
  output: resultSchema,
  handler: async (input, ctx) => {
    const runCheck = await assertRunInWorkspace(ctx);
    if (!runCheck.ok) return { ok: false, error: runCheck.error };

    // Delegate to the shared persistence helper — single source of truth used by
    // both this tool and the visual-context stage.
    const result = await persistVisualMoment({
      db: ctx.db,
      workspaceId: ctx.workspaceId,
      runId: ctx.runId,
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
      minUsefulnessScore: VISUAL_LIMITS.minUsefulnessScore,
    });
    if (!result.ok) {
      return { ok: false, error: result.error, reason: result.reason };
    }
    return { ok: true, id: result.id };
  },
};
