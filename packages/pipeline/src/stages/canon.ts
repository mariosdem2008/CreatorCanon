import { eq } from '@creatorcanon/db';
import { canonNode, videoIntelligenceCard } from '@creatorcanon/db/schema';
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

  const cards = await db
    .select({ id: videoIntelligenceCard.id })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, input.runId));
  if (cards.length === 0) {
    return {
      ok: false,
      nodeCount: 0,
      costCents: 0,
      summary: null,
      error: 'No video_intelligence_card rows in this run; canon stage cannot run.',
    };
  }

  const bootstrap =
    `${cards.length} video intelligence cards available. Read every card via listVideoIntelligenceCards. ` +
    `Visual moments are also available via listVisualMoments(minScore:60). ` +
    `Merge into a canon. Don't pad weak content.`;

  const cfg = SPECIALISTS.canon_architect;
  const model = selectModel('canon_architect', process.env);
  const provider = makeProvider(model.provider);

  try {
    const summary = await runAgent({
      runId: input.runId,
      workspaceId: input.workspaceId,
      agent: cfg.agent,
      modelId: model.modelId,
      provider,
      r2,
      tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt,
      userMessage: bootstrap,
      caps: cfg.stopOverrides,
    });
    const finalNodes = await db
      .select({ id: canonNode.id })
      .from(canonNode)
      .where(eq(canonNode.runId, input.runId));
    return { ok: true, nodeCount: finalNodes.length, costCents: summary.costCents, summary };
  } catch (err) {
    return { ok: false, nodeCount: 0, costCents: 0, summary: null, error: (err as Error).message };
  }
}

export async function validateCanonMaterialization(
  _output: CanonStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const r = await db.select({ id: canonNode.id }).from(canonNode).where(eq(canonNode.runId, ctx.runId));
  return r.length > 0;
}
