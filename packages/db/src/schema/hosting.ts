import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { deploymentStatusEnum } from './enums';
import { hub } from './release';

export const deploymentStatusValues = deploymentStatusEnum.enumValues;
export type DeploymentStatus = (typeof deploymentStatusValues)[number];

/**
 * `deployment` tracks the per-creator Vercel project and domain state for a hub.
 *
 * Phase G locks in one Vercel project per hub. `hub_id` follows the repo's
 * existing text-id convention even though the original plan sketch used UUIDs.
 */
export const deployment = pgTable(
  'deployment',
  {
    id: text('id').primaryKey(),
    hubId: text('hub_id')
      .notNull()
      .references(() => hub.id, { onDelete: 'cascade' }),
    vercelProjectId: varchar('vercel_project_id', { length: 64 }),
    vercelDeploymentId: varchar('vercel_deployment_id', { length: 64 }),
    vercelCertId: varchar('vercel_cert_id', { length: 64 }),
    status: deploymentStatusEnum('status').notNull().default('pending'),
    liveUrl: text('live_url'),
    lastError: text('last_error'),
    /** Mirrors `hub.custom_domain`; API writes keep both columns synchronized. */
    customDomain: varchar('custom_domain', { length: 255 }),
    domainVerified: boolean('domain_verified').notNull().default(false),
    sslReady: boolean('ssl_ready').notNull().default(false),
    domainAttachedAt: timestamp('domain_attached_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    hubUnique: uniqueIndex('deployment_hub_unique').on(t.hubId),
    customDomainUnique: uniqueIndex('deployment_custom_domain_unique').on(
      t.customDomain,
    ),
    statusIdx: index('deployment_status_idx').on(t.status, t.updatedAt),
    vercelProjectIdx: index('deployment_vercel_project_idx').on(t.vercelProjectId),
  }),
);
