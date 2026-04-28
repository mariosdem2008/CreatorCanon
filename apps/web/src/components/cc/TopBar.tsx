'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

type RouteMeta = { crumb: string; title: string };

const ROUTE_TABLE: Array<{ test: (path: string) => boolean; meta: RouteMeta }> = [
  { test: (p) => p === '/app', meta: { crumb: 'Home', title: 'Welcome' } },
  { test: (p) => p === '/app/library', meta: { crumb: 'Videos', title: 'Source library' } },
  { test: (p) => p === '/app/projects', meta: { crumb: 'Pages', title: 'All projects' } },
  { test: (p) => p === '/app/projects/new', meta: { crumb: 'Pages', title: 'New project' } },
  { test: (p) => /^\/app\/projects\/[^/]+\/review$/.test(p), meta: { crumb: 'Pages', title: 'Review' } },
  { test: (p) => /^\/app\/projects\/[^/]+\/pages$/.test(p), meta: { crumb: 'Pages', title: 'Draft pages' } },
  { test: (p) => /^\/app\/projects\/[^/]+\/pages\/[^/]+$/.test(p), meta: { crumb: 'Pages', title: 'Edit page' } },
  { test: (p) => /^\/app\/projects\/[^/]+$/.test(p), meta: { crumb: 'Pages', title: 'Project' } },
  { test: (p) => p === '/app/configure', meta: { crumb: 'Pages', title: 'Configure hub' } },
  { test: (p) => p === '/app/checkout', meta: { crumb: 'Pages', title: 'Checkout' } },
  { test: (p) => p === '/app/publish', meta: { crumb: 'Publish', title: 'Publish' } },
  { test: (p) => p === '/app/inbox', meta: { crumb: 'Inbox', title: 'Approval inbox' } },
  { test: (p) => p === '/app/settings', meta: { crumb: 'Settings', title: 'Overview' } },
  { test: (p) => p === '/app/settings/source', meta: { crumb: 'Settings', title: 'Source' } },
  { test: (p) => p === '/app/settings/billing', meta: { crumb: 'Settings', title: 'Billing' } },
  { test: (p) => p === '/app/settings/team', meta: { crumb: 'Settings', title: 'Team' } },
];

const FALLBACK: RouteMeta = { crumb: 'Workspace', title: 'CreatorCanon' };

function metaFor(pathname: string): RouteMeta {
  return ROUTE_TABLE.find((r) => r.test(pathname))?.meta ?? FALLBACK;
}

export function TopBar({ bell }: { bell?: ReactNode }) {
  const pathname = usePathname() ?? '/app';
  const { crumb, title } = metaFor(pathname);

  return (
    <header
      className="sticky top-0 z-30 flex h-[50px] items-center justify-between border-b border-[var(--cc-rule)] bg-[rgba(3,5,7,0.82)] px-6 backdrop-blur"
      role="banner"
    >
      <p className="text-[12px] text-[var(--cc-ink-3)]">
        {crumb} <span className="mx-1.5 text-[var(--cc-ink-4)]">/</span>
        <strong className="font-semibold text-[var(--cc-ink)]">{title}</strong>
      </p>
      <div className="flex items-center gap-2">
        <AtlasPill />
        {bell}
      </div>
    </header>
  );
}

function AtlasPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--cc-ink)]">
      <span aria-hidden className="size-2 rotate-45 rounded-[2px] bg-[var(--cc-accent)]" />
      Atlas
    </span>
  );
}
