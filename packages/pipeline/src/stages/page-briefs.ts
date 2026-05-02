import { and, eq, gte } from '@creatorcanon/db';
import { canonNode, channelProfile, pageBrief, visualMoment } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAICompatibleProvider } from '../agents/providers/factory';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import type { StageContext } from '../harness';
import { buildFallbacks } from './fallback-chain';
import {
  buildPageBriefPlannerUserMessage,
  type CanonVisualMoment,
  type PageWorthyCanonNode,
} from './preload-context';

export interface PageBriefsStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  r2Override?: R2Client;
}

export interface PageBriefsStageOutput {
  ok: boolean;
  briefCount: number;
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runPageBriefsStage(
  input: PageBriefsStageInput,
): Promise<PageBriefsStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  // Idempotency.
  await db.delete(pageBrief).where(eq(pageBrief.runId, input.runId));

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAICompatibleProvider(process.env);
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  // Pre-load every read the agent would otherwise make.
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, input.runId))
    .limit(1);
  const channelProfilePayload = cpRows[0]?.payload ?? null;
  if (!channelProfilePayload) {
    throw new Error('page-briefs stage requires channel_profile to have run first');
  }

  // Filter to page-worthy nodes (score >= 60) at the SQL boundary so the
  // prompt stays compact. Explicit projection prevents future schema
  // columns from leaking into the prompt.
  const nodes: PageWorthyCanonNode[] = await db
    .select({
      id: canonNode.id,
      type: canonNode.type,
      origin: canonNode.origin,
      pageWorthinessScore: canonNode.pageWorthinessScore,
      sourceVideoIds: canonNode.sourceVideoIds,
      payload: canonNode.payload,
    })
    .from(canonNode)
    .where(and(eq(canonNode.runId, input.runId), gte(canonNode.pageWorthinessScore, 60)));

  if (nodes.length === 0) {
    throw new Error(
      'page-briefs stage cannot run: no canon_node rows with pageWorthinessScore >= 60 in this run',
    );
  }

  // High-score visual moments only — keep the prompt focused on assets the
  // planner is likely to recommend.
  const vmRows: CanonVisualMoment[] = await db
    .select({
      visualMomentId: visualMoment.id,
      videoId: visualMoment.videoId,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
      hubUse: visualMoment.hubUse,
      usefulnessScore: visualMoment.usefulnessScore,
    })
    .from(visualMoment)
    .where(and(eq(visualMoment.runId, input.runId), gte(visualMoment.usefulnessScore, 60)));

  const cfg = SPECIALISTS.page_brief_planner;
  const model = selectModel('page_brief_planner', process.env);
  const provider = makeProvider(model.provider);
  const fallbacks = buildFallbacks(model, makeProvider);

  // Shared helper: same prompt-format module canon and video_intelligence use.
  const userMessage = buildPageBriefPlannerUserMessage(channelProfilePayload, nodes, vmRows);

  const summary = await runAgent({
    runId: input.runId,
    workspaceId: input.workspaceId,
    agent: cfg.agent,
    modelId: model.modelId,
    provider,
    fallbacks,
    r2,
    tools: cfg.allowedTools,
    systemPrompt: cfg.systemPrompt,
    userMessage,
    caps: cfg.stopOverrides,
  });
  const finalBriefs = await db
    .select({ id: pageBrief.id })
    .from(pageBrief)
    .where(eq(pageBrief.runId, input.runId));
  if (finalBriefs.length === 0) {
    throw new Error(
      'page-briefs stage produced 0 page_brief rows; agent likely hit a quota or schema-validation error',
    );
  }
  return { ok: true, briefCount: finalBriefs.length, costCents: summary.costCents, summary };
}

export async function validatePageBriefsMaterialization(
  _output: PageBriefsStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const r = await db
    .select({ id: pageBrief.id })
    .from(pageBrief)
    .where(eq(pageBrief.runId, ctx.runId));
  return r.length > 0;
}
