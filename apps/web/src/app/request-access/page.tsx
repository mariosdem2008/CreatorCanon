import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Footer } from '@/components/marketing/Footer';
import { MarketingNav } from '@/components/marketing/MarketingNav';

import { requestAccess } from './actions';

export const metadata: Metadata = {
  title: 'Request alpha access — CreatorCanon',
  description:
    'CreatorCanon is in private alpha. Request a seat and we email you when your access is ready — usually within a few days.',
};

const TIMELINE: Array<{ n: string; title: string; body: string }> = [
  {
    n: '01',
    title: 'You leave your email',
    body: 'The Google address that owns your YouTube channel works best — it speeds up the review.',
  },
  {
    n: '02',
    title: 'We review fit',
    body: 'CreatorCanon is sharpened around business creators with a teaching archive. Most replies go out within a few business days.',
  },
  {
    n: '03',
    title: 'You get a seat',
    body: 'Approval lands in your inbox with a link to sign in, connect your channel, and generate your first hub.',
  },
];

export default function RequestAccessPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const submitted = searchParams?.status === 'submitted';
  const invalid = searchParams?.status === 'invalid';

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <MarketingNav />
      <main className="flex-1">
        <section className="border-b border-rule bg-paper">
          <div className="mx-auto grid max-w-[1180px] gap-12 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:py-24">
            <div className="min-w-0">
              <p className="text-eyebrow uppercase text-ink-4">Private alpha</p>
              <h1 className="mt-3 max-w-[640px] font-serif text-display-lg text-ink">
                Request alpha access.
              </h1>
              <p className="mt-5 max-w-[58ch] text-body-lg text-ink-2">
                CreatorCanon is invite-only while we tune the source-grounding pipeline with our
                first cohort. Leave the email that owns the YouTube channel you want to
                productize and we&apos;ll reply when your seat is ready.
              </p>

              <ol className="mt-12 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
                {TIMELINE.map((step) => (
                  <li key={step.n} className="flex flex-col gap-2 bg-paper p-6">
                    <span className="font-mono text-caption text-amber-ink">{step.n}</span>
                    <span className="text-heading-md text-ink">{step.title}</span>
                    <span className="text-body-sm text-ink-3">{step.body}</span>
                  </li>
                ))}
              </ol>

              <p className="mt-8 max-w-[60ch] text-body-sm text-ink-3">
                Already approved?{' '}
                <Link
                  href="/sign-in"
                  className="font-semibold text-ink underline-offset-4 hover:underline"
                >
                  Sign in →
                </Link>
              </p>
            </div>

            <aside
              aria-label="Alpha access form"
              className="rounded-2xl border border-rule bg-paper-warm p-6 shadow-1 lg:p-7"
            >
              <div className="text-eyebrow uppercase text-ink-4">Request a seat</div>
              <h2 className="mt-3 font-serif text-heading-lg text-ink">
                We&apos;ll reply by email — no surprise charges.
              </h2>

              {submitted ? (
                <div
                  role="status"
                  className="mt-6 rounded-md border border-sage/30 bg-sage/10 p-4 text-body-sm"
                >
                  <p className="font-semibold text-sage">Request received.</p>
                  <p className="mt-1 text-ink-2">
                    We&apos;ll email you when your seat is ready — no need to refresh.
                  </p>
                </div>
              ) : (
                <form action={requestAccess} className="mt-6 flex flex-col gap-3">
                  <label htmlFor="email" className="text-body-sm font-semibold text-ink">
                    Work email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-11 rounded-md border border-rule bg-paper px-3 text-body-sm text-ink shadow-1 focus:outline-none focus:ring-2 focus:ring-amber"
                  />
                  {invalid ? (
                    <p role="alert" className="text-caption text-rose">
                      Enter a valid email address.
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-md bg-ink px-5 text-body-sm font-semibold text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                  >
                    Request access
                    <Icon name="arrowRight" size={12} aria-hidden />
                  </button>
                  <p className="mt-1 text-caption text-ink-4">
                    We never publish, share, or sell your email. Used only to confirm alpha access.
                  </p>
                </form>
              )}

              <ul className="mt-7 space-y-3 border-t border-rule pt-5 text-body-sm text-ink-3">
                <li className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
                  $29 per generated hub during alpha.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
                  Read-only YouTube access — revoke any time.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber" aria-hidden />
                  No auto-publish. You approve every page.
                </li>
              </ul>
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
