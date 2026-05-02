import { task, logger } from '@trigger.dev/sdk/v3';
import {
  completeAuditGeneratedRun,
  markAuditGeneratedRunFailed,
  runGenerationPipeline,
  type RunGenerationPipelinePayload,
} from '@creatorcanon/pipeline';

interface TaskLogger {
  info(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

interface RunPipelineTaskBodyDeps {
  logger: TaskLogger;
  runGenerationPipeline?: typeof runGenerationPipeline;
  completeAuditGeneratedRun?: typeof completeAuditGeneratedRun;
  markAuditGeneratedRunFailed?: typeof markAuditGeneratedRunFailed;
}

export async function runPipelineTaskBody(
  payload: RunGenerationPipelinePayload,
  deps: RunPipelineTaskBodyDeps = { logger },
): Promise<Awaited<ReturnType<typeof runGenerationPipeline>>> {
  const taskLogger = deps.logger;
  const runPipeline = deps.runGenerationPipeline ?? runGenerationPipeline;
  const completeRun = deps.completeAuditGeneratedRun ?? completeAuditGeneratedRun;
  const markAuditRunFailed = deps.markAuditGeneratedRunFailed ?? markAuditGeneratedRunFailed;

  taskLogger.info('Pipeline starting', { runId: payload.runId });

  let result: Awaited<ReturnType<typeof runGenerationPipeline>>;
  try {
    result = await runPipeline(payload);
    taskLogger.info('Pipeline complete', { runId: payload.runId });
  } catch (err) {
    taskLogger.error('Pipeline failed', {
      runId: payload.runId,
      error: err instanceof Error ? err.message : String(err),
    });
    try {
      await markAuditRunFailed({ runId: payload.runId, error: err });
    } catch (failureUpdateError) {
      taskLogger.error('Audit generated hub failure transition failed', {
        runId: payload.runId,
        error:
          failureUpdateError instanceof Error
            ? failureUpdateError.message
            : String(failureUpdateError),
      });
    }
    throw err;
  }

  try {
    const published = await completeRun({ runId: payload.runId });
    if (published) {
      taskLogger.info('Auto-published audit generated hub', {
        runId: payload.runId,
        releaseId: published.releaseId,
        publicPath: published.publicPath,
      });
    }
  } catch (err) {
    taskLogger.error('Audit generated hub completion failed', {
      runId: payload.runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return result;
}

export const runPipelineTask = task({
  id: 'run-pipeline',
  maxDuration: 3600,
  // Default small-1x (512 MB) OOM'd on import-time bootstrap during
  // validation run 7ysqxkhk on 2026-04-24. Jump to medium-1x (2 GB) so the
  // 16-stage pipeline has headroom without over-provisioning.
  machine: 'medium-1x',
  run: async (payload: RunGenerationPipelinePayload) => runPipelineTaskBody(payload),
});
