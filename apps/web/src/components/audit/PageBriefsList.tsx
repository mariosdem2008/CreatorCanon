import type { CanonNodeView, PageBriefView } from '@/lib/audit/types';

const RENDERED_KEYS = new Set([
  'pageType',
  'pageTitle',
  'slug',
  'audienceQuestion',
  'openingHook',
  'primaryCanonNodeIds',
  'supportingCanonNodeIds',
]);

export function PageBriefsList({
  briefs,
  canonNodes,
}: {
  briefs: PageBriefView[];
  canonNodes: CanonNodeView[];
}) {
  if (briefs.length === 0) {
    return (
      <section className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        No pages proposed yet.
      </section>
    );
  }
  const titleById = new Map(canonNodes.map((n) => [n.id, n.title ?? '(Untitled)']));
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">
        Proposed hub pages ({briefs.length})
      </h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        When you click &ldquo;Generate Hub&rdquo;, we&rsquo;ll write each of these pages in your hub.
      </p>
      <ol className="mt-4 space-y-3">
        {briefs.map((b) => {
          const extras = Object.entries(b.payload).filter(([k, v]) => !RENDERED_KEYS.has(k) && v != null);
          return (
            <li
              key={b.id}
              className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-3"
            >
              <header className="flex flex-wrap items-baseline gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                  {b.pageType}
                </span>
                <span className="text-[11px] tabular-nums text-[var(--cc-ink-4)]">
                  #{b.position + 1}
                </span>
                {b.pageWorthinessScore != null ? (
                  <span className="rounded-[4px] bg-[var(--cc-accent)]/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--cc-accent)]">
                    pageWorthiness {b.pageWorthinessScore}
                  </span>
                ) : null}
              </header>
              <p className="mt-1 text-[14px] font-semibold text-[var(--cc-ink)]">{b.pageTitle}</p>
              {b.slug ? (
                <p className="mt-0.5 font-mono text-[10px] text-[var(--cc-ink-4)]">{b.slug}</p>
              ) : null}
              {b.audienceQuestion ? (
                <p className="mt-2 rounded-[6px] border border-[var(--cc-rule)]/60 bg-[var(--cc-surface)] px-2 py-1 text-[12px] italic text-[var(--cc-ink-3)]">
                  &ldquo;{b.audienceQuestion}&rdquo;
                </p>
              ) : null}
              {b.openingHook ? (
                <p className="mt-1.5 text-[12px] leading-[1.55] text-[var(--cc-ink-2)]">
                  <span className="font-semibold text-[var(--cc-ink)]">Opening hook:</span>{' '}
                  {b.openingHook}
                </p>
              ) : null}

              {b.primaryCanonNodeIds.length > 0 ? (
                <CanonRefList
                  label="Primary canon nodes"
                  ids={b.primaryCanonNodeIds}
                  titleById={titleById}
                />
              ) : null}
              {b.supportingCanonNodeIds.length > 0 ? (
                <CanonRefList
                  label="Supporting canon nodes"
                  ids={b.supportingCanonNodeIds}
                  titleById={titleById}
                />
              ) : null}

              {extras.length > 0 ? (
                <details className="mt-2 text-[11px] text-[var(--cc-ink-3)]">
                  <summary className="cursor-pointer text-[var(--cc-ink-4)]">
                    Other planning fields ({extras.length})
                  </summary>
                  <div className="mt-1 space-y-1.5">
                    {extras.map(([k, v]) => (
                      <ExtraField key={k} label={prettyKey(k)} value={v} />
                    ))}
                  </div>
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function CanonRefList({
  label,
  ids,
  titleById,
}: {
  label: string;
  ids: string[];
  titleById: Map<string, string>;
}) {
  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
        {label} ({ids.length})
      </p>
      <ul className="mt-1 space-y-0.5 text-[12px] text-[var(--cc-ink-2)]">
        {ids.map((id) => (
          <li key={id} className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] text-[var(--cc-ink-4)]">{id}</span>
            <span>{titleById.get(id) ?? '(unknown node)'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExtraField({ label, value }: { label: string; value: unknown }) {
  if (typeof value === 'string') {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cc-ink-4)]">
          {label}
        </p>
        <p className="text-[12px] leading-[1.5] text-[var(--cc-ink-2)]">{value}</p>
      </div>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cc-ink-4)]">
          {label} ({value.length})
        </p>
        <ul className="list-disc pl-5 text-[12px] text-[var(--cc-ink-2)]">
          {value.map((item, i) => (
            <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

function prettyKey(camel: string): string {
  const out = camel.replace(/([A-Z])/g, ' $1').toLowerCase();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
