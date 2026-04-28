import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  body,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-ink-4)]">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="mt-1 text-[28px] font-semibold leading-[1.15] tracking-[0] text-[var(--cc-ink)]">
          {title}
        </h1>
        {body ? (
          <p className="mt-2 max-w-[640px] text-[13px] leading-[1.55] text-[var(--cc-ink-3)]">
            {body}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
