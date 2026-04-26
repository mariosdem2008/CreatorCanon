import Link from 'next/link';

import { desc, eq } from '@creatorcanon/db';
import {
  generationRun,
  hub,
  page as hubPage,
  project,
  release,
} from '@creatorcanon/db/schema';

import {
  EmptyState,
  LinkButton,
  PageHeader,
  Panel,
  StatusPill,
} from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projects' };

export default async function ProjectsPage() {
  const { db, workspaceId } = await requireWorkspace();

  const [projects, runs, hubs, pages, releases] = await Promise.all([
    db
      .select()
      .from(project)
      .where(eq(project.workspaceId, workspaceId))
      .orderBy(desc(project.createdAt))
      .limit(80),
    db
      .select()
      .from(generationRun)
      .where(eq(generationRun.workspaceId, workspaceId))
      .orderBy(desc(generationRun.createdAt))
      .limit(160),
    db.select().from(hub).where(eq(hub.workspaceId, workspaceId)),
    db
      .select({ runId: hubPage.runId, status: hubPage.status })
      .from(hubPage)
      .where(eq(hubPage.workspaceId, workspaceId)),
    db
      .select()
      .from(release)
      .where(eq(release.workspaceId, workspaceId))
      .orderBy(desc(release.createdAt))
      .limit(160),
  ]);

  const runById = new Map(runs.map((run) => [run.id, run]));
  const hubByProjectId = new Map(hubs.map((item) => [item.projectId, item]));
  const latestReleaseByHubId = new Map<string, (typeof releases)[number]>();
  for (const item of releases) {
    if (!latestReleaseByHubId.has(item.hubId)) latestReleaseByHubId.set(item.hubId, item);
  }

  const pageStatsByRunId = new Map<string, { total: number; approved: number }>();
  for (const item of pages) {
    const current = pageStatsByRunId.get(item.runId) ?? { total: 0, approved: 0 };
    current.total += 1;
    if (item.status === 'approved') current.approved += 1;
    pageStatsByRunId.set(item.runId, current);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Projects"
        title="Pages"
        body="Every CreatorCanon project — from source selection through generation, review, and live release."
        actions={
          <LinkButton href="/app/library" variant="primary">
            Start a new hub →
          </LinkButton>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon="◇"
          title="No projects yet"
          body="Start from the source library. Atlas works best when the first hub is built from a focused, source-ready video set."
          action={{ label: 'Select source videos', href: '/app/library' }}
        />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-[var(--cc-surface-2)]/60">
                <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
                  <th className="px-4 py-2.5 font-semibold">Project</th>
                  <th className="px-2 py-2.5 font-semibold">Run</th>
                  <th className="px-2 py-2.5 font-semibold">Pages</th>
                  <th className="px-2 py-2.5 font-semibold">Release</th>
                  <th className="px-4 py-2.5 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((item) => {
                  const run = item.currentRunId ? runById.get(item.currentRunId) : undefined;
                  const stats = run ? pageStatsByRunId.get(run.id) : undefined;
                  const projectHub = hubByProjectId.get(item.id);
                  const latestRelease = projectHub
                    ? latestReleaseByHubId.get(projectHub.id)
                    : undefined;
                  return (
                    <tr
                      key={item.id}
                      className="border-t border-[var(--cc-rule)] transition-colors hover:bg-[var(--cc-surface-2)]/50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/app/projects/${item.id}`}
                          className="block min-w-[260px] truncate font-medium text-[var(--cc-ink)] hover:text-[var(--cc-accent)]"
                        >
                          {item.title}
                        </Link>
                      </td>
                      <td className="px-2 py-3">
                        {run ? <RunBadge status={run.status} /> : <StatusPill tone="neutral">Draft</StatusPill>}
                      </td>
                      <td className="px-2 py-3 text-[var(--cc-ink-3)] whitespace-nowrap tabular-nums">
                        {stats ? `${stats.approved}/${stats.total}` : '—'}
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap">
                        {projectHub?.liveReleaseId ? (
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cc-success)]">
                            <span aria-hidden className="size-1.5 rounded-full bg-[var(--cc-success)]" />
                            Live · /h/{projectHub.subdomain}
                          </span>
                        ) : latestRelease ? (
                          <StatusPill tone="info">{latestRelease.status}</StatusPill>
                        ) : (
                          <span className="text-[12px] text-[var(--cc-ink-4)]">Not published</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[var(--cc-ink-3)] whitespace-nowrap">
                        {dateLabel(item.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

function RunBadge({ status }: { status: string }) {
  const tone =
    status === 'published'
      ? 'success'
      : status === 'awaiting_review'
        ? 'warn'
        : status === 'failed'
          ? 'danger'
          : status === 'running' || status === 'queued' || status === 'awaiting_payment'
            ? 'info'
            : 'neutral';
  return <StatusPill tone={tone as 'success' | 'warn' | 'danger' | 'info' | 'neutral'}>{status.replaceAll('_', ' ')}</StatusPill>;
}

function dateLabel(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value);
}
