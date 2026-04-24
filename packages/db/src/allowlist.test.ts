import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isAllowlistApproved, type AllowlistRow } from './schema/allowlist';

test('isAllowlistApproved returns true when row is approved', () => {
  const row: AllowlistRow = {
    email: 'a@b.com',
    approved: true,
    invitedByUserId: null,
    requestedByIp: null,
    note: null,
    createdAt: new Date(),
    approvedAt: new Date(),
  };
  assert.equal(isAllowlistApproved(row), true);
});

test('isAllowlistApproved returns false when row is unapproved', () => {
  const row: AllowlistRow = {
    email: 'a@b.com',
    approved: false,
    invitedByUserId: null,
    requestedByIp: null,
    note: null,
    createdAt: new Date(),
    approvedAt: null,
  };
  assert.equal(isAllowlistApproved(row), false);
});

test('isAllowlistApproved returns false when row is undefined', () => {
  assert.equal(isAllowlistApproved(undefined), false);
});

test('isAllowlistApproved returns false when row is null', () => {
  assert.equal(isAllowlistApproved(null), false);
});
