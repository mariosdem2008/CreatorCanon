/**
 * Phase N — Enforcer middleware.
 *
 * `requireCredits(store, userId, kind, amount)` throws `InsufficientCreditsError`
 * if the user's balance is too low. It does NOT decrement the balance — that's
 * the consumer's responsibility once the work succeeds (work-first, debit-on-success).
 *
 * API routes catch the error and translate to:
 *   HTTP 402 Payment Required
 *   { error: 'insufficient_credits', kind, required, available, addonUrl: '/billing/addons' }
 *
 * Use sites:
 *   - Phase A audit start (`hours`) — call before kicking off the run.
 *   - Phase B builder API (`builder_credits`) — per call, before invoking Codex.
 *   - Phase L chat API (`chat_credits`) — per response, before streaming.
 */

import { InsufficientCreditsError } from './types';
import type { CreditKind, CreditLedgerStore } from './types';

export async function requireCredits(
  store: CreditLedgerStore,
  userId: string,
  kind: CreditKind,
  amount: number,
): Promise<void> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new TypeError(`requireCredits amount must be a positive integer (got ${amount})`);
  }
  const balance = await store.getBalance(userId, kind);
  if (balance < amount) {
    throw new InsufficientCreditsError({
      creditKind: kind,
      required: amount,
      available: balance,
    });
  }
}

/**
 * Wrap an async work function with a credit gate.
 *
 *   1. requireCredits(kind, amount)         (throws if short)
 *   2. fn()                                  (your work — throws on failure)
 *   3. consume the work's actual usage      (only on success)
 *
 * The consume is delegated back to the caller (a `commit` callback) so they
 * can use the work's output to decide the *real* amount (e.g., audit's true
 * video duration vs. estimate). If `commit` is omitted, `amount` is consumed
 * verbatim.
 *
 * If `fn()` throws, no consume event is written — the failed work doesn't
 * cost the user any credits. The pre-check `requireCredits` already fired
 * so we don't have to retry it.
 */
export interface RunWithCreditsArgs<T> {
  store: CreditLedgerStore;
  userId: string;
  kind: CreditKind;
  /** Pre-check amount (estimate). */
  estimate: number;
  /** The work to run. Receives nothing; returns its result. */
  fn: () => Promise<T>;
  /** Source slug for the consume event (e.g. `audit:run_<runId>`). */
  source: string;
  /** Optional reference for idempotency (e.g. `run_<runId>`). */
  reference?: string | null;
  /**
   * Convert the work's result into the actual amount to consume. Default: use
   * the pre-check estimate. May return a value larger or smaller than the
   * estimate — true-up consumes are common for audits where duration isn't
   * known until decoded.
   */
  computeActual?: (result: T) => number;
}

/**
 * Helper that does pre-check → work → success-only consume. Bubbles up
 * `InsufficientCreditsError` from the pre-check, and surfaces work failures
 * unchanged (caller decides whether to log).
 */
export async function runWithCredits<T>(
  args: RunWithCreditsArgs<T>,
): Promise<{ result: T; consumed: number }> {
  await requireCredits(args.store, args.userId, args.kind, args.estimate);
  const result = await args.fn();
  const actual = args.computeActual
    ? Math.max(0, Math.floor(args.computeActual(result)))
    : args.estimate;
  if (actual > 0) {
    // Direct ledger insert (negative delta). We import lazily to avoid circular
    // dep cycles between enforcer + ledger.
    const { consume } = await import('./ledger');
    await consume(args.store, {
      userId: args.userId,
      kind: args.kind,
      amount: actual,
      source: args.source,
      reference: args.reference ?? null,
    });
  }
  return { result, consumed: actual };
}
