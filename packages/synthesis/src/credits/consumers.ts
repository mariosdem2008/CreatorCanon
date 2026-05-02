/**
 * Phase N — Per-call-site consumption helpers.
 *
 * Each consumer (audit / builder / chat) has a stable use-shape:
 *
 *   1. Pre-check via `requireCredits` (throws InsufficientCreditsError → 402).
 *   2. Run the work.
 *   3. On success, write a consume event with a deterministic source slug
 *      tied to the work's id. Idempotent on (source, reference).
 *
 * For audits, step 1 is an *estimate* (we don't know the real video duration
 * until decode); step 3 is the *true-up* — we may consume more or less than
 * estimated. `consumeAuditHours` handles both cases via a single call at
 * end-of-run that records the actual consumption and an explicit refund or
 * debit-of-difference if the estimate diverged.
 *
 * Phase A / Phase B / Phase L consumers import these helpers; Phase N owns
 * the wiring contract.
 */

import { consume, grant } from './ledger';
import { requireCredits } from './enforcer';
import type { CreditLedgerStore, CreditKind } from './types';

// ── Audit (hours) ────────────────────────────────────────────────────────

export interface ReserveAuditHoursArgs {
  userId: string;
  /** Estimated hours up-front (pre-check). Integer. */
  estimateHours: number;
  /** Audit run id for idempotency / source slug. */
  runId: string;
}

/**
 * Phase A audit pre-check. Called BEFORE kicking off the run.
 * Throws `InsufficientCreditsError` if the user can't cover the estimate.
 *
 * Does NOT debit the ledger — the actual consume happens in `finalizeAuditHours`
 * once the run succeeds.
 */
export async function reserveAuditHours(
  store: CreditLedgerStore,
  args: ReserveAuditHoursArgs,
): Promise<void> {
  await requireCredits(store, args.userId, 'hours', args.estimateHours);
}

export interface FinalizeAuditHoursArgs {
  userId: string;
  /** The actual video hours consumed by the completed run. Integer. */
  actualHours: number;
  /** Audit run id (matches reserveAuditHours). */
  runId: string;
}

/**
 * Phase A audit finaliser. Called AFTER the run succeeds.
 * Writes a single consume event of `actualHours` against the run.
 * Idempotent on `(audit:run_<runId>, run_<runId>)` — replaying is a no-op.
 *
 * If the user no longer has enough credits at finalize time (rare race,
 * unlikely given the pre-check), this throws InsufficientCreditsError —
 * the run completed but the debit failed; ops needs to investigate.
 *
 * Returns `{ inserted, balance }`. Callers that maintain a per-run
 * `credit_event_ids` array (Phase A audit row) can use `inserted` to
 * decide whether to append the consume event reference.
 */
export async function finalizeAuditHours(
  store: CreditLedgerStore,
  args: FinalizeAuditHoursArgs,
): Promise<{ inserted: boolean; balance: number; consumed: number }> {
  if (args.actualHours <= 0) {
    return { inserted: false, balance: await store.getBalance(args.userId, 'hours'), consumed: 0 };
  }
  const r = await consume(store, {
    userId: args.userId,
    kind: 'hours',
    amount: args.actualHours,
    source: `audit:run_${args.runId}`,
    reference: `run_${args.runId}`,
  });
  return { inserted: r.inserted, balance: r.balance, consumed: args.actualHours };
}

/**
 * Optional refund helper for audits that completed with cost less than the
 * estimate. The default behaviour is "consume actual at finalize" — no refund
 * necessary because we never debit the estimate. This helper exists for
 * cases where Phase A wants to *eagerly* debit the estimate up-front and
 * later refund the diff (a different policy).
 */
export async function refundAuditHours(
  store: CreditLedgerStore,
  args: { userId: string; runId: string; refundHours: number },
): Promise<void> {
  if (args.refundHours <= 0) return;
  await grant(store, {
    userId: args.userId,
    kind: 'hours',
    amount: args.refundHours,
    source: `audit_refund:run_${args.runId}`,
    reference: `run_${args.runId}`,
  });
}

// ── Builder credits (per call) ───────────────────────────────────────────

export interface ConsumeBuilderCreditArgs {
  userId: string;
  /** Builder call id for idempotency / source slug. */
  callId: string;
  /** Defaults to 1. Integer. */
  amount?: number;
}

export async function consumeBuilderCredit(
  store: CreditLedgerStore,
  args: ConsumeBuilderCreditArgs,
): Promise<void> {
  const amount = args.amount ?? 1;
  await requireCredits(store, args.userId, 'builder_credits', amount);
  await consume(store, {
    userId: args.userId,
    kind: 'builder_credits',
    amount,
    source: `builder:call_${args.callId}`,
    reference: `call_${args.callId}`,
  });
}

// ── Chat credits (per response) ──────────────────────────────────────────

export interface ConsumeChatCreditArgs {
  /**
   * The hub-owner's user id (NOT the visitor — the creator pays for chat
   * credits, not the audience).
   */
  hubOwnerUserId: string;
  /** Chat message id for idempotency. */
  msgId: string;
  amount?: number;
}

export async function consumeChatCredit(
  store: CreditLedgerStore,
  args: ConsumeChatCreditArgs,
): Promise<void> {
  const amount = args.amount ?? 1;
  await requireCredits(store, args.hubOwnerUserId, 'chat_credits', amount);
  await consume(store, {
    userId: args.hubOwnerUserId,
    kind: 'chat_credits',
    amount,
    source: `chat:msg_${args.msgId}`,
    reference: `msg_${args.msgId}`,
  });
}

// ── Generic helper for any kind ──────────────────────────────────────────

export interface ConsumeOnSuccessArgs {
  userId: string;
  kind: CreditKind;
  amount: number;
  /** Source slug, e.g. `chat:msg_<id>`. */
  source: string;
  reference?: string | null;
}

/**
 * Low-level escape hatch: pre-check + consume in one call. Use the named
 * per-domain helpers above whenever possible — they encode the source-slug
 * convention so audit/builder/chat events stay consistent across the codebase.
 */
export async function consumeOnSuccess(
  store: CreditLedgerStore,
  args: ConsumeOnSuccessArgs,
): Promise<void> {
  await requireCredits(store, args.userId, args.kind, args.amount);
  await consume(store, {
    userId: args.userId,
    kind: args.kind,
    amount: args.amount,
    source: args.source,
    reference: args.reference ?? null,
  });
}
