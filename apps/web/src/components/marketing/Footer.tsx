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
    <footer className="border-t border-rule bg-paper-warm">
      <div className="mx-auto max-w-[1140px] px-6 py-16">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo size={22} />
            <p className="mt-4 max-w-xs text-body-sm text-ink-3">
              Turn your videos into a premium business knowledge system — structured, cited, creator-owned.
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <div className="text-eyebrow uppercase text-ink-4">{col.title}</div>
              <ul className="mt-4 space-y-2.5 text-body-sm text-ink-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-rule pt-6 text-caption text-ink-4 sm:flex-row sm:items-center">
          <div>© {year} CreatorCanon. All rights reserved.</div>
          <div>hello@creatorcanon.com</div>
        </div>
      </div>
    </footer>
  );
}
