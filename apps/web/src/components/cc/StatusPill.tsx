import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Tone = 'success' | 'warn' | 'danger' | 'info' | 'neutral' | 'accent';

const toneClasses: Record<Tone, string> = {
  success: 'bg-[var(--cc-success-wash)] text-[var(--cc-success)]',
  warn: 'bg-[var(--cc-warn-wash)] text-[var(--cc-warn)]',
  danger: 'bg-[var(--cc-danger-wash)] text-[var(--cc-danger)]',
  info: 'bg-[var(--cc-info-wash)] text-[var(--cc-info)]',
  neutral: 'bg-[var(--cc-surface-2)] text-[var(--cc-ink-3)]',
  accent: 'bg-[var(--cc-accent-wash)] text-[var(--cc-accent)]',
};

export function StatusPill({
  tone = 'neutral',
  children,
  withDot = true,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-[0.02em]',
        toneClasses[tone],
        className,
      )}
    >
      {withDot ? (
        <span aria-hidden className="size-1.5 rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}
