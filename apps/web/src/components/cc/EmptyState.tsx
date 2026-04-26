import Link from 'next/link';
import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="rounded-[12px] border border-dashed border-[var(--cc-rule)] bg-[var(--cc-surface)] px-6 py-10 text-center">
      {icon ? (
        <div className="mx-auto mb-3 grid size-9 place-items-center rounded-[8px] bg-[var(--cc-surface-2)] text-[16px]">
          {icon}
        </div>
      ) : null}
      <p className="text-[14px] font-semibold text-[var(--cc-ink)]">{title}</p>
      {body ? (
        <p className="mx-auto mt-1.5 max-w-[420px] text-[12px] leading-[1.55] text-[var(--cc-ink-4)]">
          {body}
        </p>
      ) : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
        >
          {action.label} →
        </Link>
      ) : null}
    </div>
  );
}
