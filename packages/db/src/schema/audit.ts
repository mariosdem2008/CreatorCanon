import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { workspace } from './workspace';
import { generationRun } from './run';

/**
 * `audit_log` — security/compliance audit trail.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspace.id, {
      onDelete: 'set null',
    }),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    ip: text('ip'),
    ua: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceCreatedIdx: index('audit_log_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
    actorCreatedIdx: index('audit_log_actor_created_idx').on(
      t.actorUserId,
      t.createdAt,
    ),
    targetIdx: index('audit_log_target_idx').on(t.targetType, t.targetId),
    actionIdx: index('audit_log_action_idx').on(t.action),
  }),
);

/**
 * `quality_eval` — run-level quality metrics from the QA stage.
 */
export const qualityEval = pgTable(
  'quality_eval',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    citationSupportRate: doublePrecision('citation_support_rate'),
    coverageScore: doublePrecision('coverage_score'),
    clusterCohesion: doublePrecision('cluster_cohesion'),
    contradictionsFlagged: integer('contradictions_flagged').notNull().default(0),
    unsupportedClaims: integer('unsupported_claims').notNull().default(0),
    evaluatorVersion: text('evaluator_version'),
    metrics: jsonb('metrics'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runUnique: uniqueIndex('quality_eval_run_unique').on(t.runId),
    workspaceIdx: index('quality_eval_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * `analytics_event` — thin SQL mirror of PostHog events we want queryable.
 */
export const analyticsEvent = pgTable(
  'analytics_event',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspace.id, {
      onDelete: 'set null',
    }),
    hubId: text('hub_id'),
    kind: text('kind').notNull(),
    props: jsonb('props'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceOccurredIdx: index('analytics_event_workspace_occurred_idx').on(
      t.workspaceId,
      t.occurredAt,
    ),
    hubOccurredIdx: index('analytics_event_hub_occurred_idx').on(
      t.hubId,
      t.occurredAt,
    ),
    kindIdx: index('analytics_event_kind_idx').on(t.kind),
  }),
);
