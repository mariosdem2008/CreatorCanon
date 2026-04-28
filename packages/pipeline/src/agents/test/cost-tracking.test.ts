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

  describe('cached input', () => {
    // NOTE on call convention: tokenCostCents follows the OpenAI API
    // shape — `inputTokens` is the TOTAL prompt token count (inclusive of
    // cached); `cachedInputTokens` is the cached subset. The function
    // bills (inputTokens - cachedInputTokens) at full rate and
    // cachedInputTokens at the provider's discount.

    it('gpt-5.5: 100% cached 1M input bills at half price', () => {
      // Total input 1M, all of it cached.
      const allCached = tokenCostCents('gpt-5.5', 1_000_000, 0, 1_000_000);
      const allFresh = tokenCostCents('gpt-5.5', 1_000_000, 0, 0);
      assert.equal(allFresh, 250);
      assert.equal(allCached, 125);
    });

    it('gpt-5.5: 50/50 split fresh + cached + output adds up correctly', () => {
      // Total input 1M (500K fresh + 500K cached), 100K output.
      const c = tokenCostCents('gpt-5.5', 1_000_000, 100_000, 500_000);
      // fresh: 500K * 250 / 1M = 125
      // cached: 500K * 250 * 0.5 / 1M = 62.5
      // output: 100K * 1000 / 1M = 100
      // total: 287.5
      assert.equal(c, 287.5);
    });

    it('gemini-2.5-flash: cached at 25% of fresh', () => {
      const allFresh = tokenCostCents('gemini-2.5-flash', 1_000_000, 0, 0);
      const allCached = tokenCostCents('gemini-2.5-flash', 1_000_000, 0, 1_000_000);
      assert.equal(allFresh, 7.5);
      assert.equal(allCached, 7.5 * 0.25);
    });

    it('cachedInputTokens defaults to 0 (backward-compatible 3-arg call)', () => {
      // Old callers that pass only 3 args should still work.
      const c = tokenCostCents('gpt-5.5', 1_000_000, 0);
      assert.equal(c, 250);
    });
  });
});
