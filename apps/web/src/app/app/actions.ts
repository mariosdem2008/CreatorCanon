'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '@atlas/auth';
import { createYouTubeClient } from '@atlas/adapters/youtube';
import { and, eq, getDb } from '@atlas/db';
import { account, channel, workspaceMember } from '@atlas/db/schema';

export async function connectYouTubeChannel(): Promise<{ error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not authenticated' };

  const db = getDb();
  const userId = session.user.id;

  // Find the user's workspace.
  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) return { error: 'No workspace found' };

  // Check if a channel is already connected.
  const existing = await db
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.workspaceId, workspaceId))
    .limit(1);

  if (existing.length > 0) {
    revalidatePath('/app');
    return {};
  }

  // Get the Google OAuth access token stored by NextAuth.
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
  } catch {
    return { error: 'Could not reach YouTube. Make sure this Google account owns a YouTube channel.' };
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

  revalidatePath('/app');
  return {};
}
