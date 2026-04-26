import { eq, inArray } from '@creatorcanon/db';
import { archiveFinding, archiveRelation, segment } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';
import { collectHighlights } from '../../mergers/highlights-collector';

export async function projectHighlights({
  runId,
  db,
  publishedPageFindingIds,
}: {
  runId: string;
  db: AtlasDb;
  publishedPageFindingIds: Set<string>;
}) {
  const findings = await db
    .select()
    .from(archiveFinding)
    .where(eq(archiveFinding.runId, runId));
  const relations = await db
    .select()
    .from(archiveRelation)
    .where(eq(archiveRelation.runId, runId));

  const relevantSegmentIds = new Set<string>();
  for (const f of findings) {
    for (const id of f.evidenceSegmentIds) relevantSegmentIds.add(id);
  }
  if (relevantSegmentIds.size === 0) return [];

  const segs = await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs })
    .from(segment)
    .where(inArray(segment.id, [...relevantSegmentIds]));

  const segmentLookup: Record<string, { videoId: string; startMs: number }> = {};
  for (const s of segs) segmentLookup[s.id] = { videoId: s.videoId, startMs: s.startMs };

  return collectHighlights({ findings, relations, publishedPageFindingIds, segmentLookup });
}
