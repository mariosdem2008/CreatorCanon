'use client';

import Link from 'next/link';
import * as React from 'react';

import { Logo, Icon } from '@atlas/ui';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function MarketingNav() {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-colors duration-200',
        scrolled
          ? 'border-rule bg-paper/85 backdrop-blur-md'
          : 'border-transparent bg-paper',
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1140px] items-center justify-between px-6">
        <Link href="/" className="inline-flex items-center" aria-label="Channel Atlas home">
          <Logo size={18} />
        </Link>

        <nav className="hidden items-center gap-8 text-body-sm text-ink-2 md:flex">
          <Link href="/pricing" className="transition-colors hover:text-ink">
            Pricing
          </Link>
          <Link href="/about" className="transition-colors hover:text-ink">
            About
          </Link>
          <Link href="/faq" className="transition-colors hover:text-ink">
            FAQ
          </Link>
          <Link href="/case-study" className="transition-colors hover:text-ink">
            Case study
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild variant="accent" size="sm">
            <Link href="/signup">
              Start a hub
              <Icon name="arrowRight" size={12} />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
