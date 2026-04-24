import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * `allowlist_email` — private-alpha gate. An email MUST exist here AND have
 * `approved=true` before NextAuth will create or resume a session for that
 * identity. Operator approves new rows manually via `/admin` or SQL.
 *
 * `requested_by_ip` is for abuse triage only (admin-only). Do NOT surface
 * in product UI.
 */
export const allowlistEmail = pgTable(
  'allowlist_email',
  {
    email: text('email').primaryKey(),
    approved: boolean('approved').notNull().default(false),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    requestedByIp: text('requested_by_ip'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    approvedIdx: index('allowlist_email_approved_idx').on(t.approved),
  }),
);

export type AllowlistRow = typeof allowlistEmail.$inferSelect;

export function isAllowlistApproved(row: AllowlistRow | undefined | null): boolean {
  return Boolean(row?.approved);
}
