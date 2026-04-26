import { and, count, desc, eq, inArray, ne } from '@creatorcanon/db';
import {
  channel,
  generationRun,
  hub,
  inboxItem,
  page as hubPage,
  project,
  video,
} from '@creatorcanon/db/schema';

import {
  ChannelHeaderCard,
  HubProgressCard,
  LinkButton,
  MetricCard,
  NoticeBanner,
  PageHeader,
  RecentActivityList,
  type HubStage,
  type RecentActivityItem,
} from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

import { ConnectChannelForm } from './ConnectChannelForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Welcome — CreatorCanon' };

export default async function AppHomePage() {
  const { db, session, workspaceId } = await requireWorkspace();

  const channels = await db
    .select()
    .from(channel)
    .where(eq(channel.workspaceId, workspaceId))
    .limit(1);
  const ch = channels[0];

  const noChannelInventoryDefault = [{ n: 0 }] as const;
  const [
    videoCountResult,
    readyVideoCountResult,
    activeRunCountResult,
    reviewRunCountResult,
    draftPageCountResult,
    approvedPageCountResult,
    hubCountResult,
    inboxRows,
    recentProjects,
  ] = await Promise.all([
    ch
      ? db.select({ n: count() }).from(video).where(eq(video.channelId, ch.id))
      : Promise.resolve(noChannelInventoryDefault),
    ch
      ? db
          .select({ n: count() })
          .from(video)
          .where(
            and(
              eq(video.channelId, ch.id),
              inArray(video.captionStatus, ['available', 'auto_only']),
            ),
          )
      : Promise.resolve(noChannelInventoryDefault),
    db
      .select({ n: count() })
      .from(generationRun)
      .where(
        and(
          eq(generationRun.workspaceId, workspaceId),
          inArray(generationRun.status, ['queued', 'running']),
        ),
      ),
    db
      .select({ n: count() })
      .from(generationRun)
      .where(
        and(
          eq(generationRun.workspaceId, workspaceId),
          eq(generationRun.status, 'awaiting_review'),
        ),
      ),
    db.select({ n: count() }).from(hubPage).where(eq(hubPage.workspaceId, workspaceId)),
    db
      .select({ n: count() })
      .from(hubPage)
      .where(
        and(eq(hubPage.workspaceId, workspaceId), eq(hubPage.status, 'approved')),
      ),
    db.select({ n: count() }).from(hub).where(eq(hub.workspaceId, workspaceId)),
    db
      .select({
        id: inboxItem.id,
        kind: inboxItem.kind,
        status: inboxItem.status,
        title: inboxItem.title,
        body: inboxItem.body,
        targetRef: inboxItem.targetRef,
        createdAt: inboxItem.createdAt,
      })
      .from(inboxItem)
      .where(
        and(
          eq(inboxItem.workspaceId, workspaceId),
          ne(inboxItem.status, 'archived'),
        ),
      )
      .orderBy(desc(inboxItem.createdAt))
      .limit(8),
    db
      .select({
        id: project.id,
        title: project.title,
        currentRunId: project.currentRunId,
        publishedHubId: project.publishedHubId,
        createdAt: project.createdAt,
      })
      .from(project)
      .where(eq(project.workspaceId, workspaceId))
      .orderBy(desc(project.createdAt))
      .limit(1),
  ]);

  const videoCount = videoCountResult[0]?.n ?? 0;
  const readyVideoCount = readyVideoCountResult[0]?.n ?? 0;
  const activeRunCount = activeRunCountResult[0]?.n ?? 0;
  const reviewRunCount = reviewRunCountResult[0]?.n ?? 0;
  const draftPageCount = draftPageCountResult[0]?.n ?? 0;
  const approvedPageCount = approvedPageCountResult[0]?.n ?? 0;
  const publishedHubCount = hubCountResult[0]?.n ?? 0;
  const firstProject = recentProjects[0];

  const hubProgress = deriveHubStage({
    hasChannel: Boolean(ch),
    hasReadyVideos: readyVideoCount > 0,
    firstProject: firstProject ?? null,
    activeRunCount,
    reviewRunCount,
    approvedPageCount,
    publishedHubCount,
  });

  const firstName = (session.user.name ?? '').split(' ')[0] ?? null;

  const activityItems: RecentActivityItem[] = inboxRows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    href: deriveActivityHref(row.kind, row.targetRef),
    createdAt: row.createdAt,
    status: row.status,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Command center"
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome to CreatorCanon'}
        body={
          ch
            ? readyVideoCount > 0
              ? 'Your channel is connected. Choose the videos for your first knowledge hub and Atlas will handle the rest.'
              : 'Your channel is connected. Atlas is checking caption coverage for your videos — once at least 8 are ready, you can start a hub.'
            : 'Connect your YouTube channel to begin. Atlas will catalogue your archive and recommend the best source set for your first hub.'
        }
        actions={
          ch ? (
            <LinkButton href="/app/library" variant="primary">
              Select videos →
            </LinkButton>
          ) : null
        }
      />

      {ch ? (
        readyVideoCount > 0 ? (
          <NoticeBanner
            tone="atlas"
            badge="Atlas"
            title={`${readyVideoCount} source-ready ${readyVideoCount === 1 ? 'video' : 'videos'} found.`}
            body="Atlas suggests starting with your highest-engagement, most-comprehensive teaching content for the strongest first hub."
            action={{ label: 'Review picks', href: '/app/library' }}
          />
        ) : null
      ) : null}

      <HubProgressCard
        current={hubProgress.current}
        doneStages={hubProgress.done}
        statusLabel={hubProgress.statusLabel}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Videos selected"
          value={firstProject ? videoCount : 0}
          sub={firstProject ? `${readyVideoCount} caption-ready` : 'Select at least 8 to start'}
        />
        <MetricCard
          label="Pages generated"
          value={draftPageCount}
          sub={draftPageCount === 0 ? 'Generated after your first run' : `${reviewRunCount} runs awaiting review`}
        />
        <MetricCard
          label="Pages approved"
          value={approvedPageCount}
          sub={approvedPageCount === 0 ? 'Approved during review' : `${draftPageCount - approvedPageCount} still draft`}
        />
        <MetricCard
          label="Hub status"
          value={hubProgress.statusValue}
          sub={hubProgress.statusSub}
          tone={hubProgress.statusTone}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {ch ? (
          <ChannelHeaderCard
            channel={{
              avatarUrl: ch.avatarUrl,
              name: ch.title ?? 'Connected channel',
              handle: ch.handle,
              videoCount,
              subscriberCount: ch.subsCount ?? undefined,
              captionReadyCount: readyVideoCount,
              isConnected: true,
            }}
          />
        ) : (
          <div className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
              Source setup
            </p>
            <h2 className="mt-2 text-[16px] font-semibold text-[var(--cc-ink)]">
              Connect your YouTube channel
            </h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-[var(--cc-ink-3)]">
              Read-only access. We import channel metadata and the available video catalog.
            </p>
            <div className="mt-4">
              <ConnectChannelForm />
            </div>
          </div>
        )}
        <RecentActivityList items={activityItems} />
      </div>
    </div>
  );
}

