import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { citext } from './_vector';
import { workspaceRoleEnum } from './enums';
import { user } from './auth';

export const workspace = pgTable(
  'workspace',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    onboardingState: jsonb('onboarding_state').$type<{
      audience_level?: string;
      tone_preference?: string;
      primary_use_case?: string;
      [k: string]: unknown;
    }>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    slugIdx: uniqueIndex('workspace_slug_unique').on(t.slug),
    ownerIdx: index('workspace_owner_user_id_idx').on(t.ownerUserId),
    stripeCustomerIdx: uniqueIndex('workspace_stripe_customer_id_unique').on(
      t.stripeCustomerId,
    ),
  }),
);

export const workspaceMember = pgTable(
  'workspace_member',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspace.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: workspaceRoleEnum('role').notNull().default('owner'),
    invitedAt: timestamp('invited_at', { withTimezone: true, mode: 'date' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workspaceId, t.userId] }),
    userIdx: index('workspace_member_user_id_idx').on(t.userId),
  }),
);
