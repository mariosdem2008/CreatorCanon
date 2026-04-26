import { sql } from 'drizzle-orm';
import {
  bigint,
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

import { bytea } from './_vector';
import {
  captionStatusEnum,
  sourceKindEnum,
  transcribeStatusEnum,
  uploadStatusEnum,
  youtubeConnectionStatusEnum,
} from './enums';
import { workspace } from './workspace';

export const youtubeConnection = pgTable(
  'youtube_connection',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    googleSub: text('google_sub').notNull(),
    accessTokenEnc: bytea('access_token_enc').notNull(),
    refreshTokenEnc: bytea('refresh_token_enc').notNull(),
    scopes: text('scopes').array().notNull().default(sql`ARRAY[]::text[]`),
    status: youtubeConnectionStatusEnum('status').notNull().default('connected'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    workspaceIdx: index('youtube_connection_workspace_idx').on(t.workspaceId),
    // MVP enforces one active connection per workspace via partial index (added post-migration)
    // -- CREATE UNIQUE INDEX youtube_connection_active_per_workspace
    // --   ON youtube_connection (workspace_id) WHERE status = 'connected';
  }),
);

export const channel = pgTable(
  'channel',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    youtubeChannelId: text('youtube_channel_id'),
    title: text('title'),
    handle: text('handle'),
    description: text('description'),
    subsCount: integer('subs_count'),
    videoCount: integer('video_count'),
    uploadsPlaylistId: text('uploads_playlist_id'),
    country: text('country'),
    language: text('language'),
    avatarUrl: text('avatar_url'),
    bannerUrl: text('banner_url'),
    metadataFetchedAt: timestamp('metadata_fetched_at', {
      withTimezone: true,
      mode: 'date',
    }),
    sourceKind: sourceKindEnum('source_kind').notNull().default('youtube'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    youtubeIdIdx: uniqueIndex('channel_youtube_channel_id_unique').on(t.youtubeChannelId),
    workspaceIdx: index('channel_workspace_idx').on(t.workspaceId),
  }),
);

export const video = pgTable(
  'video',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    channelId: text('channel_id')
      .notNull()
      .references(() => channel.id, { onDelete: 'cascade' }),
    youtubeVideoId: text('youtube_video_id'),
    title: text('title'),
    description: text('description'),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    durationSeconds: integer('duration_seconds'),
    viewCount: bigint('view_count', { mode: 'number' }),
    likeCount: bigint('like_count', { mode: 'number' }),
    thumbnails: jsonb('thumbnails').$type<{
      small?: string;
      medium?: string;
      large?: string;
      maxres?: string;
    }>(),
    categories: text('categories').array(),
    tags: text('tags').array(),
    defaultLanguage: text('default_language'),
    captionStatus: captionStatusEnum('caption_status').notNull().default('unknown'),
    excludedFromSelection: boolean('excluded_from_selection').notNull().default(false),
    metadataFetchedAt: timestamp('metadata_fetched_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    sourceKind: sourceKindEnum('source_kind').notNull().default('youtube'),
    localR2Key: text('local_r2_key'),
    uploadStatus: uploadStatusEnum('upload_status'),
    transcribeStatus: transcribeStatusEnum('transcribe_status'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    contentType: text('content_type'),
  },
  (t) => ({
    youtubeIdWorkspaceIdx: uniqueIndex('video_workspace_youtube_id_unique').on(
      t.workspaceId,
      t.youtubeVideoId,
    ),
    youtubeVideoIdx: index('video_youtube_video_id_idx').on(t.youtubeVideoId),
    workspaceChannelIdx: index('video_workspace_channel_idx').on(
      t.workspaceId,
      t.channelId,
    ),
    publishedIdx: index('video_workspace_published_idx').on(
      t.workspaceId,
      t.publishedAt,
    ),
  }),
);

/**
 * Lightweight append-only snapshot table for tracking view/like count drift over
 * time. Written by the channel_metadata_scan stage on each resync.
 */
export const videoSnapshot = pgTable(
  'video_snapshot',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    videoId: text('video_id')
      .notNull()
      .references(() => video.id, { onDelete: 'cascade' }),
    viewCount: bigint('view_count', { mode: 'number' }),
    likeCount: bigint('like_count', { mode: 'number' }),
    commentCount: bigint('comment_count', { mode: 'number' }),
    qualityScore: doublePrecision('quality_score'),
    capturedAt: timestamp('captured_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    videoCapturedIdx: index('video_snapshot_video_captured_idx').on(
      t.videoId,
      t.capturedAt,
    ),
    workspaceIdx: index('video_snapshot_workspace_idx').on(t.workspaceId),
  }),
);
