/**
 * Phase N — Credit ledger public types.
 *
 * Re-exports the canonical kind-set from @creatorcanon/db so callers don't
 * have to depend on the schema module just to type a kind.
 */

export { CREDIT_KINDS, isCreditKind } from '@creatorcanon/db/schema';
export type { CreditKind, CreditEvent, CreditBalanceRow } from '@creatorcanon/db/schema';

/**
 * Thrown by `consume()` and `requireCredits()` when the user's balance is
 * insufficient. API routes catch this and translate to HTTP 402 with an
 * upsell CTA.
 */
export class InsufficientCreditsError extends Error {
  /** Discriminator for catch-blocks (instanceof works too). */
  readonly kind = 'InsufficientCreditsError' as const;
  readonly creditKind: string;
  readonly required: number;
  readonly available: number;

  constructor(args: { creditKind: string; required: number; available: number; message?: string }) {
    super(
      args.message ??
        `Insufficient ${args.creditKind} credits: required ${args.required}, available ${args.available}`,
    );
    this.name = 'InsufficientCreditsError';
    this.creditKind = args.creditKind;
    this.required = args.required;
    this.available = args.available;
  }
}

/** Minimal contract for a credit-ledger storage backend. */
export interface CreditLedgerStore {
  /**
   * Insert one credit_event row. Idempotent on (source, reference) — a
   * duplicate insert returns the existing row's id (or `null` if the row
   * was deduped without an id surface). The corresponding `credit_balance`
   * row MUST be updated atomically with the event insert.
   */
  insertEvent(args: {
    id: string;
    userId: string;
    kind: string;
    delta: number;
    source: string;
    reference?: string | null;
  }): Promise<{ inserted: boolean; balance: number }>;

  /** Read current balance for (userId, kind). Returns 0 if no row exists. */
  getBalance(userId: string, kind: string): Promise<number>;

  /** Read all 3 balances for a user. */
  getAllBalances(userId: string): Promise<Record<string, number>>;
}
