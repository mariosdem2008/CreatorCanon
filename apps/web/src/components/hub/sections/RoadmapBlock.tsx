export interface RoadmapBlockProps {
  title: string;
  steps: Array<{
    index: number;
    title: string;
    body: string;
    durationLabel?: string;
  }>;
}

/**
 * Numbered vertical timeline of actionable steps. Each step shows index +
 * title (bold) + body (prose) + optional duration label (e.g. "~30 min").
 */
export function RoadmapBlock({ title, steps }: RoadmapBlockProps) {
  return (
    <section className="my-6 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
      <ol className="mt-4 space-y-4">
        {steps.map((s) => (
          <li key={s.index} className="flex gap-3">
            <span className="flex-shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white text-xs font-semibold">
              {s.index}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                {s.durationLabel ? (
                  <span className="text-xs text-slate-500">· {s.durationLabel}</span>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
