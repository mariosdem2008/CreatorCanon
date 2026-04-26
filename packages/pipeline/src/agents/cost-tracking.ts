/**
 * Per-1M-token prices in USD cents. Placeholders pinned at plan time (spec § 9.3).
 * UPDATE when actual pricing for GPT-5.5 / GPT-5.4 / Gemini 2.5 lands.
 *
 * Reading: `tokenCostCents(modelId, in, out)` returns USD cents (fractional).
 * Stored downstream as `numeric(12, 4)` on `archive_finding.cost_cents`.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  'gpt-5.5':           { in: 250,  out: 1000 },
  'gpt-5.4':           { in: 30,   out: 120 },
  'gemini-2.5-flash':  { in: 7.5,  out: 30 },
  'gemini-2.5-pro':    { in: 125,  out: 500 },
};

export function tokenCostCents(modelId: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[modelId];
  if (!p) {
    // Unknown model: charge nothing rather than crash. Logged elsewhere as a warning.
    return 0;
  }
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
}
