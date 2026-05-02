import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { citext } from './_vector';
import {
  hubAccessModeEnum,
  hubAccessStatusEnum,
  hubFreePreviewEnum,
  hubTemplateKeyEnum,
  hubThemeEnum,
  releaseStatusEnum,
} from './enums';
import { workspace } from './workspace';
import { project } from './project';
import { generationRun } from './run';

/** Per-hub freeform override bag. See spec § 5.2 + § 12.2. Empty object is the no-op. */
export interface HubMetadata {
  /** Optional display tagline shown on the hub home; falls back to a template default. */
  tagline?: string;
  /** Per-hub override of the template's trust block. Adapter shallow-merges per top-level key. */
  trust?: {
    methodologySummary?: string;
    qualityPrinciples?: { title: string; body: string }[];
    creationProcess?: { stepNumber: number; title: string; body: string }[];
    faq?: { question: string; answer: string }[];
  };
  /** Creator Manual brand overrides merged by the hub adapter. */
  brand?: {
    name?: string;
    tone?: string;
    colors?: Partial<{
      background: string;
      foreground: string;
      surface: string;
      elevated: string;
      border: string;
      muted: string;
      accent: string;
      accentForeground: string;
      warning: string;
      success: string;
    }>;
    typography?: Partial<{
      headingFamily: string;
      bodyFamily: string;
    }>;
    assets?: Partial<{
      logoUrl: string;
      heroImageUrl: string;
      patternImageUrl: string;
    }>;
  };
}

/**
 * `hub` (a.k.a. `published_hub`) — one hub per project for MVP. Keyed by subdomain.
 *
 * CHECK constraint added in post-migration SQL:
 *   -- ALTER TABLE hub ADD CONSTRAINT hub_subdomain_format
 *   --   CHECK (subdomain ~ '^[a-z0-9-]{3,30}$');
 *   -- ALTER TABLE hub ADD CONSTRAINT hub_subdomain_not_reserved
 *   --   CHECK (subdomain NOT IN ('www','admin','api','app','mail','status'));
 */
export const hub = pgTable(
  'hub',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    subdomain: citext('subdomain').notNull(),
    customDomain: text('custom_domain'),
    theme: hubThemeEnum('theme').notNull().default('paper'),
    templateKey: hubTemplateKeyEnum('template_key').notNull().default('creator_manual'),
    accessMode: hubAccessModeEnum('access_mode').notNull().default('public'),
    paywallPriceCents: integer('paywall_price_cents'),
    metadata: jsonb('metadata').$type<HubMetadata>().notNull().default({}),
    freePreview: hubFreePreviewEnum('free_preview').notNull().default('first_lesson'),
    /** Forward ref; FK added post-migration (avoids import cycle with release). */
    liveReleaseId: text('live_release_id'),
    previewReleaseId: text('preview_release_id'),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    subdomainUnique: uniqueIndex('hub_subdomain_unique').on(t.subdomain),
    customDomainUnique: uniqueIndex('hub_custom_domain_unique').on(t.customDomain),
    projectUnique: uniqueIndex('hub_project_unique').on(t.projectId),
    workspaceIdx: index('hub_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * `release` — immutable snapshot of the hub at publish time.
 */
export const release = pgTable(
  'release',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    hubId: text('hub_id')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade' }),
    runId: text('run_id')
      .notNull()
      .references(() => generationRun.id, { onDelete: 'restrict' }),
    releaseNumber: integer('release_number').notNull(),
    status: releaseStatusEnum('status').notNull().default('building'),
    manifestR2Key: text('manifest_r2_key'),
    builtAt: timestamp('built_at', { withTimezone: true, mode: 'date' }),
    liveAt: timestamp('live_at', { withTimezone: true, mode: 'date' }),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    hubReleaseNumberUnique: uniqueIndex('release_hub_release_number_unique').on(
      t.hubId,
      t.releaseNumber,
    ),
    hubCreatedIdx: index('release_hub_created_idx').on(t.hubId, t.createdAt),
    statusIdx: index('release_status_idx').on(t.status),
    runIdx: index('release_run_idx').on(t.runId),
    workspaceIdx: index('release_workspace_idx').on(t.workspaceId),
  }),
);

/**
 * `hub_visit` — page-view analytics mirror. Thin, keyed by hub for quick
 * per-hub dashboards. Full analytics stream lives in PostHog.
 */
export const hubVisit = pgTable(
  'hub_visit',
  {
    id: text('id').primaryKey(),
    hubId: text('hub_id')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade' }),
    releaseId: text('release_id').references(() => release.id, {
      onDelete: 'set null',
    }),
    /** Page/slug the visit landed on. Null for hub root. */
    pageSlug: text('page_slug'),
    visitorId: text('visitor_id'),
    referrer: text('referrer'),
    userAgent: text('user_agent'),
    ipHash: text('ip_hash'),
    country: text('country'),
    durationMs: integer('duration_ms'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    hubOccurredIdx: index('hub_visit_hub_occurred_idx').on(t.hubId, t.occurredAt),
    releaseIdx: index('hub_visit_release_idx').on(t.releaseId),
    visitorIdx: index('hub_visit_visitor_idx').on(t.visitorId),
  }),
);

/**
 * `hub_subscriber` — merged "lead capture + paywall access" table.
 * Stores both free subscribers (email capture) and paywalled viewers
 * (hub_access per data-model doc).
 */
export const hubSubscriber = pgTable(
  'hub_subscriber',
  {
    id: text('id').primaryKey(),
    hubId: text('hub_id')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    name: text('name'),
    /** Null for free subscribers; set when they upgrade through paywall. */
    stripeSubscriptionId: text('stripe_subscription_id'),
    accessStatus: hubAccessStatusEnum('access_status').notNull().default('active'),
    /** True for lead-capture signups without paid access. */
    isFree: jsonb('is_free').$type<boolean>(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'date' }),
    unsubscribedAt: timestamp('unsubscribed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    hubEmailUnique: uniqueIndex('hub_subscriber_hub_email_unique').on(
      t.hubId,
      t.email,
    ),
    hubCreatedIdx: index('hub_subscriber_hub_created_idx').on(
      t.hubId,
      t.createdAt,
    ),
    stripeSubIdx: uniqueIndex('hub_subscriber_stripe_sub_unique').on(
      t.stripeSubscriptionId,
    ),
    accessStatusIdx: index('hub_subscriber_access_status_idx').on(t.accessStatus),
  }),
);
