import { tasks } from '@trigger.dev/sdk/v3';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  project,
} from '@creatorcanon/db/schema';
import type { RunGenerationPipelinePayload } from '@creatorcanon/pipeline';

import { loadDefaultEnvFiles } from './env-files';

const POLL_INTERVAL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15 * 60_000;

function requireRunId(): string {
  const fromArg = process.argv[2]?.trim();
  const fromEnv = process.env.ALPHA_TRIGGER_RUN_ID?.trim();
  const runId = fromArg || fromEnv;
  if (!runId) {
    throw new Error('Pass a run id as the first arg or set ALPHA_TRIGGER_RUN_ID.');
  }
  return runId;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadRun(runId: string) {
  const db = getDb();
  const rows = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      status: generationRun.status,
      pipelineVersion: generationRun.pipelineVersion,
      stripePaymentIntentId: generationRun.stripePaymentIntentId,
      projectTitle: project.title,
    })
    .from(generationRun)
    .innerJoin(project, eq(project.id, generationRun.projectId))
    .where(eq(generationRun.id, runId))
    .limit(1);

  const run = rows[0];
  if (!run) throw new Error(`Run ${runId} was not found.`);
  return run;
}

async function loadStageSummary(runId: string) {
  const db = getDb();
  const stages = await db
    .select({
      stageName: generationStageRun.stageName,
      status: generationStageRun.status,
      durationMs: generationStageRun.durationMs,
      errorJson: generationStageRun.errorJson,
    })
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, runId))
    .orderBy(generationStageRun.createdAt);

  return {
    stageCount: stages.length,
    failedStageCount: stages.filter((stage) => stage.status.startsWith('failed')).length,
    stages,
  };
}

function assertDispatchable(run: {
  status: string;
  stripePaymentIntentId: string | null;
}) {
  if (run.status === 'awaiting_payment') {
    throw new Error('Cannot dispatch an unpaid awaiting_payment run.');
  }
  if (run.status === 'awaiting_review' || run.status === 'published') {
    throw new Error(`Run is already ${run.status}; trigger dispatch is not needed.`);
  }
  if (!run.stripePaymentIntentId && process.env.ALPHA_TRIGGER_ALLOW_NO_PAYMENT !== 'true') {
    throw new Error('Run has no payment intent. Refusing dispatch without ALPHA_TRIGGER_ALLOW_NO_PAYMENT=true.');
  }
}

async function main() {
  loadDefaultEnvFiles();
  const runId = requireRunId();
  const timeoutMs = Number(process.env.ALPHA_TRIGGER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  const run = await loadRun(runId);
  assertDispatchable(run);

  const payload: RunGenerationPipelinePayload = {
    runId: run.id,
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    videoSetId: run.videoSetId,
    pipelineVersion: run.pipelineVersion,
  };

  const triggerHandle = await tasks.trigger('run-pipeline', payload);
  const startedAt = Date.now();
  let lastRun = run;
  let lastStages = await loadStageSummary(runId);

  while (Date.now() - startedAt < timeoutMs) {
    await sleep(POLL_INTERVAL_MS);
    lastRun = await loadRun(runId);
    lastStages = await loadStageSummary(runId);

    if (lastRun.status === 'awaiting_review') {
      console.info(JSON.stringify({
        ok: true,
        runId,
        projectId: run.projectId,
        projectTitle: run.projectTitle,
        triggerHandle,
        status: lastRun.status,
        elapsedMs: Date.now() - startedAt,
        pipeline: lastStages,
      }, null, 2));
      return;
    }

    if (lastRun.status === 'failed') {
      throw new Error(JSON.stringify({
        message: 'Triggered run failed before reaching awaiting_review.',
        runId,
        triggerHandle,
        pipeline: lastStages,
      }, null, 2));
    }
  }

  throw new Error(JSON.stringify({
    message: `Timed out after ${timeoutMs}ms waiting for Trigger-dispatched run.`,
    runId,
    triggerHandle,
    status: lastRun.status,
    pipeline: lastStages,
  }, null, 2));
}

main().catch(async (error) => {
  console.error('[smoke-trigger-dispatch] failed', error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDb();
});
