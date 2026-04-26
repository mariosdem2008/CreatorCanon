import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import { archiveFinding, archiveRelation } from '@creatorcanon/db/schema';
import type { ToolDef, ToolCtx } from './types';
import { segmentRefSchema, validateSegmentRefs } from '../segment-ref';
import type { SegmentRef } from '../segment-ref';
import {
  topicPayload,
  frameworkPayload,
  lessonPayload,
  playbookPayload,
  quotePayload,
  ahaMomentPayload,
  sourceRankingPayload,
} from '../schemas';

// ---------------------------------------------------------------------------
// Shared types and helpers
// ---------------------------------------------------------------------------

type ProposeOk = { ok: true; findingId: string };
type ProposeErr = { ok: false; error: string };
type ProposeResult = ProposeOk | ProposeErr;

type RelationOk = { ok: true; relationId: string };
type RelationResult = RelationOk | ProposeErr;

const proposeResultSchema = z.union([
  z.object({ ok: z.literal(true), findingId: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const relationResultSchema = z.union([
  z.object({ ok: z.literal(true), relationId: z.string() }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function insertFinding(
  type: typeof archiveFinding.$inferInsert['type'],
  payload: Record<string, unknown>,
  evidence: SegmentRef[] | undefined,
  ctx: ToolCtx,
): Promise<ProposeResult> {
  const refs = evidence ?? [];
  const validation = await validateSegmentRefs(ctx.runId, refs, ctx.db);
  if (!validation.ok) {
    return {
      ok: false,
      error: `Unknown segment ID: ${validation.unknownIds[0]}. Use searchSegments to find valid IDs.`,
    };
  }
  const id = makeId('fnd');
  await ctx.db.insert(archiveFinding).values({
    id,
    runId: ctx.runId,
    type,
    agent: ctx.agent,
    model: ctx.model,
    payload,
    evidenceSegmentIds: refs.map((e) => e.segmentId),
  });
  return { ok: true, findingId: id };
}

// ---------------------------------------------------------------------------
// 1. proposeTopic
// ---------------------------------------------------------------------------

const proposeTopicInput = topicPayload.extend({
  evidence: z.array(segmentRefSchema).min(1),
});
type ProposeTopicInput = z.infer<typeof proposeTopicInput>;

export const proposeTopicTool: ToolDef<ProposeTopicInput, ProposeResult> = {
  name: 'proposeTopic',
  description:
    'Record a topic finding. Provide at least 1 evidence segment that establishes the topic. ' +
    'Returns a findingId on success or an error if any segmentId is unknown.',
  input: proposeTopicInput,
  output: proposeResultSchema,
  handler: async (input, ctx) => {
    const { evidence, ...payload } = input;
    return insertFinding('topic', payload, evidence, ctx);
  },
};

// ---------------------------------------------------------------------------
// 2. proposeFramework
// ---------------------------------------------------------------------------

const proposeFrameworkInput = frameworkPayload.extend({
  evidence: z.array(segmentRefSchema).min(2),
});
type ProposeFrameworkInput = z.infer<typeof proposeFrameworkInput>;

export const proposeFrameworkTool: ToolDef<ProposeFrameworkInput, ProposeResult> = {
  name: 'proposeFramework',
  description:
    'Record a framework finding. Requires at least 2 evidence segments — frameworks must be ' +
    'grounded in multiple transcript locations. Returns a findingId on success.',
  input: proposeFrameworkInput,
  output: proposeResultSchema,
  handler: async (input, ctx) => {
    const { evidence, ...payload } = input;
    return insertFinding('framework', payload, evidence, ctx);
  },
};

// ---------------------------------------------------------------------------
// 3. proposeLesson
// ---------------------------------------------------------------------------

const proposeLessonInput = lessonPayload.extend({
  evidence: z.array(segmentRefSchema).min(1),
});
type ProposeLessonInput = z.infer<typeof proposeLessonInput>;

export const proposeLessonTool: ToolDef<ProposeLessonInput, ProposeResult> = {
  name: 'proposeLesson',
  description:
    'Record a lesson finding. Provide at least 1 evidence segment. ' +
    'Returns a findingId on success or an error if any segmentId is unknown.',
  input: proposeLessonInput,
  output: proposeResultSchema,
  handler: async (input, ctx) => {
    const { evidence, ...payload } = input;
    return insertFinding('lesson', payload, evidence, ctx);
  },
};

// ---------------------------------------------------------------------------
// 4. proposePlaybook
// ---------------------------------------------------------------------------

const proposePlaybookInput = playbookPayload.extend({
  evidence: z.array(segmentRefSchema).min(1),
  /** Optional IDs of previously-recorded findings that this playbook builds upon.
   *  Each ID must belong to the current run. For each ID, an archiveRelation row
   *  with type `builds_on` is automatically created (from=playbook, to=that ID). */
  buildsOnFindingIds: z.array(z.string()).optional(),
});
type ProposePlaybookInput = z.infer<typeof proposePlaybookInput>;

export const proposePlaybookTool: ToolDef<ProposePlaybookInput, ProposeResult> = {
  name: 'proposePlaybook',
  description:
    'Record a playbook finding. Provide at least 1 evidence segment. ' +
    'Optionally pass buildsOnFindingIds to auto-create builds_on relations to existing findings. ' +
    'Returns a findingId on success.',
  input: proposePlaybookInput,
  output: proposeResultSchema,
  handler: async (input, ctx) => {
    const { evidence, buildsOnFindingIds, ...payload } = input;
    const result = await insertFinding('playbook', payload, evidence, ctx);
    if (!result.ok) return result;

    // Auto-create builds_on relations for each referenced finding.
    if (buildsOnFindingIds && buildsOnFindingIds.length > 0) {
      const segmentIds = evidence.map((e) => e.segmentId);
      for (const toId of buildsOnFindingIds) {
        const relId = makeId('rel');
        await ctx.db.insert(archiveRelation).values({
          id: relId,
          runId: ctx.runId,
          agent: ctx.agent,
          model: ctx.model,
          fromFindingId: result.findingId,
          toFindingId: toId,
          type: 'builds_on',
          evidenceSegmentIds: segmentIds,
        });
      }
    }

    return result;
  },
};

// ---------------------------------------------------------------------------
// 5. proposeQuote
// ---------------------------------------------------------------------------

const proposeQuoteInput = quotePayload.extend({
  /** A single segment that contains this quote. */
  evidence: segmentRefSchema,
});
type ProposeQuoteInput = z.infer<typeof proposeQuoteInput>;

export const proposeQuoteTool: ToolDef<ProposeQuoteInput, ProposeResult> = {
  name: 'proposeQuote',
  description:
    'Record a verbatim or near-verbatim quote finding. Provide exactly 1 evidence segment ' +
    'that contains the quote. Returns a findingId on success.',
  input: proposeQuoteInput,
  output: proposeResultSchema,
  handler: async (input, ctx) => {
    const { evidence, ...payload } = input;
    return insertFinding('quote', payload, [evidence], ctx);
  },
};

// ---------------------------------------------------------------------------
// 6. proposeAhaMoment
// ---------------------------------------------------------------------------

const proposeAhaMomentInput = ahaMomentPayload.extend({
  evidence: z.array(segmentRefSchema).min(1),
});
type ProposeAhaMomentInput = z.infer<typeof proposeAhaMomentInput>;

export const proposeAhaMomentTool: ToolDef<ProposeAhaMomentInput, ProposeResult> = {
  name: 'proposeAhaMoment',
  description:
    'Record an aha-moment finding — a striking insight or realization from the source material. ' +
    'Provide at least 1 evidence segment. Returns a findingId on success.',
  input: proposeAhaMomentInput,
  output: proposeResultSchema,
  handler: async (input, ctx) => {
    const { evidence, ...payload } = input;
    return insertFinding('aha_moment', payload, evidence, ctx);
  },
};

// ---------------------------------------------------------------------------
// 7. proposeSourceRanking
// ---------------------------------------------------------------------------

const proposeSourceRankingInput = sourceRankingPayload.extend({
  /** Evidence is optional for source rankings — the ranking is structural, not
   *  extracted from a specific passage. Pass an empty array if no segment applies. */
  evidence: z.array(segmentRefSchema).optional().default([]),
});
type ProposeSourceRankingInput = z.infer<typeof proposeSourceRankingInput>;

export const proposeSourceRankingTool: ToolDef<ProposeSourceRankingInput, ProposeResult> = {
  name: 'proposeSourceRanking',
  description:
    'Record a source-ranking finding that orders videos by relevance to a topic. ' +
    'topicId is the finding ID of the topic being ranked against. Evidence segments are optional — ' +
    'this is a structural finding. Returns a findingId on success.',
  input: proposeSourceRankingInput,
  output: proposeResultSchema,
  handler: async (input, ctx) => {
    const { evidence, ...payload } = input;
    return insertFinding('source_ranking', payload, evidence, ctx);
  },
};

// ---------------------------------------------------------------------------
// 8. proposeRelation (universal)
// ---------------------------------------------------------------------------

const proposeRelationInput = z.object({
  fromFindingId: z.string().min(1),
  toFindingId: z.string().min(1),
  type: z.enum(['supports', 'builds_on', 'related_to', 'instance_of', 'contradicts']),
  evidence: z.array(segmentRefSchema).min(1),
  notes: z.string().optional(),
});
type ProposeRelationInput = z.infer<typeof proposeRelationInput>;

export const proposeRelationTool: ToolDef<ProposeRelationInput, RelationResult> = {
  name: 'proposeRelation',
  description:
    'Record a typed relation between two existing findings in this run. ' +
    'Both findingIds must belong to the current run. ' +
    'Relation types: supports | builds_on | related_to | instance_of | contradicts. ' +
    'Provide at least 1 evidence segment. Returns a relationId on success.',
  input: proposeRelationInput,
  output: relationResultSchema,
  handler: async (input, ctx) => {
    const { fromFindingId, toFindingId, type, evidence, notes } = input;

    // Reject self-references immediately.
    if (fromFindingId === toFindingId) {
      return { ok: false, error: `Self-reference not allowed: fromFindingId and toFindingId are both '${fromFindingId}'.` };
    }

    // Validate evidence segments.
    const segValidation = await validateSegmentRefs(ctx.runId, evidence, ctx.db);
    if (!segValidation.ok) {
      return {
        ok: false,
        error: `Unknown segment ID: ${segValidation.unknownIds[0]}. Use searchSegments to find valid IDs.`,
      };
    }

    // Verify both findings exist in this run in one query.
    const found = await ctx.db
      .select({ id: archiveFinding.id })
      .from(archiveFinding)
      .where(and(
        eq(archiveFinding.runId, ctx.runId),
        inArray(archiveFinding.id, [fromFindingId, toFindingId]),
      ));

    if (!found.find((r) => r.id === fromFindingId)) {
      return { ok: false, error: `Unknown fromFindingId: ${fromFindingId}` };
    }
    if (!found.find((r) => r.id === toFindingId)) {
      return { ok: false, error: `Unknown toFindingId: ${toFindingId}` };
    }

    const id = makeId('rel');
    await ctx.db.insert(archiveRelation).values({
      id,
      runId: ctx.runId,
      agent: ctx.agent,
      model: ctx.model,
      fromFindingId,
      toFindingId,
      type,
      evidenceSegmentIds: evidence.map((e) => e.segmentId),
      notes: notes ?? null,
    });

    return { ok: true, relationId: id };
  },
};
