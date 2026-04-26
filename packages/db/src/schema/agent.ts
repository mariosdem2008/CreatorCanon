import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import {
  agentSuggestionKindEnum,
  agentSuggestionStatusEnum,
} from './enums';
import { user } from './auth';
import { workspace } from './workspace';

/**
 * `agent_suggestion` — persistent agentic recommendations the Atlas surface
 * shows on `/app/agent`. The pipeline + UI both write rows. Each row is
 * actionable: a creator either accepts (does the thing) or dismisses (sweeps
 * it). Past rows stay queryable for the activity timeline.
 *
 * `targetRef` is a free-form pointer (e.g. project id, run id, page id). The
 * UI maps `kind` → which `targetRef` to expect; we don't FK-link to keep the
 * table generic.
 */
export const agentSuggestion = pgTable(
  'agent_suggestion',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    kind: agentSuggestionKindEnum('kind').notNull(),
    status: agentSuggestionStatusEnum('status').notNull().default('pending'),
    title: text('title').notNull(),
    body: text('body'),
    targetRef: text('target_ref'),
    metadata: jsonb('metadata'),
    actionedByUserId: text('actioned_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    actionedAt: timestamp('actioned_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    workspaceCreatedIdx: index('agent_suggestion_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
    workspaceStatusIdx: index('agent_suggestion_workspace_status_idx').on(
      t.workspaceId,
      t.status,
    ),
  }),
);

export type AgentSuggestionRow = typeof agentSuggestion.$inferSelect;
