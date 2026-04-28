import type { z } from 'zod';
import { runAgent, type RunAgentSummary } from '../../agents/harness';
import type { AgentProvider } from '../../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';
import type { StopCaps } from '../../agents/stop-conditions';

export interface SpecialistContext {
  runId: string;
  workspaceId: string;
  agent: string;
  modelId: string;
  provider: AgentProvider;
  fallbacks: Array<{ modelId: string; provider: AgentProvider }>;
  r2: R2Client;
  systemPrompt: string;
  caps?: Partial<StopCaps>;
}

export async function runSpecialist<T>(
  ctx: SpecialistContext,
  userMessage: string,
  schema: z.ZodType<T>,
): Promise<{ artifact: T; costCents: number }> {
  const summary: RunAgentSummary = await runAgent({
    runId: ctx.runId,
    workspaceId: ctx.workspaceId,
    agent: ctx.agent,
    modelId: ctx.modelId,
    provider: ctx.provider,
    fallbacks: ctx.fallbacks,
    r2: ctx.r2,
    tools: [],
    systemPrompt: ctx.systemPrompt,
    userMessage,
    caps: ctx.caps,
  });
  const obj = await ctx.r2.getObject(summary.transcriptR2Key);
  const transcript = JSON.parse(new TextDecoder().decode(obj.body)) as Array<{ role: string; content: string }>;
  const last = [...transcript].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
  if (!last) throw new Error(`${ctx.agent} returned no assistant message`);
  const trimmed = last.content.trim();
  const stripped = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim()
    : trimmed;
  const parsed = JSON.parse(stripped);
  const artifact = schema.parse(parsed);
  return { artifact, costCents: summary.costCents };
}
