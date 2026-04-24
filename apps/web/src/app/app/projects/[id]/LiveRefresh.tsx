'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Polls the server component by calling router.refresh() on an interval.
 * Mount this only while the run's status is non-terminal
 * (queued / running) so terminal states stop polling forever.
 */
export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
