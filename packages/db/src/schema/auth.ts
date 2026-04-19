import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { citext } from './_vector';

/**
 * Auth.js v5 Drizzle-adapter compatible shape.
 * https://authjs.dev/getting-started/adapters/drizzle
 *
 * Extended with Atlas-specific columns: `is_admin`, `google_sub`, `last_login_at`.
 * `email` uses plain `text` (not citext) so @auth/drizzle-adapter's PgText
 * type check passes. Case-insensitive uniqueness is enforced via a functional
 * index `LOWER(email)` added in post-migration SQL. Google OAuth always
 * returns lowercase emails so this is a non-issue in practice.
 */
export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: timestamp('email_verified', {
      withTimezone: true,
      mode: 'date',
    }),
    image: text('image'),
    avatarUrl: text('avatar_url'),
    googleSub: text('google_sub'),
    isAdmin: boolean('is_admin').default(false).notNull(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    emailIdx: uniqueIndex('user_email_unique').on(t.email),
    googleSubIdx: uniqueIndex('user_google_sub_unique').on(t.googleSub),
  }),
);

// Column TS property names must match @auth/drizzle-adapter's DefaultPostgresAccountsTable:
// camelCase for userId/type/provider/providerAccountId, snake_case for the OAuth token fields.
export const account = pgTable(
  'account',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
    userIdx: index('account_user_id_idx').on(t.userId),
  }),
);

export const session = pgTable(
  'session',
  {
    sessionToken: text('session_token').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    userIdx: index('session_user_id_idx').on(t.userId),
  }),
);

export const verificationToken = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);