type ProjectRow = {
  id: string;
  currentRunId: string | null;
  publishedHubId: string | null;
};

function deriveHubStage(input: {
  hasChannel: boolean;
  hasReadyVideos: boolean;
  firstProject: ProjectRow | null;
  activeRunCount: number;
  reviewRunCount: number;
  approvedPageCount: number;
  publishedHubCount: number;
}): {
  current: HubStage;
  done: HubStage[];
  statusValue: string;
  statusSub: string;
  statusLabel: string;
  statusTone: 'default' | 'success' | 'warn' | 'danger';
} {
  if (input.publishedHubCount > 0) {
    return {
      current: 'publish',
      done: ['select_videos', 'configure_hub', 'generate', 'review_pages', 'publish'],
      statusValue: 'Published',
      statusSub: 'Live to readers',
      statusLabel: 'Hub is live',
      statusTone: 'success',
    };
  }
  if (input.reviewRunCount > 0 || input.approvedPageCount > 0) {
    return {
      current: 'review_pages',
      done: ['select_videos', 'configure_hub', 'generate'],
      statusValue: 'In review',
      statusSub: 'Approve pages to publish',
      statusLabel: 'Awaiting review',
      statusTone: 'warn',
    };
  }
  if (input.activeRunCount > 0) {
    return {
      current: 'generate',
      done: ['select_videos', 'configure_hub'],
      statusValue: 'Generating',
      statusSub: 'Atlas is drafting pages',
      statusLabel: 'Worker running',
      statusTone: 'warn',
    };
  }
  if (input.firstProject) {
    if (input.firstProject.currentRunId) {
      return {
        current: 'generate',
        done: ['select_videos', 'configure_hub'],
        statusValue: 'Queued',
        statusSub: 'Generation about to start',
        statusLabel: 'Worker queued',
        statusTone: 'warn',
      };
    }
    return {
      current: 'configure_hub',
      done: ['select_videos'],
      statusValue: 'Configuring',
      statusSub: 'Pick scope + theme',
      statusLabel: 'Project drafted',
      statusTone: 'default',
    };
  }
  if (input.hasChannel && input.hasReadyVideos) {
    return {
      current: 'select_videos',
      done: [],
      statusValue: 'Not started',
      statusSub: 'Select at least 8 videos',
      statusLabel: 'Awaiting selection',
      statusTone: 'default',
    };
  }
  return {
    current: 'select_videos',
    done: [],
    statusValue: 'Not started yet',
    statusSub: input.hasChannel ? 'Awaiting caption coverage' : 'Connect a channel',
    statusLabel: 'Not started',
    statusTone: 'default',
  };
}

function deriveActivityHref(kind: string, targetRef: string | null): string | null {
  switch (kind) {
    case 'run_completed':
    case 'run_failed':
    case 'run_awaiting_review':
    case 'release_published':
      return targetRef ? `/app/projects/${targetRef}` : '/app/projects';
    case 'invite_pending':
      return '/app/settings/team';
    default:
      return null;
  }
}
