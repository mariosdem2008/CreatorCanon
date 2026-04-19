import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { vector } from './_vector';
import {
  confidenceEnum,
  frameObservationTypeEnum,
  visualAssetModeEnum,
} from './enums';
import { workspace } from './workspace';
import { video } from './youtube';
import { generationRun } from './run';

/**
 * `visual_asset` — the video asset prepared for Gemini. One per (run, video).
 */
export const visualAsset = pgTable(
  'visual_asset',
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
    mode: visualAssetModeEnum('mode').notNull(),
    r2KeyOrUrl: text('r2_key_or_url').notNull(),
    /** Null when mode = direct_video. */
    samplingFps: doublePrecision('sampling_fps'),
    durationSeconds: integer('duration_seconds'),
    /** 0.0–1.0 pre-check visual-density heuristic. */
    densityScore: doublePrecision('density_score'),
    shouldExtract: boolean('should_extract').notNull().default(false),
    /** Opaque Gemini file handle cached across stages. */
    geminiFileHandle: text('gemini_file_handle'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    runVideoUnique: uniqueIndex('visual_asset_run_video_unique').on(
      t.runId,
      t.videoId,
    ),
    workspaceIdx: index('visual_asset_workspace_idx').on(t.workspaceId),
    runIdx: index('visual_asset_run_idx').on(t.runId),
  }),
);

/**
 * `frame_asset` — sampled keyframe. Skipped when `visual_asset.mode = direct_video`.
 */
export const frameAsset = pgTable(
  'frame_asset',
  {
    id: text('id').primaryKey(),
    visualAssetId: text('visual_asset_id')
      .notNull()
      .references(() => visualAsset.id, { onDelete: 'cascade' }),
    timestampMs: integer('timestamp_ms').notNull(),
    r2Key: text('r2_key').notNull(),
    /** Cheap pre-OCR used for the density heuristic. */
    ocrText: text('ocr_text'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    visualAssetTsIdx: index('frame_asset_visual_asset_ts_idx').on(
      t.visualAssetId,
      t.timestampMs,
    ),
  }),
);

/**
 * `frame_observation` — Gemini-extracted visual observation; the visual analogue
 * of a text segment. Constraint `end_ms >= start_ms` added via CHECK constraint
 * in post-migration SQL (drizzle-kit 0.24 cannot emit table CHECK constraints).
 *
 *   -- ALTER TABLE frame_observation ADD CONSTRAINT frame_observation_end_ge_start
 *   --   CHECK (end_ms >= start_ms);
 *
 * HNSW index to be added in post-migration SQL:
 *   -- CREATE INDEX frame_observation_embedding_hnsw ON frame_observation
 *   --   USING hnsw (embedding vector_cosine_ops);
 */
export const frameObservation = pgTable(
  'frame_observation',
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
    visualAssetId: text('visual_asset_id')
      .notNull()
      .references(() => visualAsset.id, { onDelete: 'cascade' }),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
    observationType: frameObservationTypeEnum('observation_type').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    textExtracted: text('text_extracted'),
    entities: jsonb('entities').$type<{
      concepts?: string[];
      numbers?: (string | number)[];
      labels?: string[];
      [k: string]: unknown;
    }>(),
    confidence: confidenceEnum('confidence').notNull().default('moderate'),
    /** HNSW index to be added in post-migration SQL (see comment above). */
    embedding: vector('embedding', { dimensions: 1536 }),
    /** Optional R2 key of the representative frame image used for UI preview. */
    representativeFrameR2Key: text('representative_frame_r2_key'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    videoRangeIdx: index('frame_observation_video_range_idx').on(
      t.videoId,
      t.startMs,
      t.endMs,
    ),
    runVideoIdx: index('frame_observation_run_video_idx').on(t.runId, t.videoId),
    visualAssetIdx: index('frame_observation_visual_asset_idx').on(t.visualAssetId),
    observationTypeIdx: index('frame_observation_type_idx').on(t.observationType),
    workspaceIdx: index('frame_observation_workspace_idx').on(t.workspaceId),
  }),
);
