import { and, eq, inArray, sql } from '@creatorcanon/db';
import { segment, video, transcriptAsset } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';

export async function projectStats({
  runId,
  db,
  pageCount,
  sourceCount,
}: {
  runId: string;
  db: AtlasDb;
  pageCount: number;
  sourceCount: number;
}) {
  // Get unique video IDs in this run via segments.
  const videoIdRows = await db
    .selectDistinct({ videoId: segment.videoId })
    .from(segment)
    .where(eq(segment.runId, runId));
  const videoIds = videoIdRows.map((r) => r.videoId);
  const videoCount = videoIds.length;

  let archiveYears = 0;
  if (videoCount > 0) {
    const videos = await db
      .select({ id: video.id, publishedAt: video.publishedAt })
      .from(video)
      .where(inArray(video.id, videoIds));

    const dates = videos
      .map((v) => v.publishedAt)
      .filter((d): d is Date => d != null);

    if (dates.length >= 2) {
      const min = Math.min(...dates.map((d) => d.getTime()));
      const max = Math.max(...dates.map((d) => d.getTime()));
      archiveYears = Math.round(((max - min) / (1000 * 60 * 60 * 24 * 365.25)) * 10) / 10;
    }
  }

  let transcriptPercent = 0;
  if (videoCount > 0) {
    const canonical = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transcriptAsset)
      .where(
        and(eq(transcriptAsset.isCanonical, true), inArray(transcriptAsset.videoId, videoIds)),
      );
    transcriptPercent = Math.min(1, Number(canonical[0]?.count ?? 0) / videoCount);
  }

  return {
    videoCount,
    sourceCount,
    transcriptPercent,
    archiveYears: Math.max(0, archiveYears),
    pageCount,
  };
}
