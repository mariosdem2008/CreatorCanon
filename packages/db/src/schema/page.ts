import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import {
  citationKindEnum,
  pageAuthorKindEnum,
  pageStatusEnum,
  pageTypeEnum,
  supportLabelEnum,
} from './enums';
import { workspace } from './workspace';
import { generationRun } from './run';
import { cluster } from './cluster';
import { evidenceAtom } from './atom';
import { segment } from './transcript';
import { frameObservation } from './visual';
import { video } from './youtube';

/**
 * `page` (a.k.a. `page_document`) — a stable logical page in the hub.
 * `current_version_id` is a forward reference, FK added post-migration.
 */
export const page = pgTable(
  'page',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    clusterId: text('cluster_id').references(() => cluster.id, {
      onDelete: 'set null',
    }),
    slug: text('slug').notNull(),
    pageType: pageTypeEnum('page_type').notNull(),
    position: integer('position').notNull().default(0),
    /** Forward ref to `page_version.id`; FK added post-migration. */
    currentVersionId: text('current_version_id'),
    status: pageStatusEnum('status').notNull().default('needs_review'),
    supportLabel: supportLabelEnum('support_label')
      .notNull()
      .default('review_recommended'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    runSlugUnique: uniqueIndex('page_run_slug_unique').on(t.runId, t.slug),
    runPositionIdx: index('page_run_position_idx').on(t.runId, t.position),
    clusterIdx: index('page_cluster_idx').on(t.clusterId),
    workspaceIdx: index('page_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * `page_version` — immutable snapshot of the page content.
 * Editing creates a new version. `block_tree_json` stores the ordered blocks.
 */
export const pageVersion = pgTable(
  'page_version',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    pageId: text('page_id')
      .notNull()
      .references(() => page.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    summary: text('summary'),
    blockTreeJson: jsonb('block_tree_json')
      .$type<{
        blocks: Array<{
          type: string;
          id: string;
          content: unknown;
          citations?: string[];
        }>;
      }>()
      .notNull(),
    authorKind: pageAuthorKindEnum('author_kind').notNull().default('pipeline'),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pageVersionUnique: uniqueIndex('page_version_page_version_unique').on(
      t.pageId,
      t.version,
    ),
    pageCreatedIdx: index('page_version_page_created_idx').on(t.pageId, t.createdAt),
    runIdx: index('page_version_run_idx').on(t.runId),
  }),
);

/**
 * `page_block` — optional normalized projection of `page_version.block_tree_json`
 * for per-block queries (regenerate, diff, citation lookup). Pipeline keeps the
 * tree JSON as the source of truth and materializes this table alongside it.
 */
export const pageBlock = pgTable(
  'page_block',
  {
    id: text('id').primaryKey(),
    pageVersionId: text('page_version_id')
      .notNull()
      .references(() => pageVersion.id, { onDelete: 'cascade' }),
    blockId: text('block_id').notNull(),
    blockType: text('block_type').notNull(),
    position: integer('position').notNull(),
    content: jsonb('content').notNull(),
    citations: jsonb('citations').$type<string[]>().notNull().default([]),
    supportLabel: supportLabelEnum('support_label'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pageVersionBlockUnique: uniqueIndex('page_block_version_block_unique').on(
      t.pageVersionId,
      t.blockId,
    ),
    pageVersionPositionIdx: index('page_block_version_position_idx').on(
      t.pageVersionId,
      t.position,
    ),
  }),
);

/**
 * `page_citation` — persistent citations resolved at page level.
 * Supports text, visual, and multimodal citations.
 */
export const pageCitation = pgTable(
  'page_citation',
  {
    id: text('id').primaryKey(),
    pageVersionId: text('page_version_id')
      .notNull()
      .references(() => pageVersion.id, { onDelete: 'cascade' }),
    blockId: text('block_id').notNull(),
    atomId: text('atom_id')
      .notNull()
      .references(() => evidenceAtom.id, { onDelete: 'restrict' }),
    segmentId: text('segment_id').references(() => segment.id, {
      onDelete: 'set null',
    }),
    frameObservationId: text('frame_observation_id').references(
      () => frameObservation.id,
      { onDelete: 'set null' },
    ),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'restrict' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    quoteText: text('quote_text'),
    visualR2Key: text('visual_r2_key'),
    citationKind: citationKindEnum('citation_kind').notNull().default('text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pageVersionIdx: index('page_citation_page_version_idx').on(t.pageVersionId),
    pageVersionBlockIdx: index('page_citation_page_version_block_idx').on(
      t.pageVersionId,
      t.blockId,
    ),
    atomIdx: index('page_citation_atom_idx').on(t.atomId),
    videoRangeIdx: index('page_citation_video_range_idx').on(
      t.videoId,
      t.startMs,
      t.endMs,
    ),
    kindIdx: index('page_citation_kind_idx').on(t.citationKind),
  }),
);

/**
 * `edit_action` — audit + undo trail for creator edits on page versions.
 */
export const editAction = pgTable(
  'edit_action',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    pageVersionId: text('page_version_id')
      .notNull()
      .references(() => pageVersion.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    action: text('action').notNull(),
    blockId: text('block_id'),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    promptUsed: text('prompt_used'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pageVersionCreatedIdx: index('edit_action_page_version_created_idx').on(
      t.pageVersionId,
      t.createdAt,
    ),
    userIdx: index('edit_action_user_idx').on(t.userId),
    workspaceIdx: index('edit_action_workspace_idx').on(t.workspaceId),
  }),
);
