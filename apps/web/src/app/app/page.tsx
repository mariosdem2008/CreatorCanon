import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth, signOut } from '@creatorcanon/auth';
import { count, eq, getDb } from '@creatorcanon/db';
import { channel, video, workspaceMember } from '@creatorcanon/db/schema';

import { ConnectChannelForm } from './ConnectChannelForm';
import { DashboardCard } from './DashboardCard';
import { StepList } from './StepList';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home' };

const ONBOARDING_STEPS = [
  {
    title: 'Connect your YouTube channel',
    detail: 'Verify the workspace against the Google account that owns or manages the channel.',
  },
  {
    title: 'Review the imported library',
    detail: 'Pick focused, source-ready videos before you configure the hub.',
  },
  {
    title: 'Configure, pay, and publish',
    detail: 'Set output preferences, run generation, then review the draft before release.',
  },
] as const;

export default async function AppHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;

  const channels = workspaceId
    ? await db.select().from(channel).where(eq(channel.workspaceId, workspaceId)).limit(1)
    : [];

  const ch = channels[0];

  const videoCountResult = ch
    ? await db.select({ n: count() }).from(video).where(eq(video.channelId, ch.id))
    : [];
  const videoCount = videoCountResult[0]?.n ?? 0;

  async function signOutAction() {
    'use server';
    await signOut({ redirectTo: '/' });
  }

  return (
    <main className="min-h-screen bg-paper-studio px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-[32px] border border-rule bg-paper shadow-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_left,rgba(196,154,68,0.18),transparent_38%),radial-gradient(circle_at_top_right,rgba(21,25,33,0.10),transparent_34%)]" />

          <div className="relative grid gap-6 px-5 py-5 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1.45fr)_320px]">
            <div className="space-y-6">
              <section className="overflow-hidden rounded-[28px] border border-rule bg-paper-2/80">
                <div className="border-b border-rule/80 px-5 py-5 sm:px-6 sm:py-6">
                  <div className="mb-2 text-eyebrow uppercase tracking-widest text-ink-4">
                    Authenticated workspace
                  </div>
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                      <h1 className="font-serif text-heading-lg text-ink sm:text-display-sm">
                        {ch ? 'Your channel cockpit' : 'Bring your channel into CreatorCanon'}
                      </h1>
                      <p className="mt-3 text-body-md leading-7 text-ink-3">
                        {ch
                          ? 'The channel is connected. Use this workspace to verify sync status, review imported inventory, and move into hub configuration.'
                          : 'Start with a channel connection. Once metadata and videos land, the rest of the workflow becomes a guided build instead of a blank dashboard.'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href="/app/alpha-guide"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-rule bg-paper px-4 text-body-sm font-medium text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                      >
                        Open alpha guide
                      </Link>
                      {ch && videoCount > 0 ? (
                        <Link
                          href="/app/library"
                          className="inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                        >
                          Browse library
                        </Link>
                      ) : null}
                      <Link
                        href="/app/hubs"
                        className="inline-flex h-10 items-center justify-center rounded-xl border border-rule bg-paper px-4 text-body-sm font-medium text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                      >
                        My hubs →
                      </Link>
                    </div>
                  </div>
                </div>

                {ch ? (
                  <div className="space-y-6 px-5 py-5 sm:px-6 sm:py-6">
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        {ch.avatarUrl ? (
                          <Image
                            src={ch.avatarUrl}
                            alt={ch.title ?? 'Channel'}
                            width={72}
                            height={72}
                            className="h-16 w-16 shrink-0 rounded-full ring-2 ring-rule sm:h-[72px] sm:w-[72px]"
                            unoptimized
                          />
                        ) : (
                          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-paper text-body-md font-medium text-ink-3 ring-2 ring-rule sm:h-[72px] sm:w-[72px]">
                            {ch.title?.slice(0, 2) ?? 'Ch'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="inline-flex items-center rounded-full border border-emerald/30 bg-emerald/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                            Channel connected
                          </div>
                          <h2 className="mt-3 truncate font-serif text-heading-lg text-ink">
                            {ch.title}
                          </h2>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-4">
                            {ch.handle ? <span>{ch.handle}</span> : null}
                            <span>Workspace ready for import and review</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 lg:w-[320px]">
                        <StatusPill
                          label="Library state"
                          value={videoCount > 0 ? 'Synced' : 'Needs sync'}
                          tone={videoCount > 0 ? 'success' : 'warning'}
                        />
                        <StatusPill
                          label="Next move"
                          value={videoCount > 0 ? 'Select videos' : 'Reconnect channel'}
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <StatCard label="Subscribers" value={ch.subsCount != null ? fmtNumber(ch.subsCount) : '--'} />
                      <StatCard label="YouTube videos" value={ch.videoCount != null ? fmtNumber(ch.videoCount) : '--'} />
                      <StatCard label="Synced videos" value={fmtNumber(videoCount)} />
                      <StatCard label="Coverage" value={videoCount > 0 ? pct(videoCount, ch.videoCount) : '0%'} />
                    </div>

                    {videoCount > 0 ? (
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="rounded-[24px] border border-rule bg-paper px-5 py-5">
                          <p className="text-eyebrow uppercase tracking-widest text-ink-4">
                            Ready to build
                          </p>
                          <h3 className="mt-2 font-serif text-heading-md text-ink">
                            Your imported library is ready for curation
                          </h3>
                          <p className="mt-3 max-w-2xl text-body-md leading-7 text-ink-3">
                            Move into the library to select source-ready videos, shape the scope,
                            and hand off a cleaner input set to configuration.
                          </p>
                        </div>
                        <div className="rounded-[24px] border border-rule bg-paper px-5 py-5">
                          <p className="text-eyebrow uppercase tracking-widest text-ink-4">
                            Suggested next step
                          </p>
                          <p className="mt-2 text-body-sm leading-6 text-ink-3">
                            Start with a focused batch of videos rather than the full archive for a
                            tighter first hub.
                          </p>
                          <Link
                            href="/app/library"
                            className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                          >
                            Review source library
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                        <div className="rounded-[24px] border border-amber/30 bg-amber-wash/60 px-5 py-5">
                          <p className="text-eyebrow uppercase tracking-widest text-amber-ink/80">
                            Sync needed
                          </p>
                          <h3 className="mt-2 font-serif text-heading-md text-amber-ink">
                            Reconnect to trigger the first full video import
                          </h3>
                          <p className="mt-3 text-body-md leading-7 text-amber-ink/80">
                            The workspace sees the channel, but the library has not landed yet.
                            Reconnecting refreshes access and kicks off the catalog sync.
                            {ch.videoCount != null
                              ? ` ${ch.videoCount.toLocaleString()} videos are available upstream.`
                              : ''}
                          </p>
                        </div>
                        <div className="rounded-[24px] border border-rule bg-paper px-5 py-5">
                          <p className="text-eyebrow uppercase tracking-widest text-ink-4">
                            What to expect
                          </p>
                          <p className="mt-2 text-body-sm leading-6 text-ink-3">
                            Once the import completes, this dashboard changes from setup mode to a
                            curation workspace with library access.
                          </p>
                          <Link
                            href="/app/alpha-guide"
                            className="mt-4 inline-flex rounded text-body-sm font-medium text-ink underline decoration-rule underline-offset-4 transition hover:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                          >
                            Review the alpha workflow
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-6 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1.1fr)_360px]">
                    <div className="space-y-5">
                      <div className="max-w-2xl">
                        <p className="text-eyebrow uppercase tracking-widest text-ink-4">
                          First run
                        </p>
                        <h2 className="mt-2 font-serif text-heading-lg text-ink">
                          Connect a channel and let the workspace populate itself
                        </h2>
                        <p className="mt-3 text-body-md leading-7 text-ink-3">
                          We will pull channel metadata and the video inventory tied to the Google
                          account you signed in with. After that, the product flow switches from
                          setup into selection and configuration.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <InfoTile
                          title="1. Verify ownership"
                          body="The Google session needs channel access so the workspace resolves the right source."
                        />
                        <InfoTile
                          title="2. Import the archive"
                          body="Metadata arrives first, then the video list becomes available for selection."
                        />
                        <InfoTile
                          title="3. Start the hub build"
                          body="Once videos are in place, configuration and checkout become available."
                        />
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-rule bg-paper p-5 shadow-1 sm:p-6">
                      <p className="text-eyebrow uppercase tracking-widest text-ink-4">
                        Connect channel
                      </p>
                      <h3 className="mt-2 font-serif text-heading-md text-ink">
                        Set up the workspace source
                      </h3>
                      <p className="mt-3 text-body-sm leading-6 text-ink-3">
                        This uses the signed-in Google account and does not change any later steps.
                      </p>
                      <div className="mt-5">
                        <ConnectChannelForm />
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-6">
              <DashboardCard eyebrow="Progress" title={ch ? 'Current workflow' : 'Onboarding path'}>
                <StepList
                  items={ONBOARDING_STEPS.map((item, index) => ({
                    ...item,
                    status: ch
                      ? index === 0
                        ? 'complete'
                        : videoCount > 0 && index === 1
                          ? 'complete'
                          : videoCount > 0 && index === 2
                            ? 'current'
                            : index === 1
                              ? 'current'
                              : 'upcoming'
                      : index === 0
                        ? 'current'
                        : 'upcoming',
                  }))}
                  compact
                />
              </DashboardCard>

              <DashboardCard eyebrow="Session" title="Workspace access">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-rule bg-paper-2 p-4">
                    <p className="text-body-sm font-medium text-ink">
                      {session.user.name ?? session.user.email}
                    </p>
                    <p className="mt-1 text-caption text-ink-4">{session.user.email}</p>
                    {session.user.isAdmin ? (
                      <div className="mt-3 inline-flex rounded-full border border-rule bg-paper px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3">
                        admin
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-3 text-body-sm">
                    <Link
                      href="/app/alpha-guide"
                      className="block rounded-2xl border border-rule bg-paper-2 px-4 py-3 text-ink-3 transition hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                    >
                      Review the private alpha guide
                    </Link>
                    {ch ? (
                      <Link
                        href="/app/library"
                        className="block rounded-2xl border border-rule bg-paper-2 px-4 py-3 text-ink-3 transition hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                      >
                        Open imported video library
                      </Link>
                    ) : null}
                    <form action={signOutAction}>
                      <button
                        type="submit"
                        className="w-full rounded-2xl border border-rule bg-paper-2 px-4 py-3 text-left text-body-sm text-ink-3 transition hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                </div>
              </DashboardCard>

              <DashboardCard eyebrow="Operator Notes" title="What makes this feel fast">
                <div className="space-y-3 text-caption leading-5 text-ink-4">
                  <p>Focused source selection creates better outlines than importing everything.</p>
                  <p>Transcript coverage improves quotes, timestamps, and evidence density.</p>
                  <p>The dashboard stays in setup mode until the library is genuinely usable.</p>
                </div>
              </DashboardCard>
            </aside>
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

function pct(synced: number, total: number | null): string {
  if (!total || total <= 0) return '--';
  return `${Math.min(100, Math.round((synced / total) * 100))}%`;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-rule bg-paper px-4 py-4">
      <p className="text-eyebrow uppercase tracking-widest text-ink-4">{label}</p>
      <p className="mt-2 font-serif text-heading-md text-ink">{value}</p>
    </div>
  );
}

function StatusPill({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}) {
  const toneClass =
    tone === 'success'
      ? 'border-emerald/30 bg-emerald/10 text-emerald-700'
      : tone === 'warning'
        ? 'border-amber/30 bg-amber-wash text-amber-ink'
        : 'border-rule bg-paper text-ink';

  return (
    <div className={`rounded-[20px] border px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] opacity-80">{label}</p>
      <p className="mt-1 text-body-sm font-medium">{value}</p>
    </div>
  );
}

function InfoTile({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[22px] border border-rule bg-paper px-4 py-4">
      <p className="text-body-sm font-medium text-ink">{title}</p>
      <p className="mt-2 text-caption leading-5 text-ink-4">{body}</p>
    </div>
  );
}
