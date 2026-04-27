interface SegmentRef {
  id: string;
  videoId: string;
  startMs: number;
}

export interface SectionLike {
  kind: string;
  body?: string;
  citationIds?: string[];
  sourceVideoId?: string;
  timestampStart?: number;
  [key: string]: unknown;
}

export function enrichQuoteSection(
  section: SectionLike,
  segments: Map<string, SegmentRef>,
): SectionLike {
  if (section.kind !== 'quote') return section;
  const firstCitation = section.citationIds?.[0];
  if (!firstCitation) return section;
  const seg = segments.get(firstCitation);
  if (!seg) return section;
  return {
    ...section,
    sourceVideoId: seg.videoId,
    timestampStart: Math.floor(seg.startMs / 1000),
  };
}
