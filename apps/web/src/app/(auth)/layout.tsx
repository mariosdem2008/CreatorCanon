import type { ReactNode } from 'react';
import Link from 'next/link';

import { Logo } from '@creatorcanon/ui';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--cc-canvas)] text-[var(--cc-ink)]">
      <header className="flex items-center justify-between border-b border-[var(--cc-rule)] bg-[var(--cc-surface)]/80 px-5 py-3.5 backdrop-blur">
        <Link
          href="/"
          aria-label="Back to CreatorCanon homepage"
          className="flex items-center rounded-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)]"
        >
          <Logo size={18} />
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--cc-accent)]/30 bg-[var(--cc-accent-wash)] px-2.5 py-1 text-[11px] font-semibold text-[var(--cc-accent)]">
          <span aria-hidden className="size-1.5 rounded-full bg-[var(--cc-accent)]" />
          Private alpha
        </span>
      </header>

      <div className="grid min-h-[calc(100vh-58px)] lg:grid-cols-[minmax(0,1fr)_460px]">
        <section className="hidden border-r border-[var(--cc-rule)] bg-[var(--cc-surface)] px-10 py-12 lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-ink-4)]">
              Agentic creator operations
            </p>
            <h1 className="mt-3 max-w-2xl text-[44px] font-semibold leading-[1.05] tracking-[0] text-[var(--cc-ink)]">
              Turn a video archive into a source-grounded knowledge product.
            </h1>
            <p className="mt-5 max-w-xl text-[14px] leading-[1.65] text-[var(--cc-ink-3)]">
              CreatorCanon maps source readiness, drafts cited pages, tracks generation, and
              keeps publishing under creator approval.
            </p>
          </div>

          <div className="grid gap-2.5">
            {[
              ['Source-aware', 'YouTube videos become reviewable, cited source material.'],
              ['Human approved', 'Drafts, edits, and releases stay under creator control.'],
              ['Productized', 'Published hubs are public knowledge products, not internal dashboards.'],
            ].map(([title, body]) => (
              <div
                key={title}
                className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 p-3.5"
              >
                <p className="text-[13px] font-semibold text-[var(--cc-ink)]">{title}</p>
                <p className="mt-0.5 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-[420px] rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-6 shadow-[var(--cc-shadow-2)] sm:p-8">
            {children}
          </div>
        </section>
      </div>
    </main>
  );
}
