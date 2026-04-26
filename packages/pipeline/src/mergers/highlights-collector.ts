import type { ArchiveFinding, ArchiveRelation } from '@creatorcanon/db/schema';

/**
 * Highlight shape produced by the merger. The adapter (Task 5.3) projects this
 * into the manifest's `Highlight` schema. Defined locally to avoid a cross-package
 * import from apps/web.
 */
export interface Highlight {
  id: string;
  type: 'aha_moment' | 'quote';
  text: string;
  context?: string;
  attribution?: string;
  evidence: {
    sourceVideoId: string;
    timestampStart: number;
    timestampLabel: string;
  };
}

interface CollectInput {
  findings: ArchiveFinding[];
  relations: ArchiveRelation[];
  publishedPageFindingIds: Set<string>;
  segmentLookup: Record<string, { videoId: string; startMs: number }>;
}

function formatTs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function collectHighlights(input: CollectInput): Highlight[] {
  const out: Highlight[] = [];
  for (const f of input.findings) {
    if (f.type !== 'quote' && f.type !== 'aha_moment') continue;
    const supportsLinked = input.relations.some((r) =>
      r.fromFindingId === f.id && r.type === 'supports' && input.publishedPageFindingIds.has(r.toFindingId)
    );
    if (supportsLinked) continue;

    const segId = f.evidenceSegmentIds[0];
    if (!segId) continue;
    const seg = input.segmentLookup[segId];
    if (!seg) continue;
    const startSec = Math.floor(seg.startMs / 1000);

    if (f.type === 'quote') {
      out.push({
        id: `hl_${f.id}`,
        type: 'quote',
        text: (f.payload as any).text,
        attribution: (f.payload as any).attribution,
        evidence: { sourceVideoId: seg.videoId, timestampStart: startSec, timestampLabel: formatTs(startSec) },
      });
    } else {
      out.push({
        id: `hl_${f.id}`,
        type: 'aha_moment',
        text: (f.payload as any).quote,
        context: (f.payload as any).context,
        attribution: (f.payload as any).attribution,
        evidence: { sourceVideoId: seg.videoId, timestampStart: startSec, timestampLabel: formatTs(startSec) },
      });
    }
  }
  return out;
}
