'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const ITEMS: Array<{ href: string; label: string; description: string }> = [
  { href: '/app/settings', label: 'Overview', description: 'Workspace + profile' },
  { href: '/app/settings/source', label: 'Source', description: 'YouTube + sync state' },
  { href: '/app/settings/billing', label: 'Billing', description: 'Customer + ledger' },
  { href: '/app/settings/team', label: 'Team', description: 'Members + invites' },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Settings sections" className="space-y-1">
      {ITEMS.map((item) => {
        const active =
          item.href === '/app/settings'
            ? pathname === '/app/settings'
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-col gap-0.5 rounded-[10px] border px-3 py-2 transition',
              active
                ? 'border-[var(--cc-accent)]/40 bg-[var(--cc-accent-wash)] text-[var(--cc-ink)]'
                : 'border-[var(--cc-rule)] bg-[var(--cc-surface)] text-[var(--cc-ink-3)] hover:border-[var(--cc-ink-4)] hover:text-[var(--cc-ink)]',
            )}
          >
            <span className="text-[13px] font-semibold">{item.label}</span>
            <span
              className={cn(
                'text-[11px]',
                active ? 'text-[var(--cc-accent)]' : 'text-[var(--cc-ink-4)]',
              )}
            >
              {item.description}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
