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

import { generationRun } from './run';
import { workspace } from './workspace';

/**
 * `synthesis_run` — one attempt at producing a ProductBundle for a given
 * generationRun + productGoal.
 *
 * Status lifecycle: queued -> running -> succeeded | failed.
 *
 * `cost_cents` mirrors the convention used by `channel_profile.cost_cents`
 * (numeric(12,4)) — fractional pennies allowed because Codex CLI charges in
 * tiny per-token amounts.
 */
export const synthesisRun = pgTable(
  'synthesis_run',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    productGoal: text('product_goal').notNull(),
    status: text('status').notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    errorMessage: text('error_message'),
    composerCallCount: integer('composer_call_count').notNull().default(0),
    costCents: numeric('cost_cents', { precision: 12, scale: 4 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runIdx: index('synthesis_run_run_idx').on(t.runId),
    statusCreatedIdx: index('synthesis_run_status_created_idx').on(t.status, t.createdAt),
  }),
);

/**
 * `product_bundle` — the typed JSON document produced by the synthesis
 * runner. One per successful synthesis_run (unique constraint).
 *
 * `payload` is the ProductBundle (see packages/synthesis/src/types.ts).
 * `schema_version` lets us migrate old bundles without a wholesale
 * regenerate when the bundle shape evolves.
 */
export const productBundle = pgTable(
  'product_bundle',
  {
    id: text('id').primaryKey(),
    synthesisRunId: text('synthesis_run_id')
      .notNull()
      .references(() => synthesisRun.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    payload: jsonb('payload').notNull(),
    schemaVersion: text('schema_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    synthesisRunUnique: uniqueIndex('product_bundle_synthesis_run_unique').on(t.synthesisRunId),
    runIdx: index('product_bundle_run_idx').on(t.runId),
  }),
);

export type SynthesisRun = typeof synthesisRun.$inferSelect;
export type NewSynthesisRun = typeof synthesisRun.$inferInsert;
export type ProductBundleRow = typeof productBundle.$inferSelect;
export type NewProductBundle = typeof productBundle.$inferInsert;
