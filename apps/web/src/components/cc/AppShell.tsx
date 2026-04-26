import type { ReactNode } from 'react';

import { NotificationBell } from './NotificationBell';
import { Sidebar, type SidebarUser } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({
  user,
  signOutSlot,
  unreadCount = 0,
  children,
}: {
  user: SidebarUser;
  signOutSlot?: ReactNode;
  unreadCount?: number;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--cc-canvas)] text-[var(--cc-ink)]">
      <div className="grid min-h-screen lg:grid-cols-[232px_minmax(0,1fr)]">
        <Sidebar user={user} signOutSlot={signOutSlot} />
        <div className="flex min-w-0 flex-col">
          <TopBar bell={<NotificationBell unreadCount={unreadCount} />} />
          <main className="flex-1 px-5 py-6 sm:px-6 lg:px-7">
            <div className="max-w-[1240px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
