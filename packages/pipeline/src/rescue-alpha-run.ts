import { asc, closeDb, eq, getDb } from '@creatorcanon/db';
import {
  auditLog,
  generationRun,
  generationStageRun,
  project,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from './env-files';
import { runGenerationPipeline } from './run-generation-pipeline';

function requireRunId(): string {
  const fromArg = process.argv[2]?.trim();
  const fromEnv = process.env.ALPHA_RESCUE_RUN_ID?.trim();
  const runId = fromArg || fromEnv;
  if (!runId) {
    throw new Error('Pass a run id as the first arg or set ALPHA_RESCUE_RUN_ID.');
  }
  return runId;
}

function isLocalDatabase(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('host.docker.internal');
}

function requireConfirmation() {
  if (isLocalDatabase(process.env.DATABASE_URL)) return;
  if (process.env.ALPHA_RESCUE_CONFIRM !== 'true') {
    throw new Error('Set ALPHA_RESCUE_CONFIRM=true to rescue a run against a non-local database.');
  }
}

function assertRescuable(run: {
  status: string;
  stripePaymentIntentId: string | null;
}) {
  if (run.status === 'awaiting_payment') {
    throw new Error('Cannot rescue an unpaid awaiting_payment run.');
  }
  if (run.status === 'awaiting_review' || run.status === 'published') {
    throw new Error(`Run is already ${run.status}; pipeline rescue is not needed.`);
  }
  if (!run.stripePaymentIntentId && process.env.ALPHA_RESCUE_ALLOW_NO_PAYMENT !== 'true') {
    throw new Error('Run has no payment intent. Refusing rescue without ALPHA_RESCUE_ALLOW_NO_PAYMENT=true.');
  }
}

async function main() {
  loadDefaultEnvFiles();
  requireConfirmation();

  const runId = requireRunId();
  const actorUserId = process.env.ALPHA_RESCUE_ACTOR_USER_ID ?? 'alpha-rescue-operator';
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
  assertRescuable(run);

  const beforeStages = await db
    .select({
      id: generationStageRun.id,
      stageName: generationStageRun.stageName,
      status: generationStageRun.status,
      attempt: generationStageRun.attempt,
      startedAt: generationStageRun.startedAt,
      completedAt: generationStageRun.completedAt,
      errorJson: generationStageRun.errorJson,
    })
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, runId))
    .orderBy(asc(generationStageRun.createdAt));

  const startedAuditId = crypto.randomUUID();
  await db.insert(auditLog).values({
    id: startedAuditId,
    workspaceId: run.workspaceId,
    actorUserId,
    action: 'operator.rescue_alpha_run.started',
    targetType: 'generation_run',
    targetId: runId,
    beforeJson: {
      status: run.status,
      stripePaymentIntentId: run.stripePaymentIntentId,
      stages: beforeStages.map((stage) => ({
        id: stage.id,
        stageName: stage.stageName,
        status: stage.status,
        attempt: stage.attempt,
        startedAt: stage.startedAt?.toISOString() ?? null,
        completedAt: stage.completedAt?.toISOString() ?? null,
      })),
    },
  });

  try {
    const result = await runGenerationPipeline({
      runId: run.id,
      projectId: run.projectId,
      workspaceId: run.workspaceId,
      videoSetId: run.videoSetId,
      pipelineVersion: run.pipelineVersion,
    });

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      actorUserId,
      action: 'operator.rescue_alpha_run.succeeded',
      targetType: 'generation_run',
      targetId: runId,
      beforeJson: { startedAuditId },
      afterJson: result as unknown as Record<string, unknown>,
    });

    console.info(JSON.stringify({
      ok: true,
      rescued: true,
      runId,
      projectId: run.projectId,
      projectTitle: run.projectTitle,
      result,
    }, null, 2));
  } catch (error) {
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      actorUserId,
      action: 'operator.rescue_alpha_run.failed',
      targetType: 'generation_run',
      targetId: runId,
      beforeJson: { startedAuditId },
      afterJson: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

main().catch(async (error) => {
  console.error('[rescue-alpha-run] failed', error);
  process.exitCode = 1;
}).finally(async () => {
  await closeDb();
});
