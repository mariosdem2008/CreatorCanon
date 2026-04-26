import { z } from 'zod';
import { and, eq } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';
import type { ToolDef } from './types';

const findingTypeEnum = z.enum(['topic', 'framework', 'lesson', 'playbook', 'quote', 'aha_moment', 'source_ranking']);
const evidenceQualityEnum = z.enum(['strong', 'moderate', 'limited', 'unverified']);

const findingSchema = z.object({
  id: z.string(),
  type: findingTypeEnum,
  agent: z.string(),
  evidenceQuality: evidenceQualityEnum,
  evidenceSegmentIds: z.array(z.string()),
  payload: z.record(z.unknown()),
});

export const listFindingsTool: ToolDef<
  { type: z.infer<typeof findingTypeEnum>; agent?: string; evidenceQuality?: z.infer<typeof evidenceQualityEnum> },
  z.infer<typeof findingSchema>[]
> = {
  name: 'listFindings',
  description: 'List findings of a given type produced earlier in this run. Optionally filter by agent or evidenceQuality.',
  input: z.object({
    type: findingTypeEnum,
    agent: z.string().optional(),
    evidenceQuality: evidenceQualityEnum.optional(),
  }).strict(),
  output: z.array(findingSchema),
  handler: async ({ type, agent, evidenceQuality }, ctx) => {
    const conditions = [eq(archiveFinding.runId, ctx.runId), eq(archiveFinding.type, type)];
    if (agent) conditions.push(eq(archiveFinding.agent, agent));
    if (evidenceQuality) conditions.push(eq(archiveFinding.evidenceQuality, evidenceQuality));
    const rows = await ctx.db.select().from(archiveFinding).where(and(...conditions));
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      agent: r.agent,
      evidenceQuality: r.evidenceQuality,
      evidenceSegmentIds: r.evidenceSegmentIds,
      payload: r.payload as Record<string, unknown>,
    }));
  },
};
