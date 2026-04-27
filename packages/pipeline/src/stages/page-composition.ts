import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import {
  canonNode,
  page,
  pageBrief,
  pageVersion,
  segment,
  video,
  videoSetItem,
  generationRun,
  visualMoment,
} from '@creatorcanon/db/schema';
import { getDb, type AtlasDb } from '@creatorcanon/db';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { SPECIALISTS } from '../agents/specialists';
import { tokenCostCents } from '../agents/cost-tracking';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import type { StageContext } from '../harness';

function nano(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export interface PageCompositionStageInput {
  runId: string;
  workspaceId: string;
  /**
   * - undefined: build provider from env (default).
   * - null: skip writer, force deterministic fallback for every page.
   * - AgentProvider: use it directly (test/integration override).
   */
  writerProvider?: AgentProvider | null;
}

export interface PageCompositionStageOutput {
  pageCount: number;
  llmWrittenCount: number;
  fallbackCount: number;
  costCents: number;
}

// Section block schema. Strict: every block needs citationIds (may be empty
// for visual_example blocks but must be present).
const blockKindEnum = z.enum([
  'overview', 'paragraph', 'principles', 'steps', 'scenes',
  'workflow', 'common_mistakes', 'failure_points',
  'quote', 'callout', 'visual_example',
]);

const sectionSchema = z
  .array(
    z.object({
      kind: blockKindEnum,
      body: z.string().optional(),
      title: z.string().optional(),
      items: z
        .array(z.union([z.string(), z.object({ title: z.string(), body: z.string() })]))
        .optional(),
      schedule: z.array(z.object({ day: z.string(), items: z.array(z.string()).min(1) })).optional(),
      attribution: z.string().optional(),
      sourceVideoId: z.string().optional(),
      timestampStart: z.number().optional(),
      tone: z.enum(['note', 'warn', 'success']).optional(),
      visualMomentId: z.string().optional(),
      description: z.string().optional(),
      citationIds: z.array(z.string()),
    }),
  )
  .min(3)
  .max(9);

type Section = z.infer<typeof sectionSchema>[number];

interface SourcePacketSegment {
  segmentId: string;
  videoId: string;
  videoTitle: string | null;
  startMs: number;
  endMs: number;
  text: string;
}
interface SourcePacketVisual {
  visualMomentId: string;
  videoId: string;
  timestampMs: number;
  type: string;
  description: string;
  hubUse: string;
  frameR2Key: string | null;
}

type CanonNodeRow = typeof canonNode.$inferSelect;

interface BriefPayload {
  pageType?: 'lesson' | 'framework' | 'playbook' | string;
  title?: string;
  slug?: string;
  readerProblem?: string;
  promisedOutcome?: string;
  whyThisMatters?: string;
  outline?: string[];
  primaryCanonNodeIds?: string[];   // canonical key (set by proposePageBrief)
  supportingCanonNodeIds?: string[];
  requiredEvidenceSegmentIds?: string[];
  ctaOrNextStep?: string;
  recommendedVisualMomentIds?: string[];
}

export async function runPageCompositionStage(
  input: PageCompositionStageInput,
): Promise<PageCompositionStageOutput> {
  const db = getDb();
  const env = parseServerEnv(process.env);

  // Writer provider resolution.
  let writer: AgentProvider | null = null;
  if (input.writerProvider === null) {
    writer = null;
  } else if (input.writerProvider !== undefined) {
    writer = input.writerProvider;
  } else {
    const writerModel = selectModel('page_writer', process.env);
    if (writerModel.provider === 'openai') {
      writer = env.OPENAI_API_KEY ? createOpenAIProvider(env.OPENAI_API_KEY) : null;
    } else {
      writer = env.GEMINI_API_KEY ? createGeminiProvider(env.GEMINI_API_KEY) : null;
    }
  }
  const writerModel = selectModel('page_writer', process.env);

  // Idempotency: pageVersion FK to page → delete versions first.
  await db.delete(pageVersion).where(eq(pageVersion.runId, input.runId));
  await db.delete(page).where(eq(page.runId, input.runId));

  const briefs = await db
    .select()
    .from(pageBrief)
    .where(eq(pageBrief.runId, input.runId))
    .orderBy(pageBrief.position);
  if (briefs.length === 0) {
    return { pageCount: 0, llmWrittenCount: 0, fallbackCount: 0, costCents: 0 };
  }

  // Total selected videos for atlasMeta.sourceCoveragePercent.
  const setRows = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .innerJoin(generationRun, eq(generationRun.videoSetId, videoSetItem.videoSetId))
    .where(eq(generationRun.id, input.runId));
  const totalSelectedVideos = setRows.length;

  // Pre-load all referenced canon nodes in one query.
  const nodeIds = new Set<string>();
  for (const b of briefs) {
    const p = b.payload as BriefPayload;
    for (const id of p.primaryCanonNodeIds ?? []) nodeIds.add(id);
    for (const id of p.supportingCanonNodeIds ?? []) nodeIds.add(id);
  }
  const nodes = nodeIds.size
    ? await db
        .select()
        .from(canonNode)
        .where(and(eq(canonNode.runId, input.runId), inArray(canonNode.id, [...nodeIds])))
    : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  let position = 0;
  let llmWrittenCount = 0;
  let fallbackCount = 0;
  let costCents = 0;

  for (const brief of briefs) {
    const p = brief.payload as BriefPayload;
    const primaryId = (p.primaryCanonNodeIds ?? [])[0];
    if (!primaryId) continue;
    const primary = nodeById.get(primaryId);
    if (!primary) continue;

    const supporting = (p.supportingCanonNodeIds ?? [])
      .map((id) => nodeById.get(id))
      .filter((n): n is CanonNodeRow => Boolean(n));

    const sourcePacket = await buildSourcePacket(
      db,
      input.runId,
      primary,
      supporting,
      p.recommendedVisualMomentIds ?? [],
    );

    const pageType = (p.pageType ?? 'lesson') as 'lesson' | 'framework' | 'playbook';
    const title = p.title ?? 'Untitled';
    const slug = p.slug ?? `pg-${nano()}`;

    let sections: Section[] | null = null;

    if (writer) {
      try {
        const userMessage =
          `BRIEF:\n${JSON.stringify(p, null, 2)}\n\n` +
          `PRIMARY CANON NODE:\n${JSON.stringify(primary.payload)}\n\n` +
          `SUPPORTING CANON NODES:\n${JSON.stringify(supporting.map((n) => ({ id: n.id, type: n.type, payload: n.payload })))}\n\n` +
          `SOURCE PACKET:\n${JSON.stringify(sourcePacket)}\n\n` +
          `Return ONE JSON array of section blocks. No prose around it.`;
        const response = await writer.chat({
          modelId: writerModel.modelId,
          messages: [
            { role: 'system', content: SPECIALISTS.page_writer.systemPrompt },
            { role: 'user', content: userMessage },
          ],
          tools: [],
        });
        const content = response.message.content ?? '[]';
        // Strip ```json fences if the model adds them despite the prompt.
        const cleaned = stripJsonFence(content);
        const parsed = JSON.parse(cleaned);
        const validation = sectionSchema.safeParse(parsed);
        if (validation.success) {
          const validSegIds = new Set(sourcePacket.requiredSegments.map((s) => s.segmentId));
          const validVmIds = new Set(sourcePacket.visuals.map((v) => v.visualMomentId));
          const cited = validation.data.flatMap((s) => s.citationIds);
          const invalidCites = cited.filter((id) => !validSegIds.has(id));
          const visualBlocks = validation.data.filter((s) => s.kind === 'visual_example');
          const invalidVms = visualBlocks.filter(
            (b) => !b.visualMomentId || !validVmIds.has(b.visualMomentId),
          );
          if (invalidCites.length === 0 && invalidVms.length === 0) {
            sections = validation.data;
            llmWrittenCount += 1;
            costCents += tokenCostCents(
              writerModel.modelId,
              response.usage.inputTokens,
              response.usage.outputTokens,
            );
          }
        }
      } catch {
        // Writer call or JSON parse failed → deterministic fallback.
        sections = null;
      }
    }

    if (!sections) {
      sections = buildDeterministicSections(
        { pageType, readerProblem: p.readerProblem ?? '', promisedOutcome: p.promisedOutcome ?? '', whyThisMatters: p.whyThisMatters ?? '', outline: p.outline ?? [], ctaOrNextStep: p.ctaOrNextStep },
        primary,
        supporting,
        sourcePacket.visuals,
      );
      fallbackCount += 1;
    }

    const evidenceSegmentIds = collectEvidenceSegmentIds(primary, supporting);
    const distinctSourceVideos = new Set<string>();
    for (const n of [primary, ...supporting]) for (const v of n.sourceVideoIds) distinctSourceVideos.add(v);

    const pageId = `pg_${nano()}`;
    const versionId = `pv_${nano()}`;
    await db.insert(page).values({
      id: pageId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      slug,
      pageType: pageType === 'lesson' || pageType === 'framework' || pageType === 'playbook' ? pageType : 'lesson',
      position: position++,
      supportLabel: 'review_recommended',
      currentVersionId: versionId,
    });

    const blockTree = {
      blocks: sections.map((s, i) => ({
        type: s.kind === 'visual_example' ? 'callout' : s.kind, // Option A: render visual_example as callout
        id: `blk_${i}`,
        content:
          s.kind === 'visual_example'
            ? {
                tone: 'note',
                body: `Visual example from source: ${s.description ?? ''}`,
                _visualMomentId: s.visualMomentId,
              }
            : (({ kind: _k, citationIds: _c, ...rest }) => rest)(s as Record<string, unknown>),
        citations: s.citationIds,
      })),
      atlasMeta: {
        evidenceQuality: primary.evidenceQuality,
        citationCount: evidenceSegmentIds.length,
        sourceCoveragePercent:
          totalSelectedVideos > 0 ? Math.min(1, distinctSourceVideos.size / totalSelectedVideos) : 0,
        relatedPageIds: [] as string[],
        hero: {
          illustrationKey:
            pageType === 'framework' ? 'desk' : pageType === 'playbook' ? 'desk' : 'open-notebook',
        },
        evidenceSegmentIds,
        primaryFindingId: primary.id,
        supportingFindingIds: p.supportingCanonNodeIds ?? [],
        readerProblem: p.readerProblem ?? '',
        promisedOutcome: p.promisedOutcome ?? '',
        whyThisMatters: p.whyThisMatters ?? '',
        distinctSourceVideos: distinctSourceVideos.size,
        totalSelectedVideos,
      },
    };

    await db.insert(pageVersion).values({
      id: versionId,
      workspaceId: input.workspaceId,
      pageId,
      runId: input.runId,
      version: 1,
      title,
      summary: p.promisedOutcome,
      blockTreeJson: blockTree,
      isCurrent: true,
    });
  }

  return { pageCount: briefs.length, llmWrittenCount, fallbackCount, costCents };
}

export async function validatePageCompositionMaterialization(
  _output: PageCompositionStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const p = await db.select({ id: page.id }).from(page).where(eq(page.runId, ctx.runId));
  return p.length > 0;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function stripJsonFence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  }
  return trimmed;
}

