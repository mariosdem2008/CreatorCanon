import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth, signOut } from '@creatorcanon/auth';
import { count, eq, getDb } from '@creatorcanon/db';
import { channel, video, workspaceMember } from '@creatorcanon/db/schema';

import { ConnectChannelForm } from './ConnectChannelForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

export default async function AppHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const db = getDb();
  const userId = session.user.id;

  // Resolve workspace
  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;

  // Resolve channel (may not exist yet)
  const channels = workspaceId
    ? await db
        .select()
        .from(channel)
        .where(eq(channel.workspaceId, workspaceId))
        .limit(1)
    : [];

  const ch = channels[0];

  // Video count
  const videoCountResult = ch
    ? await db.select({ n: count() }).from(video).where(eq(video.channelId, ch.id))
    : [];
  const videoCount = videoCountResult[0]?.n ?? 0;

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <main className="flex min-h-screen items-start justify-center bg-paper-studio px-4 py-8 sm:px-6 sm:py-16">
      <div className="w-full max-w-lg space-y-0 rounded-xl border border-rule bg-paper shadow-1">

        {ch ? (
          <>
            {/* Channel header */}
            <div className="flex items-center gap-3 border-b border-rule px-5 py-5 sm:gap-4 sm:px-8 sm:py-6">
              {ch.avatarUrl ? (
                <Image
                  src={ch.avatarUrl}
                  alt={ch.title ?? 'Channel'}
                  width={56}
                  height={56}
                  className="h-12 w-12 shrink-0 rounded-full ring-2 ring-rule sm:h-14 sm:w-14"
                  unoptimized
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-paper-3 text-body-md font-medium text-ink-3 sm:h-14 sm:w-14">
                  {ch.title?.slice(0, 2) ?? 'Ch'}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-serif text-heading-md text-ink truncate sm:text-heading-lg">
                  {ch.title}
                </h1>
                {ch.handle && (
                  <p className="mt-0.5 text-body-sm text-ink-4">{ch.handle}</p>
                )}
              </div>
            </div>

            {/* Channel snapshot stats — stack on mobile */}
            <div className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
              <div className="px-3 py-4 sm:px-6 sm:py-5">
                <p className="text-eyebrow uppercase tracking-widest text-ink-4 truncate">Subs</p>
                <p className="mt-1.5 font-serif text-heading-md text-ink sm:mt-2">
                  {ch.subsCount != null ? fmtNumber(ch.subsCount) : (
                    <span className="text-ink-4 text-body-md">—</span>
                  )}
                </p>
              </div>
              <div className="px-3 py-4 sm:px-6 sm:py-5">
                <p className="text-eyebrow uppercase tracking-widest text-ink-4 truncate">Videos</p>
                <p className="mt-1.5 font-serif text-heading-md text-ink sm:mt-2">
                  {ch.videoCount != null ? fmtNumber(ch.videoCount) : (
                    <span className="text-ink-4 text-body-md">—</span>
                  )}
                </p>
              </div>
              <div className="px-3 py-4 sm:px-6 sm:py-5">
                <p className="text-eyebrow uppercase tracking-widest text-ink-4 truncate">Synced</p>
                <p className="mt-1.5 font-serif text-heading-md text-ink sm:mt-2">
                  {fmtNumber(videoCount)}
                </p>
              </div>
            </div>

            {/* Primary action */}
            <div className="border-b border-rule px-5 py-5 sm:px-8 sm:py-6">
              {videoCount > 0 ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-body-sm text-ink-3">
                    Your library is ready. Select videos and build a knowledge hub.
                  </p>
                  <Link
                    href="/app/library"
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-5 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 sm:justify-start"
                  >
                    Browse library
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : (
                /* First-run: channel connected but nothing synced yet */
                <div className="space-y-4">
                  <div className="flex items-start gap-3 rounded-xl border border-amber/30 bg-amber-wash px-4 py-3">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-ink" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M8 5v4M8 10.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                    <div>
                      <p className="text-body-sm font-semibold text-amber-ink">Sync your video library</p>
                      <p className="mt-0.5 text-caption text-amber-ink/80 leading-relaxed">
                        Channel connected — reconnect to trigger a full sync of your videos.
                        {ch.videoCount != null && ` ${ch.videoCount.toLocaleString()} videos waiting.`}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-caption text-ink-4">
                      {ch.videoCount != null
                        ? `${ch.videoCount.toLocaleString()} videos available on YouTube`
                        : 'Video count unavailable yet — try reconnecting.'}
                    </p>
                    <Link
                      href="/app/alpha-guide"
                      className="text-caption text-ink-4 underline underline-offset-2 hover:text-ink"
                    >
                      How syncing works →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Connect channel state — first-run onboarding */}
            <div className="border-b border-rule px-5 py-6 sm:px-8 sm:py-8">
              <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
                Creator Studio
              </div>
              <h1 className="mt-2 font-serif text-heading-lg text-ink">
                Connect your channel
              </h1>
              <p className="mt-3 text-body-md text-ink-3 leading-relaxed">
                We&apos;ll pull your channel metadata and video list from YouTube
                using the account you signed in with.
              </p>
              {/* Onboarding steps hint */}
              <div className="mt-5 space-y-2">
                {(['Connect your YouTube channel', 'Pick source-ready videos', 'Configure and pay', 'Review, edit, publish'] as const).map((step, i) => (
                  <div key={step} className="flex items-center gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rule bg-paper-2 font-mono text-[10px] text-ink-4">
                      {i + 1}
                    </span>
                    <span className={`text-body-sm ${i === 0 ? 'font-medium text-ink' : 'text-ink-4'}`}>{step}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-b border-rule px-5 py-5 sm:px-8 sm:py-6">
              <ConnectChannelForm />
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <span className="text-caption text-ink-4 truncate max-w-[160px] sm:max-w-none">
              {session.user.name ?? session.user.email}
            </span>
            {session.user.isAdmin && (
              <span className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-[10px] text-ink-3">
                admin
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/app/alpha-guide"
              className="text-caption text-ink-4 underline decoration-rule underline-offset-2 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 rounded"
            >
              Alpha guide
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-caption text-ink-4 underline decoration-rule underline-offset-2 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 rounded"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

      </div>
    </main>
  );
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}
