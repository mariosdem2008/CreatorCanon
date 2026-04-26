import { and, asc, closeDb, desc, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  hub,
  page,
  project,
  release,
  stripeEvent,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from './env-files';

function requireRunId(): string {
  const fromArg = process.argv[2]?.trim();
  const fromEnv = process.env.ALPHA_INSPECT_RUN_ID?.trim() || process.env.ALPHA_SMOKE_RUN_ID?.trim();
  const runId = fromArg || fromEnv;
  if (!runId) {
    throw new Error('Pass a run id as the first arg or set ALPHA_INSPECT_RUN_ID.');
  }
  return runId;
}

function eventMatchesRun(event: typeof stripeEvent.$inferSelect, runId: string, paymentIntentId: string | null): boolean {
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

function nextAction(input: {
  status: string;
  stripePaymentIntentId: string | null;
  latestCheckoutEvent?: typeof stripeEvent.$inferSelect;
  failedStageCount: number;
  draftPageCount: number;
  liveReleaseId?: string | null;
}) {
  if (input.status === 'awaiting_payment') {
    if (!input.latestCheckoutEvent) return 'No checkout webhook event found. Check Stripe endpoint delivery.';
    if (input.latestCheckoutEvent.processingError) return 'Checkout webhook errored. Inspect processing_error and retry delivery.';
    if (!input.stripePaymentIntentId) return 'Checkout webhook processed but run has no payment intent. Inspect webhook metadata.';
    return 'Payment event exists but run is still awaiting_payment. This is a blocker; inspect webhook handler.';
  }
  if (input.status === 'queued') return 'Run is paid and queued. If stale, use admin re-dispatch.';
  if (input.status === 'running') return 'Run is processing. Check stage progress and worker logs if stale.';
  if (input.status === 'failed') {
    return input.failedStageCount > 0
      ? 'Run failed with failed stage rows. Use admin rerun from the failed/downstream stage.'
      : 'Run failed before stage rows. Use admin re-dispatch after checking worker logs.';
  }
  if (input.status === 'awaiting_review') {
    return input.draftPageCount > 0 ? 'Draft pages are ready. Review/approve/publish.' : 'Review status without draft pages. Re-dispatch the run from the adapt stage.';
  }
  if (input.status === 'published') {
    return input.liveReleaseId ? 'Published hub is live.' : 'Run is published but no live release is attached. Use admin publish if draft pages exist.';
  }
  return 'No specific action.';
}

async function main() {
  loadDefaultEnvFiles();
  const runId = requireRunId();
  const db = getDb();

  const runRows = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      status: generationRun.status,
      pipelineVersion: generationRun.pipelineVersion,
      priceCents: generationRun.priceCents,
      stripePaymentIntentId: generationRun.stripePaymentIntentId,
      createdAt: generationRun.createdAt,
      updatedAt: generationRun.updatedAt,
      projectTitle: project.title,
      publishedHubId: project.publishedHubId,
    })
    .from(generationRun)
    .innerJoin(project, eq(project.id, generationRun.projectId))
    .where(eq(generationRun.id, runId))
    .limit(1);

  const run = runRows[0];
  if (!run) throw new Error(`Run ${runId} was not found.`);

  const [stages, pages, hubRows, recentEvents] = await Promise.all([
    db
      .select({
        stageName: generationStageRun.stageName,
        status: generationStageRun.status,
        durationMs: generationStageRun.durationMs,
        artifactR2Key: generationStageRun.artifactR2Key,
        errorJson: generationStageRun.errorJson,
      })
      .from(generationStageRun)
      .where(eq(generationStageRun.runId, run.id))
      .orderBy(asc(generationStageRun.createdAt)),
    db
      .select({ id: page.id, slug: page.slug, status: page.status, currentVersionId: page.currentVersionId })
      .from(page)
      .where(eq(page.runId, run.id))
      .orderBy(asc(page.position)),
    db
      .select({
        id: hub.id,
        subdomain: hub.subdomain,
        theme: hub.theme,
        liveReleaseId: hub.liveReleaseId,
        releaseId: release.id,
        releaseNumber: release.releaseNumber,
        releaseStatus: release.status,
        manifestR2Key: release.manifestR2Key,
      })
      .from(hub)
      .leftJoin(release, eq(release.id, hub.liveReleaseId))
      .where(and(eq(hub.projectId, run.projectId), eq(hub.workspaceId, run.workspaceId)))
      .limit(1),
    db
      .select()
      .from(stripeEvent)
      .orderBy(desc(stripeEvent.receivedAt))
      .limit(50),
  ]);

  const matchingEvents = recentEvents
    .filter((event) => eventMatchesRun(event, run.id, run.stripePaymentIntentId))
    .slice(0, 5)
    .map((event) => ({
      id: event.id,
      stripeEventId: event.stripeEventId,
      type: event.type,
      receivedAt: event.receivedAt.toISOString(),
      processedAt: event.processedAt?.toISOString() ?? null,
      processingError: event.processingError,
    }));

  const liveHub = hubRows[0];
  const failedStageCount = stages.filter((stage) => stage.status.startsWith('failed')).length;

  console.info(JSON.stringify({
    ok: true,
    run: {
      id: run.id,
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      projectTitle: run.projectTitle,
      status: run.status,
      pipelineVersion: run.pipelineVersion,
      priceCents: run.priceCents,
      stripePaymentIntentId: run.stripePaymentIntentId,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
    },
    stripe: {
      latestMatchingEvents: matchingEvents,
      checkoutEventProcessed: matchingEvents.some((event) => event.type === 'checkout.session.completed' && event.processedAt && !event.processingError),
    },
    pipeline: {
      stageCount: stages.length,
      failedStageCount,
      stages,
    },
    content: {
      draftPageCount: pages.length,
      pages,
    },
    release: liveHub ? {
      hubId: liveHub.id,
      publicPath: `/h/${liveHub.subdomain}`,
      theme: liveHub.theme,
      liveReleaseId: liveHub.liveReleaseId,
      releaseNumber: liveHub.releaseNumber,
      releaseStatus: liveHub.releaseStatus,
      manifestR2Key: liveHub.manifestR2Key,
    } : null,
    nextAction: nextAction({
      status: run.status,
      stripePaymentIntentId: run.stripePaymentIntentId,
      latestCheckoutEvent: recentEvents.find((event) => eventMatchesRun(event, run.id, run.stripePaymentIntentId) && event.type === 'checkout.session.completed'),
      failedStageCount,
      draftPageCount: pages.length,
      liveReleaseId: liveHub?.liveReleaseId,
    }),
  }, null, 2));
}

main().catch(async (error) => {
  console.error('[inspect-alpha-run] failed', error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDb();
});
