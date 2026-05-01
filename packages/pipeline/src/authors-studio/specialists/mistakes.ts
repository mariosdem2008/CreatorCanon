import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { MistakesArtifact, PagePlan } from '../types';

const mistakeMapWorkbenchArtifactSchema = z.object({
  type: z.literal('mistake_map'),
  title: z.string().min(4),
  body: z.string().min(40),
  citationIds: z.array(z.string().min(1)).min(1),
});

const mistakesSchema = z.object({
  kind: z.literal('common_mistakes'),
  items: z.array(z.object({
    mistake: z.string().min(15),
    why: z.string().min(20),
    correction: z.string().min(15),
    citationIds: z.array(z.string().min(1)).min(1),
  })).min(3).max(5),
  workbenchArtifact: mistakeMapWorkbenchArtifactSchema.optional(),
});

export interface MistakesAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  vicMistakes: Array<{ mistake: string; why?: string; correction?: string }>;
  channelProfilePayload: unknown;
}

export async function runMistakesAuthor(input: MistakesAuthorInput): Promise<MistakesArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use commonMistake/failureModes)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# VIC MISTAKES (additional source — drawn from underlying videos)\n${JSON.stringify(input.vicMistakes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the mistakes as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, mistakesSchema);
  return { ...artifact, costCents };
}
