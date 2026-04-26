import { task, logger } from '@trigger.dev/sdk/v3';
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
 *                         so they can retry the complete step.
 *   - R2 object missing → true orphan; delete R2 key (best-effort) and mark 'failed'.
 *   - No localR2Key     → no R2 object was ever created; mark 'failed' immediately.
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
        await db
          .update(video)
          .set({ uploadStatus: 'failed' })
          .where(eq(video.id, v.id));
        failed++;
        logger.warn('Orphaned upload: no localR2Key, marked failed', { videoId: v.id });
        continue;
      }

      try {
        await r2.headObject(v.localR2Key);
        // Object exists — the user completed the PUT but never called the
        // complete endpoint. Recover by marking 'uploaded' so the UI can offer
        // a retry of the complete step.
        await db
          .update(video)
          .set({ uploadStatus: 'uploaded' })
          .where(eq(video.id, v.id));
        recovered++;
        logger.info('Orphaned upload: R2 object found, marked uploaded', {
          videoId: v.id,
          r2Key: v.localR2Key,
        });
      } catch {
        // headObject threw — object is missing (or inaccessible). Clean up and
        // mark failed so the UI shows a clear error state.
        try {
          await r2.deleteObject(v.localR2Key);
        } catch {
          // Best-effort deletion; object may already be gone.
        }
        await db
          .update(video)
          .set({ uploadStatus: 'failed' })
          .where(eq(video.id, v.id));
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
