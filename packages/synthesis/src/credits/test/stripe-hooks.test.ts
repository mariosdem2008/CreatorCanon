/**
 * Tests for the Stripe webhook hooks (Phase E integration shim).
 *
 * Phase E itself is NOT implemented in this package — these tests prove the
 * adapter functions delegate to the allocator correctly and remain idempotent
 * across replayed webhook deliveries.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { consume } from '../ledger';
import { MemoryCreditLedger } from '../memory-store';
import {
  onAddonPurchased,
  onSubscriptionPeriodStart,
} from '../stripe-hooks';

const USER = 'usr_stripe_1';
const PERIOD_A = new Date('2026-05-01T00:00:00Z');
const PERIOD_B = new Date('2026-06-01T00:00:00Z');

describe('credits/stripe-hooks', () => {
  test('onSubscriptionPeriodStart grants tier credits + idempotent on retry', async () => {
    const store = new MemoryCreditLedger();

    // Stripe delivers customer.subscription.created twice (network retry).
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_A,
      subscriptionId: 'sub_abc',
      stripeEventId: 'evt_111',
    });
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_A,
      subscriptionId: 'sub_abc',
      stripeEventId: 'evt_111_retry',
    });

    assert.deepEqual(await store.getAllBalances(USER), {
      hours: 12,
      builder_credits: 500,
      chat_credits: 1000,
    });
  });

  test('onAddonPurchased grants once per Stripe charge id', async () => {
    const store = new MemoryCreditLedger();
    await onAddonPurchased(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_addon_1',
    });
    // Retry (same charge id).
    await onAddonPurchased(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_addon_1',
    });
    assert.equal(await store.getBalance(USER, 'hours'), 5);
  });

  test('full month simulation: sub created → consume → addon → period reset', async () => {
    const store = new MemoryCreditLedger();

    // Day 1: pro sub starts.
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_A,
      subscriptionId: 'sub_abc',
    });
    assert.equal(await store.getBalance(USER, 'hours'), 12);

    // Day 5: audit consumes 8 hours.
    await consume(store, {
      userId: USER,
      kind: 'hours',
      amount: 8,
      source: 'audit:run_X',
      reference: 'run_X',
    });
    assert.equal(await store.getBalance(USER, 'hours'), 4);

    // Day 20: user buys addon +5 hours.
    await onAddonPurchased(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_topup',
    });
    assert.equal(await store.getBalance(USER, 'hours'), 9);

    // End of period A → period B starts. invoice.payment_succeeded fires.
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_B,
      prevPeriodStart: PERIOD_A,
      subscriptionId: 'sub_abc',
    });

    // Tier-only at end of A: 12 (grant) - 8 (consume eats tier first) = 4.
    // Reset zeros that 4. Addon 5 preserved. New tier grant +12 = 17.
    assert.equal(await store.getBalance(USER, 'hours'), 17);
  });
});
