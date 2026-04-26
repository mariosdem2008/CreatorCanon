import { index, integer, jsonb, numeric, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { generationRun } from './run';
import {
  evidenceQualityEnum,
  findingTypeEnum,
  relationTypeEnum,
} from './enums';

export const archiveFinding = pgTable(
  'archive_finding',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    type: findingTypeEnum('type').notNull(),
    agent: text('agent').notNull(),
    model: text('model').notNull(),
    payload: jsonb('payload').notNull(),
    evidenceSegmentIds: text('evidence_segment_ids')
      .array()
      .notNull()
      .default([]),
    evidenceQuality: evidenceQualityEnum('evidence_quality')
      .notNull()
      .default('unverified'),
    costCents: numeric('cost_cents', { precision: 12, scale: 4 }).notNull().default('0'),
    durationMs: integer('duration_ms').default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runTypeIdx: index('archive_finding_run_type_idx').on(t.runId, t.type),
    runAgentIdx: index('archive_finding_run_agent_idx').on(t.runId, t.agent),
  }),
);

export const archiveRelation = pgTable(
  'archive_relation',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    agent: text('agent').notNull(),
    model: text('model').notNull(),
    fromFindingId: text('from_finding_id')
      .notNull()
      .references(() => archiveFinding.id, { onDelete: 'cascade' }),
    toFindingId: text('to_finding_id')
      .notNull()
      .references(() => archiveFinding.id, { onDelete: 'cascade' }),
    type: relationTypeEnum('type').notNull(),
    evidenceSegmentIds: text('evidence_segment_ids').array().notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runIdx: index('archive_relation_run_idx').on(t.runId),
    fromIdx: index('archive_relation_from_idx').on(t.fromFindingId),
    toIdx: index('archive_relation_to_idx').on(t.toFindingId),
  }),
);

export type ArchiveFinding = typeof archiveFinding.$inferSelect;
export type NewArchiveFinding = typeof archiveFinding.$inferInsert;
export type ArchiveRelation = typeof archiveRelation.$inferSelect;
export type NewArchiveRelation = typeof archiveRelation.$inferInsert;
