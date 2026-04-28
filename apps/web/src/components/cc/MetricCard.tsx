export function MetricCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'success' | 'warn' | 'danger';
}) {
  const subToneClass =
    tone === 'success'
      ? 'text-[var(--cc-success)]'
      : tone === 'warn'
        ? 'text-[var(--cc-warn)]'
        : tone === 'danger'
          ? 'text-[var(--cc-danger)]'
          : 'text-[var(--cc-ink-4)]';

  const valueIsString = typeof value === 'string';
  return (
    <div className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-4 py-3.5 shadow-[var(--cc-shadow-1)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
        {label}
      </p>
      <p
        className={`mt-2 font-semibold leading-none tracking-[-0.01em] text-[var(--cc-ink)] tabular-nums ${
          valueIsString && value.length > 4 ? 'text-[16px]' : 'text-[26px]'
        }`}
      >
        {value}
      </p>
      {sub ? <p className={`mt-1.5 text-[11px] ${subToneClass}`}>{sub}</p> : null}
    </div>
  );
}
