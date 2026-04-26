'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SVGProps } from 'react';

import { cn } from '@/lib/utils';

type IconKey = 'home' | 'videos' | 'pages' | 'publish' | 'settings';

const NAV: Array<{ href: string; label: string; icon: IconKey; matchPrefix?: string }> = [
  { href: '/app', label: 'Home', icon: 'home' },
  { href: '/app/library', label: 'Videos', icon: 'videos' },
  { href: '/app/projects', label: 'Pages', icon: 'pages', matchPrefix: '/app/projects' },
  { href: '/app/publish', label: 'Publish', icon: 'publish' },
  { href: '/app/settings', label: 'Settings', icon: 'settings', matchPrefix: '/app/settings' },
];

export function NavList() {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace navigation" className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active =
          item.href === '/app'
            ? pathname === '/app'
            : (item.matchPrefix
              ? pathname.startsWith(item.matchPrefix)
              : pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-2.5 rounded-[8px] px-2.5 py-2 text-[13px] transition-colors',
              active
                ? 'bg-[rgba(88,86,246,0.18)] text-white shadow-[inset_0_0_0_1px_rgba(88,86,246,0.4)]'
                : 'text-[var(--cc-sidebar-ink-3)] hover:bg-[rgba(255,255,255,0.04)] hover:text-white',
            )}
          >
            <Icon name={item.icon} className="size-3.5 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function Icon({ name, ...props }: { name: IconKey } & SVGProps<SVGSVGElement>) {
  const common = {
    viewBox: '0 0 16 16',
    fill: 'none',
    strokeWidth: 1.6,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M2.5 7L8 2.5 13.5 7v6a1 1 0 0 1-1 1h-3v-4h-3v4h-3a1 1 0 0 1-1-1V7Z" />
        </svg>
      );
    case 'videos':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="m7 6.5 3.5 1.8L7 10V6.5Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'pages':
      return (
        <svg {...common}>
          <path d="M3.5 2h6L13 5.5V14a0.5 0.5 0 0 1-.5.5h-9A.5.5 0 0 1 3 14V2.5A.5.5 0 0 1 3.5 2Z" />
          <path d="M9 2v4h4" />
        </svg>
      );
    case 'publish':
      return (
        <svg {...common}>
          <path d="M8 2v9" />
          <path d="m4.5 5.5 3.5-3.5 3.5 3.5" />
          <path d="M3 11.5v2A.5.5 0 0 0 3.5 14h9a.5.5 0 0 0 .5-.5v-2" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2" />
          <path d="M13 8a5 5 0 0 0-.1-1l1.4-1.1-1.5-2.6-1.6.7a5 5 0 0 0-1.7-1l-.2-1.7H6.7l-.2 1.7a5 5 0 0 0-1.7 1L3.2 3.3 1.7 5.9 3.1 7a5 5 0 0 0 0 2L1.7 10.1l1.5 2.6 1.6-.7a5 5 0 0 0 1.7 1l.2 1.7h2.6l.2-1.7a5 5 0 0 0 1.7-1l1.6.7 1.5-2.6L12.9 9c.06-.33.1-.66.1-1Z" />
        </svg>
      );
    default:
      return null;
  }
}
