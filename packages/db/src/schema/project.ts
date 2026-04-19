import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { videoSetStatusEnum } from './enums';
import { workspace } from './workspace';
import { user } from './auth';
import { video } from './youtube';

/**
 * `video_set` — a named selection of videos (one per project for MVP).
 * Called "project_selection" in ticket 0.5; "video_set" per data-model doc.
 * The file is split: `video_set` (header) + `video_set_item` (rows).
 */
export const videoSet = pgTable(
  'video_set',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdBy: text('created_by')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    totalDurationSeconds: integer('total_duration_seconds').notNull().default(0),
    totalTranscriptWords: integer('total_transcript_words').notNull().default(0),
    status: videoSetStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceCreatedIdx: index('video_set_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
  }),
);

export const videoSetItem = pgTable(
  'video_set_item',
  {
    id: text('id').primaryKey(),
    videoSetId: text('video_set_id')
      .notNull()
      .references(() => videoSet.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    setVideoUnique: uniqueIndex('video_set_item_set_video_unique').on(
      t.videoSetId,
      t.videoId,
    ),
    setPositionIdx: index('video_set_item_set_position_idx').on(
      t.videoSetId,
      t.position,
    ),
    videoIdx: index('video_set_item_video_idx').on(t.videoId),
  }),
);

/**
 * `project` — creator container for a run + its output.
 * current_run_id + published_hub_id are forward references; we keep them as
 * plain text to avoid cyclic imports. FKs can be added post-migration via SQL.
 */
export const project = pgTable(
  'project',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    videoSetId: text('video_set_id').references(() => videoSet.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    config: jsonb('config').$type<{
      audience?: string;
      tone?: string;
      length_preset?: 'short' | 'standard' | 'deep';
      chat_enabled?: boolean;
      presentation_preset?: 'reference' | 'playbook' | 'guided';
      [k: string]: unknown;
    }>(),
    /** FK added post-migration to avoid cyclic import with `run`. */
    currentRunId: text('current_run_id'),
    /** FK added post-migration to avoid cyclic import with `release`. */
    publishedHubId: text('published_hub_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    workspaceCreatedIdx: index('project_workspace_created_idx').on(
      t.workspaceId,
      t.createdAt,
    ),
    currentRunIdx: index('project_current_run_idx').on(t.currentRunId),
  }),
);

/**
 * `project_selection` (ticket name) alias re-export for call-sites that follow
 * the ticket naming. Keeps the data-model canonical names authoritative.
 */
export const projectSelection = videoSetItem;
