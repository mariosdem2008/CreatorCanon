import type { Metadata } from 'next';
import { Suspense } from 'react';
import type { ReactNode } from 'react';

import { PageviewTracker } from '@/components/providers/PageviewTracker';
import { PostHogProvider } from '@/components/providers/PostHogProvider';

import { geistMono, geistSans, jetbrainsMono, newsreader } from './fonts';

import '../styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'CreatorCanon',
    template: '%s | CreatorCanon',
  },
  description:
    'Turn your YouTube archive into a hosted knowledge hub — grounded, cited, creator-owned.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[var(--paper)] font-sans text-[var(--ink)] antialiased">
        <PostHogProvider>
          <Suspense fallback={null}>
            <PageviewTracker />
          </Suspense>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
