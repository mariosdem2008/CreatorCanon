import { eq, getDb } from '@creatorcanon/db';
import { video, videoSetItem } from '@creatorcanon/db/schema';
import { createR2Client, artifactKey } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';

export interface SelectionSnapshotInput {
  runId: string;
  workspaceId: string;
  videoSetId: string;
}

export interface SelectionSnapshotOutput {
  r2Key: string;
  videoCount: number;
  totalDurationSeconds: number;
  videos: Array<{
    id: string;
    youtubeVideoId: string;
    title: string | null;
    durationSeconds: number | null;
  }>;
}

export async function importSelectionSnapshot(
  input: SelectionSnapshotInput,
): Promise<SelectionSnapshotOutput> {
  const env = parseServerEnv(process.env);
  const db = getDb();
  const r2 = createR2Client(env);

  const items = await db
    .select({
      videoId: videoSetItem.videoId,
      position: videoSetItem.position,
    })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, input.videoSetId))
    .orderBy(videoSetItem.position);

  const videoIds = items.map((i) => i.videoId);

  const videos = await Promise.all(
    videoIds.map((id) =>
      db
        .select({
          id: video.id,
          youtubeVideoId: video.youtubeVideoId,
          title: video.title,
          durationSeconds: video.durationSeconds,
        })
        .from(video)
        .where(eq(video.id, id))
        .limit(1)
        .then((rows) => rows[0]),
    ),
  );

  const validVideos = videos.filter((v): v is NonNullable<typeof v> => v != null);

  const snapshot = {
    runId: input.runId,
    workspaceId: input.workspaceId,
    videoSetId: input.videoSetId,
    videos: validVideos,
    snapshotAt: new Date().toISOString(),
  };

  const r2Key = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'import_selection_snapshot',
    name: 'selection.json',
  });

  await r2.putObject({
    key: r2Key,
    body: JSON.stringify(snapshot, null, 2),
    contentType: 'application/json',
  });

  return {
    r2Key,
    videoCount: validVideos.length,
    totalDurationSeconds: validVideos.reduce((s, v) => s + (v.durationSeconds ?? 0), 0),
    videos: validVideos,
  };
}
