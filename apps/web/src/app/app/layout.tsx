import type { ReactNode } from 'react';
import { unstable_cache } from 'next/cache';

import { signOut } from '@creatorcanon/auth';
import { and, count, eq, getDb, ne } from '@creatorcanon/db';
import { inboxItem } from '@creatorcanon/db/schema';

import { AppShell } from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

// Cached per-workspace unread count. Re-runs at most every 30s, and the
// inbox actions (markInboxRead / archiveInbox) bust this via revalidateTag.
const getUnreadCount = unstable_cache(
  async (workspaceId: string) => {
    const db = getDb();
    const [row] = await db
      .select({ n: count() })
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.workspaceId, workspaceId),
          eq(inboxItem.status, 'unread'),
          ne(inboxItem.kind, 'system_notice'),
        ),
      );
    return row?.n ?? 0;
  },
  ['inbox-unread-count'],
  { revalidate: 30, tags: ['inbox-unread-count'] },
);

export default async function CreatorAppLayout({ children }: { children: ReactNode }) {
  const { session, workspaceId } = await requireWorkspace();
  const unreadCount = await getUnreadCount(workspaceId);

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <AppShell
      user={{
        name: session.user.name,
        email: session.user.email,
        imageUrl: session.user.image ?? null,
        plan: 'Creator Plan',
        hubsUsed: 0,
        hubsAllowed: 3,
      }}
      signOutSlot={
        <form action={signOutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            className="grid place-items-center size-7 rounded-md border border-white/10 bg-white/5 text-[var(--cc-sidebar-ink-3)] transition hover:bg-white/10 hover:text-white"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-3.5"
              aria-hidden
            >
              <path d="M9.5 2H4.5A1.5 1.5 0 0 0 3 3.5v9A1.5 1.5 0 0 0 4.5 14h5" />
              <path d="M11 11l3-3-3-3" />
              <path d="M14 8H6" />
            </svg>
          </button>
        </form>
      }
      unreadCount={unreadCount}
    >
      {children}
    </AppShell>
  );
}
