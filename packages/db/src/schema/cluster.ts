import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { workspace } from './workspace';
import { generationRun } from './run';
import { evidenceAtom } from './atom';
import { video } from './youtube';

/**
 * `cluster` (a.k.a. `topic_cluster`) — cross-video cluster that becomes a
 * Track / Topic in the hub.
 */
export const cluster = pgTable(
  'cluster',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    eyebrow: text('eyebrow'),
    description: text('description'),
    palette: integer('palette'),
    cohesionScore: doublePrecision('cohesion_score'),
    position: integer('position').notNull().default(0),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runPositionIdx: index('cluster_run_position_idx').on(t.runId, t.position),
    workspaceIdx: index('cluster_workspace_idx').on(t.workspaceId),
  }),
);

export const clusterMembership = pgTable(
  'cluster_membership',
  {
    clusterId: text('cluster_id')
      .notNull()
      .references(() => cluster.id, { onDelete: 'cascade' }),
    atomId: text('atom_id')
      .notNull()
      .references(() => evidenceAtom.id, { onDelete: 'cascade' }),
    weight: doublePrecision('weight').notNull().default(1.0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clusterId, t.atomId] }),
    atomIdx: index('cluster_membership_atom_idx').on(t.atomId),
  }),
);

/**
 * `video_memo` — per-video memo JSON produced by stage 10 (`synthesize_videos`
 * / `video_memos`). Used by clustering + editor sidebar.
 */
export const videoMemo = pgTable(
  'video_memo',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    thesis: text('thesis'),
    summary: text('summary'),
    pullQuotes: jsonb('pull_quotes').$type<Array<{ text: string; start_ms: number; end_ms: number }>>(),
    topAtomIds: jsonb('top_atom_ids').$type<string[]>(),
    themes: jsonb('themes').$type<string[]>(),
    payload: jsonb('payload'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runVideoUnique: uniqueIndex('video_memo_run_video_unique').on(t.runId, t.videoId),
    workspaceIdx: index('video_memo_workspace_idx').on(t.workspaceId),
  }),
);