async function buildSourcePacket(
  db: AtlasDb,
  runId: string,
  primary: CanonNodeRow,
  supporting: CanonNodeRow[],
  visualMomentIds: string[],
): Promise<{ requiredSegments: SourcePacketSegment[]; visuals: SourcePacketVisual[] }> {
  const segIds = new Set<string>();
  for (const s of primary.evidenceSegmentIds) segIds.add(s);
  for (const n of supporting) for (const s of n.evidenceSegmentIds) segIds.add(s);

  const requiredSegments: SourcePacketSegment[] = segIds.size === 0
    ? []
    : (
        await db
          .select({
            id: segment.id,
            videoId: segment.videoId,
            startMs: segment.startMs,
            endMs: segment.endMs,
            text: segment.text,
            videoTitle: video.title,
          })
          .from(segment)
          .leftJoin(video, eq(video.id, segment.videoId))
          .where(and(eq(segment.runId, runId), inArray(segment.id, [...segIds])))
      ).map((r) => ({
        segmentId: r.id,
        videoId: r.videoId,
        videoTitle: r.videoTitle ?? null,
        startMs: r.startMs,
        endMs: r.endMs,
        text: r.text,
      }));

  const visuals: SourcePacketVisual[] = visualMomentIds.length === 0
    ? []
    : (
        await db
          .select({
            id: visualMoment.id,
            videoId: visualMoment.videoId,
            timestampMs: visualMoment.timestampMs,
            type: visualMoment.type,
            description: visualMoment.description,
            hubUse: visualMoment.hubUse,
            frameR2Key: visualMoment.frameR2Key,
          })
          .from(visualMoment)
          .where(and(eq(visualMoment.runId, runId), inArray(visualMoment.id, visualMomentIds)))
      ).map((r) => ({
        visualMomentId: r.id,
        videoId: r.videoId,
        timestampMs: r.timestampMs,
        type: r.type,
        description: r.description,
        hubUse: r.hubUse,
        frameR2Key: r.frameR2Key,
      }));

  return { requiredSegments, visuals };
}

