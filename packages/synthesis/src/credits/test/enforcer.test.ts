import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { requireCredits, runWithCredits } from '../enforcer';
import { grant } from '../ledger';
import { MemoryCreditLedger } from '../memory-store';
import { InsufficientCreditsError } from '../types';

const USER = 'usr_enf_1';

describe('credits/enforcer', () => {
  test('requireCredits passes when balance >= amount', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 5, source: 'tier:pro:p1' });
    await requireCredits(store, USER, 'hours', 3);
    await requireCredits(store, USER, 'hours', 5); // exact match ok
  });

  test('requireCredits throws InsufficientCreditsError when short', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 2, source: 'tier:starter:p1' });
    await assert.rejects(
      () => requireCredits(store, USER, 'hours', 5),
      (err: unknown) => {
        assert.ok(err instanceof InsufficientCreditsError);
        assert.equal(err.creditKind, 'hours');
        assert.equal(err.required, 5);
        assert.equal(err.available, 2);
        return true;
      },
    );
  });

  test('requireCredits throws on zero / negative amount', async () => {
    const store = new MemoryCreditLedger();
    await assert.rejects(
      () => requireCredits(store, USER, 'hours', 0),
      /positive integer/,
    );
    await assert.rejects(
      () => requireCredits(store, USER, 'hours', -1),
      /positive integer/,
    );
  });

  test('runWithCredits: success path consumes exactly `actual`', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 10, source: 'tier:pro:p1' });

    const out = await runWithCredits({
      store,
      userId: USER,
      kind: 'hours',
      estimate: 3,
      fn: async () => ({ actualHours: 4 }),
      source: 'audit:run_xxx',
      reference: 'run_xxx',
      computeActual: (r) => r.actualHours,
    });

    assert.deepEqual(out.result, { actualHours: 4 });
    assert.equal(out.consumed, 4);
    assert.equal(await store.getBalance(USER, 'hours'), 6);
  });

  test('runWithCredits: failed work writes no consume event', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 10, source: 'tier:pro:p1' });

    await assert.rejects(
      () =>
        runWithCredits({
          store,
          userId: USER,
          kind: 'hours',
          estimate: 3,
          fn: async () => {
            throw new Error('codec exploded');
          },
          source: 'audit:run_yyy',
          reference: 'run_yyy',
        }),
      /codec exploded/,
    );

    // Balance unchanged; no consume event.
    assert.equal(await store.getBalance(USER, 'hours'), 10);
    assert.equal(store.listEvents(USER).length, 1); // grant only
  });

  test('runWithCredits: pre-check fails before fn runs', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 1, source: 'tier:starter:p1' });

    let fnCalled = false;
    await assert.rejects(
      () =>
        runWithCredits({
          store,
          userId: USER,
          kind: 'hours',
          estimate: 5,
          fn: async () => {
            fnCalled = true;
            return null;
          },
          source: 'audit:run_zzz',
        }),
      InsufficientCreditsError,
    );
    assert.equal(fnCalled, false, 'work should not run when pre-check fails');
  });

  test('runWithCredits: zero actual is no-op (no consume event)', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'builder_credits', amount: 5, source: 'tier:pro:p1' });

    const out = await runWithCredits({
      store,
      userId: USER,
      kind: 'builder_credits',
      estimate: 1,
      fn: async () => ({ skipped: true }),
      source: 'builder:call_a',
      reference: 'call_a',
      computeActual: () => 0,
    });

    assert.equal(out.consumed, 0);
    assert.equal(await store.getBalance(USER, 'builder_credits'), 5);
  });
});
