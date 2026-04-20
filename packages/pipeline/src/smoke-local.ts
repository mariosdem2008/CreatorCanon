import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { and, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  hub,
  page,
  project,
  release,
} from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv, PIPELINE_VERSION } from '@creatorcanon/core';

import { closeDb } from '@creatorcanon/db/client';
import { runGenerationPipeline } from './run-generation-pipeline';
import { publishRunAsHub } from './publish-run-as-hub';
import { releaseManifestV0Schema } from './contracts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const RUN_ID = 'local-smoke-run';
const PROJECT_ID = 'local-smoke-project';
const WORKSPACE_ID = 'local-smoke-workspace';
const VIDEO_SET_ID = 'local-smoke-video-set';

const REQUIRED_STAGES = [
  'import_selection_snapshot',
  'ensure_transcripts',
  'normalize_transcripts',
  'segment_transcripts',
  'synthesize_v0_review',
  'draft_pages_v0',
] as const;

function loadEnvFile(filePath: string, opts?: { override?: boolean }) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    if (!opts?.override && process.env[key] !== undefined) continue;

    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function run() {
  loadEnvFile(path.resolve(repoRoot, '.env'));
  loadEnvFile(path.resolve(repoRoot, '.env.local'), { override: true });

  process.env.ARTIFACT_STORAGE ??= 'local';
  process.env.LOCAL_ARTIFACT_DIR ??= '.local/artifacts';

  const result = await runGenerationPipeline({
    runId: RUN_ID,
    projectId: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    videoSetId: VIDEO_SET_ID,
    pipelineVersion: PIPELINE_VERSION,
  });

  const db = getDb();
  const runs = await db
    .select({
      id: generationRun.id,
      status: generationRun.status,
      completedAt: generationRun.completedAt,
    })
    .from(generationRun)
    .where(eq(generationRun.id, RUN_ID))
    .limit(1);

  const runRow = runs[0];
  assert(runRow, 'Seeded generation run was not found.');
  assert(runRow.status === 'awaiting_review', `Expected run awaiting_review, got ${runRow.status}.`);
  assert(runRow.completedAt, 'Expected run completedAt to be set.');

  const stageRows = await db
    .select({
      stageName: generationStageRun.stageName,
      status: generationStageRun.status,
      outputJson: generationStageRun.outputJson,
    })
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, RUN_ID));

  for (const stage of REQUIRED_STAGES) {
    const row = stageRows.find((item) => item.stageName === stage);
    assert(row, `Missing stage row for ${stage}.`);
    assert(row.status === 'succeeded', `Expected ${stage} succeeded, got ${row.status}.`);
  }

  const reviewStage = stageRows.find((item) => item.stageName === 'synthesize_v0_review');
  const draftStage = stageRows.find((item) => item.stageName === 'draft_pages_v0');
  const reviewKey = (reviewStage?.outputJson as { r2Key?: string } | null)?.r2Key;
  const draftKey = (draftStage?.outputJson as { r2Key?: string } | null)?.r2Key;

  assert(reviewKey, 'Review stage did not expose an artifact key.');
  assert(draftKey, 'Draft pages stage did not expose an artifact key.');

  const r2 = createR2Client(parseServerEnv(process.env));
  await r2.headObject(reviewKey);
  await r2.headObject(draftKey);

  const pages = await db
    .select({ id: page.id, slug: page.slug })
    .from(page)
    .where(eq(page.runId, RUN_ID));
  assert(pages.length > 0, 'Expected draft page rows to exist.');

  const projects = await db
    .select({ id: project.id, currentRunId: project.currentRunId })
    .from(project)
    .where(and(eq(project.id, PROJECT_ID), eq(project.currentRunId, RUN_ID)))
    .limit(1);
  assert(projects[0], 'Expected seeded project to point at the smoke run.');

  const publishResult = await publishRunAsHub({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    runId: RUN_ID,
    actorUserId: 'local-smoke-user',
  });

  const publishedRuns = await db
    .select({ status: generationRun.status })
    .from(generationRun)
    .where(eq(generationRun.id, RUN_ID))
    .limit(1);
  assert(publishedRuns[0]?.status === 'published', 'Expected smoke run to be published.');

  const hubs = await db
    .select({
      id: hub.id,
      subdomain: hub.subdomain,
      liveReleaseId: hub.liveReleaseId,
    })
    .from(hub)
    .where(and(eq(hub.projectId, PROJECT_ID), eq(hub.workspaceId, WORKSPACE_ID)))
    .limit(1);
  assert(hubs[0], 'Expected published hub to exist.');
  assert(hubs[0].subdomain === 'local-smoke-knowledge-hub', `Unexpected smoke hub subdomain ${hubs[0].subdomain}.`);
  assert(hubs[0].liveReleaseId === publishResult.releaseId, 'Expected hub live release to match publish result.');

  const releases = await db
    .select({
      id: release.id,
      status: release.status,
      manifestR2Key: release.manifestR2Key,
    })
    .from(release)
    .where(and(eq(release.id, publishResult.releaseId), eq(release.status, 'live')))
    .limit(1);
  assert(releases[0]?.manifestR2Key, 'Expected live release manifest key.');
  const manifestObject = await r2.getObject(releases[0].manifestR2Key);
  const manifest = releaseManifestV0Schema.parse(
    JSON.parse(new TextDecoder().decode(manifestObject.body)),
  );
  const sourceRefs = manifest.pages.flatMap((manifestPage) => manifestPage.blocks.flatMap((block) => {
    const content = block.content as { sourceRefs?: unknown };
    return Array.isArray(content.sourceRefs) ? content.sourceRefs : [];
  }));
  assert(sourceRefs.length > 0, 'Expected release manifest to include source references.');
  for (const ref of sourceRefs) {
    const candidate = ref as {
      videoId?: string;
      segmentId?: string;
      startMs?: number;
      endMs?: number;
      quote?: string;
    };
    assert(candidate.videoId, 'Expected source ref videoId.');
    assert(candidate.segmentId, 'Expected source ref segmentId.');
    assert(typeof candidate.startMs === 'number', 'Expected source ref startMs.');
    assert(typeof candidate.endMs === 'number', 'Expected source ref endMs.');
    assert(candidate.quote, 'Expected source ref quote.');
  }

  const publishedProjects = await db
    .select({ publishedHubId: project.publishedHubId })
    .from(project)
    .where(eq(project.id, PROJECT_ID))
    .limit(1);
  assert(publishedProjects[0]?.publishedHubId === hubs[0].id, 'Expected project to point at the published hub.');

  await closeDb();

  console.info(JSON.stringify({
    ok: true,
    runId: result.runId,
    videoCount: result.videoCount,
    segmentsCreated: result.segmentsCreated,
    reviewArtifactKey: result.reviewArtifactKey,
    draftPageCount: result.draftPageCount,
    draftPagesArtifactKey: result.draftPagesArtifactKey,
    publicPath: publishResult.publicPath,
    releaseManifestKey: publishResult.manifestR2Key,
  }, null, 2));
}

run().catch(async (error) => {
  await closeDb();
  console.error('[smoke-local] failed', error);
  process.exit(1);
});
