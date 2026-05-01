import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { ProseArtifact, PagePlan } from '../types';

const proseSchema = z.object({
  kind: z.literal('cited_prose'),
  paragraphs: z.array(z.object({
    heading: z.string().optional(),
    body: z.string().min(40),
    citationIds: z.array(z.string().min(1)).min(1),
  })).min(3).max(5),
});

export interface ProseAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  segmentExcerpts: Array<{ segmentId: string; videoId: string; text: string; startMs: number; endMs: number }>;
  channelProfilePayload: unknown;
}

export async function runProseAuthor(input: ProseAuthorInput): Promise<ProseArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# SEGMENT EXCERPTS (cite by segmentId)\n${JSON.stringify(input.segmentExcerpts)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the prose as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, proseSchema);
  return { ...artifact, costCents };
}
