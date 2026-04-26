import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] shadow-[var(--cc-shadow-1)]',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title,
  meta,
}: {
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--cc-rule)] px-4 py-3.5">
      <h2 className="text-[14px] font-semibold text-[var(--cc-ink)]">{title}</h2>
      {meta ? <div className="text-[11px] text-[var(--cc-ink-4)]">{meta}</div> : null}
    </div>
  );
}
