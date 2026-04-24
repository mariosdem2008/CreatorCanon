/**
 * Decision helper for the Stripe-webhook-triggered pipeline dispatch.
 *
 * Modes:
 * - 'inprocess' — Vercel lambda runs runGenerationPipeline directly.
 *   Audio extraction is NOT possible in this mode (no yt-dlp on Vercel).
 *   Only suitable for runs whose videos already have audio assets.
 * - 'trigger'   — Trigger.dev worker runs tasks. Chain extract-run-audio
 *   first when audio is missing (that task self-dispatches run-pipeline
 *   via input.dispatch=true); fire run-pipeline directly when all audio
 *   is already present.
 * - 'worker'    — A long-running queue-runner polls for queued runs and
 *   processes them. Webhook does nothing.
 */
export type DispatchMode = 'inprocess' | 'trigger' | 'worker';

export type DispatchPlan =
  | { kind: 'inprocess'; tasks: readonly ['run-pipeline']; }
  | { kind: 'trigger-chain'; tasks: readonly ['extract-run-audio', 'run-pipeline']; }
  | { kind: 'trigger-direct'; tasks: readonly ['run-pipeline']; }
  | { kind: 'worker-queued'; tasks: readonly []; };

export function buildDispatchPlan(input: {
  mode: DispatchMode;
  hasAudioForAllVideos: boolean;
}): DispatchPlan {
  if (input.mode === 'worker') {
    return { kind: 'worker-queued', tasks: [] };
  }
  if (input.mode === 'inprocess') {
    return { kind: 'inprocess', tasks: ['run-pipeline'] };
  }
  if (input.hasAudioForAllVideos) {
    return { kind: 'trigger-direct', tasks: ['run-pipeline'] };
  }
  return { kind: 'trigger-chain', tasks: ['extract-run-audio', 'run-pipeline'] };
}
