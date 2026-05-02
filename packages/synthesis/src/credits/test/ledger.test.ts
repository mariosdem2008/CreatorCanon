import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { grant, consume } from '../ledger';
import { MemoryCreditLedger } from '../memory-store';
import { InsufficientCreditsError } from '../types';

const USER = 'usr_test_1';

describe('credits/ledger', () => {
  test('grant on new user → balance equals amount', async () => {
    const store = new MemoryCreditLedger();
    const r = await grant(store, {
      userId: USER,
      kind: 'hours',
      amount: 12,
      source: 'tier:pro:2026-05',
      reference: 'sub_xyz',
    });
    assert.equal(r.inserted, true);
    assert.equal(r.balance, 12);
    assert.equal(await store.getBalance(USER, 'hours'), 12);
  });

  test('consume decrements balance', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 12, source: 'tier:pro:2026-05' });
    const r = await consume(store, {
      userId: USER,
      kind: 'hours',
      amount: 3,
      source: 'audit:run_abc',
      reference: 'run_abc',
    });
    assert.equal(r.inserted, true);
    assert.equal(r.balance, 9);
  });

  test('consume more than available → InsufficientCreditsError', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 2, source: 'tier:starter:2026-05' });
    await assert.rejects(
      () =>
        consume(store, {
          userId: USER,
          kind: 'hours',
          amount: 5,
          source: 'audit:run_too_big',
          reference: 'run_too_big',
        }),
      (err: unknown) => {
        assert.ok(err instanceof InsufficientCreditsError);
        assert.equal(err.kind, 'InsufficientCreditsError');
        assert.equal(err.creditKind, 'hours');
        assert.equal(err.required, 5);
        assert.equal(err.available, 2);
        return true;
      },
    );
    // Failed consume must NOT have written an event.
    assert.equal(await store.getBalance(USER, 'hours'), 2);
    assert.equal(store.listEvents(USER).length, 1); // grant only
  });

  test('idempotent: duplicate (source, reference) is deduped', async () => {
    const store = new MemoryCreditLedger();
    const a = await grant(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      source: 'addon:hours:c_1',
      reference: 'c_1',
    });
    const b = await grant(store, {
      userId: USER,
      kind: 'hours',
      amount: 5,
      source: 'addon:hours:c_1',
      reference: 'c_1',
    });
    assert.equal(a.inserted, true);
    assert.equal(a.balance, 5);
    assert.equal(b.inserted, false);
    assert.equal(b.balance, 5); // not 10!
    assert.equal(store.listEvents(USER).length, 1);
  });

  test('grants of different kinds are independent', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 10, source: 'tier:pro:p1' });
    await grant(store, { userId: USER, kind: 'builder_credits', amount: 500, source: 'tier:pro:p1:bc' });
    await grant(store, { userId: USER, kind: 'chat_credits', amount: 1000, source: 'tier:pro:p1:cc' });
    const all = await store.getAllBalances(USER);
    assert.deepEqual(all, { hours: 10, builder_credits: 500, chat_credits: 1000 });
  });

  test('rejects non-positive amounts', async () => {
    const store = new MemoryCreditLedger();
    await assert.rejects(
      () => grant(store, { userId: USER, kind: 'hours', amount: 0, source: 's' }),
      /positive integer/,
    );
    await assert.rejects(
      () => grant(store, { userId: USER, kind: 'hours', amount: -5, source: 's' }),
      /positive integer/,
    );
    await assert.rejects(
      () => consume(store, { userId: USER, kind: 'hours', amount: 0, source: 's' }),
      /positive integer/,
    );
  });

  test('mixed grant+consume sequence ends with correct balance regardless of ordering', async () => {
    // property-style: any permutation of these 4 mutations should land on +7.
    const ops: { kind: 'g' | 'c'; n: number; src: string }[] = [
      { kind: 'g', n: 10, src: 'g1' },
      { kind: 'g', n: 5, src: 'g2' },
      { kind: 'c', n: 4, src: 'c1' },
      { kind: 'c', n: 4, src: 'c2' },
    ];
    // try a few permutations
    const perms = [
      [0, 1, 2, 3],
      [1, 0, 3, 2],
      [0, 2, 1, 3],
      [1, 3, 0, 2],
    ];
    for (const perm of perms) {
      const store = new MemoryCreditLedger();
      for (const idx of perm) {
        const op = ops[idx];
        if (!op) throw new Error(`bad perm idx ${idx}`);
        if (op.kind === 'g') {
          await grant(store, { userId: USER, kind: 'hours', amount: op.n, source: op.src });
        } else {
          await consume(store, { userId: USER, kind: 'hours', amount: op.n, source: op.src });
        }
      }
      assert.equal(
        await store.getBalance(USER, 'hours'),
        7,
        `perm ${perm.join(',')} did not land on 7`,
      );
    }
  });
});
