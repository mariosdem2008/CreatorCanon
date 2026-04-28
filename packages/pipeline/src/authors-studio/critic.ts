import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './specialists/_runner';
import type { ArtifactBundle, CriticOutput, PagePlan } from './types';

const criticSchema = z.object({
  approved: z.boolean(),
  notes: z.array(z.object({
    artifactKind: z.enum(['cited_prose', 'roadmap', 'hypothetical_example', 'diagram', 'common_mistakes']),
    severity: z.enum(['critical', 'important', 'minor']),
    issue: z.string().min(10),
    evidence: z.string().min(5),
    prescription: z.string().min(10),
  })).max(20),
});

export interface CriticInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  artifacts: ArtifactBundle;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runCritic(input: CriticInput): Promise<CriticOutput> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# ARTIFACTS PRODUCED\n${JSON.stringify(input.artifacts)}\n\n` +
    `# CANON NODES (the source of truth)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output revision notes as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, criticSchema);
  return { ...artifact, costCents };
}