function collectEvidenceSegmentIds(primary: CanonNodeRow, supporting: CanonNodeRow[]): string[] {
  const set = new Set<string>(primary.evidenceSegmentIds);
  for (const s of supporting) for (const id of s.evidenceSegmentIds) set.add(id);
  return [...set];
}

function buildDeterministicSections(
  brief: {
    pageType: string;
    readerProblem: string;
    promisedOutcome: string;
    whyThisMatters: string;
    outline: string[];
    ctaOrNextStep?: string;
  },
  primary: CanonNodeRow,
  supporting: CanonNodeRow[],
  visuals: SourcePacketVisual[],
): Section[] {
  const out: Section[] = [];
  const pp = primary.payload as Record<string, unknown>;
  const cite = primary.evidenceSegmentIds.slice(0, 5);

  out.push({ kind: 'overview', body: brief.whyThisMatters || 'Overview from source material.', citationIds: cite.slice(0, 2) });
  out.push({ kind: 'callout', tone: 'note', body: brief.readerProblem || 'Why this matters.', citationIds: cite.slice(0, 2) });

  if (brief.pageType === 'framework' && Array.isArray(pp.principles)) {
    const items = (pp.principles as Array<{ title?: string; body?: string } | string>)
      .map((it) =>
        typeof it === 'string'
          ? { title: it.slice(0, 60), body: it }
          : { title: it.title ?? 'Principle', body: it.body ?? '' },
      )
      .filter((it) => it.body);
    if (items.length > 0) out.push({ kind: 'principles', items, citationIds: cite });
  } else if (brief.pageType === 'playbook' && (Array.isArray(pp.workflow) || Array.isArray(pp.scenes))) {
    const sched = (pp.workflow ?? pp.scenes) as Array<{
      day?: string;
      title?: string;
      items?: string[];
      description?: string;
    }>;
    const schedule = sched
      .map((s) => ({
        day: s.day ?? s.title ?? 'Step',
        items: s.items ?? (s.description ? [s.description] : []),
      }))
      .filter((s) => s.items.length > 0 && s.items.every((i) => i));
    if (schedule.length > 0) out.push({ kind: 'workflow', schedule, citationIds: cite });
  } else if (typeof pp.idea === 'string') {
    out.push({ kind: 'paragraph', body: pp.idea, citationIds: cite });
  }

  if (brief.pageType === 'framework' && Array.isArray(pp.steps) && (pp.steps as unknown[]).length > 0) {
    const items = (pp.steps as Array<string | { title?: string; body?: string }>).map((s, i) =>
      typeof s === 'string' ? { title: `Step ${i + 1}`, body: s } : { title: s.title ?? `Step ${i + 1}`, body: s.body ?? '' },
    );
    out.push({ kind: 'steps', title: 'Steps', items, citationIds: cite });
  }

  if (visuals.length > 0) {
    out.push({
      kind: 'visual_example',
      visualMomentId: visuals[0]!.visualMomentId,
      description: visuals[0]!.description,
      citationIds: [],
    });
  }

  const exampleNode = supporting.find((s) => s.type === 'example' || s.type === 'quote');
  if (exampleNode) {
    const ep = exampleNode.payload as { text?: string; description?: string; quote?: string };
    const body = ep.description ?? ep.text ?? ep.quote ?? '';
    if (body) out.push({ kind: 'paragraph', body, citationIds: exampleNode.evidenceSegmentIds.slice(0, 2) });
  }

  const quote = supporting.find((s) => s.type === 'quote' || s.type === 'aha_moment');
  if (quote) {
    const qp = quote.payload as { text?: string; quote?: string; attribution?: string };
    const body = qp.text ?? qp.quote ?? '';
    if (body) out.push({ kind: 'quote', body, attribution: qp.attribution, citationIds: quote.evidenceSegmentIds.slice(0, 1) });
  }

  if (brief.ctaOrNextStep) {
    out.push({ kind: 'callout', tone: 'note', body: brief.ctaOrNextStep, citationIds: [] });
  }

  // Schema requires min 3 sections — pad with a generic close if needed.
  while (out.length < 3) {
    out.push({ kind: 'paragraph', body: brief.promisedOutcome || 'See the source material for more.', citationIds: cite.slice(0, 1) });
  }

  return out;
}
