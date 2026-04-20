'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function RefreshButton() {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-body-sm text-amber-ink">
      <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
      Processing…
    </span>
  );
}
