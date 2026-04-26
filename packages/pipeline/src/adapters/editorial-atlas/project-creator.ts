import { eq } from '@creatorcanon/db';
import { channel } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';

export async function projectCreator(input: { workspaceId: string; db: AtlasDb }) {
  const rows = await input.db
    .select()
    .from(channel)
    .where(eq(channel.workspaceId, input.workspaceId))
    .limit(1);
  const c = rows[0];
  return {
    name: c?.title ?? 'Unnamed creator',
    handle: c?.handle ?? c?.youtubeChannelId ?? 'unknown',
    avatarUrl: c?.avatarUrl ?? '',
    bio: c?.description ?? '',
    youtubeChannelUrl: c?.youtubeChannelId
      ? `https://www.youtube.com/channel/${c.youtubeChannelId}`
      : '',
  };
}
