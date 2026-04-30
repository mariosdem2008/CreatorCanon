/**
 * Tiny helper used by the offline audit scripts to record `generation_stage_run`
 * rows so the audit page's Stage Cost Breakdown section renders something
 * instead of "_No stage cost data._". Cost is 0 cents (Codex CLI is free
 * against the ChatGPT plan), but the rows make the section render.
 *
 * Idempotent: the (runId, stageName, inputHash, pipelineVersion) unique index
 * on generation_stage_run means re-running a stage is a no-op. Each call
 * uses a fixed inputHash="offline-codex" + the stage name so re-runs collapse.
 */
import crypto from 'node:crypto';
import { getDb } from '@creatorcanon/db';
import { generationStageRun } from '@creatorcanon/db/schema';

export interface TrackStageInput {
  runId: string;
  stageName: string;
  /** Cost in cents (numeric to 4 decimals). Defaults to 0. */
  costCents?: number;
  /** Started/completed timestamps. Defaults to now() for both. */
  startedAt?: Date;
  completedAt?: Date;
  /** Optional summary captured in output_json. */
  summary?: Record<string, unknown>;
}

export async function trackStageRun(input: TrackStageInput): Promise<void> {
  const db = getDb();
  const now = new Date();
  const startedAt = input.startedAt ?? now;
  const completedAt = input.completedAt ?? now;
  const durationMs = completedAt.getTime() - startedAt.getTime();
  const costCents = input.costCents ?? 0;

  await db
    .insert(generationStageRun)
    .values({
      id: crypto.randomUUID(),
      runId: input.runId,
      stageName: input.stageName,
      inputHash: 'offline-codex',
      pipelineVersion: 'canon_v1',
      status: 'succeeded' as const,
      attempt: 1,
      startedAt,
      completedAt,
      durationMs: Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0,
      costCents: costCents.toFixed(4),
      outputJson: input.summary ?? null,
    })
    .onConflictDoNothing();
}
