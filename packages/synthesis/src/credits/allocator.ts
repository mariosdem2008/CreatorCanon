/**
 * Phase N — Tier credit allocator.
 *
 * Phase E's Stripe webhook handler calls `allocateTierCredits(userId, tier,
 * periodStart)` whenever a billing period rolls over (subscription.created,
 * invoice.payment_succeeded). The allocator:
 *
 *   1. Computes the source slug `tier:${tier}:${periodStart.toISOString()}`.
 *   2. Reads the env-configured amount per kind for the tier.
 *   3. Calls `grant` once per kind with that source — idempotent on the
 *      source slug, so duplicate webhook deliveries are no-ops.
 *
 * **Reset semantics:** if `prevPeriodStart` is supplied, the allocator first
 * consumes the leftover tier-attributable balance via a synthetic
 * `tier_reset:${prevPeriodStart.toISOString()}` event, so the user starts the
 * new period at exactly the new tier's amounts (not tier + leftover).
 * Add-on credits live under a different source prefix and are NOT touched.
 *
 * The "tier-attributable balance" is computed by summing every event whose
 * source begins with `tier:` or `tier_reset:` for that user+kind. This is
 * O(events-per-user) but those numbers are tiny (≤ 12 per kind per year).
 *
 * `addAddonCredit` is the companion helper Phase E calls when a one-off
 * top-up is purchased — same idempotency story, source `addon:${kind}:${stripeChargeId}`.
 */

import { grant } from './ledger';
import type { CreditLedgerStore, CreditKind } from './types';

export type Tier = 'starter' | 'pro' | 'studio';

const ENV_KEYS: Record<Tier, Record<CreditKind, string>> = {
  starter: {
    hours: 'TIER_STARTER_HOURS',
    builder_credits: 'TIER_STARTER_BUILDER_CREDITS',
    chat_credits: 'TIER_STARTER_CHAT_CREDITS',
  },
  pro: {
    hours: 'TIER_PRO_HOURS',
    builder_credits: 'TIER_PRO_BUILDER_CREDITS',
    chat_credits: 'TIER_PRO_CHAT_CREDITS',
  },
  studio: {
    hours: 'TIER_STUDIO_HOURS',
    builder_credits: 'TIER_STUDIO_BUILDER_CREDITS',
    chat_credits: 'TIER_STUDIO_CHAT_CREDITS',
  },
};

/** Sensible fallbacks if env is unset (Phase E will set the real values). */
const DEFAULT_AMOUNTS: Record<Tier, Record<CreditKind, number>> = {
  starter: { hours: 3, builder_credits: 100, chat_credits: 250 },
  pro: { hours: 12, builder_credits: 500, chat_credits: 1000 },
  studio: { hours: 40, builder_credits: 2000, chat_credits: 5000 },
};

/**
 * Read the per-tier amount for one credit kind. Visible to tests and to
 * the Phase E webhook so it can show "Pro tier grants 12 hours" copy
 * without duplicating the table.
 */
