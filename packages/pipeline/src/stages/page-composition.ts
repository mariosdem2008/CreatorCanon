import { and, eq, inArray } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  page,
  pageBrief,
  pageVersion,
  segment,
  videoSetItem,
  generationRun,
  project,
} from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import { SPECIALISTS } from '../agents/specialists';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import type { StageContext } from '../harness';
import { buildFallbacks } from './fallback-chain';

import type { PagePlan, ArtifactBundle, ArtifactKind, VoiceMode } from '../authors-studio/types';
import { runStrategist } from '../authors-studio/strategist';
import { runProseAuthor } from '../authors-studio/specialists/prose';
import { runRoadmapAuthor } from '../authors-studio/specialists/roadmap';
import { runExampleAuthor } from '../authors-studio/specialists/example';
import { runDiagramAuthor } from '../authors-studio/specialists/diagram';
import { runMistakesAuthor } from '../authors-studio/specialists/mistakes';
import { runCritic } from '../authors-studio/critic';
import { runRevisePass } from '../authors-studio/revise';
import { assembleBlockTree } from '../authors-studio/assembler';
import type { SpecialistContext } from '../authors-studio/specialists/_runner';

function nano(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 10);
}

export interface PageCompositionStageInput {
  runId: string;
  workspaceId: string;
  r2Override?: R2Client;
}

export interface PageCompositionStageOutput {
  pageCount: number;
  studioPagesAuthored: number;
  pagesWithDiagram: number;
  pagesWithRoadmap: number;
  pagesWithExample: number;
  pagesWithMistakes: number;
  costCents: number;
}

