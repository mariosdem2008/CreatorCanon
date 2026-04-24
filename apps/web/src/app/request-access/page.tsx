import type { Metadata } from 'next';
import Link from 'next/link';

import { requestAccess } from './actions';

export const metadata: Metadata = {
  title: 'Request alpha access — CreatorCanon',
  description:
    'CreatorCanon is in private alpha. Request a seat and we will email you when your access is ready.',
};

export default function RequestAccessPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  const submitted = searchParams?.status === 'submitted';
  const invalid = searchParams?.status === 'invalid';

  return (
    <main className="mx-auto max-w-[540px] px-4 py-24">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        Private alpha
      </p>
      <h1 className="mt-3 font-serif text-[40px] leading-[1.08] tracking-[-0.025em]">
        Request alpha access
      </h1>
      <p className="mt-4 max-w-[55ch] text-ink-2">
        CreatorCanon is in private alpha. Leave the Google email that owns your
        YouTube channel and we&apos;ll email you when your seat is ready.
      </p>

      {submitted && (
        <div
          role="status"
          className="mt-8 rounded-md border border-sage/30 bg-sage/8 p-4 text-sm"
        >
          <p className="font-semibold text-sage-ink">Request received.</p>
          <p className="mt-1 text-ink-2">
            We&apos;ll email you when your seat is ready — no need to refresh.
          </p>
        </div>
      )}

      {!submitted && (
        <form action={requestAccess} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-semibold text-ink">
            Email
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
          {invalid && (
            <p role="alert" className="text-caption text-rose">
              Enter a valid email address.
            </p>
          )}
          <button
            type="submit"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 font-semibold text-paper transition hover:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          >
            Request access
          </button>
          <p className="text-xs text-ink-3">
            Already approved?{' '}
            <Link
              href="/sign-in"
              className="underline underline-offset-2 hover:text-ink-2"
            >
              Sign in →
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}
