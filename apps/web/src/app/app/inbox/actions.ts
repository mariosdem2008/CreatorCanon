'use server';

import { revalidatePath, revalidateTag } from 'next/cache';

import { and, eq, withDbRetry } from '@creatorcanon/db';
import { inboxItem } from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

async function setStatus(
  id: string,
  status: 'read' | 'archived',
): Promise<void> {
  const { db, workspaceId } = await requireWorkspace();
  const now = new Date();
  await withDbRetry(
    () =>
      db
        .update(inboxItem)
        .set({
          status,
          ...(status === 'read' ? { readAt: now } : { archivedAt: now }),
        })
        .where(
          and(eq(inboxItem.id, id), eq(inboxItem.workspaceId, workspaceId)),
        ),
    { label: `inbox:${status}` },
  );
  revalidatePath('/app/inbox');
  revalidateTag('inbox-unread-count');
}

export async function markInboxRead(formData: FormData): Promise<void> {
  const id = (formData.get('id') as string | null)?.trim();
  if (!id) throw new Error('Missing inbox item id.');
  await setStatus(id, 'read');
}

export async function archiveInbox(formData: FormData): Promise<void> {
  const id = (formData.get('id') as string | null)?.trim();
  if (!id) throw new Error('Missing inbox item id.');
  await setStatus(id, 'archived');
}
