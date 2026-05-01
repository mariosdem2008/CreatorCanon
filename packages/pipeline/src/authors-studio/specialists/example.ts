import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { ExampleArtifact, PagePlan } from '../types';

const templateWorkbenchArtifactSchema = z.object({
  type: z.literal('template'),
  title: z.string().min(4),
  body: z.string().min(40),
  citationIds: z.array(z.string().min(1)).min(1),
});

const exampleSchema = z.object({
  kind: z.literal('hypothetical_example'),
  setup: z.string().min(40),
  stepsTaken: z.array(z.string().min(15)).min(3).max(7),
  outcome: z.string().min(20),
  citationIds: z.array(z.string().min(1)).min(2),
  workbenchArtifact: templateWorkbenchArtifactSchema.optional(),
});

export interface ExampleAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runExampleAuthor(input: ExampleAuthorInput): Promise<ExampleArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use whenToUse/useCase/example/preconditions)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE (audience matters — pick a realistic protagonist)\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the example as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, exampleSchema);
  return { ...artifact, costCents };
}
