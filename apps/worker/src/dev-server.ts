import { PIPELINE_STAGES, PIPELINE_VERSION } from '@creatorcanon/core/pipeline-stages';

import { loadDefaultEnvFiles } from './env-files';
import { initTelemetry } from './instrumentation';
import { startQueueRunner } from './queue-runner';

loadDefaultEnvFiles();
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
const stopQueueRunner = startQueueRunner(log);

const shutdown = (signal: string) => {
  log('shutdown', { signal });
  clearInterval(heartbeat);
  stopQueueRunner();
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
