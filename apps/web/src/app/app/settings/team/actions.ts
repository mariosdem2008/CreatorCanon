'use server';

import { revalidatePath } from 'next/cache';

import { withDbRetry } from '@creatorcanon/db';
import { allowlistEmail } from '@creatorcanon/db/schema';

import { requireWorkspace } from '@/lib/workspace';

/**
 * Owner-only invite action. Drops a row into `allowlist_email` keyed to the
 * inviter so the invitee can complete Google sign-in. Approval is auto-true
 * because the workspace owner is consenting.
 *
 * Roles + workspace_member provisioning happen on first sign-in via the
 * existing `events.signIn` hook (which auto-creates a workspace+membership
 * if the user has none). Multi-workspace invites need a follow-up endpoint.
 */
export async function inviteByEmail(formData: FormData): Promise<void> {
  const { db, role, userId } = await requireWorkspace();
  if (role !== 'owner') {
    throw new Error('Only workspace owners can invite teammates.');
  }

  const raw = (formData.get('email') as string | null)?.trim().toLowerCase();
  if (!raw || !raw.includes('@') || raw.length < 5) {
    throw new Error('Enter a valid email address.');
  }

  await withDbRetry(
    () =>
      db
        .insert(allowlistEmail)
        .values({
          email: raw,
          approved: true,
          approvedAt: new Date(),
          invitedByUserId: userId,
          note: 'Invited from /app/settings/team',
        })
        .onConflictDoNothing(),
    { label: 'settings:invite-by-email' },
  );

  revalidatePath('/app/settings/team');
}
