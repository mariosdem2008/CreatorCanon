import { z } from 'zod';
import { runAgent } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import type { AgentProvider } from '../agents/providers';
import type { R2Client } from '@creatorcanon/adapters';
import type { PagePlan, VoiceMode } from './types';

const ARTIFACT_KIND = z.enum(['cited_prose', 'roadmap', 'hypothetical_example', 'diagram', 'common_mistakes']);
const READER_JOB = z.enum(['learn', 'build', 'copy', 'decide', 'debug']);
const WORKBENCH_ARTIFACT_TYPE = z.enum(['prompt', 'checklist', 'workflow', 'template', 'schema', 'mistake_map']);

const workbenchArtifactRequestSchema = z.object({
  type: WORKBENCH_ARTIFACT_TYPE,
  title: z.string().min(4),
  intent: z.string().min(12),
  canonNodeIds: z.array(z.string()).min(1).max(20),
});

const workbenchNextStepHintSchema = z.object({
  title: z.string().min(4),
  reason: z.string().min(8),
});

const workbenchSchema = z.object({
  readerJob: READER_JOB,
  outcome: z.string().min(20),
  useWhen: z.array(z.string().min(8)).min(2).max(4),
  artifactRequests: z.array(workbenchArtifactRequestSchema).min(1).max(3),
  nextStepHints: z.array(workbenchNextStepHintSchema).min(1).max(3),
});

const looseWorkbenchSchema = z.object({
  readerJob: READER_JOB,
  outcome: z.string().min(20),
  useWhen: z.array(z.string().min(8)).min(2),
  artifactRequests: z.array(workbenchArtifactRequestSchema).min(1),
  nextStepHints: z.array(workbenchNextStepHintSchema).min(1),
});

const pagePlanSchema = z.object({
  pageId: z.string().min(1),
  pageType: z.string().min(1),
  pageTitle: z.string().min(1),
  thesis: z.string().min(20),
  arc: z.array(z.object({
    beat: z.string().min(5),
    canonNodeIds: z.array(z.string()).max(20),
  })).min(2).max(8),
  voiceMode: z.enum(['creator_first_person', 'reader_second_person']),
  voiceNotes: z.object({
    tone: z.enum(['analytical', 'practitioner', 'urgent', 'generous']),
    creatorTermsToUse: z.array(z.string()).min(0).max(10),
    avoidPhrases: z.array(z.string()).min(0).max(10),
  }),
  artifacts: z.array(z.object({
    kind: ARTIFACT_KIND,
    canonNodeIds: z.array(z.string()).min(1),
    intent: z.string().min(10),
  })).min(1).max(5),
  siblingPagesToReference: z.array(z.object({
    pageId: z.string().min(1),
    title: z.string().min(1),
    slug: z.string().min(1),
  })).max(20).optional().default([]),
  workbench: workbenchSchema,
});

const pagePlanInputSchema = pagePlanSchema.extend({
  workbench: looseWorkbenchSchema,
});

export interface StrategistInput {
  runId: string;
  workspaceId: string;
  voiceMode: VoiceMode;
  channelProfilePayload: unknown;
  brief: { id: string; payload: Record<string, unknown> };
  primaryCanonNodes: Array<Record<string, unknown>>;
  supportingCanonNodes: Array<Record<string, unknown>>;
  siblingBriefs: Array<{ id: string; pageTitle: string; slug: string; audienceQuestion: string; primaryCanonNodeIds: string[] }>;
  provider: AgentProvider;
  fallbacks: Array<{ modelId: string; provider: AgentProvider }>;
  r2: R2Client;
  modelId: string;
}

export async function runStrategist(input: StrategistInput): Promise<PagePlan> {
  const cfg = SPECIALISTS.page_strategist;
  const userMessage =
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `# THIS PAGE'S BRIEF (id=${input.brief.id})\n${JSON.stringify(input.brief.payload)}\n\n` +
    `# PRIMARY CANON NODES\n${JSON.stringify(input.primaryCanonNodes)}\n\n` +
    `# SUPPORTING CANON NODES\n${JSON.stringify(input.supportingCanonNodes)}\n\n` +
    `# SIBLING PAGE BRIEFS (for non-repetition; reference by slug)\n${JSON.stringify(input.siblingBriefs)}\n\n` +
    `# VOICE MODE\n${input.voiceMode}\n\n` +
    `Output the page plan as a single JSON object. No prose around it.`;

  const summary = await runAgent({
    runId: input.runId,
    workspaceId: input.workspaceId,
    agent: cfg.agent,
    modelId: input.modelId,
    provider: input.provider,
    fallbacks: input.fallbacks,
    r2: input.r2,
    tools: [],
    systemPrompt: cfg.systemPrompt,
    userMessage,
    caps: cfg.stopOverrides,
  });

  const transcriptObj = await input.r2.getObject(summary.transcriptR2Key);
  const transcript = JSON.parse(new TextDecoder().decode(transcriptObj.body)) as Array<{ role: string; content: string }>;
  const lastAssistant = [...transcript].reverse().find((t) => t.role === 'assistant' && t.content?.trim().length > 0);
  if (!lastAssistant) throw new Error('strategist returned no assistant message');

  const stripped = stripJsonFence(lastAssistant.content);
  const parsed = JSON.parse(stripped);
  const parsedPlan = pagePlanInputSchema.parse(parsed);
  const validated = pagePlanSchema.parse(normalizePagePlan(parsedPlan));

  return {
    ...validated,
    siblingPagesToReference: validated.siblingPagesToReference ?? [],
    costCents: summary.costCents,
  };
}

function normalizePagePlan(plan: z.infer<typeof pagePlanInputSchema>): z.infer<typeof pagePlanSchema> {
  return {
    ...plan,
    workbench: {
      ...plan.workbench,
      useWhen: plan.workbench.useWhen.slice(0, 4),
      artifactRequests: plan.workbench.artifactRequests.slice(0, 3),
      nextStepHints: plan.workbench.nextStepHints.slice(0, 3),
    },
  };
}

function stripJsonFence(s: string): string {
  const trimmed = s.trim();
  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
  }
  return trimmed;
}
