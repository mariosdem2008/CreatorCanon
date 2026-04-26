import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Tag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md bg-[var(--cc-surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--cc-ink-3)]',
        className,
      )}
    >
      {children}
    </span>
  );
}
