import { eq, getDb, sql } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider, ProviderName } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';

export interface VerifyStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: ProviderName) => AgentProvider;
  r2Override?: R2Client;
}

export interface VerifyStageOutput {
  specialistsCompleted: number;
  findingCount: number;
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runVerifyStage(input: VerifyStageInput): Promise<VerifyStageOutput> {
  ensureToolsRegistered();

  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  function makeProvider(name: ProviderName): AgentProvider {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    if (name === 'gemini') return createGeminiProvider(env.GEMINI_API_KEY ?? '');
    throw new Error(
      `verify stage does not support provider '${name}'. ` +
      `Tool-using agents must use openai or gemini; codex-cli is only valid for the Author's Studio specialists.`,
    );
  }

  const counts = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(archiveFinding)
    .where(eq(archiveFinding.runId, input.runId));
  const total = Number(counts[0]?.count ?? 0);
  const bootstrap = `Run produced ${total} findings. Verify each finding's evidence and assign a verdict.`;

  const cfg = SPECIALISTS.citation_grounder;
  const model = selectModel('citation_grounder', process.env);
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
    return {
      specialistsCompleted: 1,
      findingCount: summary.findingCount,
      costCents: summary.costCents,
      summary,
    };
  } catch (err) {
    return {
      specialistsCompleted: 0,
      findingCount: 0,
      costCents: 0,
      summary: null,
      error: (err as Error).message,
    };
  }
}
