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
    <main className="flex min-h-screen items-start justify-center bg-paper-studio px-6 py-16">
      <div className="w-full max-w-lg space-y-0 rounded-xl border border-rule bg-paper shadow-1">

        {ch ? (
          <>
            {/* Channel header */}
            <div className="flex items-center gap-4 border-b border-rule px-8 py-6">
              {ch.avatarUrl ? (
                <Image
                  src={ch.avatarUrl}
                  alt={ch.title ?? 'Channel'}
                  width={56}
                  height={56}
                  className="h-14 w-14 shrink-0 rounded-full ring-2 ring-rule"
                  unoptimized
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-paper-3 text-body-md font-medium text-ink-3">
                  {ch.title?.slice(0, 2) ?? 'Ch'}
                </div>
              )}
              <div className="min-w-0">
                <h1 className="font-serif text-heading-lg text-ink truncate">
                  {ch.title}
                </h1>
                {ch.handle && (
                  <p className="mt-0.5 text-body-sm text-ink-4">{ch.handle}</p>
                )}
              </div>
            </div>

            {/* Channel snapshot stats */}
            <div className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
              <div className="px-6 py-5">
                <p className="text-eyebrow uppercase tracking-widest text-ink-4">Subscribers</p>
                <p className="mt-2 font-serif text-heading-md text-ink">
                  {ch.subsCount != null ? fmtNumber(ch.subsCount) : (
                    <span className="text-ink-4 text-body-md">—</span>
                  )}
                </p>
              </div>
              <div className="px-6 py-5">
                <p className="text-eyebrow uppercase tracking-widest text-ink-4">YouTube videos</p>
                <p className="mt-2 font-serif text-heading-md text-ink">
                  {ch.videoCount != null ? fmtNumber(ch.videoCount) : (
                    <span className="text-ink-4 text-body-md">—</span>
                  )}
                </p>
              </div>
              <div className="px-6 py-5">
                <p className="text-eyebrow uppercase tracking-widest text-ink-4">Synced</p>
                <p className="mt-2 font-serif text-heading-md text-ink">
                  {fmtNumber(videoCount)}
                </p>
              </div>
            </div>

            {/* Primary action */}
            <div className="px-8 py-6 border-b border-rule">
              {videoCount > 0 ? (
                <div className="flex items-center justify-between gap-4">
                  <p className="text-body-sm text-ink-3 max-w-xs">
                    Your library is ready. Select videos and build a knowledge hub.
                  </p>
                  <Link
                    href="/app/library"
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-ink px-5 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                  >
                    Browse library
                    <span aria-hidden="true">→</span>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-body-sm text-ink-3">
                    Channel metadata is connected. CreatorCanon will sync your video library
                    when you reconnect or trigger a resync.
                  </p>
                  <p className="text-caption text-ink-4">
                    {ch.videoCount != null
                      ? `${ch.videoCount.toLocaleString()} videos available on YouTube`
                      : 'No video count available yet'}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Connect channel state */}
            <div className="px-8 py-8 border-b border-rule">
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
            </div>
            <div className="px-8 py-6 border-b border-rule">
              <ConnectChannelForm />
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-8 py-4">
          <div className="flex items-center gap-3">
            <span className="text-caption text-ink-4">
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
              className="text-caption text-ink-4 underline decoration-rule transition hover:text-ink hover:decoration-ink-3"
            >
              Alpha guide
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-caption text-ink-4 underline decoration-rule transition hover:text-ink hover:decoration-ink-3"
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
