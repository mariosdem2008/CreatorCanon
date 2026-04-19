import { defineConfig } from '@trigger.dev/sdk/v3';

/**
 * Trigger.dev v3 project config.
 *
 * NOTE: `project` below is a placeholder slug. Replace `proj_channel_atlas`
 * with the real project ID from the Trigger.dev dashboard after the founder
 * creates the project (https://cloud.trigger.dev). The CLI will also write
 * this value on `trigger.dev init` if run against a real account.
 */
export default defineConfig({
  project: 'proj_channel_atlas',
  logLevel: 'info',
  // Task code lives alongside src/dev-server.ts — the CLI auto-discovers
  // every `task()` export under the dirs listed here.
  dirs: ['./src/tasks'],
  // Hard cap per task-run in seconds. Individual tasks can override.
  // 900s (15m) is generous for MVP; real pipeline stages tune this per stage.
  maxDuration: 900,
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1_000,
      maxTimeoutInMs: 30_000,
      factor: 2,
      randomize: true,
    },
  },
});
