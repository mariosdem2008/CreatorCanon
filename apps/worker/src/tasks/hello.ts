import { task } from '@trigger.dev/sdk/v3';

import { PIPELINE_VERSION } from '@atlas/core/pipeline-stages';

/**
 * Smoke-test task. Used by ticket 0.9 to prove the worker can register and
 * execute a Trigger.dev task end-to-end against the dev environment before
 * Epic 5 brings the real 15-stage pipeline online.
 */
export const helloTask = task({
  id: 'hello',
  run: async (payload: { name: string }) => ({
    greeting: `Hello, ${payload.name}`,
    pipelineVersion: PIPELINE_VERSION,
  }),
});
