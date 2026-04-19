import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  runStatusEnum,
  stageStatusEnum,
} from './enums';
import { workspace } from './workspace';
import { project, videoSet } from './project';

/**
 * `generation_run` — one attempt at generating a hub from a `video_set`.
 * Immutable config. `config_hash` is the idempotency root for downstream stages.
 */
export const generationRun = pgTable(
  'generation_run',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    videoSetId: text('video_set_id')
      .notNull()
      .references(() => videoSet.id, { onDelete: 'restrict' }),
    pipelineVersion: text('pipeline_version').notNull(),
    configHash: text('config_hash').notNull(),
    status: runStatusEnum('status').notNull().default('draft'),
    selectedDurationSeconds: integer('selected_duration_seconds')
      .notNull()
      .default(0),
    selectedWordCount: integer('selected_word_count').notNull().default(0),
    priceCents: integer('price_cents'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    costCentsActual: numeric('cost_cents_actual', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    qualityMetrics: jsonb('quality_metrics').$type<{
      citation_support_rate?: number;
      coverage?: number;
      cohesion?: number;
      [k: string]: unknown;
    }>(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceCreatedIdx: index('generation_run_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
    projectIdx: index('generation_run_project_idx').on(t.projectId),
    statusIdx: index('generation_run_status_idx').on(t.status),
    stripePaymentIntentIdx: uniqueIndex(
      'generation_run_stripe_payment_intent_unique',
    ).on(t.stripePaymentIntentId),
  }),
);

/**
 * `generation_stage_run` (a.k.a. `run_stage` in the data-model doc).
 * Unique on `(run_id, stage_name, input_hash, pipeline_version)`.
 */
export const generationStageRun = pgTable(
  'generation_stage_run',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    stageName: text('stage_name').notNull(),
    inputHash: text('input_hash').notNull(),
    pipelineVersion: text('pipeline_version').notNull(),
    status: stageStatusEnum('status').notNull().default('pending'),
    attempt: integer('attempt').notNull().default(0),
    /** Pointer to the stage's persisted output artifact in R2. */
    artifactR2Key: text('artifact_r2_key'),
    artifactSizeBytes: integer('artifact_size_bytes'),
    /** Stage inputs (config / refs) captured at enqueue time for idempotency replay. */
    inputJson: jsonb('input_json'),
    /** Stage summary output (small; large payloads go to R2). */
    outputJson: jsonb('output_json'),
    errorJson: jsonb('error_json').$type<{
      type?: string;
      message?: string;
      stack?: string;
      context?: Record<string, unknown>;
    }>(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    durationMs: integer('duration_ms'),
    costCents: numeric('cost_cents', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    idempotencyKey: uniqueIndex('generation_stage_run_idempotency_key').on(
      t.runId,
      t.stageName,
      t.inputHash,
      t.pipelineVersion,
    ),
    runStageIdx: index('generation_stage_run_run_stage_idx').on(
      t.runId,
      t.stageName,
    ),
    statusIdx: index('generation_stage_run_status_idx').on(t.status),
  }),
);

/** Alias for consumers that prefer the data-model `run_stage` name. */
export const runStage = generationStageRun;
