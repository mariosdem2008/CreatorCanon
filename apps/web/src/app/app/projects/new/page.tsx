import Image from 'next/image';

import { and, count, desc, eq, inArray } from '@creatorcanon/db';
import { channel, video } from '@creatorcanon/db/schema';

import {
  EmptyState,
  LinkButton,
  MetricCard,
  NoticeBanner,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
} from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New hub' };

export default async function NewProjectPage() {
  const { db, workspaceId } = await requireWorkspace();

  const channels = await db
    .select()
    .from(channel)
    .where(eq(channel.workspaceId, workspaceId))
    .limit(1);
  const ch = channels[0];

  const noChannel = [{ n: 0 }] as const;
  const [videoCountResult, readyCountResult, recentVideos] = ch
    ? await Promise.all([
        db.select({ n: count() }).from(video).where(eq(video.workspaceId, workspaceId)),
        db
          .select({ n: count() })
          .from(video)
          .where(
            and(
              eq(video.workspaceId, workspaceId),
              inArray(video.captionStatus, ['available', 'auto_only']),
            ),
          ),
        db
          .select({
            id: video.id,
            title: video.title,
            thumbnails: video.thumbnails,
            captionStatus: video.captionStatus,
            durationSeconds: video.durationSeconds,
          })
          .from(video)
          .where(eq(video.workspaceId, workspaceId))
          .orderBy(desc(video.publishedAt))
          .limit(4),
      ])
    : [noChannel, noChannel, [] as Array<{
        id: string;
        title: string | null;
        thumbnails: { medium?: string | null; small?: string | null } | null;
        captionStatus: 'available' | 'auto_only' | 'none' | 'unknown';
        durationSeconds: number | null;
      }>];

  const videoCount = videoCountResult[0]?.n ?? 0;
  const readyCount = readyCountResult[0]?.n ?? 0;
  const hasSource = Boolean(ch && videoCount > 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="New hub"
        title="Start with a focused source set."
        body="Atlas builds the strongest first hubs from tight, source-ready batches around a single outcome. After selection you'll configure audience, tone, template, and checkout."
        actions={
          hasSource ? (
            <LinkButton href="/app/library" variant="primary">
              Open source library →
            </LinkButton>
          ) : null
        }
      />

      <NoticeBanner
        tone={hasSource ? 'atlas' : 'warn'}
        badge={hasSource ? 'Atlas' : 'Heads up'}
        title={
          hasSource
            ? `${videoCount} synced · ${readyCount} source-ready.`
            : 'Channel not connected.'
        }
        body={
          hasSource
            ? 'Atlas can build now — prefer source-ready videos for stronger citations and cleaner first drafts.'
            : 'Connect your YouTube channel from the command center. Once videos are synced, this becomes the hub creation entry point.'
        }
        action={
          hasSource
            ? { label: 'Filter to ready', href: '/app/library' }
            : { label: 'Go to command center', href: '/app' }
        }
      />

      {hasSource ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Videos synced" value={videoCount} sub="In your channel inventory" />
            <MetricCard
              label="Source-ready"
              value={readyCount}
              sub={`${Math.round((readyCount / Math.max(videoCount, 1)) * 100)}% of inventory`}
              tone="success"
            />
            <MetricCard
              label="Recommended batch"
              value="8–20"
              sub="Atlas works best with focused sets"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <WorkflowStep
              n="1"
              title="Select sources"
              body="Pick the videos with the strongest reusable expertise."
              active
            />
            <WorkflowStep
              n="2"
              title="Configure output"
              body="Title, audience, tone, depth, template, chat intent."
            />
            <WorkflowStep
              n="3"
              title="Review and publish"
              body="Approve source-supported pages before the public release."
            />
          </div>

          {recentVideos.length > 0 ? (
            <Panel>
              <PanelHeader title="Recent source candidates" meta="Latest 4 from your channel" />
              <div className="divide-y divide-[var(--cc-rule)]">
                {recentVideos.map((item) => {
                  const ready =
                    item.captionStatus === 'available' || item.captionStatus === 'auto_only';
                  const thumb = item.thumbnails?.medium ?? item.thumbnails?.small ?? null;
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                      {thumb ? (
                        <Image
                          src={thumb}
                          alt=""
                          width={72}
                          height={40}
                          loading="lazy"
                          className="h-10 w-[72px] rounded-[6px] object-cover bg-[var(--cc-surface-2)] shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-[72px] rounded-[6px] bg-[var(--cc-surface-2)] shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-[var(--cc-ink)]">
                          {item.title ?? 'Untitled video'}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--cc-ink-4)]">
                          {item.captionStatus.replaceAll('_', ' ')}
                        </p>
                      </div>
                      <StatusPill tone={ready ? 'success' : 'warn'}>
                        {ready ? 'Ready' : 'Limited'}
                      </StatusPill>
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : null}
        </>
      ) : (
        <EmptyState
          title="Source setup is required"
          body="Connect your YouTube channel from the command center. Once videos are synced this surface becomes the hub creation entry point."
          action={{ label: 'Go to command center', href: '/app' }}
        />
      )}
    </div>
  );
}

function WorkflowStep({
  n,
  title,
  body,
  active,
}: {
  n: string;
  title: string;
  body: string;
  active?: boolean;
}) {
  return (
    <div
      className={`rounded-[12px] border p-4 ${
        active
          ? 'border-[var(--cc-accent)] bg-[var(--cc-accent-wash)]'
          : 'border-[var(--cc-rule)] bg-[var(--cc-surface)]'
      }`}
    >
      <span
        className={`grid size-6 place-items-center rounded-[6px] text-[11px] font-semibold ${
          active
            ? 'bg-[var(--cc-accent)] text-white'
            : 'bg-[var(--cc-surface-2)] text-[var(--cc-ink-4)]'
        }`}
      >
        {n}
      </span>
      <p
        className={`mt-2.5 text-[14px] font-semibold ${
          active ? 'text-[var(--cc-accent)]' : 'text-[var(--cc-ink)]'
        }`}
      >
        {title}
      </p>
      <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">{body}</p>
    </div>
  );
}
