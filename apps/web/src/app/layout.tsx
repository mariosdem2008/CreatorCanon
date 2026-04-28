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
    'Turn your YouTube archive into a hosted knowledge hub - grounded, cited, creator-owned.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  icons: {
    icon: [
      { url: '/brand/favicon.svg', type: 'image/svg+xml' },
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
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
