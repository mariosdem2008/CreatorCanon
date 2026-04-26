import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { eq, getDb } from '@creatorcanon/db';
import { workspaceMember } from '@creatorcanon/db/schema';

export async function requireWorkspace() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const db = getDb();
  const memberships = await db
    .select({
      workspaceId: workspaceMember.workspaceId,
      role: workspaceMember.role,
    })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, session.user.id))
    .limit(1);

  const membership = memberships[0];
  if (!membership?.workspaceId) redirect('/sign-in');

  return {
    db,
    session,
    userId: session.user.id,
    workspaceId: membership.workspaceId,
    role: membership.role,
    isAdmin: Boolean(session.user.isAdmin),
  };
}
