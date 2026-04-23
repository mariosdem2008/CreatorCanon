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
export const metadata = { title: 'Admin Run Detail' };

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
  return object?.metadata?.runId === runId ||
    (paymentIntentId != null && (object?.id === paymentIntentId || object?.payment_intent === paymentIntentId));
}

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

  return (
    <main className="min-h-screen bg-paper-studio">
      <div className="border-b border-rule-dark bg-paper px-8 py-5">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
              Admin Console
            </div>
            <h1 className="font-serif text-heading-lg text-ink">{run.projectTitle}</h1>
          </div>
          <Link
            href="/admin/runs"
            className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
          >
            {'<- Back to runs'}
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[1080px] space-y-6 px-8 py-10">
        <section className="rounded-lg border border-rule bg-paper p-6">
          <div className="grid grid-cols-2 gap-6 text-body-sm md:grid-cols-4">
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Run</div>
              <div className="mt-1 break-all text-ink">{run.id}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Workspace</div>
              <div className="mt-1 break-all text-ink">{run.workspaceId}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Status</div>
              <div className="mt-1 capitalize text-ink">{run.status.replace('_', ' ')}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Price</div>
              <div className="mt-1 text-ink">{formatUsdCentsMaybe(run.priceCents)}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Pipeline</div>
              <div className="mt-1 text-ink">{run.pipelineVersion}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Created</div>
              <div className="mt-1 text-ink">{run.createdAt.toLocaleString()}</div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Started</div>
              <div className="mt-1 text-ink">
                {run.startedAt ? run.startedAt.toLocaleString() : 'Not started'}
              </div>
            </div>
            <div>
              <div className="text-caption uppercase tracking-widest text-ink-4">Completed</div>
              <div className="mt-1 text-ink">
                {run.completedAt ? run.completedAt.toLocaleString() : 'Not completed'}
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-md border border-rule bg-paper-2 p-4 text-body-sm">
              <div className="text-caption uppercase tracking-widest text-ink-4">Artifacts</div>
              <div className="mt-2 text-ink">
                {reviewStage ? 'Review artifact present' : 'Review artifact missing'}
              </div>
              <div className="mt-1 text-ink">
                {draftPagesStage
                  ? `${pages.length} draft page${pages.length === 1 ? '' : 's'}`
                  : 'Draft pages missing'}
              </div>
            </div>
            <div className="rounded-md border border-rule bg-paper-2 p-4 text-body-sm">
              <div className="text-caption uppercase tracking-widest text-ink-4">Stripe</div>
              <div className="mt-2 break-all text-ink">
                {run.stripePaymentIntentId ?? 'No payment intent recorded'}
              </div>
              <div className="mt-2 text-caption text-ink-4">
                {matchingStripeEvents.length > 0
                  ? `${matchingStripeEvents.length} matching webhook event${matchingStripeEvents.length === 1 ? '' : 's'} found`
                  : 'No matching webhook events found in the latest 50 events'}
              </div>
            </div>
            <div className="rounded-md border border-rule bg-paper-2 p-4 text-body-sm">
              <div className="text-caption uppercase tracking-widest text-ink-4">Project</div>
              <div className="mt-2 break-all text-ink">{run.projectId}</div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-rule bg-paper p-6">
          <h2 className="text-body-md font-medium text-ink">Admin rescue</h2>
          <p className="mt-2 text-body-sm text-ink-4">
            This clears the selected stage and downstream implemented stages, deletes draft-page rows for the run, then re-dispatches the shared pipeline.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={redispatchRun}>
              <input type="hidden" name="runId" value={run.id} />
              <button
                type="submit"
                disabled={run.status === 'awaiting_payment' || run.status === 'awaiting_review' || run.status === 'published'}
                className="rounded-md border border-rule bg-paper px-3 py-2 text-body-sm text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:text-ink-4"
              >
                Re-dispatch run
              </button>
            </form>
            <form action={publishRunFromAdmin}>
              <input type="hidden" name="runId" value={run.id} />
              <button
                type="submit"
                disabled={(run.status !== 'awaiting_review' && run.status !== 'published') || pages.length === 0}
                className="rounded-md border border-rule bg-paper px-3 py-2 text-body-sm text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:text-ink-4"
              >
                Publish current draft
              </button>
            </form>
          </div>
          <p className="mt-3 text-caption text-ink-4">
            Re-dispatch does not clear stage data. Use stage reruns below when the failed stage output should be rebuilt.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ADMIN_RERUN_STAGES.map((stage) => (
              <form key={stage} action={rerunStage}>
                <input type="hidden" name="runId" value={run.id} />
                <input type="hidden" name="stage" value={stage} />
                <button
                  type="submit"
                  disabled={run.status === 'awaiting_payment'}
                  className="rounded-md border border-rule bg-paper px-3 py-2 text-body-sm text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:text-ink-4"
                >
                  Rerun {stage}
                </button>
              </form>
            ))}
          </div>
          {run.status === 'awaiting_payment' && (
            <p className="mt-3 text-caption text-rose">
              Unpaid runs cannot be rerun from admin.
            </p>
          )}
        </section>

        <section className="rounded-lg border border-rule bg-paper p-6">
          <h2 className="text-body-md font-medium text-ink">Release status</h2>
          {liveHub ? (
            <div className="mt-4 grid gap-4 text-body-sm md:grid-cols-2">
              <div className="rounded-md border border-rule bg-paper-2 p-4">
                <div className="text-caption uppercase tracking-widest text-ink-4">Public hub</div>
                <Link href={`/h/${liveHub.subdomain}`} className="mt-2 block break-all text-ink underline">
                  /h/{liveHub.subdomain}
                </Link>
                <div className="mt-2 text-ink-4">Theme: {liveHub.theme}</div>
              </div>
              <div className="rounded-md border border-rule bg-paper-2 p-4">
                <div className="text-caption uppercase tracking-widest text-ink-4">Live release</div>
                <div className="mt-2 break-all text-ink">{liveHub.liveReleaseId ?? 'None'}</div>
                <div className="mt-2 text-ink-4">
                  {liveHub.releaseNumber ? `#${liveHub.releaseNumber} / ${liveHub.releaseStatus}` : 'No live release row'}
                </div>
                <div className="mt-2 break-all text-caption text-ink-4">
                  {liveHub.manifestR2Key ?? 'No manifest key'}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-body-sm text-ink-4">No hub has been published for this run project yet.</p>
          )}
        </section>

        <section className="rounded-lg border border-rule bg-paper p-6">
          <h2 className="text-body-md font-medium text-ink">Stripe webhook events</h2>
          <div className="mt-4 divide-y divide-rule rounded-md border border-rule">
            {matchingStripeEvents.length > 0 ? matchingStripeEvents.map((event) => (
              <div key={event.id} className="grid gap-3 px-4 py-3 text-body-sm md:grid-cols-[1fr_1fr_1fr]">
                <div>
                  <div className="font-medium text-ink">{event.type}</div>
                  <div className="break-all text-caption text-ink-4">{event.stripeEventId}</div>
                </div>
                <div className="text-ink-3">
                  Received {event.receivedAt.toLocaleString()}
                  <br />
                  Processed {event.processedAt ? event.processedAt.toLocaleString() : 'Not processed'}
                </div>
                <div className={event.processingError ? 'text-rose' : 'text-sage'}>
                  {event.processingError ?? 'No processing error'}
                </div>
              </div>
            )) : (
              <div className="px-4 py-5 text-body-sm text-ink-4">
                No matching Stripe events found. If checkout completed, inspect the Stripe endpoint delivery log.
              </div>
            )}
          </div>
        </section>

        {auditRows.length > 0 && (
          <section className="rounded-lg border border-rule bg-paper p-6">
            <h2 className="text-body-md font-medium text-ink">Admin audit</h2>
            <div className="mt-4 divide-y divide-rule rounded-md border border-rule">
              {auditRows.map((row) => (
                <div key={`${row.action}-${row.createdAt.toISOString()}`} className="grid gap-3 px-4 py-3 text-body-sm md:grid-cols-[1fr_1fr_1fr]">
                  <div className="text-ink">{row.action}</div>
                  <div className="break-all text-ink-4">{row.actorUserId ?? 'unknown actor'}</div>
                  <div className="text-ink-4">{row.createdAt.toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-rule bg-paper">
          <div className="grid grid-cols-[1.3fr_0.7fr_0.7fr_1fr_1.2fr_1.2fr] gap-3 border-b border-rule bg-paper-2 px-5 py-3 text-caption uppercase tracking-widest text-ink-4">
            <span>Stage</span>
            <span>Status</span>
            <span>Duration</span>
            <span>Artifact</span>
            <span>Output</span>
            <span>Error</span>
          </div>

          <div className="divide-y divide-rule">
            {stageRuns.length > 0 ? (
              stageRuns.map((stage) => (
                <div
                  key={stage.id}
                  className="grid grid-cols-[1.3fr_0.7fr_0.7fr_1fr_1.2fr_1.2fr] gap-3 px-5 py-4 text-body-sm"
                >
                  <div>
                    <div className="text-ink">{stage.stageName}</div>
                    <div className="text-caption text-ink-4">
                      {stage.createdAt.toLocaleString()}
                    </div>
                  </div>
                  <span className="capitalize text-ink">{stage.status.replace('_', ' ')}</span>
                  <span className="text-ink-3">{formatDurationMs(stage.durationMs)}</span>
                  <span className="break-all text-caption text-ink-4">
                    {stage.artifactR2Key ?? 'None'}
                  </span>
                  <pre className="whitespace-pre-wrap break-words text-caption text-ink-3">
                    {truncateJson(stage.outputJson)}
                  </pre>
                  <pre className="whitespace-pre-wrap break-words text-caption text-rose">
                    {truncateJson(stage.errorJson)}
                  </pre>
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
