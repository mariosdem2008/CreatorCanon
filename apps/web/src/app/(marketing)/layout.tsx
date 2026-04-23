import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Footer } from '@/components/marketing/Footer';
import { MarketingNav } from '@/components/marketing/MarketingNav';

export const metadata: Metadata = {
  metadataBase: new URL('https://www.creatorcanon.com'),
  openGraph: {
    siteName: 'CreatorCanon',
    type: 'website',
    locale: 'en_US',
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: 'CreatorCanon — turn your videos into a premium business knowledge system',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@creatorcanon',
  },
};

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      {/* Skip navigation link for screen-reader / keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-paper focus:outline-none focus:ring-2 focus:ring-amber"
      >
        Skip to content
      </a>
      <MarketingNav />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
    </div>
  );
}
