import Link from 'next/link';
import type { ReactNode } from 'react';

import { Logo } from '@creatorcanon/ui';

import { NavList } from './NavList';

export type SidebarUser = {
  name?: string | null;
  email?: string | null;
  imageUrl?: string | null;
  plan?: string;
  hubsUsed?: number;
  hubsAllowed?: number;
};

export function Sidebar({ user, signOutSlot }: { user: SidebarUser; signOutSlot?: ReactNode }) {
  return (
    <aside className="hidden lg:flex flex-col bg-[var(--cc-sidebar)] text-[var(--cc-sidebar-ink-3)] px-3.5 py-4 gap-1 sticky top-0 h-screen overflow-hidden">
      <Link
        href="/app"
        aria-label="CreatorCanon home"
        className="flex items-center px-1.5 py-1 mb-2 text-[var(--cc-sidebar-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)] rounded-lg"
      >
        <Logo size={18} />
      </Link>

      <NavList />

      <div className="mt-auto flex flex-col gap-2">
        <AskAtlasFloat />
        <PlanCard user={user} signOutSlot={signOutSlot} />
      </div>
    </aside>
  );
}

function AskAtlasFloat() {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(0,232,138,0.18)] bg-[var(--cc-accent-wash)] px-3 py-2.5 text-[12px] text-[var(--cc-accent)]">
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--cc-accent)]" />
      Need help? Ask Atlas
    </div>
  );
}

function PlanCard({
  user,
  signOutSlot,
}: {
  user: SidebarUser;
  signOutSlot?: ReactNode;
}) {
  const initial = (user.name ?? user.email ?? 'U').slice(0, 1).toUpperCase();
  const plan = user.plan ?? 'Creator Plan';
  const hubsLabel =
    user.hubsAllowed != null
      ? `${plan} - ${user.hubsUsed ?? 0} of ${user.hubsAllowed} hubs`
      : plan;

  return (
    <div className="flex items-center gap-2.5 rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-sidebar-2)] px-3 py-2.5">
      {user.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.imageUrl}
          alt=""
          className="size-7 rounded-full object-cover shrink-0"
        />
      ) : (
        <span
          aria-hidden
          className="grid place-items-center size-7 rounded-full bg-[var(--cc-accent-wash)] text-[var(--cc-accent)] text-[12px] font-semibold shrink-0 ring-1 ring-[rgba(0,232,138,0.24)]"
        >
          {initial}
        </span>
      )}
      <div className="min-w-0 leading-tight flex-1">
        <p className="truncate text-white text-[12px] font-semibold">
          {user.name ?? user.email ?? 'Workspace user'}
        </p>
        <p className="truncate text-[var(--cc-sidebar-ink-4)] text-[11px]">{hubsLabel}</p>
      </div>
      {signOutSlot}
    </div>
  );
}
