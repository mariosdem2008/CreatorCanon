import { schedules } from '@trigger.dev/sdk/v3';

import { orphanedUploadsSweepTask } from '../tasks/orphaned-uploads-sweep';

/**
 * Hourly cron that drives the orphaned-uploads-sweep task.
 *
 * Trigger.dev v3 schedules are registered separately from the task itself so
 * the same task can be triggered ad-hoc (e.g. via the dashboard or a test
 * run) without changing the schedule definition.
 *
 * Cron: every hour on the hour — `0 * * * *`.
 */
export const orphanedUploadsSweepSchedule = schedules.task({
  id: 'orphaned-uploads-sweep-schedule',
  // Hourly: at minute 0 of every hour.
  cron: '0 * * * *',
  run: async () => {
    await orphanedUploadsSweepTask.triggerAndWait();
  },
});
