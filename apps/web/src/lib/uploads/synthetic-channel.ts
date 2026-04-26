import { getDb } from '@creatorcanon/db';
import { channel } from '@creatorcanon/db/schema';

/**
 * Returns the deterministic ID of the synthetic per-workspace upload channel,
 * creating it lazily on first use via INSERT ... ON CONFLICT DO NOTHING.
 *
 * Pattern: `ch_uploads_<workspaceId>` — matches spec § 5.2.
 * Idempotent and concurrent-safe.
 */
export async function getOrCreateUploadChannel(workspaceId: string): Promise<string> {
  const id = `ch_uploads_${workspaceId}`;
  await getDb()
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
