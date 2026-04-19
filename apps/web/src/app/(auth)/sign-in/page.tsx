import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { auth, signIn } from '@atlas/auth';
import { Logo } from '@atlas/ui';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const session = await auth();

  // Guard against open-redirect: only accept same-origin relative paths.
  const raw = searchParams?.callbackUrl;
  const callbackUrl =
    typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//')
      ? raw
      : '/app';

  if (session?.user) redirect(callbackUrl);

  async function signInWithGoogle() {
    'use server';
    await signIn('google', { redirectTo: callbackUrl });
  }

  return (
    <div className="flex flex-col items-center gap-10 text-center">
      <Logo />

      <div className="space-y-3">
        <h1 className="font-serif text-heading-lg text-ink">
          Sign in to Channel Atlas
        </h1>
        <p className="text-body-md text-ink-3">
          Use the Google account that owns your YouTube channel.
        </p>
      </div>

      {searchParams?.error != null && (
        <p className="text-body-sm text-[var(--rose)]" role="alert">
          Something went wrong. Please try again.
        </p>
      )}

      <form action={signInWithGoogle} className="w-full">
        <button
          type="submit"
          className="flex h-11 w-full items-center justify-center gap-3 rounded-md border border-rule-strong bg-paper-2 px-4 text-body-md font-medium text-ink transition hover:bg-paper-3"
        >
          <GoogleG />
          Continue with Google
        </button>
      </form>

      <p className="text-caption text-ink-4">
        By continuing you agree to our{' '}
        <a href="/terms" className="underline">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy" className="underline">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
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
