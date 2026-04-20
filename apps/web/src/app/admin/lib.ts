import { notFound, redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';

export async function requireAdminUser() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  if (!session.user.isAdmin) notFound();
  return session.user;
}

export function truncateJson(value: unknown, maxLen = 360): string {
  if (value == null) return 'None';

  const text = typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2);

  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 3)}...`;
}

export function formatDurationMs(durationMs: number | null): string {
  if (durationMs == null || durationMs <= 0) return 'None';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export function formatUsdCentsMaybe(value: number | null): string {
  if (value == null) return 'None';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value / 100);
}
