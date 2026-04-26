import Link from 'next/link';

import { and, asc, desc, eq, getDb, inArray, ne } from '@creatorcanon/db';
import {
  generationRun,
  inboxItem,
  page,
  pageVersion,
  project,
} from '@creatorcanon/db/schema';

import {
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
} from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

import { archiveInbox, markInboxRead } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Inbox' };

export default async function InboxPage() {
  const { workspaceId } = await requireWorkspace();
  const db = getDb();

  const [persistedItems, reviewRuns] = await Promise.all([
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
        and(eq(inboxItem.workspaceId, workspaceId), ne(inboxItem.status, 'archived')),
      )
      .orderBy(desc(inboxItem.createdAt))
      .limit(50),
    db
      .select({
        id: generationRun.id,
        projectId: generationRun.projectId,
        status: generationRun.status,
      })
      .from(generationRun)
      .where(eq(generationRun.workspaceId, workspaceId)),
  ]);

  const runIds = reviewRuns.map((run) => run.id);
  const projectIds = [...new Set(reviewRuns.map((run) => run.projectId))];

  // pendingPages and projects both depend only on reviewRuns — fetch in parallel.
  const [pendingPages, projects] = await Promise.all([
    runIds.length
      ? db
          .select({
            id: page.id,
            runId: page.runId,
            status: page.status,
            supportLabel: page.supportLabel,
            currentVersionId: page.currentVersionId,
            position: page.position,
          })
          .from(page)
          .where(inArray(page.runId, runIds))
          .orderBy(asc(page.position))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({ id: project.id, title: project.title })
          .from(project)
          .where(inArray(project.id, projectIds))
      : Promise.resolve([]),
  ]);

  const actionablePages = pendingPages.filter((item) => item.status !== 'approved');
  const versionIds = actionablePages
    .map((item) => item.currentVersionId)
    .filter((id): id is string => Boolean(id));
  const versions = versionIds.length
    ? await db
        .select({ id: pageVersion.id, title: pageVersion.title, summary: pageVersion.summary })
        .from(pageVersion)
        .where(inArray(pageVersion.id, versionIds))
    : [];
  const versionMap = new Map(versions.map((item) => [item.id, item]));
  const projectMap = new Map(projects.map((item) => [item.id, item]));
  const runMap = new Map(reviewRuns.map((run) => [run.id, run]));

  const unreadCount = persistedItems.filter((item) => item.status === 'unread').length;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            Inbox
            {unreadCount > 0 ? (
              <StatusPill tone="accent">{unreadCount} unread</StatusPill>
            ) : null}
          </span>
        }
        title="Approval inbox"
        body="Persisted notifications from the workspace plus the live review queue. Items move unread → read → archived as you act on them."
      />

      <Panel>
        <PanelHeader
          title="Notifications"
          meta={`${persistedItems.length} active · ${unreadCount} unread`}
        />
        {persistedItems.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--cc-ink-4)]">
            No notifications yet. Run completion, publish events, and invite acceptances will
            land here.
          </div>
        ) : (
          <div className="divide-y divide-[var(--cc-rule)]">
            {persistedItems.map((item) => (
              <InboxRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <PanelHeader
          title="Live review queue"
          meta={`${actionablePages.length} page${actionablePages.length === 1 ? '' : 's'} pending`}
        />
        {actionablePages.length === 0 ? (
          <div className="px-5 py-10 text-center text-[13px] text-[var(--cc-ink-4)]">
            Nothing waiting on review. Generated drafts appear here while their pages are still
            in draft or awaiting-review state.
          </div>
        ) : (
          <div className="grid gap-2.5 px-4 py-4">
            {actionablePages.map((item) => {
              const run = runMap.get(item.runId);
              const proj = run ? projectMap.get(run.projectId) : undefined;
              const version = item.currentVersionId
                ? versionMap.get(item.currentVersionId)
                : undefined;
              return (
                <Link
                  key={item.id}
                  href={
                    run
                      ? `/app/projects/${run.projectId}/pages#page-${item.id}`
                      : '/app/projects'
                  }
                  className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 transition hover:border-[var(--cc-ink-4)] hover:bg-white"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] text-[var(--cc-ink-4)]">{proj?.title ?? 'Project'}</p>
                      <h3 className="mt-1 text-[14px] font-semibold text-[var(--cc-ink)]">
                        {version?.title ?? `Page ${item.position + 1}`}
                      </h3>
                      {version?.summary ? (
                        <p className="mt-1.5 max-w-3xl text-[12px] leading-[1.55] text-[var(--cc-ink-3)] line-clamp-2">
                          {version.summary}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusPill tone={pillToneFor(item.status)}>
                        {item.status.replaceAll('_', ' ')}
                      </StatusPill>
                      <StatusPill tone={supportToneFor(item.supportLabel)}>
                        {item.supportLabel.replaceAll('_', ' ')}
                      </StatusPill>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      {persistedItems.length === 0 && actionablePages.length === 0 ? (
        <EmptyState
          title="Inbox is quiet"
          body="Run completions, publish events, and review-required pages will surface here as they happen."
          action={{ label: 'Open command center', href: '/app' }}
        />
      ) : null}
    </div>
  );
}

type InboxRowItem = {
  id: string;
  kind: string;
  status: string;
  title: string;
  body: string | null;
  targetRef: string | null;
  createdAt: Date;
};

function InboxRow({ item }: { item: InboxRowItem }) {
  const href = inferInboxHref(item.kind, item.targetRef);
  const unread = item.status === 'unread';
  return (
    <article className={`px-5 py-3.5 ${unread ? 'bg-white' : 'bg-[var(--cc-surface-2)]/30'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
              {item.kind.replaceAll('_', ' ')}
            </span>
            {unread ? (
              <StatusPill tone="accent">unread</StatusPill>
            ) : (
              <StatusPill tone="neutral" withDot={false}>
                read
              </StatusPill>
            )}
            <span className="text-[var(--cc-ink-4)]">{formatDateTime(item.createdAt)}</span>
          </div>
          <p className="mt-1.5 text-[14px] font-semibold text-[var(--cc-ink)]">{item.title}</p>
          {item.body ? (
            <p className="mt-1 max-w-3xl text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
              {item.body}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {href ? (
            <Link
              href={href}
              className="inline-flex h-8 items-center rounded-[8px] bg-[var(--cc-accent)] px-3 text-[11px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] hover:bg-[var(--cc-accent-strong)]"
            >
              Open
            </Link>
          ) : null}
          {unread ? (
            <form action={markInboxRead}>
              <input type="hidden" name="id" value={item.id} />
              <button
                type="submit"
                className="inline-flex h-8 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[11px] font-semibold text-[var(--cc-ink)] transition hover:border-[var(--cc-ink-4)]"
              >
                Mark read
              </button>
            </form>
          ) : null}
          <form action={archiveInbox}>
            <input type="hidden" name="id" value={item.id} />
            <button
              type="submit"
              className="inline-flex h-8 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[11px] font-semibold text-[var(--cc-ink-3)] transition hover:border-[var(--cc-ink-4)] hover:text-[var(--cc-ink)]"
            >
              Archive
            </button>
          </form>
        </div>
      </div>
    </article>
  );
}

function inferInboxHref(kind: string, targetRef: string | null): string | null {
  switch (kind) {
    case 'run_completed':
    case 'run_failed':
    case 'run_awaiting_review':
    case 'release_published':
      return targetRef ? `/app/projects/${targetRef}` : '/app/projects';
    case 'invite_pending':
      return '/app/settings/team';
    case 'system_notice':
    default:
      return null;
  }
}

function pillToneFor(status: string): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (status === 'approved') return 'success';
  if (status === 'reviewed') return 'warn';
  return 'neutral';
}

function supportToneFor(label: string): 'success' | 'warn' | 'neutral' {
  if (label === 'strong') return 'success';
  if (label === 'limited') return 'warn';
  return 'neutral';
}

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}
