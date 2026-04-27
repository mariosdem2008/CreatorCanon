import { eq } from '@creatorcanon/db';
import { channelProfile } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import { listVideosTool } from '../agents/tools/universal';
import type { AgentProvider } from '../agents/providers';
import type { ToolCtx } from '../agents/tools/types';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import type { StageContext } from '../harness';

export interface ChannelProfileStageInput {
  runId: string;
  workspaceId: string;
  /** Test override: build a provider for the given provider name. */
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  /** Test override: an R2 client to use instead of the env-driven default. */
  r2Override?: R2Client;
}

export interface ChannelProfileStageOutput {
  ok: boolean;
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runChannelProfileStage(
  input: ChannelProfileStageInput,
): Promise<ChannelProfileStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  // Bootstrap: list every video in the run so the agent has the archive shape.
  const bootstrapCtx: ToolCtx = {
    runId: input.runId,
    workspaceId: input.workspaceId,
    agent: 'bootstrap',
    model: 'n/a',
    db,
    r2,
  };
  const videos = await listVideosTool.handler({}, bootstrapCtx);
  if (videos.length === 0) {
    return { ok: false, costCents: 0, summary: null, error: 'No videos in run; cannot build channel profile.' };
  }

  const bootstrap =
    `Archive: ${videos.length} videos.\n\n` +
    videos
      .map((v) => `- ${v.id}: ${v.title} (${Math.round(v.durationSec / 60)} min)`)
      .join('\n') +
    `\n\nProduce one channel profile. Sample 3-5 videos via getSegmentedTranscript before deciding.`;

  const cfg = SPECIALISTS.channel_profiler;
  const model = selectModel('channel_profiler', process.env);
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
    return { ok: true, costCents: summary.costCents, summary };
  } catch (err) {
    return {
      ok: false,
      costCents: 0,
      summary: null,
      error: (err as Error).message,
    };
  }
}

/**
 * Materialization validator for runStage. Returns true if exactly one
 * channel_profile row exists for ctx.runId. The unique index on (run_id)
 * means cardinality is 0 or 1; we only accept the cache hit when it's 1.
 */
export async function validateChannelProfileMaterialization(
  _output: ChannelProfileStageOutput,
  ctx: StageContext,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: channelProfile.id })
    .from(channelProfile)
    .where(eq(channelProfile.runId, ctx.runId))
    .limit(1);
  return rows.length === 1;
}
