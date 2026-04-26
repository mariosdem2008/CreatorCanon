import { z } from 'zod';
import { and, eq } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';
import type { ToolDef } from './types';

const verdictEnum = z.enum(['strong', 'moderate', 'limited']);

export const markFindingEvidenceTool: ToolDef<
  { findingId: string; verdict: z.infer<typeof verdictEnum>; notes?: string },
  { ok: true } | { ok: false; error: string }
> = {
  name: 'markFindingEvidence',
  description:
    'Update the evidenceQuality verdict for a finding produced earlier in this run. ' +
    "Verdicts: 'strong' (every claim supported by ≥1 segment from ≥2 distinct videos), " +
    "'moderate' (every claim supported by ≥1 segment from a single video, OR claims mostly supported but one weak), " +
    "'limited' (at least one claim has no supporting segment OR evidence is from one offhand mention). " +
    "Used by the citation_grounder specialist.",
  input: z.object({
    findingId: z.string().min(1),
    verdict: verdictEnum,
    notes: z.string().optional(),
  }).strict(),
  output: z.union([
    z.object({ ok: z.literal(true) }),
    z.object({ ok: z.literal(false), error: z.string() }),
  ]),
  handler: async ({ findingId, verdict }, ctx) => {
    const result = await ctx.db
      .update(archiveFinding)
      .set({ evidenceQuality: verdict })
      .where(and(eq(archiveFinding.id, findingId), eq(archiveFinding.runId, ctx.runId)))
      .returning({ id: archiveFinding.id });
    if (result.length === 0) {
      return { ok: false, error: `Finding '${findingId}' not found in run '${ctx.runId}'` };
    }
    return { ok: true };
  },
};
