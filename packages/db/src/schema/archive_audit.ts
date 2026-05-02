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

import { archiveAuditStatusEnum } from './enums';
import { user } from './auth';
import { workspace } from './workspace';
import { project } from './project';
import { generationRun } from './run';
import { hub, release } from './release';

export type ArchiveAuditReportJson = {
  version: 1;
  channel: {
    id: string;
    title: string;
    handle: string | null;
    url: string;
    thumbnailUrl: string | null;
  };
  scanned: {
    videoCount: number;
    transcriptCount: number;
    publicDataOnly: true;
  };
  scores: {
    overall: number;
    knowledgeDensity: number;
    sourceDepth: number;
    positioningClarity: number;
    monetizationPotential: number;
  };
  [key: string]: unknown;
};

export const archiveAudit = pgTable(
  'archive_audit',
  {
    id: text('id').primaryKey(),
    status: archiveAuditStatusEnum('status').default('queued').notNull(),
    inputUrl: text('input_url').notNull(),
    canonicalChannelUrl: text('canonical_channel_url'),
    channelId: text('channel_id'),
    channelTitle: text('channel_title'),
    channelHandle: text('channel_handle'),
    ipHash: text('ip_hash'),
    videoCountScanned: integer('video_count_scanned').default(0).notNull(),
    transcriptCountScanned: integer('transcript_count_scanned').default(0).notNull(),
    report: jsonb('report').$type<ArchiveAuditReportJson>(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    channelIdx: index('archive_audit_channel_idx').on(t.channelId),
    ipCreatedIdx: index('archive_audit_ip_created_idx').on(t.ipHash, t.createdAt),
    statusCreatedIdx: index('archive_audit_status_created_idx').on(t.status, t.createdAt),
  }),
);

export const auditHubGeneration = pgTable(
  'audit_hub_generation',
  {
    id: text('id').primaryKey(),
    auditId: text('audit_id')
      .notNull()
      .references(() => archiveAudit.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'cascade' }),
    hubId: text('hub_id')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade' }),
    releaseId: text('release_id').references(() => release.id, { onDelete: 'set null' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    status: text('status').default('queued').notNull(),
    autoPublish: boolean('auto_publish').default(true).notNull(),
    designSpec: jsonb('design_spec'),
    errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    auditWorkspaceUnique: uniqueIndex('audit_hub_generation_audit_workspace_unique').on(
      t.auditId,
      t.workspaceId,
    ),
    runIdx: index('audit_hub_generation_run_idx').on(t.runId),
    statusIdx: index('audit_hub_generation_status_idx').on(t.status, t.createdAt),
  }),
);

export type ArchiveAudit = typeof archiveAudit.$inferSelect;
export type NewArchiveAudit = typeof archiveAudit.$inferInsert;
export type AuditHubGeneration = typeof auditHubGeneration.$inferSelect;
export type NewAuditHubGeneration = typeof auditHubGeneration.$inferInsert;
