import type { PageBriefView } from '@/lib/audit/types';

export function PageBriefsList({ briefs }: { briefs: PageBriefView[] }) {
  if (briefs.length === 0) {
    return (
      <section className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        No pages proposed yet.
      </section>
    );
  }
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">
        Proposed hub pages ({briefs.length})
      </h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        When you click &ldquo;Generate Hub&rdquo;, we&rsquo;ll write each of these pages in your hub.
      </p>
      <ol className="mt-4 space-y-2">
        {briefs.map((b) => (
          <li
            key={b.id}
            className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-3"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                {b.pageType}
              </span>
              <span className="text-[11px] tabular-nums text-[var(--cc-ink-4)]">
                #{b.position + 1}
              </span>
              <span className="text-[11px] text-[var(--cc-ink-4)]">
                &middot; anchored by {b.primaryCanonNodeIds.length} canon node
                {b.primaryCanonNodeIds.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="mt-1 text-[13px] font-semibold text-[var(--cc-ink)]">{b.pageTitle}</p>
            {b.audienceQuestion ? (
              <p className="mt-1 text-[11px] italic text-[var(--cc-ink-3)]">
                &ldquo;{b.audienceQuestion}&rdquo;
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
