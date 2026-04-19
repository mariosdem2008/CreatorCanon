import { PIPELINE_STAGES, PIPELINE_VERSION } from '@atlas/core/pipeline-stages';

// Minimal placeholder dev-server so `pnpm dev --filter @atlas/worker` has something to run
// before Trigger.dev is wired (ticket 0.9). Real task definitions land in Epic 5.

const log = (msg: string, meta: Record<string, unknown> = {}) => {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ ts: new Date().toISOString(), svc: 'atlas-worker', msg, ...meta }));
};

log('worker dev-server starting', {
  pipelineVersion: PIPELINE_VERSION,
  stages: PIPELINE_STAGES.length,
});

const heartbeat = setInterval(() => {
  log('heartbeat');
}, 30_000);

const shutdown = (signal: string) => {
  log('shutdown', { signal });
  clearInterval(heartbeat);
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
