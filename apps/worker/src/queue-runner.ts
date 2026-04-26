import { and, asc, eq, getDb } from '@creatorcanon/db';
import { generationRun } from '@creatorcanon/db/schema';
import {
  runGenerationPipeline,
  type RunGenerationPipelinePayload,
} from '@creatorcanon/pipeline';

interface LogFn {
  (msg: string, meta?: Record<string, unknown>): void;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;

async function claimNextQueuedRun(): Promise<RunGenerationPipelinePayload | null> {
  const db = getDb();
  const queued = await db
    .select({
      runId: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      pipelineVersion: generationRun.pipelineVersion,
    })
    .from(generationRun)
    .where(eq(generationRun.status, 'queued'))
    .orderBy(asc(generationRun.createdAt))
    .limit(1);

  const next = queued[0];
  if (!next) return null;

  const claimed = await db
    .update(generationRun)
    .set({
      status: 'running',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(generationRun.id, next.runId),
      eq(generationRun.status, 'queued'),
    ))
    .returning({
      runId: generationRun.id,
    });

  if (claimed.length === 0) return null;

  return {
    runId: next.runId,
    workspaceId: next.workspaceId,
    projectId: next.projectId,
    videoSetId: next.videoSetId,
    pipelineVersion: next.pipelineVersion,
  };
}

export function startQueueRunner(log: LogFn) {
  const dispatchMode = process.env.PIPELINE_DISPATCH_MODE ?? 'inprocess';
  if (dispatchMode !== 'worker') {
    log('queue runner disabled', { dispatchMode });
    return () => {};
  }

  const intervalMs = Math.max(
    5_000,
    Number(process.env.WORKER_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS),
  );

  let stopped = false;
  let draining = false;

  const drain = async () => {
    if (stopped || draining) return;
    draining = true;
    try {
      while (!stopped) {
        const payload = await claimNextQueuedRun();
        if (!payload) break;

        log('claimed queued run', {
          runId: payload.runId,
          projectId: payload.projectId,
          workspaceId: payload.workspaceId,
        });

        try {
          const result = await runGenerationPipeline(payload);
          log('completed queued run', {
            runId: payload.runId,
            pageCount: result.pageCount,
            segmentsCreated: result.segmentsCreated,
            transcriptsFetched: result.transcriptsFetched,
          });
        } catch (error) {
          log('queued run failed', {
            runId: payload.runId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      draining = false;
    }
  };

  log('queue runner enabled', { intervalMs });
  void drain();
  const interval = setInterval(() => {
    void drain();
  }, intervalMs);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
