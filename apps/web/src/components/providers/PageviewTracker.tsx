'use client';

import { usePostHog } from 'posthog-js/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

export function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const posthog = usePostHog();

  useEffect(() => {
    if (!posthog) return;
    const url = window.location.origin + pathname + (searchParams.toString() ? `?${searchParams}` : '');
    posthog.capture('$pageview', { $current_url: url });
  }, [pathname, searchParams, posthog]);

  return null;
}
