import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { tsvector, vector } from './_vector';
import {
  chatIndexNamespaceEnum,
  chatMessageRoleEnum,
} from './enums';
import { workspace } from './workspace';
import { generationRun } from './run';

/**
 * `chat_index_document` — indexable unit for chat retrieval.
 * 4 namespaces at MVP: page_block, atom, segment, visual_observation.
 *
 * Indexes added in post-migration SQL:
 *   -- CREATE INDEX chat_index_document_embedding_hnsw
 *   --   ON chat_index_document USING hnsw (embedding vector_cosine_ops);
 *   -- CREATE INDEX chat_index_document_tsvector_gin
 *   --   ON chat_index_document USING gin (tsv);
 *   -- ALTER TABLE chat_index_document
 *   --   ADD COLUMN tsv tsvector GENERATED ALWAYS AS
 *   --   (to_tsvector('english', coalesce(text, ''))) STORED;
 */
export const chatIndexDocument = pgTable(
  'chat_index_document',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    /** FK added post-migration once `release` is created (avoids import cycle). */
    releaseId: text('release_id'),
    namespace: chatIndexNamespaceEnum('namespace').notNull(),
    /** id of the block/atom/segment/frame_observation this doc mirrors. */
    sourceId: text('source_id').notNull(),
    text: text('text').notNull(),
    metadata: jsonb('metadata').$type<{
      page_id?: string;
      cluster_id?: string;
      video_id?: string;
      timestamps?: { start_ms: number; end_ms: number };
      support_label?: 'strong' | 'review_recommended' | 'limited';
      observation_type?: string;
      visual_r2_key?: string;
      [k: string]: unknown;
    }>(),
    /** HNSW index to be added in post-migration SQL (see comment above). */
    embedding: vector('embedding', { dimensions: 1536 }),
    /**
     * Generated tsvector for FTS. The actual GENERATED column is emitted in
     * post-migration SQL (Drizzle 0.24 cannot express GENERATED STORED).
     */
    tsv: tsvector('tsv'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runNamespaceIdx: index('chat_index_document_run_namespace_idx').on(
      t.runId,
      t.namespace,
    ),
    releaseNamespaceIdx: index('chat_index_document_release_namespace_idx').on(
      t.releaseId,
      t.namespace,
    ),
    sourceIdx: index('chat_index_document_source_idx').on(
      t.namespace,
      t.sourceId,
    ),
    workspaceIdx: index('chat_index_document_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * `chat_session` — a hub viewer's chat session. Keyed by hub (forward ref)
 * so it persists across releases (the release binds retrieval scope).
 */
export const chatSession = pgTable(
  'chat_session',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    /** FK added post-migration (avoids import cycle with hub). */
    hubId: text('hub_id'),
    /** Nullable — viewer may be anonymous; otherwise a user.id or a hub_subscriber.id. */
    viewerId: text('viewer_id'),
    viewerEmail: text('viewer_email'),
    /** Anonymous session cookie id for pre-login chat. */
    anonymousId: text('anonymous_id'),
    title: text('title'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    hubCreatedIdx: index('chat_session_hub_created_idx').on(t.hubId, t.createdAt),
    viewerIdx: index('chat_session_viewer_idx').on(t.viewerId),
    anonymousIdx: index('chat_session_anonymous_idx').on(t.anonymousId),
    workspaceIdx: index('chat_session_workspace_idx').on(t.workspaceId),
  }),
);

export const chatMessage = pgTable(
  'chat_message',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => chatSession.id, { onDelete: 'cascade' }),
    role: chatMessageRoleEnum('role').notNull(),
    content: text('content').notNull(),
    /** Structured assistant output with `{markdown, citations[]}`. */
    structured: jsonb('structured'),
    /** Retrieval trace — doc ids, scores — for debugging. */
    retrievalTrace: jsonb('retrieval_trace'),
    tokenCounts: jsonb('token_counts').$type<{
      input?: number;
      output?: number;
      cached?: number;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sessionCreatedIdx: index('chat_message_session_created_idx').on(
      t.sessionId,
      t.createdAt,
    ),
    roleIdx: index('chat_message_role_idx').on(t.role),
  }),
);
