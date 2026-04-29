import type { VisualMomentView } from '@/lib/audit/types';

function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VisualMomentsList({ moments }: { moments: VisualMomentView[] }) {
  if (moments.length === 0) {
    return (
      <section className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        No visual moments extracted (videos lacked usable on-screen content, or were transcript-only).
      </section>
    );
  }
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">
        Visual moments ({moments.length})
      </h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        On-screen demos, dashboards, charts, and code samples we&rsquo;ll cite alongside transcript evidence.
      </p>
      <ul className="mt-4 space-y-2.5">
        {moments.map((m) => (
          <li
            key={m.id}
            className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-3"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-3)]">
                {m.type}
              </span>
              <span className="text-[11px] tabular-nums text-[var(--cc-ink-4)]">
                {formatTs(m.timestampMs)}
              </span>
              <span className="ml-auto truncate text-[11px] text-[var(--cc-ink-4)]">
                {m.videoTitle}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-[1.55] text-[var(--cc-ink-2)]">{m.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
