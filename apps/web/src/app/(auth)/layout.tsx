import type { ReactNode } from 'react';
import Link from 'next/link';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col bg-paper">
      {/* Minimal top nav */}
      <header className="flex items-center justify-between border-b border-rule px-6 py-4">
        <Link
          href="/"
          className="text-body-sm text-ink-4 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 rounded"
          aria-label="Back to CreatorCanon homepage"
        >
          ← CreatorCanon
        </Link>
        <span className="rounded-full border border-amber/40 bg-amber-wash px-2.5 py-1 text-caption font-medium text-amber-ink">
          Private alpha
        </span>
      </header>

      {/* Card container */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-[400px]">
          <div className="rounded-2xl border border-rule bg-paper shadow-2 px-8 py-10 sm:px-10">
            {children}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-rule px-6 py-4 text-center">
        <p className="text-caption text-ink-5">
          CreatorCanon · Private Alpha · Invite-only access
        </p>
      </footer>
    </main>
  );
}
