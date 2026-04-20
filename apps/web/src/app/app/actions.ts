'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@creatorcanon/auth';
import { createYouTubeClient } from '@creatorcanon/adapters/youtube';
import { and, eq, getDb } from '@creatorcanon/db';
import { account, channel, video, workspaceMember } from '@creatorcanon/db/schema';

/** Max pages of 50 videos to fetch per sync (caps at 500 for alpha). */
const MAX_SYNC_PAGES = 10;

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0', 10) * 3600)
    + (parseInt(m[2] ?? '0', 10) * 60)
    + parseInt(m[3] ?? '0', 10);
}

async function syncChannelVideos(opts: {
  workspaceId: string;
  channelId: string;
  uploadsPlaylistId: string;
  userId: string;
}): Promise<void> {
  const db = getDb();

  const accounts = await db
    .select({ access_token: account.access_token, refresh_token: account.refresh_token, expires_at: account.expires_at })
    .from(account)
    .where(and(eq(account.userId, opts.userId), eq(account.provider, 'google')))
    .limit(1);

  const acc = accounts[0];
  if (!acc?.access_token) return;

  const yt = createYouTubeClient({
    accessToken: acc.access_token,
    refreshToken: acc.refresh_token ?? undefined,
    expiresAt: acc.expires_at ? acc.expires_at * 1000 : undefined,
  });

  let pageToken: string | undefined;
  let page = 0;

  do {
    const result = await yt.listChannelVideos({
      uploadsPlaylistId: opts.uploadsPlaylistId,
      pageToken,
      maxResults: 50,
    });

    if (result.videos.length > 0) {
      const rows = result.videos.map((v) => ({
        id: crypto.randomUUID(),
        workspaceId: opts.workspaceId,
        channelId: opts.channelId,
        youtubeVideoId: v.id,
        title: v.title,
        publishedAt: v.publishedAt ? new Date(v.publishedAt) : undefined,
        durationSeconds: v.durationIso8601 ? parseDuration(v.durationIso8601) : undefined,
        viewCount: v.viewCount ?? null,
        captionStatus: (v.captionStatus ?? 'unknown') as 'available' | 'auto_only' | 'none' | 'unknown',
        metadataFetchedAt: new Date(),
      }));

      await db.insert(video).values(rows).onConflictDoNothing();
    }

    pageToken = result.nextPageToken;
    page++;
  } while (pageToken && page < MAX_SYNC_PAGES);

  await db.update(channel).set({ updatedAt: new Date() }).where(eq(channel.id, opts.channelId));
}

export async function connectYouTubeChannel(
  prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  void prevState;
  void formData;

  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated' };

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) return { error: 'No workspace found' };

  // If channel already connected, just sync and revalidate.
  const existing = await db
    .select({ id: channel.id, uploadsPlaylistId: channel.uploadsPlaylistId })
    .from(channel)
    .where(eq(channel.workspaceId, workspaceId))
    .limit(1);

  if (existing.length > 0) {
    const ch = existing[0]!;
    if (ch.uploadsPlaylistId) {
      await syncChannelVideos({ workspaceId, channelId: ch.id, uploadsPlaylistId: ch.uploadsPlaylistId, userId });
    }
    revalidatePath('/app');
    return {};
  }

  const accounts = await db
    .select({
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      expires_at: account.expires_at,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.provider, 'google')))
    .limit(1);

  const acc = accounts[0];
  if (!acc?.access_token) return { error: 'No Google token — please sign in again' };

  const yt = createYouTubeClient({
    accessToken: acc.access_token,
    refreshToken: acc.refresh_token ?? undefined,
    expiresAt: acc.expires_at ? acc.expires_at * 1000 : undefined,
  });

  let channelInfo;
  try {
    channelInfo = await yt.listOwnChannel();
  } catch (err) {
    return { error: `YouTube API error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const channelId = crypto.randomUUID();
  await db.insert(channel).values({
    id: channelId,
    workspaceId,
    youtubeChannelId: channelInfo.id,
    title: channelInfo.title,
    handle: channelInfo.handle ?? null,
    description: channelInfo.description ?? null,
    subsCount: channelInfo.subscriberCount ?? null,
    videoCount: channelInfo.videoCount ?? null,
    uploadsPlaylistId: channelInfo.uploadsPlaylistId,
    country: channelInfo.country ?? null,
    avatarUrl: channelInfo.avatarUrl ?? null,
    metadataFetchedAt: new Date(),
  });

  // Sync videos inline — no worker required.
  await syncChannelVideos({
    workspaceId,
    channelId,
    uploadsPlaylistId: channelInfo.uploadsPlaylistId,
    userId,
  });

  revalidatePath('/app');
  return {};
}