export async function runPageCompositionStage(
  input: PageCompositionStageInput,
): Promise<PageCompositionStageOutput> {
  ensureToolsRegistered();
  const db = getDb();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);

  // Idempotency: pageVersion FK to page → delete versions first.
  await db.delete(pageVersion).where(eq(pageVersion.runId, input.runId));
  await db.delete(page).where(eq(page.runId, input.runId));

  // Load briefs ordered by position.
  const briefs = await db
    .select()
    .from(pageBrief)
    .where(eq(pageBrief.runId, input.runId))
    .orderBy(pageBrief.position);
  if (briefs.length === 0) {
    return { pageCount: 0, studioPagesAuthored: 0, pagesWithDiagram: 0, pagesWithRoadmap: 0, pagesWithExample: 0, pagesWithMistakes: 0, costCents: 0 };
  }

  // Load channel profile (whole-run shared input).
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, input.runId))
    .limit(1);
  const channelProfilePayload = cpRows[0]?.payload ?? null;
  if (!channelProfilePayload) {
    throw new Error('page-composition stage requires channel_profile to have run first');
  }

  // Load the workspace's project to read voiceMode.
  const runRows = await db
    .select({ projectId: generationRun.projectId })
    .from(generationRun)
    .where(eq(generationRun.id, input.runId))
    .limit(1);
  const projectId = runRows[0]?.projectId;
  if (!projectId) throw new Error(`generation_run ${input.runId} has no projectId`);
  const projectRows = await db
    .select({ config: project.config })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  const projectConfig = projectRows[0]?.config as { voiceMode?: VoiceMode } | null;
  const voiceMode: VoiceMode = projectConfig?.voiceMode === 'creator_first_person' ? 'creator_first_person' : 'reader_second_person';

  // Load total selected videos (for atlasMeta.sourceCoveragePercent).
  const setRows = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .innerJoin(generationRun, eq(generationRun.videoSetId, videoSetItem.videoSetId))
    .where(eq(generationRun.id, input.runId));
  const totalSelectedVideos = setRows.length;

  // Pre-load every canon node referenced anywhere in any brief.
  const nodeIds = new Set<string>();
  for (const b of briefs) {
    const p = b.payload as { primaryCanonNodeIds?: string[]; supportingCanonNodeIds?: string[] };
    for (const id of p.primaryCanonNodeIds ?? []) nodeIds.add(id);
    for (const id of p.supportingCanonNodeIds ?? []) nodeIds.add(id);
  }
  const nodes = nodeIds.size
    ? await db.select().from(canonNode).where(and(eq(canonNode.runId, input.runId), inArray(canonNode.id, [...nodeIds])))
    : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n as Record<string, unknown>]));

  // Pre-load every segment that any canon node cites.
  const segIds = new Set<string>();
  for (const n of nodes) for (const id of n.evidenceSegmentIds) segIds.add(id);
  const segs = segIds.size
    ? await db.select({ id: segment.id, videoId: segment.videoId, text: segment.text, startMs: segment.startMs, endMs: segment.endMs }).from(segment).where(and(eq(segment.runId, input.runId), inArray(segment.id, [...segIds])))
    : [];
  const validSegmentIds = new Set(segs.map((s) => s.id));

  // Sibling-brief snapshot for the strategist (lets it avoid duplication).
  const siblingBriefs = briefs.map((b) => {
    const p = b.payload as { pageTitle?: string; audienceQuestion?: string; primaryCanonNodeIds?: string[]; slug?: string };
    return {
      id: b.id,
      pageTitle: p.pageTitle ?? '',
      slug: p.slug ?? `pg-${b.id.slice(0, 8)}`,
      audienceQuestion: p.audienceQuestion ?? '',
      primaryCanonNodeIds: p.primaryCanonNodeIds ?? [],
    };
  });

  // Provider factory.
  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };
  const ctxFor = (agent: 'page_strategist' | 'prose_author' | 'roadmap_author' | 'example_author' | 'diagram_author' | 'mistakes_author' | 'critic'): SpecialistContext => {
    const cfg = SPECIALISTS[agent];
    const model = selectModel(agent, process.env);
    return {
      runId: input.runId,
      workspaceId: input.workspaceId,
      agent,
      modelId: model.modelId,
      provider: makeProvider(model.provider),
      fallbacks: buildFallbacks(model, makeProvider),
      r2,
      systemPrompt: cfg.systemPrompt,
      caps: cfg.stopOverrides,
    };
  };

  let pagesWithDiagram = 0, pagesWithRoadmap = 0, pagesWithExample = 0, pagesWithMistakes = 0;
  let studioPagesAuthored = 0;
  let totalCostCents = 0;
  let position = 0;

  for (const brief of briefs) {
    const briefPayload = brief.payload as { primaryCanonNodeIds?: string[]; supportingCanonNodeIds?: string[]; pageType?: string; pageTitle?: string; slug?: string };
    const primary = (briefPayload.primaryCanonNodeIds ?? []).map((id) => nodeById.get(id)).filter((n): n is Record<string, unknown> => Boolean(n));
    const supporting = (briefPayload.supportingCanonNodeIds ?? []).map((id) => nodeById.get(id)).filter((n): n is Record<string, unknown> => Boolean(n));
    if (primary.length === 0) continue;

    // 1. Strategist
    const strategistCtx = ctxFor('page_strategist');
    const plan = await runStrategist({
      runId: input.runId,
      workspaceId: input.workspaceId,
      voiceMode,
      channelProfilePayload,
      brief: { id: brief.id, payload: brief.payload as Record<string, unknown> },
      primaryCanonNodes: primary,
      supportingCanonNodes: supporting,
      siblingBriefs: siblingBriefs.filter((s) => s.id !== brief.id),
      provider: strategistCtx.provider,
      fallbacks: strategistCtx.fallbacks,
      r2,
      modelId: strategistCtx.modelId,
    });
    totalCostCents += plan.costCents;

    // 2. Specialists in parallel
    const allArtifactNodes = [...primary, ...supporting];
    const segmentExcerpts = segs
      .filter((s) => allArtifactNodes.some((n) => (n.evidenceSegmentIds as string[]).includes(s.id)))
      .map((s) => ({ segmentId: s.id, videoId: s.videoId, text: s.text, startMs: s.startMs, endMs: s.endMs }));

    const wantsKind = (k: ArtifactKind) => plan.artifacts.some((a) => a.kind === k);

    const proseInput = { ctx: ctxFor('prose_author'), plan, canonNodes: allArtifactNodes, segmentExcerpts, channelProfilePayload };
    const roadmapInput = wantsKind('roadmap')
      ? { ctx: ctxFor('roadmap_author'), plan, canonNodes: allArtifactNodes, channelProfilePayload }
      : undefined;
    const exampleInput = wantsKind('hypothetical_example')
      ? { ctx: ctxFor('example_author'), plan, canonNodes: allArtifactNodes, channelProfilePayload }
      : undefined;
    const diagramInput = wantsKind('diagram')
      ? { ctx: ctxFor('diagram_author'), plan, canonNodes: allArtifactNodes, channelProfilePayload }
      : undefined;
    const mistakesInput = wantsKind('common_mistakes')
      ? { ctx: ctxFor('mistakes_author'), plan, canonNodes: allArtifactNodes, vicMistakes: [], channelProfilePayload }
      : undefined;

    const [proseRes, roadmapRes, exampleRes, diagramRes, mistakesRes] = await Promise.all([
      runProseAuthor(proseInput),
      roadmapInput ? runRoadmapAuthor(roadmapInput) : Promise.resolve(undefined),
      exampleInput ? runExampleAuthor(exampleInput) : Promise.resolve(undefined),
      diagramInput ? runDiagramAuthor(diagramInput) : Promise.resolve(undefined),
      mistakesInput ? runMistakesAuthor(mistakesInput) : Promise.resolve(undefined),
    ]);

    let bundle: ArtifactBundle = {
      prose: proseRes,
      roadmap: roadmapRes ?? undefined,
      example: exampleRes ?? undefined,
      diagram: diagramRes ?? undefined,
      mistakes: mistakesRes ?? undefined,
    };
    totalCostCents += proseRes.costCents
      + (roadmapRes?.costCents ?? 0)
      + (exampleRes?.costCents ?? 0)
      + (diagramRes?.costCents ?? 0)
      + (mistakesRes?.costCents ?? 0);

    // 3. Critic
    const criticCtx = ctxFor('critic');
    const critic = await runCritic({ ctx: criticCtx, plan, artifacts: bundle, canonNodes: allArtifactNodes, channelProfilePayload });
    totalCostCents += critic.costCents;

    // 4. Revise pass (if any non-trivial notes)
    if (critic.notes.length > 0 && !critic.approved) {
      const revised = await runRevisePass({
        plan,
        artifacts: bundle,
        notes: critic,
        proseInput,
        roadmapInput,
        exampleInput,
        diagramInput,
        mistakesInput,
        contextByKind: (k) =>
          k === 'cited_prose' ? ctxFor('prose_author') :
          k === 'roadmap' ? ctxFor('roadmap_author') :
          k === 'hypothetical_example' ? ctxFor('example_author') :
          k === 'diagram' ? ctxFor('diagram_author') :
          ctxFor('mistakes_author'),
      });
      bundle = revised;
    }

    // 5. Assemble + persist
    const evidenceSegmentIds = [...new Set(allArtifactNodes.flatMap((n) => n.evidenceSegmentIds as string[]))];
    const distinctSourceVideos = new Set(allArtifactNodes.flatMap((n) => n.sourceVideoIds as string[])).size;
    const tree = assembleBlockTree({
      plan,
      bundle,
      validSegmentIds,
      evidenceSegmentIds,
      distinctSourceVideos,
      totalSelectedVideos,
      evidenceQuality: ((primary[0]?.evidenceQuality as 'strong' | 'moderate' | 'limited' | undefined) ?? 'limited'),
    });

    if (bundle.diagram) pagesWithDiagram += 1;
    if (bundle.roadmap) pagesWithRoadmap += 1;
    if (bundle.example) pagesWithExample += 1;
    if (bundle.mistakes) pagesWithMistakes += 1;
    studioPagesAuthored += 1;

    const pageId = `pg_${nano()}`;
    const versionId = `pv_${nano()}`;
    await db.insert(page).values({
      id: pageId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      slug: briefPayload.slug ?? `pg-${nano()}`,
      pageType: mapPageTypeToEnum(plan.pageType),
      position: position++,
      supportLabel: 'review_recommended',
      currentVersionId: versionId,
    });
    await db.insert(pageVersion).values({
      id: versionId,
      workspaceId: input.workspaceId,
      pageId,
      runId: input.runId,
      version: 1,
      title: plan.pageTitle,
      summary: plan.thesis,
      blockTreeJson: tree,
      isCurrent: true,
    });
  }

  return {
    pageCount: briefs.length,
    studioPagesAuthored,
    pagesWithDiagram,
    pagesWithRoadmap,
    pagesWithExample,
    pagesWithMistakes,
    costCents: totalCostCents,
  };
}

export async function validatePageCompositionMaterialization(
  _output: PageCompositionStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const r = await db.select({ id: page.id }).from(page).where(eq(page.runId, ctx.runId));
  return r.length > 0;
}

type PageTypeEnum = 'hub_home' | 'topic_overview' | 'lesson' | 'playbook' | 'framework' | 'about';

function mapPageTypeToEnum(raw: string): PageTypeEnum {
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
