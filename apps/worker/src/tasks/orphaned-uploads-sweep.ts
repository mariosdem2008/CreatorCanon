import { task, logger, tasks } from '@trigger.dev/sdk/v3';
import { and, eq, lt, getDb } from '@creatorcanon/db';
import { video } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';

/**
 * Cron task: sweep for orphaned uploads.
 *
 * Risk: browser dies during PUT to R2 — the row is left in uploadStatus='uploading'
 * forever with no corresponding complete() call. This task finds rows older than 1h
 * that are still in 'uploading' and reconciles them:
 *
 *   - R2 object exists  → user finished PUT but never called complete; mark 'uploaded'
 *                         and enqueue transcription so the video is fully processed.
 *   - R2 object missing → true orphan; delete R2 key (best-effort) and mark 'failed'.
 *   - No localR2Key     → no R2 object was ever created; mark 'failed' immediately.
 *
 * All UPDATEs are guarded with `AND upload_status = 'uploading'` to avoid a TOCTOU
 * race where /api/upload/complete advances the row between our SELECT and UPDATE.
 *
 * Schedule registration is a Trigger.dev deploy-time step (trigger.config.ts schedules
 * array or the dashboard). This file only defines the task; wire the schedule on deploy.
 */
export const orphanedUploadsSweepTask = task({
  id: 'orphaned-uploads-sweep',
  maxDuration: 600,
  machine: 'small-1x',

  run: async () => {
    const db = getDb();
    const env = parseServerEnv(process.env);
    const r2 = createR2Client(env);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const candidates = await db
      .select()
      .from(video)
      .where(
        and(
          eq(video.uploadStatus, 'uploading'),
          lt(video.createdAt, oneHourAgo),
        ),
      );

    logger.info('Orphaned uploads sweep: candidates found', {
      count: candidates.length,
      cutoff: oneHourAgo.toISOString(),
    });

    let recovered = 0;
    let failed = 0;

    for (const v of candidates) {
      if (!v.localR2Key) {
        // No R2 key was ever recorded — nothing to check; mark failed.
        // Guard on uploadStatus='uploading' to avoid overwriting a concurrent /complete.
        await db
          .update(video)
          .set({ uploadStatus: 'failed' })
          .where(and(eq(video.id, v.id), eq(video.uploadStatus, 'uploading')));
        failed++;
        logger.warn('Orphaned upload: no localR2Key, marked failed', { videoId: v.id });
        continue;
      }

      try {
        await r2.headObject(v.localR2Key);
        // Object exists — the user completed the PUT but never called the complete
        // endpoint. Recover: mark 'uploaded' and drive transcription forward.
        // Use .returning() so we only enqueue if WE actually own the transition.
        const updateResult = await db
          .update(video)
          .set({ uploadStatus: 'uploaded', transcribeStatus: 'transcribing' })
          .where(and(eq(video.id, v.id), eq(video.uploadStatus, 'uploading')))
          .returning({ id: video.id });

        if (updateResult.length > 0) {
          // We won the race — enqueue transcription.
          try {
            await tasks.trigger('transcribe-uploaded-video', {
              videoId: v.id,
              workspaceId: v.workspaceId,
            });
            recovered++;
            logger.info('Orphaned upload: R2 object found, marked uploaded and enqueued transcribe', {
              videoId: v.id,
              r2Key: v.localR2Key,
            });
          } catch (err) {
            // Trigger.dev unavailable — mark failed so user can retry.
            await db
              .update(video)
              .set({ uploadStatus: 'failed', transcribeStatus: 'failed' })
              .where(eq(video.id, v.id));
            logger.error('Failed to enqueue transcribe job during sweep recovery', {
              videoId: v.id,
              error: String(err),
            });
            failed++;
          }
        } else {
          // Another writer (e.g. /complete) already advanced the row — skip.
          logger.info('Orphaned upload: row already advanced by concurrent writer, skipping', {
            videoId: v.id,
          });
        }
      } catch {
        // headObject threw — object is missing (or inaccessible). Clean up and
        // mark failed so the UI shows a clear error state.
        try {
          await r2.deleteObject(v.localR2Key);
        } catch {
          // Best-effort deletion; object may already be gone.
        }
        // Guard on uploadStatus='uploading' to avoid overwriting a concurrent /complete.
        await db
          .update(video)
          .set({ uploadStatus: 'failed' })
          .where(and(eq(video.id, v.id), eq(video.uploadStatus, 'uploading')));
        failed++;
        logger.warn('Orphaned upload: R2 object missing, marked failed', {
          videoId: v.id,
          r2Key: v.localR2Key,
        });
      }
    }

    logger.info('Orphaned uploads sweep complete', {
      candidates: candidates.length,
      recovered,
      failed,
    });

    return { candidates: candidates.length, recovered, failed };
  },
});
