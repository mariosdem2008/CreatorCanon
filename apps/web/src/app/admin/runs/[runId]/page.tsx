import Link from 'next/link';
import { notFound } from 'next/navigation';

import { and, asc, desc, eq, getDb } from '@creatorcanon/db';
import {
  auditLog,
  generationRun,
  generationStageRun,
  hub,
  page,
  project,
  release,
  stripeEvent,
} from '@creatorcanon/db/schema';

import {
  formatDurationMs,
  formatUsdCentsMaybe,
  requireAdminUser,
  truncateJson,
} from '../../lib';
import { publishRunFromAdmin, redispatchRun, rerunStage } from '../rerun';
import { ADMIN_RERUN_STAGES } from '../stages';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin — Run Detail · CreatorCanon' };

/* ─── helpers ─────────────────────────────────────────────────────────────── */

const STATUS_STYLES: Record<string, string> = {
  awaiting_payment: 'bg-amber-wash text-amber-ink border border-amber/30',
  queued:           'bg-paper-2 text-ink-3 border border-rule',
  running:          'bg-blue-50 text-blue-700 border border-blue-200',
  awaiting_review:  'bg-purple-50 text-purple-700 border border-purple-200',
  published:        'bg-sage/10 text-sage border border-sage/30',
  failed:           'bg-rose/10 text-rose border border-rose/30',
  succeeded:        'bg-sage/10 text-sage border border-sage/30',
};

function statusPill(status: string) {
  const cls = STATUS_STYLES[status] ?? 'bg-paper-2 text-ink-3 border border-rule';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px] leading-4 ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/** Format as UTC 24h: 2024-04-23 14:32:01 UTC */
