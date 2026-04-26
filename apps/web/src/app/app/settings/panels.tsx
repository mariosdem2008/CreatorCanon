import type { ReactNode } from 'react';

export function SettingsPanel({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] shadow-[var(--cc-shadow-1)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--cc-rule)] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold text-[var(--cc-ink)]">{title}</h2>
          {description ? (
            <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">{description}</p>
          ) : null}
        </div>
        {meta ? <div className="text-[11px] text-[var(--cc-ink-4)]">{meta}</div> : null}
      </div>
      <div className="divide-y divide-[var(--cc-rule)]">{children}</div>
    </section>
  );
}

export function SettingsRow({
  label,
  value,
  mono,
  hint,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
      <div className="min-w-0">
        <span className="text-[13px] text-[var(--cc-ink-3)]">{label}</span>
        {hint ? <p className="mt-0.5 text-[11px] text-[var(--cc-ink-4)]">{hint}</p> : null}
      </div>
      <span
        className={`min-w-0 max-w-[60%] truncate text-right text-[13px] font-semibold text-[var(--cc-ink)] ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function SettingsNote({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'pending';
  children: ReactNode;
}) {
  const map: Record<typeof tone, string> = {
    info: 'bg-[var(--cc-surface-2)]/60 text-[var(--cc-ink-3)]',
    warning: 'bg-[var(--cc-warn-wash)] text-[var(--cc-warn)]',
    pending: 'bg-[var(--cc-surface-2)]/60 text-[var(--cc-ink-4)]',
  };
  return (
    <div className={`border-t border-[var(--cc-rule)] px-5 py-3.5 text-[12px] leading-[1.6] ${map[tone]}`}>
      {children}
    </div>
  );
}
