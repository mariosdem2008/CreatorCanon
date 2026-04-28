import { z } from 'zod';
import { runSpecialist, type SpecialistContext } from './_runner';
import type { RoadmapArtifact, PagePlan } from '../types';

const workflowWorkbenchArtifactSchema = z.object({
  type: z.literal('workflow'),
  title: z.string().min(4),
  body: z.string().min(40),
  citationIds: z.array(z.string().min(1)).min(1),
});

const roadmapSchema = z.object({
  kind: z.literal('roadmap'),
  title: z.string().min(5),
  steps: z.array(z.object({
    index: z.number().int().min(1),
    title: z.string().min(3),
    body: z.string().min(20),
    durationLabel: z.string().optional(),
    citationIds: z.array(z.string().min(1)).min(1),
  })).min(3).max(7),
  workbenchArtifact: workflowWorkbenchArtifactSchema.optional(),
});

export interface RoadmapAuthorInput {
  ctx: SpecialistContext;
  plan: PagePlan;
  canonNodes: Array<Record<string, unknown>>;
  channelProfilePayload: unknown;
}

export async function runRoadmapAuthor(input: RoadmapAuthorInput): Promise<RoadmapArtifact> {
  const userMessage =
    `# PAGE PLAN\n${JSON.stringify(input.plan)}\n\n` +
    `# CANON NODES (use steps/tools/sequencingRationale/successSignal)\n${JSON.stringify(input.canonNodes)}\n\n` +
    `# CHANNEL PROFILE\n${JSON.stringify(input.channelProfilePayload)}\n\n` +
    `Output the roadmap as a single JSON object matching the schema.`;
  const { artifact, costCents } = await runSpecialist(input.ctx, userMessage, roadmapSchema);
  return { ...artifact, costCents };
}
