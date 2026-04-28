/**
 * Per-1M-token prices in USD cents. Placeholders pinned at plan time (spec § 9.3).
 * UPDATE when actual pricing for GPT-5.5 / GPT-5.4 / Gemini 2.5 lands.
 *
 * Reading: tokenCostCents(modelId, in, out, cachedIn?) returns USD cents (fractional).
 * cachedInputTokens (when > 0) are billed at the provider's discounted rate:
 *   - OpenAI: 50% of fresh input
 *   - Gemini: 25% of fresh input
 *
 * Stored downstream as `numeric(12, 4)` on `archive_finding.cost_cents`.
 */

interface ProviderPricing {
  in: number;
  out: number;
  /** Fraction of `in` charged for cached tokens. OpenAI=0.5, Gemini=0.25. */
  cachedInputDiscount: number;
}

const PRICES: Record<string, ProviderPricing> = {
  'gpt-5.5':           { in: 250,  out: 1000, cachedInputDiscount: 0.5  },
  'gpt-5.4':           { in: 30,   out: 120,  cachedInputDiscount: 0.5  },
  'gemini-2.5-flash':  { in: 7.5,  out: 30,   cachedInputDiscount: 0.25 },
  'gemini-2.5-pro':    { in: 125,  out: 500,  cachedInputDiscount: 0.25 },
};

/**
 * Compute the cost of a single provider call. cachedInputTokens (if > 0) are
 * billed at the discounted rate; the remaining (inputTokens - cachedInputTokens)
 * are billed at full rate. Pass cachedInputTokens=0 (or omit) for non-cached calls.
 */
export function tokenCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const p = PRICES[modelId];
  if (!p) {
    // Unknown model: charge nothing rather than crash. Logged elsewhere as a warning.
    return 0;
  }
  // OpenAI's API returns prompt_tokens INCLUSIVE of cached_tokens — i.e.
  // inputTokens is the total, cachedInputTokens is the cached subset.
  // Bill (inputTokens - cachedInputTokens) at full rate, cachedInputTokens at discount.
  const freshInput = Math.max(0, inputTokens - cachedInputTokens);
  return (
    (freshInput / 1_000_000) * p.in +
    (cachedInputTokens / 1_000_000) * p.in * p.cachedInputDiscount +
    (outputTokens / 1_000_000) * p.out
  );
}
