import type { VideoIntelligenceCardView } from '@/lib/audit/types';

const SECTIONS: Array<{ key: string; label: string }> = [
  { key: 'mainIdeas', label: 'Main ideas' },
  { key: 'frameworks', label: 'Frameworks' },
  { key: 'lessons', label: 'Lessons' },
  { key: 'examples', label: 'Examples' },
  { key: 'stories', label: 'Stories' },
  { key: 'mistakesToAvoid', label: 'Mistakes to avoid' },
  { key: 'failureModes', label: 'Failure modes' },
  { key: 'counterCases', label: 'Counter cases' },
  { key: 'quotes', label: 'Quotes' },
  { key: 'strongClaims', label: 'Strong claims' },
  { key: 'contrarianTakes', label: 'Contrarian takes' },
  { key: 'termsDefined', label: 'Terms defined' },
  { key: 'toolsMentioned', label: 'Tools mentioned' },
  { key: 'creatorVoiceNotes', label: 'Creator voice notes' },
  { key: 'recommendedHubUses', label: 'Recommended hub uses' },
];

const KNOWN_KEYS = new Set(SECTIONS.map((s) => s.key));

export function VideoIntelligenceCardList({ cards }: { cards: VideoIntelligenceCardView[] }) {
  if (cards.length === 0) {
    return (
      <section className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        No video intelligence extracted yet.
      </section>
    );
  }
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">
        Per-video intelligence ({cards.length})
      </h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        Everything our extractor pulled from each source video. Open a section to see the full
        captured items.
      </p>
      <div className="mt-4 space-y-4">
        {cards.map((c) => {
          const totals = SECTIONS.map((s) => ({
            ...s,
            count: arrLen(c.payload[s.key]),
          })).filter((s) => s.count > 0);
          const extras = Object.keys(c.payload).filter((k) => !KNOWN_KEYS.has(k));
          return (
            <article
              key={c.videoId}
              className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-3"
            >
              <header className="flex flex-wrap items-baseline gap-2">
                <h3 className="truncate text-[13px] font-semibold text-[var(--cc-ink)]">
                  {c.videoTitle}
                </h3>
                <span className="text-[11px] text-[var(--cc-ink-4)]">
                  {c.evidenceSegmentCount} segment{c.evidenceSegmentCount === 1 ? '' : 's'} cited
                </span>
              </header>
              {totals.length === 0 ? (
                <p className="mt-2 text-[11px] italic text-[var(--cc-ink-4)]">
                  Card present but empty.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {totals.map((s) => (
                    <VicSection
                      key={s.key}
                      label={s.label}
                      count={s.count}
                      items={c.payload[s.key] as unknown[]}
                    />
                  ))}
                </div>
              )}
              {extras.length > 0 ? (
                <details className="mt-2 text-[11px] text-[var(--cc-ink-3)]">
                  <summary className="cursor-pointer text-[var(--cc-ink-4)]">
                    Other captured fields ({extras.length})
                  </summary>
                  <ul className="mt-1 space-y-0.5 text-[11px]">
                    {extras.map((k) => (
                      <li key={k}>
                        <span className="font-mono text-[10px] text-[var(--cc-ink-4)]">{k}</span>:{' '}
                        <span className="text-[var(--cc-ink-2)]">
                          {summariseValue(c.payload[k])}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function VicSection({ label, count, items }: { label: string; count: number; items: unknown[] }) {
  return (
    <details className="rounded-[8px] border border-[var(--cc-rule)]/60 bg-[var(--cc-surface)]">
      <summary className="cursor-pointer rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--cc-ink)] hover:bg-[var(--cc-surface-2)]/60">
        {label}{' '}
        <span className="ml-1 text-[11px] font-normal tabular-nums text-[var(--cc-ink-4)]">
          ({count})
        </span>
      </summary>
      <ul className="space-y-1.5 px-2.5 pb-2 pt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-2)]">
        {items.map((item, i) => (
          <li key={i} className="border-l-2 border-[var(--cc-rule)] pl-2">
            <ItemRender item={item} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function ItemRender({ item }: { item: unknown }) {
  if (typeof item === 'string') return <>{item}</>;
  if (item && typeof item === 'object') {
    const o = item as Record<string, unknown>;
    // Mistakes-to-avoid shape: { mistake, why, correction }
    const mistake = stringOrNull(o.mistake);
    if (mistake) {
      return (
        <div className="space-y-0.5">
          <p>
            <span className="font-semibold text-[var(--cc-ink)]">Mistake:</span> {mistake}
          </p>
          {stringOrNull(o.why) ? (
            <p className="text-[var(--cc-ink-3)]">
              <span className="italic">Why:</span> {String(o.why)}
            </p>
          ) : null}
          {stringOrNull(o.correction) ? (
            <p className="text-[var(--cc-ink-3)]">
              <span className="italic">Correction:</span> {String(o.correction)}
            </p>
          ) : null}
        </div>
      );
    }
    // Generic object with a primary text field
    const primary =
      stringOrNull(o.text) ?? stringOrNull(o.body) ?? stringOrNull(o.title) ?? stringOrNull(o.name);
    if (primary) {
      const rest = Object.entries(o).filter(
        ([k, v]) =>
          !['text', 'body', 'title', 'name'].includes(k) &&
          v != null &&
          (typeof v === 'string' ? v.trim().length > 0 : true),
      );
      return (
        <div>
          <p>{primary}</p>
          {rest.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5 text-[11px] text-[var(--cc-ink-3)]">
              {rest.map(([k, v]) => (
                <li key={k}>
                  <span className="italic">{prettyKey(k)}:</span>{' '}
                  {typeof v === 'string'
                    ? v
                    : Array.isArray(v)
                      ? v.filter((x) => typeof x === 'string').join(', ')
                      : JSON.stringify(v)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    }
    return <code className="font-mono text-[11px]">{JSON.stringify(item)}</code>;
  }
  return <code className="font-mono text-[11px]">{JSON.stringify(item)}</code>;
}

function arrLen(v: unknown): number {
  return Array.isArray(v) ? v.length : 0;
}

function stringOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function summariseValue(v: unknown): string {
  if (typeof v === 'string') return v.length > 80 ? `${v.slice(0, 80)}…` : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `${v.length} items`;
  if (v && typeof v === 'object') return `${Object.keys(v).length} keys`;
  return JSON.stringify(v);
}

function prettyKey(camel: string): string {
  const out = camel.replace(/([A-Z])/g, ' $1').toLowerCase();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
