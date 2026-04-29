import type { CanonNodeView } from '@/lib/audit/types';

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
  const order = [
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
  const sortedTypes = order
    .filter((t) => groups.has(t))
    .concat([...groups.keys()].filter((t) => !order.includes(t)));
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">
        Knowledge graph ({nodes.length} nodes)
      </h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        Curated synthesis of the source material. Each node is a candidate for a hub page or a
        citation anchor.
      </p>
      <div className="mt-4 space-y-4">
        {sortedTypes.map((t) => {
          const arr = groups.get(t);
          if (!arr) return null;
          return (
            <div key={t}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                {t} ({arr.length})
              </p>
              <ul className="mt-2 space-y-1.5">
                {arr.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-2 text-[13px]"
                  >
                    <p className="font-medium text-[var(--cc-ink)]">{n.title ?? '(Untitled)'}</p>
                    {n.whenToUse ? (
                      <p className="mt-0.5 text-[11px] text-[var(--cc-ink-3)]">
                        When to use: {n.whenToUse}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
