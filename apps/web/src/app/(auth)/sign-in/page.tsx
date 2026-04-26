import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth, signIn } from '@creatorcanon/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in - CreatorCanon',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  const devBypassEnabled = process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
  const devBypassEmail = process.env.DEV_AUTH_BYPASS_EMAIL ?? '';

  const raw = searchParams?.callbackUrl;
  const callbackUrl =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/app';

  if (session?.user) redirect(callbackUrl);

  const errorCode = typeof searchParams?.error === 'string' ? searchParams.error : null;
  const isAccessDenied = errorCode === 'AccessDenied';

  async function signInWithGoogle() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  async function signInWithDevUser() {
    'use server';
    if (process.env.DEV_AUTH_BYPASS_ENABLED !== 'true') return;
    const email = process.env.DEV_AUTH_BYPASS_EMAIL ?? '';
    if (!email) throw new Error('DEV_AUTH_BYPASS_EMAIL is not configured.');
    await signIn('credentials', { email, redirectTo: callbackUrl });
  }

  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-ink-4)]">
        Workspace access
      </p>
      <h1 className="mt-2.5 text-[26px] font-semibold tracking-[-0.015em] text-[var(--cc-ink)]">
        Sign in to CreatorCanon
      </h1>
      <p className="mt-2.5 text-[13px] leading-[1.6] text-[var(--cc-ink-3)]">
        Use the Google account that owns or manages the YouTube channel you want to productize.
      </p>

      <div className="mt-5 rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 p-3.5">
        <p className="text-[13px] font-semibold text-[var(--cc-ink)]">Alpha access required</p>
        <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-4)]">
          Your Google account must be approved before sign-in succeeds.
        </p>
      </div>

      {errorCode ? (
        <div
          role="alert"
          className="mt-3 rounded-[10px] border border-[var(--cc-danger)]/40 bg-[var(--cc-danger-wash)] p-3.5"
        >
          <p className="text-[13px] font-semibold text-[var(--cc-danger)]">
            {isAccessDenied ? 'Not on the alpha allowlist' : 'Sign-in failed'}
          </p>
          <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-danger)]/80">
            {isAccessDenied
              ? 'This Google account is not approved for alpha yet.'
              : 'Your account may not have alpha access, or the sign-in was canceled.'}
          </p>
          <Link
            href="/request-access"
            className="mt-2.5 inline-flex text-[12px] font-semibold text-[var(--cc-danger)] underline underline-offset-2 hover:opacity-80"
          >
            Request access
          </Link>
        </div>
      ) : null}

      <form action={signInWithGoogle} className="mt-5">
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center gap-3 rounded-[8px] bg-[var(--cc-accent)] px-4 text-[14px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] transition hover:bg-[var(--cc-accent-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cc-canvas)]"
        >
          <GoogleG />
          Continue with Google
        </button>
      </form>

      {devBypassEnabled ? (
        <form action={signInWithDevUser} className="mt-2.5 space-y-1.5">
          <button
            type="submit"
            className="flex h-10 w-full items-center justify-center rounded-[8px] border border-dashed border-[var(--cc-rule)] bg-white px-4 text-[12px] font-semibold text-[var(--cc-ink-3)] transition hover:border-[var(--cc-ink-4)] hover:text-[var(--cc-ink)]"
          >
            Continue as local dev user
          </button>
          <p className="text-center text-[11px] text-[var(--cc-ink-4)]">
            Dev bypass for {devBypassEmail || 'configured local user'}.
          </p>
        </form>
      ) : null}

      <p className="mt-5 text-center text-[11px] leading-[1.5] text-[var(--cc-ink-4)]">
        By continuing, you agree to the{' '}
        <Link
          href="/terms"
          className="underline underline-offset-2 hover:text-[var(--cc-ink-3)]"
        >
          Terms
        </Link>{' '}
        and{' '}
        <Link
          href="/privacy"
          className="underline underline-offset-2 hover:text-[var(--cc-ink-3)]"
        >
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.8 8.8 0 0 0 2.68-6.62z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.92v2.33A9 9 0 0 0 9 18z"
        fill="#34A853"
      />
      <path d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.92a9 9 0 0 0 0 8.1l3.04-2.33z" fill="#FBBC05" />
      <path
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .92 4.95l3.04 2.33C4.67 5.16 6.66 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
