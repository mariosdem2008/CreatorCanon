import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

/**
 * Phase N — Credit ledger.
 *
 * Append-only event log of every credit grant (positive `delta`) and
 * consumption (negative `delta`), plus a materialized `credit_balance`
 * row per (userId, kind) for O(1) reads.
 *
 * Three credit kinds tracked:
 *   - `hours`            (video generation hours)
 *   - `builder_credits`  (per AI builder call)
 *   - `chat_credits`     (per hub chat message)
 *
 * Idempotency is enforced by a UNIQUE(source, reference) index — the same
 * Stripe webhook firing twice, the same audit run finishing twice, etc., all
 * produce a single ledger event.
 *
 * Source convention (free-form prefix discriminates origin):
 *   - `tier:starter:<periodIso>`           tier-period grant
 *   - `tier_reset:<prevPeriodIso>`         period-rollover consume of leftover tier credits
 *   - `addon:hours:<stripeChargeId>`       one-off add-on top up
 *   - `audit:run_<runId>`                  audit-run consume (estimate or true-up)
 *   - `chat:msg_<msgId>`                   chat-message consume
 *   - `builder:call_<callId>`              builder-call consume
 *   - `manual:<note>`                      ops manual adjustment
 *
 * `userId` is a `text` FK to `user.id` (Auth.js text PKs).
 */
export const creditEvent = pgTable(
  'credit_event',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** `hours` | `builder_credits` | `chat_credits`. */
    kind: varchar('kind', { length: 24 }).notNull(),
    /** Positive for grants, negative for consumes. */
    delta: integer('delta').notNull(),
    /** Origin of this event — see source convention above. */
    source: varchar('source', { length: 96 }).notNull(),
    /** Optional FK-text (subscription_id, run_id, msg_id, ...). */
    reference: varchar('reference', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    /** Idempotency: same (source, reference) tuple lands once. */
    idempotency: uniqueIndex('credit_event_source_reference_unique').on(
      t.source,
      t.reference,
    ),
    userKindIdx: index('credit_event_user_kind_idx').on(t.userId, t.kind),
    userCreatedIdx: index('credit_event_user_created_idx').on(t.userId, t.createdAt),
  }),
);

/**
 * `credit_balance` — materialized current balance for fast O(1) reads.
 * Recomputed on every write inside the same transaction; reconciler verifies
 * nightly against the sum of `credit_event.delta`.
 */
export const creditBalance = pgTable(
  'credit_balance',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 24 }).notNull(),
    balance: integer('balance').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.kind] }),
  }),
);

export type CreditEvent = typeof creditEvent.$inferSelect;
export type NewCreditEvent = typeof creditEvent.$inferInsert;
export type CreditBalanceRow = typeof creditBalance.$inferSelect;
export type NewCreditBalance = typeof creditBalance.$inferInsert;

/** The closed set of credit kinds tracked by the ledger. */
export const CREDIT_KINDS = ['hours', 'builder_credits', 'chat_credits'] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export function isCreditKind(value: unknown): value is CreditKind {
  return (
    typeof value === 'string' &&
    (CREDIT_KINDS as readonly string[]).includes(value)
  );
}
