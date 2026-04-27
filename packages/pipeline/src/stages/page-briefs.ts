import { eq } from '@creatorcanon/db';
import { canonNode, pageBrief } from '@creatorcanon/db/schema';
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

export async function runPageBriefsStage(input: PageBriefsStageInput): Promise<PageBriefsStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  // Idempotency.
  await db.delete(pageBrief).where(eq(pageBrief.runId, input.runId));

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  const nodes = await db
    .select({
      id: canonNode.id,
      type: canonNode.type,
      score: canonNode.pageWorthinessScore,
    })
    .from(canonNode)
    .where(eq(canonNode.runId, input.runId));

  if (nodes.length === 0) {
    return {
      ok: false,
      briefCount: 0,
      costCents: 0,
      summary: null,
      error: 'No canon nodes in this run; page-briefs stage cannot run.',
    };
  }

  const frameworkCount = nodes.filter((n) => n.type === 'framework').length;
  const lessonCount = nodes.filter((n) => n.type === 'lesson').length;
  const playbookCount = nodes.filter((n) => n.type === 'playbook').length;
  const bootstrap =
    `Canon contains ${nodes.length} nodes (${frameworkCount} frameworks, ${lessonCount} lessons, ${playbookCount} playbooks). ` +
    `Visual moments available via listVisualMoments(minScore:60). ` +
    `Pick 4-12 page-worthy anchors and brief each.`;

  const cfg = SPECIALISTS.page_brief_planner;
  const model = selectModel('page_brief_planner', process.env);
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
    const finalBriefs = await db
      .select({ id: pageBrief.id })
      .from(pageBrief)
      .where(eq(pageBrief.runId, input.runId));
    return { ok: true, briefCount: finalBriefs.length, costCents: summary.costCents, summary };
  } catch (err) {
    return { ok: false, briefCount: 0, costCents: 0, summary: null, error: (err as Error).message };
  }
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
