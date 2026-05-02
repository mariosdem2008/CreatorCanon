import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { grant, consume } from '../ledger';
import { MemoryCreditLedger } from '../memory-store';
import { reconcile } from '../reconciler';
import type { DriftReport } from '../reconciler';

const USER_A = 'usr_recon_a';
const USER_B = 'usr_recon_b';

describe('credits/reconciler', () => {
  test('returns 0 drift on a clean ledger', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER_A, kind: 'hours', amount: 10, source: 'tier:pro:p1' });
    await consume(store, {
      userId: USER_A,
      kind: 'hours',
      amount: 3,
      source: 'audit:r1',
      reference: 'r1',
    });

    const result = await reconcile(store, { staleThresholdMs: 0 });
    assert.equal(result.scanned, 1);
    assert.equal(result.drifted, 0);
    assert.equal(result.healed, 0);
    assert.equal(await store.getBalance(USER_A, 'hours'), 7);
  });

  test('detects + self-heals balance drift', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER_A, kind: 'hours', amount: 10, source: 'tier:pro:p1' });
    await consume(store, {
      userId: USER_A,
      kind: 'hours',
      amount: 3,
      source: 'audit:r1',
      reference: 'r1',
    });

    // Simulate corruption: hand-tweak the materialized balance.
    store.forceSetBalance(USER_A, 'hours', 999);

    const reports: DriftReport[] = [];
    const result = await reconcile(store, {
      staleThresholdMs: 0,
      onDrift: (r) => {
        reports.push(r);
      },
    });

    assert.equal(result.drifted, 1);
    assert.equal(result.healed, 1);
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.expected, 7);
    assert.equal(reports[0]?.actual, 999);
    assert.equal(reports[0]?.drift, 992);

    // Self-healed.
    assert.equal(await store.getBalance(USER_A, 'hours'), 7);
  });

  test('autoHeal=false reports drift but does not write', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER_A, kind: 'hours', amount: 5, source: 'tier:starter:p1' });
    store.forceSetBalance(USER_A, 'hours', 1);

    const result = await reconcile(store, { staleThresholdMs: 0, autoHeal: false });
    assert.equal(result.drifted, 1);
    assert.equal(result.healed, 0);
    assert.equal(await store.getBalance(USER_A, 'hours'), 1); // untouched
  });

  test('skips (userId, kind) with events newer than staleThresholdMs', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER_A, kind: 'hours', amount: 5, source: 'tier:pro:p1' });
    store.forceSetBalance(USER_A, 'hours', 999);

    // Most recent event is now-ish; threshold of 1 hour means we should skip.
    const result = await reconcile(store, { staleThresholdMs: 60 * 60 * 1000 });
    assert.equal(result.scanned, 1);
    assert.equal(result.drifted, 0);
    assert.equal(result.healed, 0);
    assert.equal(await store.getBalance(USER_A, 'hours'), 999); // not healed (in-flight)
  });

  test('handles multiple users + kinds', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER_A, kind: 'hours', amount: 10, source: 'tier:pro:p1' });
    await grant(store, { userId: USER_A, kind: 'builder_credits', amount: 500, source: 'tier:pro:p1:bc' });
    await grant(store, { userId: USER_B, kind: 'hours', amount: 3, source: 'tier:starter:p1' });

    // Corrupt B's balance.
    store.forceSetBalance(USER_B, 'hours', 0);

    const result = await reconcile(store, { staleThresholdMs: 0 });
    assert.equal(result.scanned, 3); // 3 distinct (user, kind) combos
    assert.equal(result.drifted, 1);
    assert.equal(result.healed, 1);
    assert.equal(await store.getBalance(USER_B, 'hours'), 3);
  });
});
