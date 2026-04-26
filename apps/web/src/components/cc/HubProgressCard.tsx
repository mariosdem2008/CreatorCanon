import { cn } from '@/lib/utils';

export type HubStage =
  | 'select_videos'
  | 'configure_hub'
  | 'generate'
  | 'review_pages'
  | 'publish';

const STAGES: Array<{ key: HubStage; label: string }> = [
  { key: 'select_videos', label: 'Select videos' },
  { key: 'configure_hub', label: 'Configure hub' },
  { key: 'generate', label: 'Generate' },
  { key: 'review_pages', label: 'Review pages' },
  { key: 'publish', label: 'Publish' },
];

export function HubProgressCard({
  current,
  doneStages,
  statusLabel,
}: {
  current: HubStage;
  doneStages?: HubStage[];
  statusLabel?: string;
}) {
  const currentIndex = STAGES.findIndex((s) => s.key === current);
  const doneSet = new Set(doneStages ?? []);
  const stepLabel = `Step ${currentIndex + 1} of ${STAGES.length}`;

  return (
    <section
      aria-label="Hub progress"
      className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] px-5 py-4 shadow-[var(--cc-shadow-1)]"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-[var(--cc-ink)]">Your hub progress</h2>
        <p className="text-[11px] uppercase tracking-[0.04em] text-[var(--cc-ink-4)]">
          {stepLabel}
          {statusLabel ? <span className="ml-1.5">· {statusLabel}</span> : null}
        </p>
      </div>
      <ol className="grid grid-cols-5 gap-2">
        {STAGES.map((stage, idx) => {
          const isCurrent = stage.key === current;
          const isDone = doneSet.has(stage.key) || idx < currentIndex;
          return (
            <li key={stage.key} className="relative flex flex-col items-center">
              {/* Connector line behind dots */}
              {idx < STAGES.length - 1 ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-3.5 left-1/2 right-[-50%] h-px -z-0',
                    isDone ? 'bg-[var(--cc-success)]' : 'bg-[var(--cc-rule)]',
                  )}
                />
              ) : null}
              <span
                aria-hidden
                className={cn(
                  'relative z-10 grid place-items-center size-7 rounded-[8px] border text-[11px] font-semibold tabular-nums',
                  isDone &&
                    'bg-[var(--cc-success)] border-[var(--cc-success)] text-white',
                  isCurrent &&
                    'bg-[var(--cc-accent)] border-[var(--cc-accent)] text-white',
                  !isDone &&
                    !isCurrent &&
                    'bg-[var(--cc-surface-2)] border-[var(--cc-rule)] text-[var(--cc-ink-4)]',
                )}
              >
                {isDone ? '✓' : idx + 1}
              </span>
              <span
                className={cn(
                  'mt-2 text-[11px] text-center',
                  isCurrent
                    ? 'font-semibold text-[var(--cc-ink)]'
                    : 'text-[var(--cc-ink-3)]',
                )}
              >
                {stage.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
