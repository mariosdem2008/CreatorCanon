import { eq, getDb } from '@creatorcanon/db';
import { generationRun, generationStageRun } from '@creatorcanon/db/schema';
import type { PipelineStage } from '@creatorcanon/core/pipeline-stages';
import { PIPELINE_VERSION } from '@creatorcanon/core/pipeline-stages';
import { hashInput } from './idempotency';

export interface StageContext {
  runId: string;
  workspaceId: string;
  pipelineVersion: string;
}

export interface StageRunOptions<TInput, TOutput> {
  ctx: StageContext;
  stage: PipelineStage;
  input: TInput;
  run: (input: TInput) => Promise<TOutput>;
  /**
   * Optional. Called after a cache hit (succeeded stage_run with matching
   * inputHash) to confirm the output's downstream materialized rows still
   * exist. Returning false logs a warning and re-executes the stage.
   *
   * Use this for stages that persist canonical rows in their own tables
   * (e.g. channel_profile, video_intelligence_card, canon_node, page_brief)
   * — if those rows were truncated/restored, the cached output is stale.
   */
  validateMaterializedOutput?: (output: TOutput, ctx: StageContext) => Promise<boolean>;
}

/**
 * Wraps a pipeline stage function with idempotent execution and DB persistence.
 * - Skips execution if a completed stage_run with the same input_hash exists.
 * - Creates/updates a generation_stage_run row tracking status, timing, cost.
 * - Propagates errors as stage failures (status = 'failed').
 */
export async function runStage<TInput, TOutput>(
  opts: StageRunOptions<TInput, TOutput>,
): Promise<TOutput> {
  const { ctx, stage, input, run } = opts;
  const db = getDb();
  const inputHash = hashInput(input);
  const pipelineVersion = ctx.pipelineVersion ?? PIPELINE_VERSION;

  const existing = await db
    .select()
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, ctx.runId))
    .limit(50);

  const match = existing.find(
    (r) =>
      r.stageName === stage &&
      r.inputHash === inputHash &&
      r.pipelineVersion === pipelineVersion,
  );

  if (match?.status === 'succeeded' && match.outputJson != null) {
    const cached = match.outputJson as TOutput;
    if (opts.validateMaterializedOutput) {
      const ok = await opts.validateMaterializedOutput(cached, ctx);
      if (ok) return cached;
      // eslint-disable-next-line no-console
      console.warn(
        `[harness] cached stage_run ${stage} (${match.id}) lost materialized rows; re-running.`,
      );
    } else {
      return cached;
    }
  }

  const stageRunId = crypto.randomUUID();
  await db.insert(generationStageRun).values({
    id: stageRunId,
    runId: ctx.runId,
    stageName: stage,
    inputHash,
    pipelineVersion,
    status: 'running',
    attempt: (match?.attempt ?? 0) + 1,
    inputJson: input as Record<string, unknown>,
    startedAt: new Date(),
  }).onConflictDoNothing();

  const activeId = match?.id ?? stageRunId;
  if (match) {
    await db
      .update(generationStageRun)
      .set({ status: 'running', startedAt: new Date(), attempt: (match.attempt ?? 0) + 1 })
      .where(eq(generationStageRun.id, activeId));
  }

  const start = Date.now();

  try {
    const output = await run(input);
    const durationMs = Date.now() - start;

    await db
      .update(generationStageRun)
      .set({
        status: 'succeeded',
        outputJson: output as Record<string, unknown>,
        completedAt: new Date(),
        durationMs,
        updatedAt: new Date(),
      })
      .where(eq(generationStageRun.id, activeId));

    return output;
  } catch (err) {
    const durationMs = Date.now() - start;
    const error = err instanceof Error ? err : new Error(String(err));

    await db
      .update(generationStageRun)
      .set({
        status: 'failed_terminal',
        errorJson: {
          type: error.constructor.name,
          message: error.message,
          stack: error.stack,
        },
        completedAt: new Date(),
        durationMs,
        updatedAt: new Date(),
      })
      .where(eq(generationStageRun.id, activeId));

    throw err;
  }
}

/** Transition a generation_run to a new status. */
export async function transitionRun(
  runId: string,
  status: 'running' | 'awaiting_review' | 'failed' | 'canceled',
  extra?: { startedAt?: Date; completedAt?: Date },
): Promise<void> {
  const db = getDb();
  await db
    .update(generationRun)
    .set({ status, updatedAt: new Date(), ...extra })
    .where(eq(generationRun.id, runId));
}
