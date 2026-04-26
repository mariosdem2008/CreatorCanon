import { createR2Client } from '@creatorcanon/adapters';
import { createStripeClient } from '@creatorcanon/adapters/stripe';
import { and, asc, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  hub,
  page,
  project,
  release,
  transcriptAsset,
  video,
  videoSetItem,
} from '@creatorcanon/db/schema';
import { parseServerEnv } from '@creatorcanon/core';

import { loadDefaultEnvFiles } from './env-files';
import { publishRunAsHub } from './publish-run-as-hub';
import { runGenerationPipeline } from './run-generation-pipeline';
import type { EditorialAtlasManifest } from './adapters/editorial-atlas/manifest-types';

const REQUIRED_STAGES = [
  'import_selection_snapshot',
  'ensure_transcripts',
  'normalize_transcripts',
  'segment_transcripts',
  'discovery',
  'synthesis',
  'verify',
  'merge',
  'adapt',
] as const;

function normalizeTheme(value: unknown): 'paper' | 'midnight' | 'field' {
  if (value === 'midnight' || value === 'playbook') return 'midnight';
  if (value === 'field' || value === 'guided') return 'field';
  return 'paper';
}

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

  return { stageRows };
}

async function verifyPublishedManifest(input: {
  workspaceId: string;
  projectId: string;
  videoSetId: string;
  runId: string;
  expectedTheme: 'paper' | 'midnight' | 'field';
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
  let theme: string | undefined;

  if (!manifestR2Key) {
    const rows = await db
      .select({
      subdomain: hub.subdomain,
      theme: hub.theme,
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
    theme = row.theme;
  } else {
    const rows = await db
      .select({ theme: hub.theme })
      .from(hub)
      .where(eq(hub.id, input.publishResult!.hubId))
      .limit(1);
    theme = rows[0]?.theme;
  }
  assert(theme === input.expectedTheme, `Expected published hub theme ${input.expectedTheme}, got ${String(theme)}.`);

  const manifestObject = await r2.getObject(manifestR2Key);
  const manifest = JSON.parse(
    new TextDecoder().decode(manifestObject.body),
  ) as EditorialAtlasManifest;
  const citationCount = manifest.pages?.reduce(
    (sum, p) => sum + (p.citations?.length ?? 0),
    0,
  ) ?? 0;

  assert(
    manifest.schemaVersion === 'editorial_atlas_v1',
    'Release manifest schemaVersion is not editorial_atlas_v1.',
  );
  assert(manifest.pages.length > 0, 'Release manifest has no pages.');

  if (citationCount === 0) {
    const selectedVideoRows = await db
      .select({ videoId: videoSetItem.videoId })
      .from(videoSetItem)
      .innerJoin(video, eq(video.id, videoSetItem.videoId))
      .where(eq(videoSetItem.videoSetId, input.videoSetId));
    const selectedIds = selectedVideoRows.map((r) => r.videoId);
    const transcriptRows = selectedIds.length > 0
      ? await db
          .select({ id: transcriptAsset.id })
          .from(transcriptAsset)
          .where(and(
            eq(transcriptAsset.workspaceId, input.workspaceId),
            eq(transcriptAsset.isCanonical, true),
            inArray(transcriptAsset.videoId, selectedIds),
          ))
      : [];
    const transcriptsForSelected = transcriptRows.length;
    if (transcriptsForSelected === 0) {
      console.warn(
        '[smoke-alpha] WARN: Release manifest has 0 citations because none of the ' +
          selectedIds.length +
          ' selected videos returned fetchable captions. Graceful no-caption path verified.',
      );
    } else {
      assert(
        citationCount > 0,
        'Release manifest has no citations despite ' + transcriptsForSelected + ' transcripts on the run. This is a real pipeline bug.',
      );
    }
  }

  return {
    releaseId,
    manifestR2Key,
    publicPath,
    theme,
    pageCount: manifest.pages.length,
    citationCount,
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
      projectConfig: project.config,
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
    videoSetId: run.videoSetId,
    runId: run.id,
    expectedTheme: normalizeTheme((run.projectConfig as { presentation_preset?: unknown } | null)?.presentation_preset),
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
    pageRows: pages.length,
    release: manifestCheck,
  }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[smoke-alpha] failed', error);
  process.exit(1);
});
