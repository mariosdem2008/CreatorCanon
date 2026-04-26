import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { inboxItemKindEnum, inboxItemStatusEnum } from './enums';
import { user } from './auth';
import { workspace } from './workspace';

/**
 * `inbox_item` — workspace-scoped notification stream surfaced on
 * `/app/inbox`. Each item belongs to a workspace and optionally targets a
 * specific user (e.g. invitation pending). Status moves unread → read →
 * archived as the creator interacts.
 *
 * `targetRef` is a free-form pointer (e.g. run id, release id, project id).
 * The UI maps `kind` → which target to expect.
 */
export const inboxItem = pgTable(
  'inbox_item',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    kind: inboxItemKindEnum('kind').notNull(),
    status: inboxItemStatusEnum('status').notNull().default('unread'),
    title: text('title').notNull(),
    body: text('body'),
    targetRef: text('target_ref'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    workspaceCreatedIdx: index('inbox_item_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
    workspaceStatusIdx: index('inbox_item_workspace_status_idx').on(
      t.workspaceId,
      t.status,
    ),
    userIdx: index('inbox_item_user_idx').on(t.userId),
  }),
);

export type InboxItemRow = typeof inboxItem.$inferSelect;
