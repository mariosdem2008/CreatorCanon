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
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-16">
      <div className="w-full max-w-lg space-y-6 rounded-lg border border-rule bg-paper-2 p-8">

        {ch ? (
          <>
            <div className="flex items-center gap-4">
              {ch.avatarUrl && (
                <Image
                  src={ch.avatarUrl}
                  alt={ch.title ?? 'Channel'}
                  width={48}
                  height={48}
                  className="rounded-full"
                  unoptimized
                />
              )}
              <div>
                <h1 className="font-serif text-heading-md text-ink">
                  {ch.title}
                </h1>
                {ch.handle && (
                  <p className="text-body-sm text-ink-4">{ch.handle}</p>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-3 gap-4 rounded-md border border-rule bg-paper p-4 text-center">
              <div>
                <dt className="text-caption text-ink-4">Subscribers</dt>
                <dd className="mt-1 font-mono text-body-md text-ink">
                  {ch.subsCount != null ? fmtNumber(ch.subsCount) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-4">YouTube videos</dt>
                <dd className="mt-1 font-mono text-body-md text-ink">
                  {ch.videoCount != null ? fmtNumber(ch.videoCount) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-4">Synced</dt>
                <dd className="mt-1 font-mono text-body-md text-ink">
                  {fmtNumber(videoCount)}
                </dd>
              </div>
            </dl>

            {videoCount > 0 ? (
              <Link
                href="/app/library"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
              >
                Browse library ({fmtNumber(videoCount)} videos) →
              </Link>
            ) : (
              <p className="text-body-sm text-ink-3">
                Channel metadata is connected and CreatorCanon will sync your video
                library inline when you reconnect or resync this source.
              </p>
            )}
          </>
        ) : (
          <>
            <h1 className="font-serif text-heading-md text-ink">
              Connect your channel
            </h1>
            <p className="text-body-md text-ink-3">
              We&apos;ll pull your channel metadata and video list from YouTube
              using the account you signed in with.
            </p>
            <ConnectChannelForm />
          </>
        )}

        <hr className="border-rule" />

        <Link
          href="/app/alpha-guide"
          className="inline-flex text-body-sm text-ink-3 underline transition hover:text-ink"
        >
          Private alpha guide
        </Link>

        <div className="flex items-center justify-between text-caption text-ink-4">
          <span>
            {session.user.name ?? session.user.email}
            {session.user.isAdmin && (
              <span className="ml-2 rounded bg-paper-3 px-1.5 py-0.5 font-mono text-[10px]">
                admin
              </span>
            )}
          </span>
          <form action={signOutAction}>
            <button type="submit" className="underline hover:text-ink-2">
              Sign out
            </button>
          </form>
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
