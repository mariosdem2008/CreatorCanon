import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth, signIn } from '@creatorcanon/auth';
import { Logo } from '@creatorcanon/ui';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sign in — CreatorCanon',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();
  const devBypassEnabled = process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
  const devBypassEmail = process.env.DEV_AUTH_BYPASS_EMAIL ?? '';

  // Guard against open-redirect: only accept same-origin relative paths.
  const raw = searchParams?.callbackUrl;
  const callbackUrl =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')
      ? raw
      : '/app';

  if (session?.user) redirect(callbackUrl);

  const errorCode = typeof searchParams?.error === 'string' ? searchParams.error : null;
  const hasError = errorCode != null;
  const isAccessDenied = errorCode === 'AccessDenied';

  async function signInWithGoogle() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  async function signInWithDevUser() {
    'use server';

    if (process.env.DEV_AUTH_BYPASS_ENABLED !== 'true') return;

    const email = process.env.DEV_AUTH_BYPASS_EMAIL ?? '';
    if (!email) {
      throw new Error('DEV_AUTH_BYPASS_EMAIL is not configured.');
    }

    await signIn('credentials', {
      email,
      redirectTo: callbackUrl,
    });
  }

  return (
    <div className="flex flex-col items-center gap-8 text-center">
      {/* Logo */}
      <div aria-hidden="true">
        <Logo />
      </div>

      {/* Heading */}
      <div className="space-y-2">
        <h1 className="font-serif text-heading-lg text-ink">
          Sign in to CreatorCanon
        </h1>
        <p className="text-body-sm text-ink-3 leading-relaxed">
          Use the Google account that owns your YouTube channel.
        </p>
      </div>

      {/* Alpha-only access notice */}
      <div className="w-full rounded-xl border border-rule bg-paper-2 px-4 py-3 text-left">
        <p className="text-body-sm font-semibold text-ink">Alpha access required</p>
        <p className="mt-1 text-caption text-ink-4 leading-relaxed">
          CreatorCanon is invite-only. Your Google account must be on the allowlist to sign in.
          If you received an invite, use that exact account.
        </p>
      </div>

      {/* Auth error */}
      {hasError && (
        <div
          className="flex w-full items-start gap-2.5 rounded-xl border border-rose/30 bg-rose/8 px-4 py-3 text-left"
          role="alert"
          aria-live="polite"
        >
          <svg
            className="mt-0.5 h-4 w-4 shrink-0 text-rose"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <p className="text-body-sm font-semibold text-rose">
              {isAccessDenied ? 'Not on the alpha allowlist' : 'Sign-in failed'}
            </p>
            <p className="mt-0.5 text-caption text-rose/80 leading-relaxed">
              {isAccessDenied ? (
                <>
                  This Google account isn&apos;t approved for alpha yet.{' '}
                  <a
                    href="/request-access"
                    className="underline underline-offset-2 font-medium hover:text-rose"
                  >
                    Request access →
                  </a>
                </>
              ) : (
                <>Your account may not have alpha access, or the sign-in was canceled. Try again or contact the team.</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Google sign-in */}
      <form action={signInWithGoogle} className="w-full">
        <GoogleSignInButton />
      </form>

      {/* Dev bypass */}
      {devBypassEnabled && (
        <form action={signInWithDevUser} className="w-full space-y-2">
          <button
            type="submit"
            className="flex h-10 w-full items-center justify-center gap-2.5 rounded-xl border border-dashed border-rule-strong bg-paper px-4 text-body-sm font-medium text-ink transition hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          >
            Continue as local dev user
          </button>
          <p className="text-caption text-ink-4">
            Dev bypass for {devBypassEmail || 'configured local user'}.{' '}
            <a
              href="/api/dev/reset-auth"
              className="underline underline-offset-2 hover:text-ink-3"
            >
              Reset session
            </a>
          </p>
        </form>
      )}

      {/* Legal */}
      <p className="text-caption text-ink-5">
        By continuing you agree to our{' '}
        <a
          href="/terms"
          className="underline underline-offset-2 hover:text-ink-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
        >
          Terms
        </a>{' '}
        and{' '}
        <a
          href="/privacy"
          className="underline underline-offset-2 hover:text-ink-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
        >
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

function GoogleSignInButton() {
  return (
    <button
      type="submit"
      className="group flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-rule-strong bg-paper px-4 text-body-sm font-medium text-ink shadow-1 transition hover:bg-paper-2 hover:shadow-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 active:scale-[0.99]"
      aria-label="Sign in with Google"
    >
      <GoogleG />
      <span>Continue with Google</span>
    </button>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92a8.8 8.8 0 0 0 2.68-6.62z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.92v2.33A9 9 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.92a9 9 0 0 0 0 8.1l3.04-2.33z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 0 0 .92 4.95l3.04 2.33C4.67 5.16 6.66 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