function fmtUtc(d: Date | null | undefined): string {
  if (!d) return '—';
  return d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function stripeEventMatchesRun(
  event: typeof stripeEvent.$inferSelect,
  runId: string,
  paymentIntentId: string | null,
) {
  const payload = event.payload as {
    data?: {
      object?: {
        id?: string;
        payment_intent?: string | null;
        metadata?: Record<string, string | undefined>;
      };
    };
  };
  const object = payload.data?.object;
  return (
    object?.metadata?.runId === runId ||
    (paymentIntentId != null &&
      (object?.id === paymentIntentId || object?.payment_intent === paymentIntentId))
  );
}

/* ─── page ─────────────────────────────────────────────────────────────────── */

export default async function AdminRunDetailPage({
  params,
}: {
  params: { runId: string };
}) {
  await requireAdminUser();

  const db = getDb();
  const rows = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      status: generationRun.status,
      pipelineVersion: generationRun.pipelineVersion,
      selectedDurationSeconds: generationRun.selectedDurationSeconds,
      priceCents: generationRun.priceCents,
      createdAt: generationRun.createdAt,
      startedAt: generationRun.startedAt,
      completedAt: generationRun.completedAt,
      stripePaymentIntentId: generationRun.stripePaymentIntentId,
      projectTitle: project.title,
    })
    .from(generationRun)
    .innerJoin(project, eq(project.id, generationRun.projectId))
    .where(eq(generationRun.id, params.runId))
    .limit(1);

  const run = rows[0];
  if (!run) notFound();

  const stageRuns = await db
    .select()
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, run.id))
    .orderBy(asc(generationStageRun.createdAt));

  const pages = await db
    .select({ id: page.id, slug: page.slug })
    .from(page)
    .where(eq(page.runId, run.id))
    .orderBy(page.position);

  const recentStripeEvents = await db
    .select()
    .from(stripeEvent)
    .orderBy(desc(stripeEvent.receivedAt))
    .limit(50);
  const matchingStripeEvents = recentStripeEvents
    .filter((event) => stripeEventMatchesRun(event, run.id, run.stripePaymentIntentId))
    .slice(0, 6);

  const hubRows = await db
    .select({
      hubId: hub.id,
      subdomain: hub.subdomain,
      theme: hub.theme,
      liveReleaseId: hub.liveReleaseId,
      releaseNumber: release.releaseNumber,
      releaseStatus: release.status,
      manifestR2Key: release.manifestR2Key,
    })
    .from(hub)
    .leftJoin(release, eq(release.id, hub.liveReleaseId))
    .where(and(eq(hub.projectId, run.projectId), eq(hub.workspaceId, run.workspaceId)))
    .limit(1);
  const liveHub = hubRows[0];

  const auditRows = await db
    .select({
      action: auditLog.action,
      actorUserId: auditLog.actorUserId,
      createdAt: auditLog.createdAt,
      afterJson: auditLog.afterJson,
    })
    .from(auditLog)
    .where(and(eq(auditLog.targetType, 'generation_run'), eq(auditLog.targetId, run.id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(5);

  const reviewStage = stageRuns.find(
    (stage) => stage.stageName === 'synthesize_v0_review' && stage.status === 'succeeded',
  );
  const draftPagesStage = stageRuns.find(
    (stage) => stage.stageName === 'draft_pages_v0' && stage.status === 'succeeded',
  );

  const isUnpaid = run.status === 'awaiting_payment';

  return (
    <main className="min-h-screen bg-paper-studio" aria-label="Admin run detail">
      {/* Console header */}
      <div className="border-b border-rule-dark bg-paper px-6 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-[1080px] flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 font-mono text-[11px] uppercase tracking-widest text-ink-4">
              Admin Console · Run Detail
            </div>
            <h1 className="truncate font-sans text-heading-lg font-semibold text-ink">
              {run.projectTitle}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <code className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-3">
                {run.id}
              </code>
              {statusPill(run.status)}
            </div>
          </div>
          <Link
            href="/admin/runs"
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded border border-rule bg-paper px-3 font-mono text-[11px] text-ink-3 transition hover:border-ink-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            ← Back to runs
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] space-y-5 px-6 py-8 sm:px-8 sm:py-10">

        {/* ── Run summary (read-only) ─────────────────────────────────────── */}
        <section
          aria-label="Run summary"
          className="rounded-lg border border-rule bg-paper"
        >
          <div className="border-b border-rule px-5 py-3">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-ink-4">
              Run summary
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-5 p-5 text-body-sm sm:grid-cols-4">
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Run ID</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-ink">{run.id}</dd>
            </dl>
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Workspace</dt>
              <dd className="mt-1 break-all font-mono text-[11px] text-ink">{run.workspaceId}</dd>
            </dl>
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Status</dt>
              <dd className="mt-1">{statusPill(run.status)}</dd>
            </dl>
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Price</dt>
              <dd className="mt-1 font-mono text-[11px] text-ink">{formatUsdCentsMaybe(run.priceCents)}</dd>
            </dl>
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Pipeline</dt>
              <dd className="mt-1 font-mono text-[11px] text-ink">{run.pipelineVersion}</dd>
            </dl>
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Created</dt>
              <dd className="mt-1 font-mono text-[11px] text-ink">{fmtUtc(run.createdAt)}</dd>
            </dl>
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Started</dt>
              <dd className="mt-1 font-mono text-[11px] text-ink">
                {run.startedAt ? fmtUtc(run.startedAt) : <span className="text-ink-4">Not started</span>}
              </dd>
            </dl>
            <dl>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Completed</dt>
              <dd className="mt-1 font-mono text-[11px] text-ink">
                {run.completedAt ? fmtUtc(run.completedAt) : <span className="text-ink-4">Not completed</span>}
              </dd>
            </dl>
          </div>

          {/* Artifact + Stripe + Project sub-panels */}
          <div className="grid gap-4 border-t border-rule p-5 md:grid-cols-3">
            <div className="rounded-md border border-rule bg-paper-2 p-4 text-body-sm">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Artifacts</div>
              <div className="mt-2 text-ink">
                {reviewStage ? 'Review artifact present' : (
                  <span className="text-rose">Review artifact missing</span>
                )}
              </div>
              <div className="mt-1 text-ink">
                {draftPagesStage ? (
                  `${pages.length} draft page${pages.length === 1 ? '' : 's'}`
                ) : (
                  <span className="text-rose">Draft pages missing</span>
                )}
              </div>
            </div>
            <div className="rounded-md border border-rule bg-paper-2 p-4 text-body-sm">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Stripe PI</div>
              <div className="mt-2 break-all font-mono text-[11px] text-ink">
                {run.stripePaymentIntentId ?? <span className="text-ink-4">None recorded</span>}
              </div>
              <div className="mt-2 font-mono text-[10px] text-ink-4">
                {matchingStripeEvents.length > 0
                  ? `${matchingStripeEvents.length} matching webhook event${matchingStripeEvents.length === 1 ? '' : 's'}`
                  : 'No matching events in latest 50'}
              </div>
            </div>
            <div className="rounded-md border border-rule bg-paper-2 p-4 text-body-sm">
              <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Project ID</div>
              <div className="mt-2 break-all font-mono text-[11px] text-ink">{run.projectId}</div>
            </div>
          </div>
        </section>

        {/* ── Admin rescue (action surface — visually distinct) ────────────── */}
        <section
          aria-label="Admin rescue actions"
          className="rounded-lg border-2 border-amber/50 bg-amber-wash/30"
        >
          <div className="flex items-center gap-2 border-b border-amber/30 px-5 py-3">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-amber-ink">
              Admin rescue actions
            </h2>
            <span className="rounded bg-amber/20 px-1.5 py-0.5 font-mono text-[10px] text-amber-ink">
              DESTRUCTIVE — CONFIRM BEFORE USE
            </span>
          </div>

          {isUnpaid && (
            <div className="mx-5 mt-4 rounded-md border border-rose/30 bg-rose/10 px-4 py-3 font-mono text-[11px] text-rose" role="alert">
              Unpaid runs cannot be rescued from admin.
            </div>
          )}

          <div className="space-y-5 p-5">
            {/* Re-dispatch */}
            <div className="rounded-md border border-rule bg-paper p-4">
              <h3 id="redispatch-label" className="font-sans text-body-md font-semibold text-ink">
                Re-dispatch run
              </h3>
              <p id="redispatch-desc" className="mt-1 text-body-sm text-ink-3">
                Marks run as <code className="font-mono text-[11px]">queued</code> and re-triggers
                the pipeline without clearing stage data. Use when a run got stuck mid-queue.
                Does not apply to runs awaiting payment, review, or already published.
              </p>
              <details className="mt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-rule bg-paper px-3 py-1.5 font-mono text-[11px] text-ink-3 transition hover:border-amber hover:text-amber-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
                  Confirm re-dispatch…
                </summary>
                <div className="mt-3 rounded-md border border-amber/30 bg-amber-wash/50 p-3">
                  <p className="mb-3 font-mono text-[11px] text-amber-ink">
                    This will re-queue the run and trigger the pipeline. No stage data is cleared.
                  </p>
                  <form action={redispatchRun}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button
                      type="submit"
                      disabled={
                        isUnpaid ||
                        run.status === 'awaiting_review' ||
                        run.status === 'published'
                      }
                      aria-describedby="redispatch-desc"
                      className="rounded-md border border-amber bg-amber-ink px-4 py-2 font-mono text-[11px] text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:cursor-not-allowed disabled:border-rule disabled:bg-paper-2 disabled:text-ink-4"
                    >
                      Re-dispatch run — {run.id.slice(0, 8)}…
                    </button>
                  </form>
                </div>
              </details>
            </div>

            {/* Publish current draft */}
            <div className="rounded-md border border-rule bg-paper p-4">
              <h3 id="publish-label" className="font-sans text-body-md font-semibold text-ink">
                Publish current draft
              </h3>
              <p id="publish-desc" className="mt-1 text-body-sm text-ink-3">
                Publishes the existing draft pages as a hub release. Only available when run is
                in <code className="font-mono text-[11px]">awaiting_review</code> or{' '}
                <code className="font-mono text-[11px]">published</code> state and draft pages exist.
              </p>
              <details className="mt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-rule bg-paper px-3 py-1.5 font-mono text-[11px] text-ink-3 transition hover:border-amber hover:text-amber-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber">
                  Confirm publish…
                </summary>
                <div className="mt-3 rounded-md border border-amber/30 bg-amber-wash/50 p-3">
                  <p className="mb-3 font-mono text-[11px] text-amber-ink">
                    This will publish the current draft as a live hub release. The hub will be
                    publicly accessible immediately.
                  </p>
                  <form action={publishRunFromAdmin}>
                    <input type="hidden" name="runId" value={run.id} />
                    <button
                      type="submit"
                      disabled={
                        (run.status !== 'awaiting_review' && run.status !== 'published') ||
                        pages.length === 0
                      }
                      aria-describedby="publish-desc"
                      className="rounded-md border border-amber bg-amber-ink px-4 py-2 font-mono text-[11px] text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:cursor-not-allowed disabled:border-rule disabled:bg-paper-2 disabled:text-ink-4"
                    >
                      Publish draft ({pages.length} page{pages.length === 1 ? '' : 's'}) — {run.id.slice(0, 8)}…
                    </button>
                  </form>
                </div>
              </details>
            </div>

            {/* Stage reruns */}
            <div className="rounded-md border border-rule bg-paper p-4">
              <h3 id="stage-rerun-label" className="font-sans text-body-md font-semibold text-ink">
                Rerun from stage
              </h3>
              <p id="stage-rerun-desc" className="mt-1 text-body-sm text-ink-3">
                Clears the selected stage and all downstream implemented stages, deletes draft-page
                rows for this run, then re-dispatches the pipeline from that stage. This is
                destructive — downstream artifacts are permanently removed.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {ADMIN_RERUN_STAGES.map((stage) => (
                  <details key={stage}>
                    <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-rule bg-paper-2 px-2.5 py-1.5 font-mono text-[11px] text-ink-3 transition hover:border-rose/60 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber disabled:cursor-not-allowed">
                      Rerun from {stage}…
                    </summary>
                    <div className="mt-2 ml-1 rounded-md border border-rose/30 bg-rose/5 p-3">
                      <p className="mb-3 font-mono text-[11px] text-rose">
                        This permanently deletes stage data for <strong>{stage}</strong> and all
                        downstream stages, plus all draft pages. This cannot be undone.
                      </p>
                      <form action={rerunStage}>
                        <input type="hidden" name="runId" value={run.id} />
                        <input type="hidden" name="stage" value={stage} />
                        <button
                          type="submit"
                          disabled={isUnpaid}
                          aria-describedby="stage-rerun-desc"
                          className="rounded-md border border-rose/60 bg-rose/10 px-4 py-2 font-mono text-[11px] text-rose transition hover:bg-rose/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose disabled:cursor-not-allowed disabled:border-rule disabled:bg-paper-2 disabled:text-ink-4"
                        >
                          Rerun from {stage} — {run.id.slice(0, 8)}…
                        </button>
                      </form>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Release status (read-only) ──────────────────────────────────── */}
        <section aria-label="Release status" className="rounded-lg border border-rule bg-paper">
          <div className="border-b border-rule px-5 py-3">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-ink-4">Release status</h2>
          </div>
          <div className="p-5">
            {liveHub ? (
              <div className="grid gap-4 text-body-sm md:grid-cols-2">
                <div className="rounded-md border border-rule bg-paper-2 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Public hub</div>
                  <Link
                    href={`/h/${liveHub.subdomain}`}
                    className="mt-2 block break-all font-mono text-[11px] text-amber-ink underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                  >
                    /h/{liveHub.subdomain}
                  </Link>
                  <div className="mt-2 font-mono text-[11px] text-ink-4">Theme: {liveHub.theme}</div>
                </div>
                <div className="rounded-md border border-rule bg-paper-2 p-4">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-ink-4">Live release</div>
                  <div className="mt-2 break-all font-mono text-[11px] text-ink">
                    {liveHub.liveReleaseId ?? <span className="text-ink-4">None</span>}
                  </div>
                  <div className="mt-2 font-mono text-[11px] text-ink-4">
                    {liveHub.releaseNumber
                      ? `#${liveHub.releaseNumber} / ${liveHub.releaseStatus}`
                      : 'No live release row'}
                  </div>
                  <div className="mt-2 break-all font-mono text-[10px] text-ink-4">
                    {liveHub.manifestR2Key ?? 'No manifest key'}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-body-sm text-ink-4">No hub has been published for this run project yet.</p>
            )}
          </div>
        </section>

        {/* ── Stripe webhook events (read-only) ──────────────────────────── */}
        <section aria-label="Stripe webhook events" className="rounded-lg border border-rule bg-paper">
          <div className="border-b border-rule px-5 py-3">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-ink-4">Stripe webhook events</h2>
          </div>
          <div className="divide-y divide-rule">
            {matchingStripeEvents.length > 0 ? (
              matchingStripeEvents.map((event) => (
                <div
                  key={event.id}
                  className="grid gap-3 px-5 py-4 text-body-sm md:grid-cols-[1.5fr_1.5fr_1fr]"
                >
                  <div>
                    <div className="font-mono text-[11px] font-medium text-ink">{event.type}</div>
                    <div className="mt-0.5 break-all font-mono text-[10px] text-ink-4">
                      {event.stripeEventId}
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-ink-3">
                    <div>Received {fmtUtc(event.receivedAt)}</div>
                    <div>
                      Processed{' '}
                      {event.processedAt ? fmtUtc(event.processedAt) : <span className="text-ink-4">Not processed</span>}
                    </div>
                  </div>
                  <div className={`font-mono text-[11px] ${event.processingError ? 'text-rose' : 'text-sage'}`}>
                    {event.processingError ?? 'No error'}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-6 text-body-sm text-ink-4">
                No matching Stripe events found. If checkout completed, inspect the Stripe endpoint
                delivery log.
              </div>
            )}
          </div>
        </section>

        {/* ── Admin audit (read-only) ─────────────────────────────────────── */}
        {auditRows.length > 0 && (
          <section aria-label="Admin audit log" className="rounded-lg border border-rule bg-paper">
            <div className="border-b border-rule px-5 py-3">
              <h2 className="font-mono text-[11px] uppercase tracking-widest text-ink-4">Admin audit</h2>
            </div>
            <div className="divide-y divide-rule">
              {auditRows.map((row) => (
                <div
                  key={`${row.action}-${row.createdAt.toISOString()}`}
                  className="grid gap-3 px-5 py-3 text-body-sm md:grid-cols-[1.5fr_1fr_1fr]"
                >
                  <div className="font-mono text-[11px] text-ink">{row.action}</div>
                  <div className="break-all font-mono text-[11px] text-ink-4">
                    {row.actorUserId ?? 'unknown actor'}
                  </div>
                  <div className="font-mono text-[11px] text-ink-4">{fmtUtc(row.createdAt)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Stage runs (read-only) ─────────────────────────────────────── */}
        <section aria-label="Stage runs" className="rounded-lg border border-rule bg-paper">
          <div className="border-b border-rule px-5 py-3">
            <h2 className="font-mono text-[11px] uppercase tracking-widest text-ink-4">Stage runs</h2>
          </div>

          {/* Header row — hidden on mobile */}
          <div
            className="hidden grid-cols-[minmax(0,1.5fr)_100px_80px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] gap-3 border-b border-rule bg-paper-2 px-5 py-3 md:grid"
            aria-hidden
          >
            {['Stage', 'Status', 'Duration', 'Artifact', 'Output', 'Error'].map((h) => (
              <span key={h} className="font-mono text-[10px] uppercase tracking-widest text-ink-4">
                {h}
              </span>
            ))}
          </div>

          <div className="divide-y divide-rule">
            {stageRuns.length > 0 ? (
              stageRuns.map((stage) => (
                <div
                  key={stage.id}
                  className="px-5 py-4 md:grid md:grid-cols-[minmax(0,1.5fr)_100px_80px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.5fr)] md:items-start md:gap-3"
                >
                  {/* Stage name + timestamp */}
                  <div className="mb-2 md:mb-0">
                    <div className="font-mono text-[11px] text-ink">{stage.stageName}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-ink-4">
                      {fmtUtc(stage.createdAt)}
                    </div>
                  </div>
                  {/* Status */}
                  <div className="mb-2 md:mb-0">{statusPill(stage.status)}</div>
                  {/* Duration */}
                  <div className="mb-2 font-mono text-[11px] text-ink-3 md:mb-0">
                    {formatDurationMs(stage.durationMs)}
                  </div>
                  {/* Artifact key */}
                  <div className="mb-2 break-all font-mono text-[10px] text-ink-4 md:mb-0">
                    {stage.artifactR2Key ?? '—'}
                  </div>
                  {/* Output JSON */}
                  <div className="mb-2 md:mb-0">
                    {stage.outputJson ? (
                      <details>
                        <summary className="cursor-pointer font-mono text-[10px] text-ink-3 hover:text-ink">
                          Output ▸
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-rule bg-paper-2 p-2 font-mono text-xs text-ink-3">
                          {truncateJson(stage.outputJson)}
                        </pre>
                      </details>
                    ) : (
                      <span className="font-mono text-[10px] text-ink-4">—</span>
                    )}
                  </div>
                  {/* Error JSON */}
                  <div>
                    {stage.errorJson ? (
                      <details>
                        <summary className="cursor-pointer font-mono text-[10px] text-rose hover:opacity-80">
                          Error ▸
                        </summary>
                        <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-rose/20 bg-rose/5 p-2 font-mono text-xs text-rose">
                          {truncateJson(stage.errorJson)}
                        </pre>
                      </details>
                    ) : (
                      <span className="font-mono text-[10px] text-ink-4">—</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-body-sm text-ink-4">
                This run has no stage rows yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
