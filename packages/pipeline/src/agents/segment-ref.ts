import { z } from 'zod';
import { and, eq, inArray, getDb } from '@creatorcanon/db';
import { segment } from '@creatorcanon/db/schema';

export const segmentRefSchema = z.object({
  segmentId: z.string().min(1),
});
export type SegmentRef = z.infer<typeof segmentRefSchema>;

/**
 * Validate that all segmentIds belong to the given runId.
 * Returns the set of unknown IDs (empty if all valid).
 */
export async function validateSegmentRefs(
  runId: string,
  refs: SegmentRef[],
): Promise<{ ok: true } | { ok: false; unknownIds: string[] }> {
  if (refs.length === 0) return { ok: true };
  const db = getDb();
  const ids = refs.map((r) => r.segmentId);
  const found = await db
    .select({ id: segment.id })
    .from(segment)
    .where(and(eq(segment.runId, runId), inArray(segment.id, ids)));
  const foundSet = new Set(found.map((r) => r.id));
  const unknown = ids.filter((id) => !foundSet.has(id));
  if (unknown.length > 0) return { ok: false, unknownIds: unknown };
  return { ok: true };
}
