import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FLAT_PRICE_CENTS, getFlatPriceCents, formatUsdCents, estimateRunPriceCents } from './pricing';

test('FLAT_PRICE_CENTS is 2900', () => {
  assert.equal(FLAT_PRICE_CENTS, 2900);
});

test('getFlatPriceCents ignores duration', () => {
  assert.equal(getFlatPriceCents(0), 2900);
  assert.equal(getFlatPriceCents(3600), 2900);
  assert.equal(getFlatPriceCents(36000), 2900);
});

test('estimateRunPriceCents is a backwards-compat alias returning flat price', () => {
  assert.equal(estimateRunPriceCents(0), 2900);
  assert.equal(estimateRunPriceCents(72000), 2900);
});

test('formatUsdCents renders 2900 as $29', () => {
  assert.equal(formatUsdCents(2900), '$29');
});
