import { PIPELINE_STAGES, PIPELINE_VERSION } from '@creatorcanon/core/pipeline-stages';

import { initTelemetry } from './instrumentation';

initTelemetry();

const log = (msg: string, meta: Record<string, unknown> = {}) => {
  // eslint-disable-next-line no-console
  console.info(JSON.stringify({ ts: new Date().toISOString(), svc: 'creatorcanon-worker', msg, ...meta }));
};

log('worker dev-server starting', {
  pipelineVersion: PIPELINE_VERSION,
  stages: PIPELINE_STAGES.length,
  sentry: !!process.env.SENTRY_DSN,
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
