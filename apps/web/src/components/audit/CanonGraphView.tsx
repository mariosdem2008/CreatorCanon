import type { CanonNodeView } from '@/lib/audit/types';

const STRING_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'definition', label: 'Definition' },
  { key: 'summary', label: 'Summary' },
  { key: 'whenToUse', label: 'When to use' },
  { key: 'whenNotToUse', label: 'When NOT to use' },
  { key: 'commonMistake', label: 'Common mistake' },
  { key: 'successSignal', label: 'Success signal' },
  { key: 'sequencingRationale', label: 'Sequencing rationale' },
];

const ARRAY_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'preconditions', label: 'Preconditions' },
  { key: 'steps', label: 'Steps' },
  { key: 'failureModes', label: 'Failure modes' },
  { key: 'examples', label: 'Examples' },
];

const RENDERED_KEYS = new Set([
  ...STRING_FIELDS.map((f) => f.key),
  ...ARRAY_FIELDS.map((f) => f.key),
  'title',
  'name',
  'term',
  'pageWorthinessScore',
  'confidenceScore',
  'specificityScore',
  'creatorUniquenessScore',
  'evidenceQuality',
  'origin',
  'visualMomentIds',
]);

const TYPE_ORDER = [
  'playbook',
  'framework',
  'lesson',
  'principle',
  'definition',
  'tactic',
  'pattern',
  'example',
  'aha_moment',
  'quote',
  'topic',
];

export function CanonGraphView({ nodes }: { nodes: CanonNodeView[] }) {
  if (nodes.length === 0) {
    return (
      <section className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        No canon nodes synthesized yet.
      </section>
    );
  }
  const groups = new Map<string, CanonNodeView[]>();
  for (const node of nodes) {
    const arr = groups.get(node.type) ?? [];
    arr.push(node);
    groups.set(node.type, arr);
  }
  const sortedTypes = TYPE_ORDER.filter((t) => groups.has(t)).concat(
    [...groups.keys()].filter((t) => !TYPE_ORDER.includes(t)),
  );
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">
        Knowledge graph ({nodes.length} nodes)
      </h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        Curated synthesis of the source material. Each node is a candidate for a hub page or a
        citation anchor.
      </p>
      <div className="mt-4 space-y-5">
        {sortedTypes.map((t) => {
          const arr = groups.get(t);
          if (!arr) return null;
          return (
            <div key={t}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                {t} ({arr.length})
              </p>
              <ul className="mt-2 space-y-2">
                {arr.map((n) => (
                  <CanonNodeCard key={n.id} node={n} />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CanonNodeCard({ node }: { node: CanonNodeView }) {
  const p = node.payload;
  const meta: Array<[string, string]> = [];
  if (node.pageWorthinessScore != null) meta.push(['pageWorthiness', String(node.pageWorthinessScore)]);
  if (node.confidenceScore != null) meta.push(['confidence', String(node.confidenceScore)]);
  if (node.specificityScore != null) meta.push(['specificity', String(node.specificityScore)]);
  if (node.creatorUniquenessScore != null) meta.push(['creatorUniq', String(node.creatorUniquenessScore)]);
  if (node.citationCount != null) meta.push(['citations', String(node.citationCount)]);
  if (node.sourceCoverage != null) meta.push(['sourceCoverage', String(node.sourceCoverage)]);
  if (node.evidenceQuality) meta.push(['evidence', node.evidenceQuality]);
  if (node.origin) meta.push(['origin', node.origin]);

  const extras = Object.entries(p).filter(([k, v]) => !RENDERED_KEYS.has(k) && v != null);

  return (
    <li className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-3 text-[13px]">
      <header className="flex flex-wrap items-baseline gap-2">
        <h4 className="text-[14px] font-semibold text-[var(--cc-ink)]">
          {node.title ?? '(Untitled)'}
        </h4>
        <span className="font-mono text-[10px] text-[var(--cc-ink-4)]">{node.id}</span>
      </header>
      {meta.length > 0 ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {meta.map(([k, v]) => (
            <span
              key={k}
              className="rounded-[4px] bg-[var(--cc-surface)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--cc-ink-3)]"
            >
              <span className="text-[var(--cc-ink-4)]">{k}:</span> {v}
            </span>
          ))}
        </div>
      ) : null}
      {node.sourceVideoTitles.length > 0 ? (
        <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
          Sources: {node.sourceVideoTitles.join(' · ')}
        </p>
      ) : null}

      <div className="mt-2 space-y-1.5">
        {STRING_FIELDS.map((f) => {
          const v = p[f.key];
          if (typeof v !== 'string' || v.trim().length === 0) return null;
          return (
            <p key={f.key} className="text-[12px] leading-[1.55] text-[var(--cc-ink-2)]">
              <span className="font-semibold text-[var(--cc-ink)]">{f.label}:</span> {v}
            </p>
          );
        })}
        {ARRAY_FIELDS.map((f) => {
          const v = p[f.key];
          if (!Array.isArray(v) || v.length === 0) return null;
          return (
            <div key={f.key}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
                {f.label} ({v.length})
              </p>
              <ul className="mt-0.5 list-decimal space-y-0.5 pl-5 text-[12px] leading-[1.55] text-[var(--cc-ink-2)]">
                {v.map((item, i) => (
                  <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {extras.length > 0 ? (
        <details className="mt-2 text-[11px] text-[var(--cc-ink-3)]">
          <summary className="cursor-pointer text-[var(--cc-ink-4)]">
            Other payload fields ({extras.length})
          </summary>
          <dl className="mt-1 space-y-1">
            {extras.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--cc-ink-4)]">
                  {prettyKey(k)}
                </dt>
                <dd className="text-[12px] text-[var(--cc-ink-2)]">{stringify(v)}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </li>
  );
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) return v.join(', ');
    return JSON.stringify(v);
  }
  return JSON.stringify(v);
}

function prettyKey(camel: string): string {
  const out = camel.replace(/([A-Z])/g, ' $1').toLowerCase();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
