import Link from 'next/link';

import { desc, eq, getDb } from '@creatorcanon/db';
import { generationRun, project } from '@creatorcanon/db/schema';

import { formatUsdCentsMaybe, requireAdminUser } from '../lib';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin Runs' };

const FILTER_STATUSES = [
  'awaiting_payment',
  'queued',
  'running',
  'awaiting_review',
  'failed',
] as const;
type FilterStatus = (typeof FILTER_STATUSES)[number];

function fmtDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default async function AdminRunsPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  await requireAdminUser();

  const db = getDb();
  const statusParam = searchParams?.status;
  const selectedStatus: FilterStatus | undefined = statusParam && FILTER_STATUSES.includes(statusParam as FilterStatus)
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
    <main className="min-h-screen bg-paper-studio">
      <div className="border-b border-rule-dark bg-paper px-8 py-5">
        <div className="mx-auto max-w-[1080px]">
          <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
            Admin Console
          </div>
          <h1 className="font-serif text-heading-lg text-ink">Runs</h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] space-y-6 px-8 py-10">
        <section className="rounded-lg border border-rule bg-paper p-5">
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/runs"
              className={`rounded-full border px-3 py-1 text-caption ${!selectedStatus ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper text-ink-3'}`}
            >
              All
            </Link>
            {FILTER_STATUSES.map((status) => (
              <Link
                key={status}
                href={`/admin/runs?status=${status}`}
                className={`rounded-full border px-3 py-1 text-caption ${selectedStatus === status ? 'border-ink bg-ink text-paper' : 'border-rule bg-paper text-ink-3'}`}
              >
                {status.replace('_', ' ')}
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-rule bg-paper">
          <div className="grid grid-cols-[1.8fr_1.2fr_1fr_1fr_1fr_1fr] gap-3 border-b border-rule bg-paper-2 px-5 py-3 text-caption uppercase tracking-widest text-ink-4">
            <span>Run</span>
            <span>Workspace</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Price</span>
            <span>Created</span>
          </div>

          <div className="divide-y divide-rule">
            {runs.length > 0 ? runs.map((run) => (
              <Link
                key={run.id}
                href={`/admin/runs/${run.id}`}
                className="grid grid-cols-[1.8fr_1.2fr_1fr_1fr_1fr_1fr] gap-3 px-5 py-4 text-body-sm hover:bg-paper-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{run.projectTitle}</div>
                  <div className="truncate text-caption text-ink-4">{run.id}</div>
                </div>
                <span className="truncate text-ink-3">{run.workspaceId}</span>
                <span className="capitalize text-ink">{run.status.replace('_', ' ')}</span>
                <span className="text-ink-3">{fmtDuration(run.selectedDurationSeconds)}</span>
                <span className="text-ink-3">{formatUsdCentsMaybe(run.priceCents)}</span>
                <span className="text-ink-4">{run.createdAt.toLocaleString()}</span>
              </Link>
            )) : (
              <div className="px-5 py-8 text-body-sm text-ink-4">
                No runs match this filter.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
