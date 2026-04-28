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

// Block schema MUST match PAGE_WRITER_PROMPT verbatim. Block kinds and the
// outer { title, subtitle, blocks } wrapper are dictated by the prompt at
// packages/pipeline/src/agents/specialists/prompts.ts:254-283.
const blockKindEnum = z.enum([
  'intro',
  'section',
  'framework',
  'callout',
  'quote',
  'list',
  'visual_example',
]);

// Each block carries citationIds (required; may be empty only for visual_example).
const blockSchema = z.object({
  kind: blockKindEnum,
  // intro/section/callout/quote
  body: z.string().optional(),
  // section/list/callout/visual_example
  title: z.string().optional(),
  // section/list
  heading: z.string().optional(),
  // callout
  tone: z.enum(['tip', 'warning', 'definition', 'example']).optional(),
  // framework
  steps: z
    .array(z.object({ label: z.string(), detail: z.string(), citationIds: z.array(z.string()) }))
    .optional(),
  // list
  items: z
    .array(z.object({ label: z.string(), detail: z.string(), citationIds: z.array(z.string()) }))
    .optional(),
  // quote
  text: z.string().optional(),
  attribution: z.string().optional(),
  // visual_example
  description: z.string().optional(),
  visualMomentId: z.string().optional(),
  timestampMs: z.number().optional(),
  // every block
  citationIds: z.array(z.string()),
});

const writerOutputSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional().default(''),
  blocks: z.array(blockSchema).min(3).max(12),
});

