import { task } from '@trigger.dev/sdk/v3';

import { createYouTubeClient } from '@creatorcanon/adapters/youtube';
import { and, eq, getDb } from '@creatorcanon/db';
import { account, channel, video } from '@creatorcanon/db/schema';

/** Max pages of 50 to fetch per sync (caps at 500 videos for alpha). */
const MAX_PAGES = 10;

export const syncChannelTask = task({
  id: 'sync-channel',
  maxDuration: 300,
  run: async (payload: {
    workspaceId: string;
    channelRecordId: string;
    uploadsPlaylistId: string;
    userId: string;
  }) => {
    const db = getDb();

    const accounts = await db
      .select({ access_token: account.access_token, refresh_token: account.refresh_token, expires_at: account.expires_at })
      .from(account)
      .where(and(eq(account.userId, payload.userId), eq(account.provider, 'google')))
      .limit(1);

    const acc = accounts[0];
    if (!acc?.access_token) {
      throw new Error(`No Google access token found for user ${payload.userId}`);
    }

    const yt = createYouTubeClient({
      accessToken: acc.access_token,
      refreshToken: acc.refresh_token ?? undefined,
      // expires_at from NextAuth is epoch seconds; googleapis expects epoch ms
      expiresAt: acc.expires_at ? acc.expires_at * 1000 : undefined,
    });

    let pageToken: string | undefined;
    let totalInserted = 0;
    let page = 0;

    do {
      const result = await yt.listChannelVideos({
        uploadsPlaylistId: payload.uploadsPlaylistId,
        pageToken,
        maxResults: 50,
      });

      if (result.videos.length > 0) {
        const rows = result.videos.map((v) => ({
          id: crypto.randomUUID(),
          workspaceId: payload.workspaceId,
          channelId: payload.channelRecordId,
          youtubeVideoId: v.id,
          title: v.title,
          publishedAt: v.publishedAt ? new Date(v.publishedAt) : undefined,
          durationSeconds: v.durationIso8601 ? parseDuration(v.durationIso8601) : undefined,
          viewCount: v.viewCount ?? null,
          captionStatus: (v.captionStatus ?? 'unknown') as 'available' | 'auto_only' | 'none' | 'unknown',
          metadataFetchedAt: new Date(),
        }));

        await db.insert(video).values(rows).onConflictDoNothing();
        totalInserted += rows.length;
      }

      pageToken = result.nextPageToken;
      page++;
    } while (pageToken && page < MAX_PAGES);

    // Update channel's lastSyncedAt
    await db
      .update(channel)
      .set({ updatedAt: new Date() })
      .where(eq(channel.id, payload.channelRecordId));

    return { totalInserted, pages: page };
  },
});

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0', 10) * 3600)
    + (parseInt(m[2] ?? '0', 10) * 60)
    + parseInt(m[3] ?? '0', 10);
}
