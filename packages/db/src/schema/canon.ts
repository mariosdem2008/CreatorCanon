import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspace } from './workspace';
import { generationRun } from './run';
import { video } from './youtube';

export const channelProfile = pgTable('channel_profile', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  costCents: numeric('cost_cents', { precision: 10, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runUnique: uniqueIndex('channel_profile_run_unique').on(t.runId),
}));

export const videoIntelligenceCard = pgTable('video_intelligence_card', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull().references(() => video.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  evidenceSegmentIds: text('evidence_segment_ids').array().notNull().default([]),
  costCents: numeric('cost_cents', { precision: 10, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runVideoUnique: uniqueIndex('vic_run_video_unique').on(t.runId, t.videoId),
  runIdx: index('vic_run_idx').on(t.runId),
}));

export const canonNode = pgTable('canon_node', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  evidenceSegmentIds: text('evidence_segment_ids').array().notNull().default([]),
  sourceVideoIds: text('source_video_ids').array().notNull().default([]),
  evidenceQuality: text('evidence_quality').notNull(),
  origin: text('origin').notNull().default('single_video'),
  confidenceScore: integer('confidence_score').notNull().default(0),
  citationCount: integer('citation_count').notNull().default(0),
  sourceCoverage: integer('source_coverage').notNull().default(0),
  pageWorthinessScore: integer('page_worthiness_score').notNull().default(0),
  specificityScore: integer('specificity_score').notNull().default(0),
  creatorUniquenessScore: integer('creator_uniqueness_score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runTypeIdx: index('canon_node_run_type_idx').on(t.runId, t.type),
}));

export const pageBrief = pgTable('page_brief', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  pageWorthinessScore: integer('page_worthiness_score').notNull().default(0),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runPositionIdx: index('page_brief_run_position_idx').on(t.runId, t.position),
}));

export const pageQualityReport = pgTable('page_quality_report', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  pageId: text('page_id').notNull(),
  evidenceScore: integer('evidence_score').notNull().default(0),
  citationCount: integer('citation_count').notNull().default(0),
  distinctSourceVideos: integer('distinct_source_videos').notNull().default(0),
  emptySectionCount: integer('empty_section_count').notNull().default(0),
  unsupportedClaimCount: integer('unsupported_claim_count').notNull().default(0),
  genericLanguageScore: integer('generic_language_score').notNull().default(0),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runPageUnique: uniqueIndex('pqr_run_page_unique').on(t.runId, t.pageId),
}));

export const visualMoment = pgTable('visual_moment', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull().references(() => video.id, { onDelete: 'cascade' }),
  segmentId: text('segment_id'),
  timestampMs: integer('timestamp_ms').notNull(),
  frameR2Key: text('frame_r2_key'),
  thumbnailR2Key: text('thumbnail_r2_key'),
  type: text('type').notNull(),
  description: text('description').notNull(),
  extractedText: text('extracted_text'),
  hubUse: text('hub_use').notNull(),
  usefulnessScore: integer('usefulness_score').notNull().default(0),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runVideoIdx: index('visual_moment_run_video_idx').on(t.runId, t.videoId),
  runScoreIdx: index('visual_moment_run_score_idx').on(t.runId, t.usefulnessScore),
}));

export type ChannelProfile = typeof channelProfile.$inferSelect;
export type VideoIntelligenceCard = typeof videoIntelligenceCard.$inferSelect;
export type CanonNode = typeof canonNode.$inferSelect;
export type PageBrief = typeof pageBrief.$inferSelect;
export type PageQualityReport = typeof pageQualityReport.$inferSelect;
export type VisualMoment = typeof visualMoment.$inferSelect;
