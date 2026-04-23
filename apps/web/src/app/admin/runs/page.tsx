import Link from 'next/link';

import { desc, eq, getDb } from '@creatorcanon/db';
import { generationRun, project } from '@creatorcanon/db/schema';

import { formatUsdCentsMaybe, requireAdminUser } from '../lib';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Runs · CreatorCanon' };

const FILTER_STATUSES = [
  'awaiting_payment',
  'queued',
  'running',
  'awaiting_review',
  'failed',
] as const;
type FilterStatus = (typeof FILTER_STATUSES)[number];

const STATUS_STYLES: Record<string, string> = {
  awaiting_payment: 'bg-amber-wash text-amber-ink border border-amber/30',
  queued:           'bg-paper-2 text-ink-3 border border-rule',
  running:          'bg-blue-50 text-blue-700 border border-blue-200',
  awaiting_review:  'bg-purple-50 text-purple-700 border border-purple-200',
  published:        'bg-sage/10 text-sage border border-sage/30',
  failed:           'bg-rose/10 text-rose border border-rose/30',
};

function statusPill(status: string) {
  const cls = STATUS_STYLES[status] ?? 'bg-paper-2 text-ink-3 border border-rule';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] leading-4 ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function fmtDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Format as UTC 24h: 2024-04-23 14:32:01 UTC */
function fmtUtc(d: Date): string {
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export default async function AdminRunsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  await requireAdminUser();

  const db = getDb();
  const statusParam = searchParams?.status;
  const selectedStatus: FilterStatus | undefined =
    statusParam && FILTER_STATUSES.includes(statusParam as FilterStatus)
      ? (statusParam as FilterStatus)
      : undefined;

  const runs = selectedStatus
    ? await db
        .select({
          id: generationRun.id,
          workspaceId: generationRun.workspaceId,
          projectId: generationRun.projectId,
          status: generationRun.status,
          selectedDurationSeconds: generationRun.selectedDurationSeconds,
          priceCents: generationRun.priceCents,
          pipelineVersion: generationRun.pipelineVersion,
          createdAt: generationRun.createdAt,
          projectTitle: project.title,
        })
        .from(generationRun)
        .innerJoin(project, eq(project.id, generationRun.projectId))
        .where(eq(generationRun.status, selectedStatus))
        .orderBy(desc(generationRun.createdAt))
        .limit(50)
    : await db
        .select({
          id: generationRun.id,
          workspaceId: generationRun.workspaceId,
          projectId: generationRun.projectId,
          status: generationRun.status,
          selectedDurationSeconds: generationRun.selectedDurationSeconds,
          priceCents: generationRun.priceCents,
          pipelineVersion: generationRun.pipelineVersion,
          createdAt: generationRun.createdAt,
          projectTitle: project.title,
        })
        .from(generationRun)
        .innerJoin(project, eq(project.id, generationRun.projectId))
        .orderBy(desc(generationRun.createdAt))
        .limit(50);

  return (
    <main className="min-h-screen bg-paper-studio" aria-label="Admin runs console">
      {/* Console header */}
      <div className="border-b border-rule-dark bg-paper px-6 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto max-w-[1080px]">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-ink-4">
            Admin Console
          </div>
          <h1 className="font-sans text-heading-lg font-semibold text-ink">Runs</h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] space-y-5 px-6 py-8 sm:px-8 sm:py-10">
        {/* Status filter bar */}
        <section aria-label="Filter by status">
          <div className="flex flex-wrap gap-2 rounded-lg border border-rule bg-paper p-4">
            <Link
              href="/admin/runs"
              aria-current={!selectedStatus ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
                !selectedStatus
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule bg-paper text-ink-3 hover:border-ink-3 hover:text-ink'
              }`}
            >
              All
            </Link>
            {FILTER_STATUSES.map((status) => (
              <Link
                key={status}
                href={`/admin/runs?status=${status}`}
                aria-current={selectedStatus === status ? 'page' : undefined}
                className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-colors ${
                  selectedStatus === status
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule bg-paper text-ink-3 hover:border-ink-3 hover:text-ink'
                }`}
              >
                {status.replace(/_/g, ' ')}
              </Link>
            ))}
          </div>
        </section>

        {/* Runs table */}
        <section aria-label="Runs list">
          <div className="overflow-hidden rounded-lg border border-rule bg-paper">
            {/* Table header — hidden on mobile, visible md+ */}
            <div
              className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_120px_80px_80px_140px] gap-3 border-b border-rule bg-paper-2 px-5 py-3 md:grid"
              aria-hidden
            >
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Run / Project</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Workspace</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Status</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Duration</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Price</span>
              <span className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Created (UTC)</span>
            </div>

            <div className="divide-y divide-rule">
              {runs.length > 0 ? (
                runs.map((run) => (
                  <Link
                    key={run.id}
                    href={`/admin/runs/${run.id}`}
                    aria-label={`Run ${run.projectTitle} — ${run.status.replace(/_/g, ' ')}`}
                    className="block px-5 py-4 transition-colors hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber md:grid md:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_120px_80px_80px_140px] md:items-center md:gap-3"
                  >
                    {/* Run + project */}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-ink">{run.projectTitle}</div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-ink-4">{run.id}</div>
                    </div>
                    {/* Workspace */}
                    <div className="mt-2 min-w-0 md:mt-0">
                      <span className="font-mono text-[11px] text-ink-3 md:text-body-sm">{run.workspaceId}</span>
                    </div>
                    {/* Status pill */}
                    <div className="mt-2 md:mt-0">
                      {statusPill(run.status)}
                    </div>
                    {/* Duration */}
                    <div className="mt-1 font-mono text-[11px] text-ink-3 md:mt-0 md:text-body-sm">
                      {fmtDuration(run.selectedDurationSeconds)}
                    </div>
                    {/* Price */}
                    <div className="font-mono text-[11px] text-ink-3 md:text-body-sm">
                      {formatUsdCentsMaybe(run.priceCents)}
                    </div>
                    {/* Created UTC */}
                    <div className="mt-1 font-mono text-[11px] text-ink-4 md:mt-0">
                      {fmtUtc(run.createdAt)}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-body-sm text-ink-4">
                  No runs match this filter.
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-right font-mono text-[11px] text-ink-4">
            Showing {runs.length} of 50 most recent
          </p>
        </section>
      </div>
    </main>
  );
}