export function tierAmount(tier: Tier, kind: CreditKind): number {
  const envKey = ENV_KEYS[tier][kind];
  const raw = process.env[envKey];
  if (raw !== undefined) {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return DEFAULT_AMOUNTS[tier][kind];
}

/**
 * Source slug used by the tier-period grant. Same period start → same
 * slug → idempotent webhook replay.
 */
export function tierSource(tier: Tier, periodStart: Date): string {
  return `tier:${tier}:${periodStart.toISOString()}`;
}

export function tierResetSource(periodStart: Date): string {
  return `tier_reset:${periodStart.toISOString()}`;
}

/**
 * Compute the leftover tier-attributable balance to be zeroed at rollover.
 *
 * Accounting model: **tier credits are spent before add-ons** (FIFO from
 * the cheaper bucket). So:
 *
 *   leftoverTier = max(0, sum(tier:* + tier_reset:* deltas) + sum(non-grant consume deltas))
 *                  capped at the user's current total balance.
 *
 * In other words: take everything tier put on the books, subtract every
 * consume (regardless of source), and clamp to [0, currentBalance]. This
 * means a user who consumed all their tier credits has leftover = 0 even
 * if they still have add-on balance, which preserves their add-on top-ups
 * across the rollover.
 *
 * Implementation note: production callers should use the Drizzle backend's
 * SQL aggregation; in-memory store walks its event list. We dispatch via
 * optional duck-typed methods so the public `CreditLedgerStore` contract
 * doesn't grow tier-specific surface that everyone has to implement.
 */
async function tierLeftoverToZero(
  store: CreditLedgerStore,
  userId: string,
  kind: CreditKind,
): Promise<number> {
  type WithTierLeftover = CreditLedgerStore & {
    tierLeftover?: (userId: string, kind: string) => Promise<number>;
  };
  const s = store as WithTierLeftover;
  if (typeof s.tierLeftover === 'function') {
    const leftover = await s.tierLeftover(userId, kind);
    const total = await store.getBalance(userId, kind);
    return Math.max(0, Math.min(total, leftover));
  }

  // Fallback: walk the in-memory event list.
  type WithEvents = CreditLedgerStore & {
    listEvents?: (userId?: string) => Array<{
      userId: string;
      kind: string;
      delta: number;
      source: string;
    }>;
  };
  const t = store as WithEvents;
  if (typeof t.listEvents !== 'function') {
    // No way to introspect — degrade to "don't reset" rather than wipe addons.
    return 0;
  }

  const events = t.listEvents(userId).filter((e) => e.kind === kind);
  let tierBucket = 0;
  for (const e of events) {
    if (e.source.startsWith('tier:') || e.source.startsWith('tier_reset:')) {
      // tier grants (+) and prior tier_resets (-).
      tierBucket += e.delta;
    } else if (e.delta < 0) {
      // Any consume burns tier first; only the surplus eats addons.
      tierBucket += e.delta;
    }
    // else: non-tier grants (addons) are ignored.
  }
  const total = await store.getBalance(userId, kind);
  return Math.max(0, Math.min(total, tierBucket));
}

export interface AllocateTierCreditsArgs {
  userId: string;
  tier: Tier;
  periodStart: Date;
  /** If supplied, the allocator zeros leftover tier credits from this prior period. */
  prevPeriodStart?: Date;
  /** Optional Stripe subscription id, stored as `reference` for traceability. */
  subscriptionId?: string;
}

/**
 * Allocate one period's tier credits to a user. Idempotent on
 * `(tierSource, subscriptionId ?? null)`. Should be called from Phase E's
 * Stripe webhook handler.
 */
export async function allocateTierCredits(
  store: CreditLedgerStore,
  args: AllocateTierCreditsArgs,
): Promise<void> {
  // 1. Reset prior tier balance if asked.
  if (args.prevPeriodStart) {
    const resetSource = tierResetSource(args.prevPeriodStart);
    for (const kind of ['hours', 'builder_credits', 'chat_credits'] as const) {
      const leftover = await tierLeftoverToZero(store, args.userId, kind);
      if (leftover > 0) {
        // Direct insertEvent with negative delta — bypasses `consume()` which
        // would re-check (and could throw if leftover briefly drifts > balance).
        await store.insertEvent({
          id: `${resetSource}:${kind}`,
          userId: args.userId,
          kind,
          delta: -leftover,
          source: resetSource,
          reference: kind,
        });
      }
    }
  }

  // 2. Grant the new period's amounts. Idempotent on
  // `(tierSource, kind + subscriptionId)` — kind goes into the reference so
  // each kind is its own dedupe slot under a single tier-period source.
  const source = tierSource(args.tier, args.periodStart);
  const subRef = args.subscriptionId ?? '';
  for (const kind of ['hours', 'builder_credits', 'chat_credits'] as const) {
    const amount = tierAmount(args.tier, kind);
    if (amount > 0) {
      await grant(store, {
        userId: args.userId,
        kind,
        amount,
        source,
        reference: subRef ? `${kind}:${subRef}` : kind,
      });
    }
  }
}

export interface AddAddonCreditArgs {
  userId: string;
  kind: CreditKind;
  amount: number;
  /** Stripe charge / payment-intent id used as the idempotency reference. */
  stripeChargeId: string;
}

/**
 * Phase-E hook — record an add-on top-up. Idempotent on the Stripe charge id,
 * so Stripe webhook retries land a single grant.
 */
export async function addAddonCredit(
  store: CreditLedgerStore,
  args: AddAddonCreditArgs,
): Promise<void> {
  await grant(store, {
    userId: args.userId,
    kind: args.kind,
    amount: args.amount,
    source: `addon:${args.kind}:${args.stripeChargeId}`,
    reference: args.stripeChargeId,
  });
}
