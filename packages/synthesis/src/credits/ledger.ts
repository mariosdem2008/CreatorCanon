/**
 * Phase N — Ledger API.
 *
 * `grant` and `consume` are thin wrappers around `store.insertEvent`. They
 * differ only in:
 *   - sign convention (grant > 0; consume < 0)
 *   - balance pre-check (consume throws InsufficientCreditsError)
 *
 * Both are idempotent on `(source, reference)`: a duplicate insert is a
 * no-op that returns the current balance.
 *
 * Callers pass a `CreditLedgerStore` so production code can inject the
 * Drizzle-backed implementation while tests use the in-memory one.
 */

import { randomUUID } from 'node:crypto';

import { InsufficientCreditsError } from './types';
import type { CreditLedgerStore, CreditKind } from './types';

export interface GrantArgs {
  userId: string;
  kind: CreditKind;
  /** Positive integer. Negative or zero is a programmer error. */
  amount: number;
  source: string;
  reference?: string | null;
}

export interface ConsumeArgs {
  userId: string;
  kind: CreditKind;
  /** Positive integer (will be negated when written to the ledger). */
  amount: number;
  source: string;
  reference?: string | null;
}

export interface GrantResult {
  /** False if the (source, reference) was a dedupe hit. */
  inserted: boolean;
  /** New balance after the write (or current balance on dedupe). */
  balance: number;
}

function assertPositiveInt(n: number, label: string): void {
  if (!Number.isInteger(n) || n <= 0) {
    throw new TypeError(`${label} must be a positive integer (got ${n})`);
  }
}

/** Insert a positive-delta credit event. Idempotent on (source, reference). */
export async function grant(
  store: CreditLedgerStore,
  args: GrantArgs,
): Promise<GrantResult> {
  assertPositiveInt(args.amount, 'grant amount');
  return store.insertEvent({
    id: randomUUID(),
    userId: args.userId,
    kind: args.kind,
    delta: args.amount,
    source: args.source,
    reference: args.reference ?? null,
  });
}

/**
 * Insert a negative-delta credit event after verifying the user has the
 * required balance. Idempotent on (source, reference) — replaying the same
 * consume is a no-op.
 *
 * Throws `InsufficientCreditsError` if balance < amount.
 *
 * Note: the balance check + insert are not atomic at the JS level; the
 * Drizzle implementation MUST take a row-level lock (SELECT FOR UPDATE) on
 * `credit_balance` inside the transaction to make this race-safe. The
 * in-memory store is fine because Node is single-threaded.
 */
export async function consume(
  store: CreditLedgerStore,
  args: ConsumeArgs,
): Promise<GrantResult> {
  assertPositiveInt(args.amount, 'consume amount');

  const current = await store.getBalance(args.userId, args.kind);
  if (current < args.amount) {
    throw new InsufficientCreditsError({
      creditKind: args.kind,
      required: args.amount,
      available: current,
    });
  }

  return store.insertEvent({
    id: randomUUID(),
    userId: args.userId,
    kind: args.kind,
    delta: -args.amount,
    source: args.source,
    reference: args.reference ?? null,
  });
}
