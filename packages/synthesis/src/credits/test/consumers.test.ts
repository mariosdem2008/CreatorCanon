import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  consumeBuilderCredit,
  consumeChatCredit,
  finalizeAuditHours,
  refundAuditHours,
  reserveAuditHours,
} from '../consumers';
import { grant } from '../ledger';
import { MemoryCreditLedger } from '../memory-store';
import { InsufficientCreditsError } from '../types';

const USER = 'usr_consumer_1';

describe('credits/consumers — audit (hours)', () => {
  test('reserveAuditHours passes when user has enough hours', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 12, source: 'tier:pro:p1' });
    await reserveAuditHours(store, { userId: USER, estimateHours: 5, runId: 'r_a' });
    // Pre-check does not debit.
    assert.equal(await store.getBalance(USER, 'hours'), 12);
  });

  test('reserveAuditHours throws 402-mappable error when short', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 2, source: 'tier:starter:p1' });
    await assert.rejects(
      () => reserveAuditHours(store, { userId: USER, estimateHours: 5, runId: 'r_b' }),
      InsufficientCreditsError,
    );
  });

  test('finalizeAuditHours debits exactly actualHours and is idempotent', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 12, source: 'tier:pro:p1' });

    const r1 = await finalizeAuditHours(store, { userId: USER, actualHours: 4, runId: 'r_c' });
    assert.equal(r1.inserted, true);
    assert.equal(r1.consumed, 4);
    assert.equal(r1.balance, 8);
    assert.equal(await store.getBalance(USER, 'hours'), 8);

    // Replay (e.g. retry after a transient post-success error): same result.
    const r2 = await finalizeAuditHours(store, { userId: USER, actualHours: 4, runId: 'r_c' });
    assert.equal(r2.inserted, false, 'replay should report dedupe');
    assert.equal(await store.getBalance(USER, 'hours'), 8);
  });

  test('finalizeAuditHours noop on zero', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 5, source: 'tier:starter:p1' });
    await finalizeAuditHours(store, { userId: USER, actualHours: 0, runId: 'r_d' });
    assert.equal(await store.getBalance(USER, 'hours'), 5);
  });

  test('refundAuditHours grants back hours idempotently', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'hours', amount: 5, source: 'tier:starter:p1' });
    await refundAuditHours(store, { userId: USER, refundHours: 2, runId: 'r_e' });
    assert.equal(await store.getBalance(USER, 'hours'), 7);
    // Replay = no-op.
    await refundAuditHours(store, { userId: USER, refundHours: 2, runId: 'r_e' });
    assert.equal(await store.getBalance(USER, 'hours'), 7);
  });
});

describe('credits/consumers — builder', () => {
  test('consumeBuilderCredit debits 1 by default', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'builder_credits', amount: 5, source: 'tier:pro:p1' });
    await consumeBuilderCredit(store, { userId: USER, callId: 'c_1' });
    assert.equal(await store.getBalance(USER, 'builder_credits'), 4);
  });

  test('consumeBuilderCredit honours custom amount', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'builder_credits', amount: 10, source: 'tier:pro:p1' });
    await consumeBuilderCredit(store, { userId: USER, callId: 'c_2', amount: 3 });
    assert.equal(await store.getBalance(USER, 'builder_credits'), 7);
  });

  test('consumeBuilderCredit replay is a no-op', async () => {
    const store = new MemoryCreditLedger();
    await grant(store, { userId: USER, kind: 'builder_credits', amount: 5, source: 'tier:pro:p1' });
    await consumeBuilderCredit(store, { userId: USER, callId: 'c_dup' });
    await consumeBuilderCredit(store, { userId: USER, callId: 'c_dup' });
    assert.equal(await store.getBalance(USER, 'builder_credits'), 4);
  });

  test('consumeBuilderCredit throws 402 when out of credits', async () => {
    const store = new MemoryCreditLedger();
    await assert.rejects(
      () => consumeBuilderCredit(store, { userId: USER, callId: 'c_3' }),
      InsufficientCreditsError,
    );
  });
});

describe('credits/consumers — chat', () => {
  test('consumeChatCredit charges the hub OWNER, not the visitor', async () => {
    const store = new MemoryCreditLedger();
    const owner = 'usr_owner';
    await grant(store, { userId: owner, kind: 'chat_credits', amount: 10, source: 'tier:pro:p1' });

    await consumeChatCredit(store, { hubOwnerUserId: owner, msgId: 'm_1' });
    assert.equal(await store.getBalance(owner, 'chat_credits'), 9);
  });

  test('consumeChatCredit replay is a no-op', async () => {
    const store = new MemoryCreditLedger();
    const owner = 'usr_owner_2';
    await grant(store, { userId: owner, kind: 'chat_credits', amount: 5, source: 'tier:pro:p1' });
    await consumeChatCredit(store, { hubOwnerUserId: owner, msgId: 'm_dup' });
    await consumeChatCredit(store, { hubOwnerUserId: owner, msgId: 'm_dup' });
    assert.equal(await store.getBalance(owner, 'chat_credits'), 4);
  });

  test('consumeChatCredit throws 402 when owner is exhausted', async () => {
    const store = new MemoryCreditLedger();
    await assert.rejects(
      () => consumeChatCredit(store, { hubOwnerUserId: 'usr_broke', msgId: 'm_x' }),
      InsufficientCreditsError,
    );
  });
});
