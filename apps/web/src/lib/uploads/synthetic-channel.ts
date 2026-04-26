import { eq, getDb } from '@creatorcanon/db';
import { channel } from '@creatorcanon/db/schema';

/**
 * Returns the deterministic ID of the synthetic per-workspace upload channel,
 * creating it lazily on first use.
 *
 * Pattern: `ch_uploads_<workspaceId>` — matches spec § 5.2.
 */
export async function getOrCreateUploadChannel(workspaceId: string): Promise<string> {
  const id = `ch_uploads_${workspaceId}`;
  const db = getDb();
  const existing = await db
    .select({ id: channel.id })
    .from(channel)
    .where(eq(channel.id, id))
    .limit(1);
  if (existing[0]) return id;
  await db
    .insert(channel)
    .values({
      id,
      workspaceId,
      sourceKind: 'manual_upload',
      youtubeChannelId: null,
      title: 'Uploaded videos',
    })
    .onConflictDoNothing();
  return id;
}
