import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import {
  addAddonCredit,
  allocateTierCredits,
  tierAmount,
  tierSource,
  tierResetSource,
} from '../allocator';
import { MemoryCreditLedger } from '../memory-store';

const USER = 'usr_alloc_1';
const PERIOD_A = new Date('2026-05-01T00:00:00Z');
const PERIOD_B = new Date('2026-06-01T00:00:00Z');

describe('credits/allocator', () => {
  let savedEnv: Record<string, string | undefined>;
  beforeEach(() => {
    savedEnv = {
      TIER_STARTER_HOURS: process.env.TIER_STARTER_HOURS,
      TIER_PRO_HOURS: process.env.TIER_PRO_HOURS,
      TIER_PRO_BUILDER_CREDITS: process.env.TIER_PRO_BUILDER_CREDITS,
      TIER_PRO_CHAT_CREDITS: process.env.TIER_PRO_CHAT_CREDITS,
    };
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test('tierAmount uses env when set, defaults otherwise', () => {
    delete process.env.TIER_PRO_HOURS;
    assert.equal(tierAmount('pro', 'hours'), 12); // default
    process.env.TIER_PRO_HOURS = '20';
    assert.equal(tierAmount('pro', 'hours'), 20);
    process.env.TIER_PRO_HOURS = 'not-a-number';
    assert.equal(tierAmount('pro', 'hours'), 12); // falls back
  });

  test('source slug includes tier + iso period', () => {
    assert.equal(tierSource('pro', PERIOD_A), 'tier:pro:2026-05-01T00:00:00.000Z');
    assert.equal(
      tierResetSource(PERIOD_A),
      'tier_reset:2026-05-01T00:00:00.000Z',
    );
  });

  test('allocateTierCredits writes one grant per kind', async () => {
    const store = new MemoryCreditLedger();
    await allocateTierCredits(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_A,
      subscriptionId: 'sub_xyz',
    });
    const all = await store.getAllBalances(USER);
    assert.deepEqual(all, { hours: 12, builder_credits: 500, chat_credits: 1000 });
    assert.equal(store.listEvents(USER).length, 3);
  });

  test('idempotent on duplicate webhook delivery (same period + sub)', async () => {
    const store = new MemoryCreditLedger();
    const args = {
      userId: USER,
      tier: 'pro' as const,
      periodStart: PERIOD_A,
      subscriptionId: 'sub_xyz',
    };
    await allocateTierCredits(store, args);
    await allocateTierCredits(store, args);
    await allocateTierCredits(store, args);
    const all = await store.getAllBalances(USER);
    // Same balance — duplicate calls are no-ops.
    assert.deepEqual(all, { hours: 12, builder_credits: 500, chat_credits: 1000 });
    assert.equal(store.listEvents(USER).length, 3);
  });

  test('period rollover resets tier credits but keeps addons', async () => {
    const store = new MemoryCreditLedger();

    // Period A: pro tier grant + addon top-up + small consume.
    await allocateTierCredits(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_A,
      subscriptionId: 'sub_xyz',
    });
    await addAddonCredit(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_1',
    });
    // After this: hours = 12 (tier) + 5 (addon) = 17.
    assert.equal(await store.getBalance(USER, 'hours'), 17);

    // Period B rolls over.
    await allocateTierCredits(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_B,
      prevPeriodStart: PERIOD_A,
      subscriptionId: 'sub_xyz',
    });

    // After rollover: tier_reset zeros the 12 leftover tier-hours, then new
    // tier grant adds 12. Addon's 5 is preserved → balance = 5 + 12 = 17.
    // (Same number, but reached differently — the reset is observable in events.)
    assert.equal(await store.getBalance(USER, 'hours'), 17);

    // Builder + chat: previously 500/1000, no addons, no consumption.
    // After reset → new period: 500/1000 again.
    assert.equal(await store.getBalance(USER, 'builder_credits'), 500);
    assert.equal(await store.getBalance(USER, 'chat_credits'), 1000);

    // Verify there's a tier_reset event in the log.
    const resetEvents = store.listEvents(USER).filter((e) =>
      e.source.startsWith('tier_reset:'),
    );
    assert.equal(resetEvents.length, 3); // one per kind
  });

  test('rollover reset preserves addon-only balance when tier consumption was full', async () => {
    const store = new MemoryCreditLedger();
    // Period A: starter (3 hours), then user consumes all 3 + buys addon.
    await allocateTierCredits(store, {
      userId: USER,
      tier: 'starter',
      periodStart: PERIOD_A,
    });
    // Consume all 3 hours.
    await store.insertEvent({
      id: 'ev_consume',
      userId: USER,
      kind: 'hours',
      delta: -3,
      source: 'audit:run_a',
      reference: 'run_a',
    });
    await addAddonCredit(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_addon',
    });
    assert.equal(await store.getBalance(USER, 'hours'), 5);

    // Roll over to period B, upgrading to pro.
    await allocateTierCredits(store, {
      userId: USER,
      tier: 'pro',
      periodStart: PERIOD_B,
      prevPeriodStart: PERIOD_A,
    });

    // Tier-attributable from A: 3 (grant) - 3 (consume) = 0, no reset needed.
    // New pro tier: +12. Addon: +5 still. → 17.
    assert.equal(await store.getBalance(USER, 'hours'), 17);
  });

  test('addAddonCredit is idempotent on stripeChargeId', async () => {
    const store = new MemoryCreditLedger();
    await addAddonCredit(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_dup',
    });
    await addAddonCredit(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      stripeChargeId: 'ch_dup',
    });
    assert.equal(await store.getBalance(USER, 'hours'), 5);
  });
});
