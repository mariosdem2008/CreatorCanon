'use client';

import Link from 'next/link';
import * as React from 'react';

import { Logo, Icon } from '@creatorcanon/ui';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'About', href: '/about' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Case study', href: '/case-study' },
] as const;

export function MarketingNav() {
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close mobile menu on route change (any click)
  const closeMobile = () => setMobileOpen(false);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-colors duration-200',
        scrolled
          ? 'border-rule bg-paper/85 backdrop-blur-md'
          : 'border-transparent bg-paper',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          aria-label="CreatorCanon home"
        >
          <Logo size={22} />
        </Link>

        {/* Desktop nav */}
        <nav aria-label="Site navigation" className="hidden items-center gap-8 text-body-sm text-ink-2 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant="accent" size="sm">
            <Link href="/sign-in">
              <span className="sm:hidden">Start</span>
              <span className="hidden sm:inline">Start a hub</span>
              <Icon name="arrowRight" size={12} />
            </Link>
          </Button>

          {/* Mobile menu toggle */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded p-2 text-ink-3 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber md:hidden"
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen((o) => !o)}
          >
            <Icon name={mobileOpen ? 'x' : 'menu'} size={18} />
          </button>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          aria-label="Mobile navigation"
          className="border-t border-rule bg-paper px-4 pb-5 pt-3 md:hidden"
        >
          <ul className="space-y-1">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={closeMobile}
                  className="block rounded px-3 py-2.5 text-body-md text-ink-2 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="mt-3 border-t border-rule pt-3">
              <Link
                href="/sign-in"
                onClick={closeMobile}
                className="block rounded px-3 py-2.5 text-body-md text-ink-2 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
