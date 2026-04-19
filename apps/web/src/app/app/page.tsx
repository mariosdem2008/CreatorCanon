// Placeholder creator-app landing. Epic 2 (tickets 2.x) replaces this with
// the real shell (sidebar, channel overview, inventory). Ticket 0.7 only
// needs a protected target so the sign-in → callbackUrl flow has a landing.

import { auth, signOut } from '@atlas/auth';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Home',
};

export default async function AppHomePage() {
  const session = await auth();

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-lg space-y-6 rounded-lg border border-rule bg-paper-2 p-8">
        <h1 className="font-serif text-heading-md text-ink">Signed in</h1>
        <p className="text-body-md text-ink-3">
          Welcome back, {session?.user?.name ?? session?.user?.email}. Your
          creator workspace loads here once Epic 2 lands.
        </p>
        <dl className="space-y-1 text-caption text-ink-4">
          <div>
            <dt className="inline">User id: </dt>
            <dd className="inline font-mono">{session?.user?.id}</dd>
          </div>
          <div>
            <dt className="inline">Admin: </dt>
            <dd className="inline font-mono">
              {session?.user?.isAdmin ? 'true' : 'false'}
            </dd>
          </div>
        </dl>
        <form action={signOutAction}>
          <button
            type="submit"
            className="h-10 rounded-md border border-rule-strong px-4 text-body-sm font-medium text-ink transition hover:bg-paper-3"
          >
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
