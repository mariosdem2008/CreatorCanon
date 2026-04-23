import { defineConfig } from '@trigger.dev/sdk/v3';

const project = process.env.TRIGGER_PROJECT_ID;
if (!project) {
  throw new Error('Set TRIGGER_PROJECT_ID to the real Trigger.dev project id before running trigger dev/deploy.');
}

export default defineConfig({
  project,
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
