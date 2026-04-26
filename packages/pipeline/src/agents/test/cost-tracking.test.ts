import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenCostCents } from '../cost-tracking';

describe('tokenCostCents', () => {
  it('returns 0 for unknown model (no crash)', () => {
    assert.equal(tokenCostCents('unknown-model-xyz', 1000, 500), 0);
  });

  it('charges per-1M-token rates for gpt-5.5', () => {
    const cost = tokenCostCents('gpt-5.5', 1_000_000, 1_000_000);
    // Per spec/cost-tracking placeholder: gpt-5.5 = 250¢ in + 1000¢ out = 1250¢
    assert.equal(cost, 1250);
  });

  it('scales linearly with token count', () => {
    const oneM = tokenCostCents('gpt-5.4', 1_000_000, 0);
    const tenK = tokenCostCents('gpt-5.4', 10_000, 0);
    // 10k = 1% of 1M, so cost should be 1% of the 1M cost.
    assert.ok(Math.abs(tenK - oneM / 100) < 0.000001);
  });
});
