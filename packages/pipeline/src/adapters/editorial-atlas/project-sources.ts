import { inArray } from '@creatorcanon/db';
import { segment, video, transcriptAsset } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';

export async function projectSources({
  db,
  pages,
}: {
  runId: string;
  db: AtlasDb;
  pages: Array<{
    id: string;
    _internal?: { evidenceSegmentIds: string[] };
  }>;
}) {
  // Find every segment referenced by any page's evidence.
  const allSegmentIds = new Set<string>();
  for (const p of pages) {
    for (const id of p._internal?.evidenceSegmentIds ?? []) allSegmentIds.add(id);
  }
  if (allSegmentIds.size === 0) return [];

  const segmentRows = await db
    .select({
      id: segment.id,
      videoId: segment.videoId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    })
    .from(segment)
    .where(inArray(segment.id, [...allSegmentIds]));

  const videoIds = [...new Set(segmentRows.map((s) => s.videoId))];
  if (videoIds.length === 0) return [];

  const videoRows = await db
    .select()
    .from(video)
    .where(inArray(video.id, videoIds));
  const transcripts = await db
    .select({ videoId: transcriptAsset.videoId, isCanonical: transcriptAsset.isCanonical })
    .from(transcriptAsset)
    .where(inArray(transcriptAsset.videoId, videoIds));
  const canonicalSet = new Set(
    transcripts.filter((t) => t.isCanonical).map((t) => t.videoId),
  );

  const segByVideo = new Map<string, typeof segmentRows>();
  for (const s of segmentRows) {
    const list = segByVideo.get(s.videoId) ?? [];
    list.push(s);
    segByVideo.set(s.videoId, list);
  }

  return videoRows.map((v) => {
    const segs = segByVideo.get(v.id) ?? [];
    const citedPageIds = pages
      .filter((p) =>
        (p._internal?.evidenceSegmentIds ?? []).some((id) => segs.some((s) => s.id === id)),
      )
      .map((p) => p.id);
    const topicSlugs: string[] = []; // optional enrichment; leave empty for now

    return {
      id: v.id,
      youtubeId: v.youtubeVideoId,
      title: v.title ?? 'Untitled',
      channelName: 'Creator', // placeholder satisfies min(1) constraint
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : new Date().toISOString(),
      durationSec: v.durationSeconds ?? 1,
      thumbnailUrl:
        (v.thumbnails as { medium?: string; small?: string } | null)?.medium ??
        (v.thumbnails as { medium?: string; small?: string } | null)?.small ??
        `https://i.ytimg.com/vi/${v.youtubeVideoId}/hqdefault.jpg`,
      transcriptStatus: canonicalSet.has(v.id) ? ('available' as const) : ('unavailable' as const),
      topicSlugs,
      citedPageIds,
      keyMoments: segs.slice(0, 5).map((s) => ({
        timestampStart: Math.floor(s.startMs / 1000),
        timestampEnd: Math.floor(s.endMs / 1000),
        label: s.text.slice(0, 80),
      })),
      transcriptExcerpts: segs.slice(0, 3).map((s) => ({
        timestampStart: Math.floor(s.startMs / 1000),
        body: s.text,
      })),
    };
  });
}
