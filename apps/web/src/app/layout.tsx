import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import '../styles/globals.css';

export const metadata: Metadata = {
  title: 'Channel Atlas',
  description:
    'Turn your YouTube archive into a hosted knowledge hub — grounded, cited, creator-owned.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
