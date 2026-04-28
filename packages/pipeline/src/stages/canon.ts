import { eq } from '@creatorcanon/db';
import { canonNode, videoIntelligenceCard, channelProfile, visualMoment } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import type { StageContext } from '../harness';
import { buildFallbacks } from './fallback-chain';
import {
  buildCanonArchitectUserMessage,
  type CanonVisualMoment,
  type CanonVicRow,
} from './preload-context';

export interface CanonStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  r2Override?: R2Client;
}

export interface CanonStageOutput {
  ok: boolean;
  nodeCount: number;
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runCanonStage(input: CanonStageInput): Promise<CanonStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  // Idempotency: delete prior canon nodes for this run before re-extracting.
  await db.delete(canonNode).where(eq(canonNode.runId, input.runId));

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
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
    throw new Error('canon stage requires channel_profile to have run first');
  }

  // Explicit projection (not db.select()) so future schema columns on
  // videoIntelligenceCard don't accidentally leak into the prompt.
  const vicRows: CanonVicRow[] = await db
    .select({
      id: videoIntelligenceCard.id,
      videoId: videoIntelligenceCard.videoId,
      evidenceSegmentIds: videoIntelligenceCard.evidenceSegmentIds,
      payload: videoIntelligenceCard.payload,
    })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, input.runId));
  if (vicRows.length === 0) {
    throw new Error('canon stage cannot run: no video_intelligence_card rows in this run');
  }

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
    .where(eq(visualMoment.runId, input.runId));

  const cfg = SPECIALISTS.canon_architect;
  const model = selectModel('canon_architect', process.env);
  const provider = makeProvider(model.provider);
  const fallbacks = buildFallbacks(model, makeProvider);

  // Shared helper: same prompt format module video_intelligence uses.
  // Includes hubUse on visual moments (canon needs it to decide which
  // moments to attach) and is the single source of truth for canon's
  // user-message shape.
  const userMessage = buildCanonArchitectUserMessage(channelProfilePayload, vicRows, vmRows);

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
  const finalNodes = await db
    .select({ id: canonNode.id })
    .from(canonNode)
    .where(eq(canonNode.runId, input.runId));
  if (finalNodes.length === 0) {
    // Agent ran but produced zero canon_nodes — fail loudly so the cache
    // doesn't pin this empty state.
    throw new Error('canon stage produced 0 canon_node rows; agent likely hit a quota or schema-validation error');
  }
  return { ok: true, nodeCount: finalNodes.length, costCents: summary.costCents, summary };
}

export async function validateCanonMaterialization(
  _output: CanonStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const r = await db.select({ id: canonNode.id }).from(canonNode).where(eq(canonNode.runId, ctx.runId));
  return r.length > 0;
}
