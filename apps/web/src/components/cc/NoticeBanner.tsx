import Link from 'next/link';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Tone = 'atlas' | 'info' | 'warn' | 'success';

const toneClasses: Record<Tone, { badge: string; label: string }> = {
  atlas: { badge: 'bg-[var(--cc-accent-wash)] text-[var(--cc-accent)]', label: 'ATLAS' },
  info: { badge: 'bg-[var(--cc-info-wash)] text-[var(--cc-info)]', label: 'INFO' },
  warn: { badge: 'bg-[var(--cc-warn-wash)] text-[var(--cc-warn)]', label: 'HEADS UP' },
  success: { badge: 'bg-[var(--cc-success-wash)] text-[var(--cc-success)]', label: 'DONE' },
};

export function NoticeBanner({
  tone = 'atlas',
  badge,
  title,
  body,
  action,
  className,
}: {
  tone?: Tone;
  badge?: string;
  title?: string;
  body: ReactNode;
  action?: { label: string; href: string };
  className?: string;
}) {
  const t = toneClasses[tone];
  return (
    <div
      role={tone === 'warn' ? 'alert' : undefined}
      className={cn(
        'flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-4 py-3 shadow-[var(--cc-shadow-1)]',
        className,
      )}
    >
      <span
        className={cn(
          'shrink-0 rounded-[6px] px-2 py-1 text-[11px] font-semibold tracking-[0.04em]',
          t.badge,
        )}
      >
        {(badge ?? t.label).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1 text-[13px] text-[var(--cc-ink-2)] leading-snug">
        {title ? (
          <strong className="text-[var(--cc-ink)] font-semibold">{title} </strong>
        ) : null}
        {body}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
        >
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}
