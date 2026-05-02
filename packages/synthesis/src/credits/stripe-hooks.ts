/**
 * Phase N — Stripe webhook integration hooks.
 *
 * Phase E's webhook handler imports these helpers and calls them from
 * `customer.subscription.created` / `invoice.payment_succeeded` / addon
 * checkout-completion events. Keeping the hooks here means:
 *
 *   - All credit-side logic lives in one package.
 *   - Phase E only needs to translate Stripe payloads into our shapes.
 *   - Tests for the credit side don't need a Stripe client.
 *
 * These functions are thin wrappers around the allocator. They exist as a
 * named API surface so Phase E's call sites read clearly:
 *
 *   await onSubscriptionPeriodStart(store, { userId, tier, ... });
 *   await onAddonPurchased(store, { userId, kind, amount, ... });
 *
 * rather than `allocateTierCredits` / `addAddonCredit` (which are also
 * exported, for any caller who prefers the lower-level names).
 */

import {
  addAddonCredit,
  allocateTierCredits,
  type AddAddonCreditArgs,
  type AllocateTierCreditsArgs,
} from './allocator';
import type { CreditLedgerStore } from './types';

export interface OnSubscriptionPeriodStartArgs extends AllocateTierCreditsArgs {
  /** Optional Stripe event id — useful for log-correlation, not for idempotency. */
  stripeEventId?: string;
}

/**
 * Phase E webhook adapter: call from `customer.subscription.created` and
 * `invoice.payment_succeeded` once you've decoded the tier + period start.
 *
 * Idempotency is handled inside `allocateTierCredits` via the deterministic
 * `(tier, periodStart)` source slug.
 */
export async function onSubscriptionPeriodStart(
  store: CreditLedgerStore,
  args: OnSubscriptionPeriodStartArgs,
): Promise<void> {
  await allocateTierCredits(store, args);
}

export interface OnAddonPurchasedArgs extends AddAddonCreditArgs {
  /** Optional Stripe event id — log-only. */
  stripeEventId?: string;
}

/**
 * Phase E webhook adapter: call from a successful add-on checkout. The
 * idempotency key is the Stripe charge id (or payment-intent id) — the
 * caller is responsible for picking one stable identifier per top-up.
 */
export async function onAddonPurchased(
  store: CreditLedgerStore,
  args: OnAddonPurchasedArgs,
): Promise<void> {
  await addAddonCredit(store, args);
}
