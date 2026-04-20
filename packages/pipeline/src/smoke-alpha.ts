import { createR2Client } from '@creatorcanon/adapters';
import { createStripeClient } from '@creatorcanon/adapters/stripe';
import { and, asc, closeDb, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  hub,
  page,
  project,
  release,
} from '@creatorcanon/db/schema';
import { parseServerEnv } from '@creatorcanon/core';

import { releaseManifestV0Schema } from './contracts';
import { loadDefaultEnvFiles } from './env-files';
import { publishRunAsHub } from './publish-run-as-hub';
import { runGenerationPipeline } from './run-generation-pipeline';

const REQUIRED_STAGES = [
  'import_selection_snapshot',
  'ensure_transcripts',
  'normalize_transcripts',
  'segment_transcripts',
  'synthesize_v0_review',
  'draft_pages_v0',
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for smoke:alpha.`);
  return value;
}

async function verifyR2RoundTrip() {
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const key = `__smoke_alpha__/${Date.now()}-${crypto.randomUUID()}.json`;
  const body = JSON.stringify({ ok: true, generatedAt: new Date().toISOString() });

  await r2.putObject({ key, body, contentType: 'application/json' });
  const readBack = await r2.getObject(key);
  assert(new TextDecoder().decode(readBack.body) === body, 'R2 round-trip body mismatch.');
  await r2.deleteObject(key);

  return { key };
}

async function verifyStripeCheckout() {
  const env = parseServerEnv(process.env);
  if (
    env.ARTIFACT_STORAGE === 'local' &&
    env.STRIPE_SECRET_KEY === 'sk_test_local_smoke'
  ) {
    return {
      skipped: true,
      reason: 'Skipped Stripe Checkout creation for local fake smoke key.',
    };
  }

  assert(
    env.STRIPE_SECRET_KEY.startsWith('sk_test_'),
    'smoke:alpha requires a Stripe test-mode secret key.',
  );

  const appUrl = requireEnv('NEXT_PUBLIC_APP_URL');
  const stripe = createStripeClient(env);
  const session = await stripe.createCheckoutSession({
    amountCents: 100,
    currency: 'usd',
    productName: 'CreatorCanon alpha smoke checkout',
    mode: 'payment',
    quantity: 1,
    successUrl: `${appUrl.replace(/\/$/, '')}/app/checkout?smoke=success`,
    cancelUrl: `${appUrl.replace(/\/$/, '')}/app/checkout?smoke=cancel`,
    idempotencyKey: `alpha-smoke-${Date.now()}`,
    metadata: {
      smoke: 'alpha',
      generatedAt: new Date().toISOString(),
    },
  });

  return { checkoutSessionId: session.id, checkoutUrlPresent: Boolean(session.url) };
}

async function verifyStageRows(runId: string) {
  const db = getDb();
  const stageRows = await db
    .select({
      stageName: generationStageRun.stageName,
      status: generationStageRun.status,
      outputJson: generationStageRun.outputJson,
      errorJson: generationStageRun.errorJson,
    })
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, runId))
    .orderBy(asc(generationStageRun.createdAt));

  for (const stage of REQUIRED_STAGES) {
    const row = stageRows.find((item) => item.stageName === stage);
    assert(row, `Missing stage row for ${stage}.`);
    assert(row.status === 'succeeded', `Expected ${stage} succeeded, got ${row.status}.`);
  }

  const reviewStage = stageRows.find((item) => item.stageName === 'synthesize_v0_review');
  const draftStage = stageRows.find((item) => item.stageName === 'draft_pages_v0');
  const reviewArtifactKey = (reviewStage?.outputJson as { r2Key?: string } | undefined)?.r2Key;
  const draftPagesArtifactKey = (draftStage?.outputJson as { r2Key?: string } | undefined)?.r2Key;
  assert(reviewArtifactKey, 'Review stage did not expose an artifact key.');
  assert(draftPagesArtifactKey, 'Draft pages stage did not expose an artifact key.');

  return { stageRows, reviewArtifactKey, draftPagesArtifactKey };
}

async function verifyPublishedManifest(input: {
  workspaceId: string;
  projectId: string;
  runId: string;
  publishResult?: {
    hubId: string;
    releaseId: string;
    publicPath: string;
    manifestR2Key: string;
  };
}) {
  const db = getDb();
  const r2 = createR2Client(parseServerEnv(process.env));

  let manifestR2Key = input.publishResult?.manifestR2Key;
  let publicPath = input.publishResult?.publicPath;
  let releaseId = input.publishResult?.releaseId;

  if (!manifestR2Key) {
    const rows = await db
      .select({
        subdomain: hub.subdomain,
        liveReleaseId: hub.liveReleaseId,
        manifestR2Key: release.manifestR2Key,
        releaseId: release.id,
      })
      .from(hub)
      .innerJoin(release, eq(release.id, hub.liveReleaseId))
      .where(and(eq(hub.projectId, input.projectId), eq(hub.workspaceId, input.workspaceId)))
      .limit(1);
    const row = rows[0];
    assert(row?.manifestR2Key, 'Published hub release manifest was not found.');
    manifestR2Key = row.manifestR2Key;
    publicPath = `/h/${row.subdomain}`;
    releaseId = row.releaseId;
  }

  const manifestObject = await r2.getObject(manifestR2Key);
  const manifest = releaseManifestV0Schema.parse(
    JSON.parse(new TextDecoder().decode(manifestObject.body)),
  );
  const sourceRefs = manifest.pages.flatMap((manifestPage) => manifestPage.blocks.flatMap((block) => {
    const content = block.content as { sourceRefs?: unknown };
    return Array.isArray(content.sourceRefs) ? content.sourceRefs : [];
  }));

  assert(manifest.runId === input.runId, 'Release manifest run id does not match smoke run.');
  assert(manifest.pages.length > 0, 'Release manifest has no pages.');
  assert(sourceRefs.length > 0, 'Release manifest has no source references.');

  return {
    releaseId,
    manifestR2Key,
    publicPath,
    pageCount: manifest.pages.length,
    sourceRefCount: sourceRefs.length,
  };
}

async function main() {
  loadDefaultEnvFiles();

  const env = parseServerEnv(process.env);
  const runId = requireEnv('ALPHA_SMOKE_RUN_ID');
  const actorUserId = process.env.ALPHA_SMOKE_ACTOR_USER_ID ?? 'alpha-smoke-operator';

  const r2Check = await verifyR2RoundTrip();
  const stripeCheck = await verifyStripeCheckout();

  const db = getDb(env.DATABASE_URL);
  const rows = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      pipelineVersion: generationRun.pipelineVersion,
      status: generationRun.status,
      projectTitle: project.title,
    })
    .from(generationRun)
    .innerJoin(project, eq(project.id, generationRun.projectId))
    .where(eq(generationRun.id, runId))
    .limit(1);

  const run = rows[0];
  assert(run, `Generation run ${runId} was not found.`);
  assert(run.status !== 'awaiting_payment', 'Cannot smoke an unpaid awaiting_payment run.');

  let pipelineResult:
    | Awaited<ReturnType<typeof runGenerationPipeline>>
    | { runId: string; skipped: true; reason: string };

  if (run.status === 'published') {
    pipelineResult = {
      runId: run.id,
      skipped: true,
      reason: 'Run was already published; smoke verified existing stage rows and release manifest.',
    };
  } else {
    pipelineResult = await runGenerationPipeline({
      runId: run.id,
      projectId: run.projectId,
      workspaceId: run.workspaceId,
      videoSetId: run.videoSetId,
      pipelineVersion: run.pipelineVersion,
    });
  }

  const stageCheck = await verifyStageRows(run.id);
  const pages = await db
    .select({ id: page.id })
    .from(page)
    .where(and(eq(page.runId, run.id), eq(page.workspaceId, run.workspaceId)));
  assert(pages.length > 0, 'Expected draft page rows for alpha smoke run.');

  let publishResult:
    | Awaited<ReturnType<typeof publishRunAsHub>>
    | undefined;
  if (run.status !== 'published') {
    publishResult = await publishRunAsHub({
      workspaceId: run.workspaceId,
      projectId: run.projectId,
      runId: run.id,
      actorUserId,
    });
  }

  const manifestCheck = await verifyPublishedManifest({
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    runId: run.id,
    publishResult,
  });

  await closeDb();

  console.info(JSON.stringify({
    ok: true,
    runId: run.id,
    projectId: run.projectId,
    projectTitle: run.projectTitle,
    r2RoundTrip: r2Check,
    stripeCheckout: stripeCheck,
    pipeline: pipelineResult,
    reviewArtifactKey: stageCheck.reviewArtifactKey,
    draftPagesArtifactKey: stageCheck.draftPagesArtifactKey,
    draftPageRows: pages.length,
    release: manifestCheck,
  }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[smoke-alpha] failed', error);
  process.exit(1);
});
