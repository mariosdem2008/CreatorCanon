/**
 * Phase N — Entitlements view-model.
 *
 * Phase E's `EntitlementsBadge.tsx` (Codex territory) needs balance + tier
 * cap together so it can render "Hours: 8 / 12". We expose a single helper
 * that computes the view-model so the React component is dumb.
 *
 *   {
 *     hours:           { balance, cap, used, percentUsed, nearExhaustion },
 *     builder_credits: { balance, cap, used, percentUsed, nearExhaustion },
 *     chat_credits:    { balance, cap, used, percentUsed, nearExhaustion },
 *     tier:            'starter' | 'pro' | 'studio',
 *     topUpUrl:        '/billing/addons',
 *   }
 *
 * `cap` reflects the current tier's allotment. `used = cap - balance` for
 * display only — internally we don't store `used` because the ledger's
 * grant/consume semantics already encode it.
 *
 * `nearExhaustion` is true when `balance / cap < 0.10` — Phase E uses this
 * to show a "Top up" link.
 */

import { getBalance } from './balance';
import { tierAmount } from './allocator';
import { CREDIT_KINDS } from './types';
import type { Tier } from './allocator';
import type { CreditKind, CreditLedgerStore } from './types';

export interface EntitlementSlot {
  balance: number;
  cap: number;
  /** Display-only: `cap - balance`, clamped to [0, cap]. */
  used: number;
  /** balance / cap, clamped to [0, 1]. NaN-safe (returns 0 if cap is 0). */
  percentUsed: number;
  /** True when `balance / cap < threshold` (default 10%). */
  nearExhaustion: boolean;
}

export type EntitlementsByKind = Record<CreditKind, EntitlementSlot>;

export interface Entitlements {
  hours: EntitlementSlot;
  builder_credits: EntitlementSlot;
  chat_credits: EntitlementSlot;
  tier: Tier;
  topUpUrl: string;
}

export interface GetEntitlementsArgs {
  /** The viewer's user id. */
  userId: string;
  /** Caller's current Stripe tier — Phase E supplies from the subscription state machine. */
  tier: Tier;
  /** Threshold for `nearExhaustion`. Default 0.10 (10%). */
  exhaustionThreshold?: number;
  /** Override the top-up link target. */
  topUpUrl?: string;
}

/**
 * Compute the entitlement view-model for one user. Pure: a single
 * getBalance + 3 tierAmount lookups. Can be called from a Server Component.
 */
export async function getEntitlements(
  store: CreditLedgerStore,
  args: GetEntitlementsArgs,
): Promise<Entitlements> {
  const threshold = args.exhaustionThreshold ?? 0.1;
  const balances = await getBalance(store, args.userId);

  const slot = (kind: CreditKind): EntitlementSlot => {
    const balance = balances[kind] ?? 0;
    const cap = tierAmount(args.tier, kind);
    const used = Math.max(0, Math.min(cap, cap - balance));
    const percentUsed = cap > 0 ? Math.max(0, Math.min(1, used / cap)) : 0;
    const ratioLeft = cap > 0 ? balance / cap : 1;
    const nearExhaustion = cap > 0 && ratioLeft < threshold;
    return { balance, cap, used, percentUsed, nearExhaustion };
  };

  return {
    hours: slot('hours'),
    builder_credits: slot('builder_credits'),
    chat_credits: slot('chat_credits'),
    tier: args.tier,
    topUpUrl: args.topUpUrl ?? '/billing/addons',
  };
}

/** Re-export for convenience to anybody mocking in tests. */
export { CREDIT_KINDS };