type WriterOutput = z.infer<typeof writerOutputSchema>;
type Section = z.infer<typeof blockSchema>;

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
  // Page-type field — page_brief_planner writes `pageType`. Also accept legacy `type`.
  pageType?: 'lesson' | 'framework' | 'playbook' | string;
  type?: string;
  // Title — planner writes `pageTitle`. Also accept legacy `title`.
  pageTitle?: string;
  title?: string;
  slug?: string;
  // Reader-question — planner writes `audienceQuestion`. Also accept legacy `readerProblem`.
  audienceQuestion?: string;
  readerProblem?: string;
  promisedOutcome?: string;
  // Why-this-matters — planner writes `openingHook`. Also accept legacy `whyThisMatters`.
  openingHook?: string;
  whyThisMatters?: string;
  // Outline — planner writes Array<{sectionTitle, intent, canonNodeIds}>. Legacy was string[].
  outline?: Array<string | { sectionTitle?: string; intent?: string; canonNodeIds?: string[] }>;
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

    // Read planner field names with legacy fallback. The page_brief_planner
    // prompt writes pageType / pageTitle / audienceQuestion / openingHook —
    // older code paths used type / title / readerProblem / whyThisMatters.
    const pageType = mapBriefPageTypeToEnum(p.pageType ?? p.type);
    const title = p.pageTitle ?? p.title ?? 'Untitled';
    const readerProblem = p.audienceQuestion ?? p.readerProblem ?? '';
    const whyThisMatters = p.openingHook ?? p.whyThisMatters ?? '';
    // Promised outcome doesn't have an exact planner equivalent — fall back to
    // the audience question (which always reads as a problem-it-solves) or the
    // opening hook so summaries are never empty downstream.
    const promisedOutcome = p.promisedOutcome ?? p.audienceQuestion ?? p.openingHook ?? title;
    const slug = p.slug ?? `pg-${nano()}`;

    let writerResult: WriterOutput | null = null;

    if (writer) {
      try {
        const userMessage =
          `BRIEF:\n${JSON.stringify(p, null, 2)}\n\n` +
          `PRIMARY CANON NODE:\n${JSON.stringify(primary.payload)}\n\n` +
          `SUPPORTING CANON NODES:\n${JSON.stringify(supporting.map((n) => ({ id: n.id, type: n.type, payload: n.payload })))}\n\n` +
          `SOURCE PACKET:\n${JSON.stringify(sourcePacket)}\n\n` +
          `Return ONE JSON object with shape { title, subtitle, blocks: [...] }. ` +
          `Every block must include "kind" (intro|section|framework|callout|quote|list|visual_example) ` +
          `and a non-empty citationIds array referencing segmentIds from the source packet. No prose around the JSON.`;
        const response = await writer.chat({
          modelId: writerModel.modelId,
          messages: [
            { role: 'system', content: SPECIALISTS.page_writer.systemPrompt },
            { role: 'user', content: userMessage },
          ],
          tools: [],
        });
        const content = response.message.content ?? '{}';
        const cleaned = stripJsonFence(content);
        const parsed = JSON.parse(cleaned);
        const validation = writerOutputSchema.safeParse(parsed);
        if (validation.success) {
          const validSegIds = new Set(sourcePacket.requiredSegments.map((s) => s.segmentId));
          const validVmIds = new Set(sourcePacket.visuals.map((v) => v.visualMomentId));
          // Citation IDs come from each block's citationIds AND from nested
          // step/item citationIds (framework + list blocks).
          const cited: string[] = [];
          for (const b of validation.data.blocks) {
            for (const id of b.citationIds) cited.push(id);
            for (const s of b.steps ?? []) for (const id of s.citationIds) cited.push(id);
            for (const it of b.items ?? []) for (const id of it.citationIds) cited.push(id);
          }
          const invalidCites = cited.filter((id) => !validSegIds.has(id));
          const visualBlocks = validation.data.blocks.filter((s) => s.kind === 'visual_example');
          const invalidVms = visualBlocks.filter(
            (b) => !b.visualMomentId || !validVmIds.has(b.visualMomentId),
          );
          if (invalidCites.length === 0 && invalidVms.length === 0) {
            writerResult = validation.data;
            llmWrittenCount += 1;
            costCents += tokenCostCents(
              writerModel.modelId,
              response.usage.inputTokens,
              response.usage.outputTokens,
            );
          }
        }
      } catch {
        // Writer call, JSON parse, or schema validation failed -> deterministic fallback.
        writerResult = null;
      }
    }

    // Build the final block list. If writer succeeded use its blocks; otherwise
    // build deterministic ones. The writer's title overrides the brief title.
    let sections: Section[];
    let resolvedTitle = title;
    let resolvedSubtitle = '';
    if (writerResult) {
      sections = writerResult.blocks;
      resolvedTitle = writerResult.title || title;
      resolvedSubtitle = writerResult.subtitle ?? '';
    } else {
      sections = buildDeterministicSections(
        {
          pageType,
          readerProblem,
          promisedOutcome,
          whyThisMatters,
          // Outline can be string[] (legacy) or {sectionTitle,intent}[] (planner).
          // The deterministic fallback only uses string headings, so flatten.
          outline: (p.outline ?? []).map((entry) =>
            typeof entry === 'string' ? entry : (entry?.sectionTitle ?? entry?.intent ?? ''),
          ).filter((s) => s.length > 0),
          ctaOrNextStep: p.ctaOrNextStep,
        },
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
      pageType,
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
                title: s.title ?? 'Visual example',
                body: `Visual example from source: ${s.description ?? ''}`,
                _visualMomentId: s.visualMomentId,
                _timestampMs: s.timestampMs,
              }
            : // Strip kind + citationIds from content (citations live alongside).
              (({ kind: _k, citationIds: _c, ...rest }) => rest)(s as Record<string, unknown>),
        citations: collectCitationIds(s),
      })),
      atlasMeta: {
        evidenceQuality: primary.evidenceQuality,
        citationCount: evidenceSegmentIds.length,
        sourceCoveragePercent:
          totalSelectedVideos > 0 ? Math.min(1, distinctSourceVideos.size / totalSelectedVideos) : 0,
        relatedPageIds: [] as string[],
        hero: {
          illustrationKey:
            pageType === 'framework' || pageType === 'playbook' ? 'desk' : 'open-notebook',
        },
        evidenceSegmentIds,
        primaryFindingId: primary.id,
        supportingFindingIds: p.supportingCanonNodeIds ?? [],
        readerProblem,
        promisedOutcome,
        whyThisMatters,
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
      title: resolvedTitle,
      subtitle: resolvedSubtitle || null,
      // page_version.summary feeds project-pages -> manifest summary (min(1)).
      // Use promisedOutcome which now falls back through audienceQuestion ->
      // openingHook -> title, so it's never empty.
      summary: promisedOutcome,
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

type PageTypeEnum = 'hub_home' | 'topic_overview' | 'lesson' | 'playbook' | 'framework' | 'about';

/**
 * Map the page-brief planner's pageType (which uses an editorial vocabulary —
 * topic, example_collection, definition, principle, etc.) to the actual DB
 * `pageTypeEnum`. Unknown values get an honest neighbor (NOT all collapsed
 * silently to 'lesson').
 */
function mapBriefPageTypeToEnum(raw: unknown): PageTypeEnum {
  if (typeof raw !== 'string') return 'lesson';
  switch (raw.toLowerCase()) {
    case 'lesson':
    case 'definition':
    case 'principle':
      return 'lesson';
    case 'framework':
      return 'framework';
    case 'playbook':
      return 'playbook';
    case 'topic':
    case 'topic_overview':
    case 'example_collection':
      return 'topic_overview';
    case 'hub_home':
      return 'hub_home';
    case 'about':
      return 'about';
    default:
      return 'lesson';
  }
}

/**
 * Aggregate citationIds for a block. Framework `steps` and list `items` carry
 * their own per-step citationIds — surface them so the page-quality stage can
 * count them as transcript-cited.
 */
function collectCitationIds(s: Section): string[] {
  const ids = new Set<string>(s.citationIds);
  for (const step of s.steps ?? []) for (const id of step.citationIds) ids.add(id);
  for (const item of s.items ?? []) for (const id of item.citationIds) ids.add(id);
  return [...ids];
}

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

/**
 * Deterministic section builder used when the page_writer agent fails or is
 * unavailable. Emits blocks matching the canonical writer schema (intro,
 * section, framework, callout, quote, list, visual_example) so a fallback
 * page passes the same downstream validators as an LLM-written one.
 */
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

  // 1) intro — required by prompt as exactly one, first.
  out.push({
    kind: 'intro',
    body: brief.whyThisMatters || brief.promisedOutcome || 'Source-grounded summary from the creator archive.',
    citationIds: cite.slice(0, 2),
  });

  // 2) reader-problem callout
  if (brief.readerProblem) {
    out.push({
      kind: 'callout',
      tone: 'definition',
      title: 'The problem',
      body: brief.readerProblem,
      citationIds: cite.slice(0, 2),
    });
  }

  // 3) framework | list (depending on page type)
  if (brief.pageType === 'framework' && Array.isArray(pp.steps) && (pp.steps as unknown[]).length > 0) {
    const steps = (pp.steps as Array<string | { title?: string; body?: string }>).map((s, i) => {
      const label = typeof s === 'string' ? `Step ${i + 1}` : s.title ?? `Step ${i + 1}`;
      const detail = typeof s === 'string' ? s : s.body ?? '';
      return { label, detail, citationIds: cite.slice(0, 2) };
    });
    out.push({
      kind: 'framework',
      title: brief.outline[0] ?? 'Framework',
      steps,
      citationIds: cite,
    });
  } else if (brief.pageType === 'playbook' && (Array.isArray(pp.workflow) || Array.isArray(pp.scenes))) {
    const sched = (pp.workflow ?? pp.scenes) as Array<{
      day?: string;
      title?: string;
      items?: string[];
      description?: string;
    }>;
    const items = sched
      .map((s) => ({
        label: s.day ?? s.title ?? 'Step',
        detail: (s.items ?? []).join('; ') || s.description || '',
        citationIds: cite.slice(0, 2),
      }))
      .filter((it) => it.detail);
    if (items.length > 0) {
      out.push({
        kind: 'list',
        title: 'Workflow',
        items,
        citationIds: cite,
      });
    }
  } else if (Array.isArray(pp.principles)) {
    const items = (pp.principles as Array<{ title?: string; body?: string } | string>)
      .map((it) =>
        typeof it === 'string'
          ? { label: it.slice(0, 60), detail: it, citationIds: cite.slice(0, 2) }
          : { label: it.title ?? 'Principle', detail: it.body ?? '', citationIds: cite.slice(0, 2) },
      )
      .filter((it) => it.detail);
    if (items.length > 0) {
      out.push({
        kind: 'list',
        title: 'Principles',
        items,
        citationIds: cite,
      });
    }
  }

  // 4) supporting paragraph from primary canon node text
  if (typeof pp.idea === 'string') {
    out.push({ kind: 'section', heading: 'Why it works', body: pp.idea, citationIds: cite });
  }

  // 5) example (if a supporting example or quote-style node exists)
  const exampleNode = supporting.find((s) => s.type === 'example');
  if (exampleNode) {
    const ep = exampleNode.payload as { text?: string; description?: string };
    const body = ep.description ?? ep.text ?? '';
    if (body) {
      out.push({
        kind: 'section',
        heading: 'Example from the archive',
        body,
        citationIds: exampleNode.evidenceSegmentIds.slice(0, 2),
      });
    }
  }

  // 6) visual_example (if a recommended visual moment is in the source packet)
  if (visuals.length > 0) {
    out.push({
      kind: 'visual_example',
      title: 'See it in the source',
      description: visuals[0]!.description,
      visualMomentId: visuals[0]!.visualMomentId,
      timestampMs: visuals[0]!.timestampMs,
      // Visual blocks intentionally have empty citationIds — the segment cite
      // travels with their adjacent transcript blocks.
      citationIds: [],
    });
  }

  // 7) quote (closing or standalone)
  const quoteNode = supporting.find((s) => s.type === 'quote' || s.type === 'aha_moment');
  if (quoteNode) {
    const qp = quoteNode.payload as { text?: string; quote?: string; attribution?: string };
    const text = qp.text ?? qp.quote ?? '';
    if (text) {
      out.push({
        kind: 'quote',
        text,
        attribution: qp.attribution,
        citationIds: quoteNode.evidenceSegmentIds.slice(0, 1),
      });
    }
  }

  // 8) cta callout
  if (brief.ctaOrNextStep) {
    out.push({
      kind: 'callout',
      tone: 'tip',
      title: 'Next',
      body: brief.ctaOrNextStep,
      citationIds: cite.slice(0, 1),
    });
  }

  // Pad to minimum 3 if a sparse canon node leaves us too short.
  while (out.length < 3) {
    out.push({
      kind: 'section',
      heading: brief.outline[out.length] ?? 'Notes',
      body: brief.promisedOutcome || 'See the source material for more.',
      citationIds: cite.slice(0, 1),
    });
  }

  return out;
}
