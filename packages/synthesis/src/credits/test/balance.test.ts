import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { getBalance } from '../balance';
import { grant } from '../ledger';
import { MemoryCreditLedger } from '../memory-store';

const USER = 'usr_test_balance';

describe('credits/balance', () => {
  test('new user → all 3 kinds = 0', async () => {
    const store = new MemoryCreditLedger();
    const all = await getBalance(store, USER);
    assert.deepEqual(all, { hours: 0, builder_credits: 0, chat_credits: 0 });
  });

  test('returns single kind when specified', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 5, source: 'tier:starter:p1' });
    const r = await getBalance(store, USER, 'hours');
    assert.deepEqual(r, { hours: 5 });
  });

  test('returns all 3 kinds with mix of granted + zero', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 12, source: 'tier:pro:p1' });
    await grant(store, { userId: USER, kind: 'chat_credits', amount: 1000, source: 'tier:pro:p1:cc' });
    const all = await getBalance(store, USER);
    assert.deepEqual(all, { hours: 12, builder_credits: 0, chat_credits: 1000 });
  });
});
