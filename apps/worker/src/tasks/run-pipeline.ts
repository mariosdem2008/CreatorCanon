import { task, logger } from '@trigger.dev/sdk/v3';
import {
  runGenerationPipeline,
  type RunGenerationPipelinePayload,
} from '@creatorcanon/pipeline';

export const runPipelineTask = task({
  id: 'run-pipeline',
  maxDuration: 3600,
  // Default small-1x (512 MB) OOM'd on import-time bootstrap during
  // validation run 7ysqxkhk on 2026-04-24. Jump to medium-1x (2 GB) so the
  // 16-stage pipeline has headroom without over-provisioning.
  machine: 'medium-1x',
  run: async (payload: RunGenerationPipelinePayload) => {
    logger.info('Pipeline starting', { runId: payload.runId });

    try {
      const result = await runGenerationPipeline(payload);
      logger.info('Pipeline complete', { runId: payload.runId });
      return result;
    } catch (err) {
      logger.error('Pipeline failed', {
        runId: payload.runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});
