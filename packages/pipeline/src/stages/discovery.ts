import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel, type AgentName } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import { listVideosTool } from '../agents/tools/universal';
import type { AgentProvider } from '../agents/providers';
import type { ToolCtx } from '../agents/tools/types';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';

type DiscoveryAgent = Extract<AgentName, 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'>;
const DISCOVERY_AGENTS: DiscoveryAgent[] = ['topic_spotter', 'framework_extractor', 'lesson_extractor'];
const CONCURRENCY = 4;

export interface DiscoveryStageInput {
  runId: string;
  workspaceId: string;
  /** Test override: build a provider for the given provider name. */
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  /** Test override: an R2 client to use instead of the env-driven default. */
  r2Override?: R2Client;
}

export interface DiscoveryStageOutput {
  specialistsCompleted: number;
  findingCount: number;
  costCents: number;
  perAgent: Array<{ agent: DiscoveryAgent; modelId: string; summary: RunAgentSummary | null; error?: string }>;
}

export async function runDiscoveryStage(input: DiscoveryStageInput): Promise<DiscoveryStageOutput> {
  ensureToolsRegistered();

  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);

  function makeProvider(name: 'openai' | 'gemini'): AgentProvider {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  }

  // Bootstrap context: list of videos in this run.
  const bootstrapCtx: ToolCtx = {
    runId: input.runId,
    workspaceId: input.workspaceId,
    agent: 'bootstrap',
    model: 'n/a',
    db: getDb(),
    r2,
  };
  const videos = await listVideosTool.handler({}, bootstrapCtx);
  const bootstrap = `Archive: ${videos.length} videos.\n\n` + videos.slice(0, 50).map((v) => `- ${v.id}: ${v.title} (${Math.round(v.durationSec / 60)} min)`).join('\n');

  // Fan out specialists with bounded concurrency.
  const summaries = await runWithConcurrency(DISCOVERY_AGENTS, CONCURRENCY, async (agent) => {
    const cfg = SPECIALISTS[agent];
    const model = selectModel(agent, process.env);
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
      return { agent, modelId: model.modelId, summary, error: undefined };
    } catch (err) {
      return { agent, modelId: model.modelId, summary: null, error: (err as Error).message };
    }
  });

  return {
    specialistsCompleted: summaries.filter((s) => s.summary !== null).length,
    findingCount: summaries.reduce((acc, s) => acc + (s.summary?.findingCount ?? 0), 0),
    costCents: summaries.reduce((acc, s) => acc + (s.summary?.costCents ?? 0), 0),
    perAgent: summaries,
  };
}

async function runWithConcurrency<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = [];
  let i = 0;
  await Promise.all(Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }));
  return out;
}
