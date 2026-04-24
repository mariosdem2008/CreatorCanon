/**
 * Private-alpha pricing: a single flat price per generated hub.
 *
 * The previous tiered implementation (`estimateRunPriceCents` returning
 * 2900/7900/14900/29900 based on total video duration) is retained as a
 * backwards-compatible alias returning the flat price so legacy callers
 * (configure/actions.ts, checkout/actions.ts) continue to compile. New
 * callers should use `getFlatPriceCents`.
 *
 * Tiered pricing will be reintroduced only after 10+ real payments.
 */
export const FLAT_PRICE_CENTS = 2900;

export function getFlatPriceCents(_totalSeconds: number): number {
  return FLAT_PRICE_CENTS;
}

/**
 * @deprecated Use `getFlatPriceCents`. Tiered pricing is cut during private alpha.
 */
export function estimateRunPriceCents(totalSeconds: number): number {
  return getFlatPriceCents(totalSeconds);
}

export function formatUsdCents(priceCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}
