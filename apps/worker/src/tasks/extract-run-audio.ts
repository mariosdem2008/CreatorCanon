import { task, logger } from '@trigger.dev/sdk/v3';

import {
  extractAlphaAudio,
  type ExtractAlphaAudioInput,
} from '@creatorcanon/pipeline';

export const extractRunAudioTask = task({
  id: 'extract-run-audio',
  maxDuration: 3600,
  // Default small-1x (512 MB) will OOM when ffmpeg / yt-dlp are in the same
  // process group as the pipeline bootstrap. Match run-pipeline at medium-1x
  // (2 GB). If we ever extract long videos we'll bump to large-1x.
  machine: 'medium-1x',
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
