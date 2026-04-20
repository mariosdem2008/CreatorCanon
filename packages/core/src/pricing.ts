export function estimateRunPriceCents(totalSeconds: number): number {
  const hours = totalSeconds / 3600;
  if (hours < 2) return 2_900;
  if (hours < 8) return 7_900;
  if (hours < 20) return 14_900;
  return 29_900;
}

export function formatUsdCents(priceCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}
