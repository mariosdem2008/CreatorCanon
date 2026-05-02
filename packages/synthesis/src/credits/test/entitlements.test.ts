import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { getEntitlements } from '../entitlements';
import { grant, consume } from '../ledger';
import { MemoryCreditLedger } from '../memory-store';

const USER = 'usr_ent_1';

describe('credits/entitlements', () => {
  test('fresh pro user has full caps and zero used', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 12, source: 'tier:pro:p1' });
    await grant(store, { userId: USER, kind: 'builder_credits', amount: 500, source: 'tier:pro:p1:bc' });
    await grant(store, { userId: USER, kind: 'chat_credits', amount: 1000, source: 'tier:pro:p1:cc' });

    const e = await getEntitlements(store, { userId: USER, tier: 'pro' });
    assert.equal(e.hours.balance, 12);
    assert.equal(e.hours.cap, 12);
    assert.equal(e.hours.used, 0);
    assert.equal(e.hours.percentUsed, 0);
    assert.equal(e.hours.nearExhaustion, false);
    assert.equal(e.tier, 'pro');
    assert.equal(e.topUpUrl, '/billing/addons');
  });

  test('used + percentUsed reflect consumption', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 12, source: 'tier:pro:p1' });
    await consume(store, {
      userId: USER,
      kind: 'hours',
      amount: 8,
      source: 'audit:run_a',
      reference: 'a',
    });

    const e = await getEntitlements(store, { userId: USER, tier: 'pro' });
    assert.equal(e.hours.balance, 4);
    assert.equal(e.hours.cap, 12);
    assert.equal(e.hours.used, 8);
    assert.equal(Math.round(e.hours.percentUsed * 100) / 100, 0.67);
  });

  test('nearExhaustion flips at threshold', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 10, source: 'tier:pro:p1' });
    // Custom cap via tier (10 hours = exactly TIER_PRO_HOURS would be 12, here use starter cap of 3 → not what we want).
    // Easier: assert with default cap=12 (pro), balance=1 → ratioLeft = 1/12 ≈ 8% < 10% → nearExhaustion=true.
    await consume(store, {
      userId: USER,
      kind: 'hours',
      amount: 9,
      source: 'audit:run_b',
      reference: 'b',
    });
    // Balance now 1.
    const e = await getEntitlements(store, { userId: USER, tier: 'pro' });
    assert.equal(e.hours.balance, 1);
    assert.equal(e.hours.nearExhaustion, true);
  });

  test('nearExhaustion respects custom threshold', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'chat_credits', amount: 1000, source: 'tier:pro:p1:cc' });
    await consume(store, {
      userId: USER,
      kind: 'chat_credits',
      amount: 700,
      source: 'chat:bulk',
      reference: 'b1',
    });
    // Balance = 300, cap = 1000, ratio = 0.3.
    const lenient = await getEntitlements(store, {
      userId: USER,
      tier: 'pro',
      exhaustionThreshold: 0.5,
    });
    assert.equal(lenient.chat_credits.nearExhaustion, true);
    const strict = await getEntitlements(store, {
      userId: USER,
      tier: 'pro',
      exhaustionThreshold: 0.1,
    });
    assert.equal(strict.chat_credits.nearExhaustion, false);
  });

  test('topUpUrl is overridable', async () => {
    const store = new MemoryCreditLedger();
    const e = await getEntitlements(store, {
      userId: USER,
      tier: 'starter',
      topUpUrl: '/custom/topup',
    });
    assert.equal(e.topUpUrl, '/custom/topup');
  });

  test('over-cap balance (eg addon top-up) reports used = 0, not negative', async () => {
    const store = new MemoryCreditLedger();
    // Grant beyond pro cap (12) — represents tier 12 + addon 5.
    await grant(store, { userId: USER, kind: 'hours', amount: 17, source: 'mixed:pro+addon' });
    const e = await getEntitlements(store, { userId: USER, tier: 'pro' });
    assert.equal(e.hours.balance, 17);
    assert.equal(e.hours.used, 0);
    assert.equal(e.hours.percentUsed, 0);
    assert.equal(e.hours.nearExhaustion, false);
  });
});
