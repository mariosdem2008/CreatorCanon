import { task, logger } from '@trigger.dev/sdk/v3';
import {
  runGenerationPipeline,
  type RunGenerationPipelinePayload,
} from '@creatorcanon/pipeline';

export const runPipelineTask = task({
  id: 'run-pipeline',
  maxDuration: 3600,
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
