'use server';

import { revalidatePath } from 'next/cache';

import { eq, withDbRetry } from '@creatorcanon/db';
import { youtubeConnection } from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

/**
 * Owner-only YouTube disconnect. Marks the connection row as `revoked` so the
 * worker stops trying to use it; we keep the row (not delete) so audit logs
 * can correlate. Token decryption / Google revoke API call lands when the
 * worker layer gets the matching task; for now this is the user-visible "off
 * switch" the settings page advertises.
 */
export async function disconnectYouTube(): Promise<void> {
  const { db, workspaceId, role } = await requireWorkspace();
  if (role !== 'owner') {
    throw new Error('Only workspace owners can disconnect the source.');
  }

  await withDbRetry(
    () =>
      db
        .update(youtubeConnection)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(eq(youtubeConnection.workspaceId, workspaceId)),
    { label: 'settings:disconnect-youtube' },
  );

  revalidatePath('/app/settings/source');
  revalidatePath('/app');
}

/**
 * Bumps `last_synced_at` to "now" so the resync scheduler picks the workspace
 * up on its next pass. The actual fetch happens in the worker; this is the
 * "request a resync" surface, not the resync itself. No-op if nothing is
 * connected.
 */
export async function requestSourceResync(): Promise<void> {
  const { db, workspaceId } = await requireWorkspace();

  await withDbRetry(
    () =>
      db
        .update(youtubeConnection)
        .set({ updatedAt: new Date() })
        .where(eq(youtubeConnection.workspaceId, workspaceId)),
    { label: 'settings:request-resync' },
  );

  revalidatePath('/app/settings/source');
}
