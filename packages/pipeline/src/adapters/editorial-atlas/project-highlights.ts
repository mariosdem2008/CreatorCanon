import { and, eq, inArray } from '@creatorcanon/db';
import { archiveFinding, archiveRelation, canonNode, segment } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';
import { collectHighlights, type Highlight } from '../../mergers/highlights-collector';

function formatTs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export async function projectHighlights({
  runId,
  db,
  publishedPageFindingIds,
}: {
  runId: string;
  db: AtlasDb;
  publishedPageFindingIds: Set<string>;
}): Promise<Highlight[]> {
  // canon_v1 source: canon_node WHERE type IN ('quote','aha_moment').
  const canonRows = await db
    .select()
    .from(canonNode)
    .where(and(eq(canonNode.runId, runId), inArray(canonNode.type, ['quote', 'aha_moment'])));

  if (canonRows.length > 0) {
    const segIds = new Set<string>();
    for (const r of canonRows) for (const id of r.evidenceSegmentIds) segIds.add(id);
    const segs = segIds.size
      ? await db
          .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs })
          .from(segment)
          .where(inArray(segment.id, [...segIds]))
      : [];
    const segLookup: Record<string, { videoId: string; startMs: number }> = {};
    for (const s of segs) segLookup[s.id] = { videoId: s.videoId, startMs: s.startMs };

    const out: Highlight[] = [];
    for (const r of canonRows) {
      // Skip canon nodes that already anchor a published page — surfacing them
      // again as standalone highlights would duplicate content.
      if (publishedPageFindingIds.has(r.id)) continue;
      const segId = r.evidenceSegmentIds[0];
      if (!segId) continue;
      const seg = segLookup[segId];
      if (!seg) continue;
      const startSec = Math.floor(seg.startMs / 1000);
      const p = r.payload as { text?: string; quote?: string; context?: string; attribution?: string };
      const text = p.text ?? p.quote ?? '';
      if (!text) continue;
      out.push({
        id: `hl_${r.id}`,
        type: r.type === 'quote' ? 'quote' : 'aha_moment',
        text,
        context: p.context,
        attribution: p.attribution,
        evidence: { sourceVideoId: seg.videoId, timestampStart: startSec, timestampLabel: formatTs(startSec) },
      });
    }
    return out;
  }

  // findings_v1 legacy fallback: archive_finding + archive_relation.
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
