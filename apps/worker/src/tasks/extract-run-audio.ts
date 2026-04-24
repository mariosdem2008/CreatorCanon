import { task, logger } from '@trigger.dev/sdk/v3';

import {
  extractAlphaAudio,
  type ExtractAlphaAudioInput,
} from '@creatorcanon/pipeline';

export const extractRunAudioTask = task({
  id: 'extract-run-audio',
  maxDuration: 3600,
  run: async (payload: ExtractAlphaAudioInput) => {
    logger.info('Audio extraction starting', {
      runId: payload.runId,
      force: payload.force ?? false,
      dispatch: payload.dispatch ?? false,
    });

    try {
      const result = await extractAlphaAudio(payload);
      logger.info('Audio extraction complete', {
        runId: payload.runId,
        extractedCount: result.extractedCount,
        reusedCount: result.reusedCount,
        dispatched: result.dispatched,
      });
      return result;
    } catch (err) {
      logger.error('Audio extraction failed', {
        runId: payload.runId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },
});
