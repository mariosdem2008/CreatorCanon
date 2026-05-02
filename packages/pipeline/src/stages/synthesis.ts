import { eq, sql } from '@creatorcanon/db';
import { archiveFinding, type ArchiveFinding } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel, type AgentName } from '../agents/providers/selectModel';
import { createOpenAICompatibleProvider } from '../agents/providers/factory';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';

type SynthesisAgent = Extract<
  AgentName,
  'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
>;
const SYNTHESIS_AGENTS: SynthesisAgent[] = [
  'playbook_extractor',
  'source_ranker',
  'quote_finder',
  'aha_moment_detector',
];
const CONCURRENCY = SYNTHESIS_AGENTS.length;

const FINDING_TYPES = {
  topic: 'topic',
  framework: 'framework',
  lesson: 'lesson',
} as const satisfies Record<string, ArchiveFinding['type']>;

export interface SynthesisStageInput {
  runId: string;
  workspaceId: string;
  /** Test override: build a provider for the given provider name. */
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  /** Test override: an R2 client to use instead of the env-driven default. */
  r2Override?: R2Client;
}

export interface SynthesisStageOutput {
  specialistsCompleted: number;
  findingCount: number;
  costCents: number;
  perAgent: Array<{
    agent: SynthesisAgent;
    modelId: string;
    summary: RunAgentSummary | null;
    error?: string;
  }>;
}

export async function runSynthesisStage(input: SynthesisStageInput): Promise<SynthesisStageOutput> {
  ensureToolsRegistered();

  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  function makeProvider(name: 'openai' | 'gemini'): AgentProvider {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAICompatibleProvider(process.env);
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  }

  // Bootstrap: count existing findings by type from Phase 1 (discovery).
  const counts = await db
    .select({ type: archiveFinding.type, count: sql<number>`count(*)::int` })
    .from(archiveFinding)
    .where(eq(archiveFinding.runId, input.runId))
    .groupBy(archiveFinding.type);
  const total = counts.reduce((acc, c) => acc + Number(c.count), 0);
  const m = counts.find((c) => c.type === FINDING_TYPES.topic)?.count ?? 0;
  const k = counts.find((c) => c.type === FINDING_TYPES.framework)?.count ?? 0;
  const l = counts.find((c) => c.type === FINDING_TYPES.lesson)?.count ?? 0;
  const bootstrap = `Discovery phase produced ${total} findings (${m} topics, ${k} frameworks, ${l} lessons). Use listFindings to read them.`;

  // Fan out synthesis specialists with bounded concurrency.
  const summaries = await runWithConcurrency(SYNTHESIS_AGENTS, CONCURRENCY, async (agent) => {
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

async function runWithConcurrency<T, U>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<U>,
): Promise<U[]> {
  const out: U[] = [];
  let i = 0;
  await Promise.all(
    Array(Math.min(concurrency, items.length))
      .fill(0)
      .map(async () => {
        while (i < items.length) {
          const idx = i++;
          out[idx] = await fn(items[idx]!);
        }
      }),
  );
  return out;
}
