import Link from 'next/link';

import { Logo } from '@creatorcanon/ui';

export function Footer() {
  const year = new Date().getFullYear();

  const columns: Array<{ title: string; links: Array<{ label: string; href: string }> }> = [
    {
      title: 'Product',
      links: [
        { label: 'How it works', href: '/#how-it-works' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Case study', href: '/case-study' },
        { label: 'FAQ', href: '/faq' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '/about' },
        { label: 'Help', href: '/help' },
        { label: 'Contact', href: 'mailto:hello@creatorcanon.com' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { label: 'Privacy', href: '/privacy' },
        { label: 'Terms', href: '/terms' },
      ],
    },
  ];

  return (
    <footer className="border-t border-rule bg-paper-warm" aria-label="Site footer">
      <div className="mx-auto max-w-[1140px] px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <Link
              href="/"
              aria-label="CreatorCanon home"
              className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              <Logo size={22} />
            </Link>
            <p className="mt-4 max-w-xs text-body-sm text-ink-3">
              Turn your videos into a premium business knowledge system — structured, cited, creator-owned.
            </p>
            <a
              href="mailto:hello@creatorcanon.com"
              className="mt-4 inline-block text-body-sm text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
            >
              hello@creatorcanon.com
            </a>
          </div>

          {/* Link columns */}
          {columns.map((col) => (
            <nav key={col.title} aria-label={`${col.title} links`}>
              <div className="text-eyebrow uppercase text-ink-4">{col.title}</div>
              <ul className="mt-4 space-y-2.5 text-body-sm text-ink-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-rule pt-6 text-caption text-ink-4 sm:flex-row sm:items-center">
          <div>© {year} CreatorCanon. All rights reserved.</div>
          <div className="flex gap-4">
            <Link href="/privacy" className="transition-colors hover:text-ink-2">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-ink-2">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
