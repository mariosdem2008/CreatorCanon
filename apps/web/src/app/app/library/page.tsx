import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { and, desc, eq, getDb, inArray } from '@creatorcanon/db';
import { channel, mediaAsset, transcriptAsset, video, workspaceMember } from '@creatorcanon/db/schema';

import LibraryClient, { type VideoRow, type ChannelRow } from './LibraryClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Source Library' };

export default async function LibraryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) redirect('/app');

  const channels = await db
    .select()
    .from(channel)
    .where(eq(channel.workspaceId, workspaceId))
    .limit(1);

  const ch = channels[0];
  if (!ch) redirect('/app');

  const videos = await db
    .select({
      id: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      publishedAt: video.publishedAt,
      durationSeconds: video.durationSeconds,
      viewCount: video.viewCount,
      thumbnails: video.thumbnails,
      captionStatus: video.captionStatus,
      transcribeStatus: video.transcribeStatus,
      sourceKind: video.sourceKind,
      categories: video.categories,
    })
    .from(video)
    .where(eq(video.workspaceId, workspaceId))
    .orderBy(desc(video.publishedAt))
    .limit(1000);

  const canonicalTranscripts = videos.length > 0
    ? await db
        .select({ videoId: transcriptAsset.videoId })
        .from(transcriptAsset)
        .where(
          and(
            eq(transcriptAsset.workspaceId, workspaceId),
            eq(transcriptAsset.isCanonical, true),
            inArray(transcriptAsset.videoId, videos.map((v) => v.id)),
          ),
        )
    : [];
  const canonicalVideoIds = new Set(canonicalTranscripts.map((row) => row.videoId));
  const audioAssets = videos.length > 0
    ? await db
        .select({ videoId: mediaAsset.videoId })
        .from(mediaAsset)
        .where(
          and(
            eq(mediaAsset.workspaceId, workspaceId),
            eq(mediaAsset.type, 'audio_m4a'),
            inArray(mediaAsset.videoId, videos.map((v) => v.id)),
          ),
        )
    : [];
  const audioVideoIds = new Set(audioAssets.map((row) => row.videoId));

  const channelRow: ChannelRow = {
    id: ch.id,
    title: ch.title,
    handle: ch.handle,
    subsCount: ch.subsCount,
    videoCount: ch.videoCount,
    avatarUrl: ch.avatarUrl,
    uploadsPlaylistId: ch.uploadsPlaylistId,
  };

  const videoRows: VideoRow[] = videos.map((v) => ({
    id: v.id,
    youtubeVideoId: v.youtubeVideoId,
    title: v.title,
    publishedAt: v.publishedAt?.toISOString() ?? null,
    durationSeconds: v.durationSeconds,
    viewCount: v.viewCount,
    thumbnailUrl: v.thumbnails?.medium ?? v.thumbnails?.small ?? null,
    captionStatus: v.captionStatus,
    transcribeStatus: v.transcribeStatus as VideoRow['transcribeStatus'],
    sourceKind: v.sourceKind,
    hasCanonicalTranscript: canonicalVideoIds.has(v.id),
    hasAudioAsset: audioVideoIds.has(v.id),
    categories: v.categories ?? [],
  }));

  return <LibraryClient channel={channelRow} videos={videoRows} />;
}
