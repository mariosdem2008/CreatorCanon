import { defineConfig } from '@trigger.dev/sdk/v3';

// CreatorCanon Trigger.dev cloud project (organization creatorcanon-92c0).
// Hardcoded default so the cloud runtime (which re-evaluates this file at
// task-boot) doesn't need TRIGGER_PROJECT_ID set in its env; local dev /
// CI can override via the env var for multi-project setups.
const DEFAULT_PROJECT_REF = 'proj_yzrjadqegzegmkeernox';
const project = process.env.TRIGGER_PROJECT_ID ?? DEFAULT_PROJECT_REF;

export default defineConfig({
  project,
  logLevel: 'info',
  // Task code and schedules live alongside src/dev-server.ts — the CLI
  // auto-discovers every `task()` and `schedules.task()` export under these dirs.
  dirs: ['./src/tasks', './src/schedules'],
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
