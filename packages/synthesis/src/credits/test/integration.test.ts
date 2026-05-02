/**
 * Phase N — Full-month integration test.
 *
 * Per the plan:
 *   "simulate full month — Pro sub created → audit consumes 8h → addon
 *    purchase +5h → next period reset → balance correct"
 *
 * Also covers:
 *   - reconciler self-heal after artificially induced drift
 *   - InsufficientCreditsError → 402-shape payload
 *   - per-run credit_event ids (Phase N.11) appended only on real writes
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  consumeBuilderCredit,
  consumeChatCredit,
  finalizeAuditHours,
  getBalance,
  getEntitlements,
  InsufficientCreditsError,
  MemoryCreditLedger,
  onAddonPurchased,
  onSubscriptionPeriodStart,
  reconcile,
  reserveAuditHours,
} from '../index';

const USER = 'usr_int_full_month';

describe('credits — full-month integration', () => {
  test('pro sub → audit -8h → addon +5h → period rollover → 17h balance', async () => {
    const store = new MemoryCreditLedger();
    const periodA = new Date('2026-05-01T00:00:00Z');
    const periodB = new Date('2026-06-01T00:00:00Z');

    // Day 1 — sub starts.
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: periodA,
      subscriptionId: 'sub_int_1',
    });
    let balances = await getBalance(store, USER);
    assert.deepEqual(balances, { hours: 12, builder_credits: 500, chat_credits: 1000 });

    // Day 5 — audit run consumes 8 hours (estimate 8, actual 8).
    await reserveAuditHours(store, { userId: USER, estimateHours: 8, runId: 'run_audit_a' });
    // Run does its work...
    const r = await finalizeAuditHours(store, {
      userId: USER,
      actualHours: 8,
      runId: 'run_audit_a',
    });
    assert.equal(r.inserted, true);
    assert.equal(r.consumed, 8);
    assert.equal(await store.getBalance(USER, 'hours'), 4);

    // Day 20 — user buys addon +5 hours.
    await onAddonPurchased(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_addon_int_1',
    });
    assert.equal(await store.getBalance(USER, 'hours'), 9);

    // End-of-period — invoice.payment_succeeded fires for period B.
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: periodB,
      prevPeriodStart: periodA,
      subscriptionId: 'sub_int_1',
    });
    // Tier-only at end of A: 12 (grant) - 8 (consume eats tier first) = 4.
    // Reset zeros that 4. Addon 5 preserved. New tier grant +12 = 17.
    balances = await getBalance(store, USER);
    assert.deepEqual(balances, { hours: 17, builder_credits: 500, chat_credits: 1000 });
  });

  test('reconciler self-heals after balance drift', async () => {
    const store = new MemoryCreditLedger();
    const periodA = new Date('2026-05-01T00:00:00Z');
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: periodA,
      subscriptionId: 'sub_drift',
    });
    await finalizeAuditHours(store, { userId: USER, actualHours: 3, runId: 'run_drift' });
    assert.equal(await store.getBalance(USER, 'hours'), 9);

    // Simulate corruption.
    store.forceSetBalance(USER, 'hours', 999);

    const result = await reconcile(store, { staleThresholdMs: 0, autoHeal: true });
    assert.ok(result.drifted >= 1);
    assert.ok(result.healed >= 1);
    assert.equal(await store.getBalance(USER, 'hours'), 9);
  });

  test('InsufficientCreditsError surfaces 402-friendly fields', async () => {
    const store = new MemoryCreditLedger();
    // Empty ledger — no consumable credits.
    try {
      await consumeBuilderCredit(store, { userId: USER, callId: 'c_x' });
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err instanceof InsufficientCreditsError);
      assert.equal(err.creditKind, 'builder_credits');
      assert.equal(err.required, 1);
      assert.equal(err.available, 0);
      // Discriminator field for catch-blocks.
      assert.equal((err as InsufficientCreditsError).kind, 'InsufficientCreditsError');
    }
  });

  test('chat consumption charges hub OWNER, not visitor', async () => {
    const store = new MemoryCreditLedger();
    const owner = 'usr_owner_int';
    const visitor = 'usr_visitor_int';

    await onSubscriptionPeriodStart(store, {
      userId: owner,
      tier: 'starter',
      periodStart: new Date('2026-05-01T00:00:00Z'),
    });
    // visitor has no credits — irrelevant.
    await consumeChatCredit(store, { hubOwnerUserId: owner, msgId: 'm_int_1' });
    assert.equal(await store.getBalance(owner, 'chat_credits'), 249);
    assert.equal(await store.getBalance(visitor, 'chat_credits'), 0);
  });

  test('entitlements view-model end-to-end', async () => {
    const store = new MemoryCreditLedger();
    await onSubscriptionPeriodStart(store, {
      userId: USER,
      tier: 'pro',
      periodStart: new Date('2026-05-01T00:00:00Z'),
    });
    // Burn 11 of 12 hours.
    await finalizeAuditHours(store, { userId: USER, actualHours: 11, runId: 'run_burn' });

    const e = await getEntitlements(store, { userId: USER, tier: 'pro' });
    assert.equal(e.hours.balance, 1);
    assert.equal(e.hours.cap, 12);
    assert.equal(e.hours.used, 11);
    assert.equal(e.hours.nearExhaustion, true, 'should flip near-exhaustion at 1/12');
    assert.equal(e.builder_credits.nearExhaustion, false);
  });
});
