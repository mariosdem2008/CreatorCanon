export interface HypotheticalExampleBlockProps {
  setup: string;
  stepsTaken: string[];
  outcome: string;
}

/**
 * "Try it" callout: a worked hypothetical scenario that shows the reader
 * how to apply the page's lesson concretely. Visually distinct from prose
 * so the reader knows this is illustrative rather than source-cited.
 */
export function HypotheticalExampleBlock({ setup, stepsTaken, outcome }: HypotheticalExampleBlockProps) {
  return (
    <aside className="my-6 rounded-lg border-l-4 border-amber-500 bg-amber-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Worked example</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-800">{setup}</p>
      <ol className="mt-3 list-decimal list-inside space-y-1 text-sm text-slate-800 marker:font-semibold">
        {stepsTaken.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-sm font-medium text-slate-900">
        <span className="text-amber-700">Outcome:</span> {outcome}
      </p>
    </aside>
  );
}
