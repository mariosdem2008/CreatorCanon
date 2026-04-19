import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { vector } from './_vector';
import {
  mediaAssetTypeEnum,
  transcriptProviderEnum,
} from './enums';
import { workspace } from './workspace';
import { video } from './youtube';
import { generationRun } from './run';

export const transcriptAsset = pgTable(
  'transcript_asset',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    provider: transcriptProviderEnum('provider').notNull(),
    language: text('language'),
    r2Key: text('r2_key').notNull(),
    wordCount: integer('word_count').notNull().default(0),
    qualityScore: doublePrecision('quality_score'),
    isCanonical: boolean('is_canonical').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    videoIdx: index('transcript_asset_video_idx').on(t.videoId),
    workspaceIdx: index('transcript_asset_workspace_idx').on(t.workspaceId),
    providerIdx: index('transcript_asset_provider_idx').on(t.provider),
    // Partial unique post-migration: one canonical per video
    // -- CREATE UNIQUE INDEX transcript_asset_canonical_per_video
    // --   ON transcript_asset (video_id) WHERE is_canonical = true;
  }),
);

export const mediaAsset = pgTable(
  'media_asset',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    type: mediaAssetTypeEnum('type').notNull(),
    r2Key: text('r2_key').notNull(),
    durationSeconds: integer('duration_seconds'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    videoIdx: index('media_asset_video_idx').on(t.videoId),
    workspaceIdx: index('media_asset_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * Post-cleaning transcript version. Drives the segment extractor.
 */
export const normalizedTranscriptVersion = pgTable(
  'normalized_transcript_version',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    transcriptAssetId: text('transcript_asset_id')
      .notNull()
      .references(() => transcriptAsset.id, { onDelete: 'cascade' }),
    r2Key: text('r2_key').notNull(),
    version: integer('version').notNull().default(1),
    sentenceCount: integer('sentence_count'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    videoVersionIdx: index('normalized_transcript_version_video_idx').on(
      t.videoId,
      t.version,
    ),
    transcriptIdx: index('normalized_transcript_version_transcript_idx').on(
      t.transcriptAssetId,
    ),
  }),
);

/**
 * `segment` — semantic transcript window (2–8 min) used as the L2 retrieval unit.
 * Embedding indexed via HNSW post-migration:
 *   -- CREATE INDEX segment_embedding_hnsw ON segment USING hnsw
 *   --   (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);
 */
export const segment = pgTable(
  'segment',
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
    normalizedTranscriptVersionId: text('normalized_transcript_version_id')
      .notNull()
      .references(() => normalizedTranscriptVersion.id, { onDelete: 'cascade' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
    tags: text('tags').array(),
    summary: text('summary'),
    metadata: jsonb('metadata'),
    /** HNSW index to be added in post-migration SQL (see comment above). */
    embedding: vector('embedding', { dimensions: 1536 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runVideoStartIdx: index('segment_run_video_start_idx').on(
      t.runId,
      t.videoId,
      t.startMs,
    ),
    videoRangeIdx: index('segment_video_range_idx').on(
      t.videoId,
      t.startMs,
      t.endMs,
    ),
    runIdx: index('segment_run_idx').on(t.runId),
  }),
);
