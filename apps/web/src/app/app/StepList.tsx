type StepItem = {
  title: string;
  detail: string;
  status?: 'current' | 'upcoming' | 'complete';
};

type StepListProps = {
  items: readonly StepItem[];
  compact?: boolean;
};

export function StepList({ items, compact = false }: StepListProps) {
  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {items.map((item, index) => {
        const isCurrent = item.status === 'current';
        const isComplete = item.status === 'complete';

        return (
          <div key={item.title} className="flex items-start gap-3">
            <span
              className={[
                'mt-0.5 flex shrink-0 items-center justify-center rounded-full border font-mono text-[10px]',
                compact ? 'h-6 w-6' : 'h-7 w-7',
                isComplete
                  ? 'border-ink bg-ink text-paper'
                  : isCurrent
                    ? 'border-amber/40 bg-amber-wash text-amber-ink'
                    : 'border-rule bg-paper-2 text-ink-4',
              ].join(' ')}
            >
              {isComplete ? 'OK' : index + 1}
            </span>
            <div className="min-w-0">
              <p className={`text-body-sm ${isCurrent || isComplete ? 'font-medium text-ink' : 'text-ink-3'}`}>
                {item.title}
              </p>
              <p className="mt-1 text-caption leading-5 text-ink-4">{item.detail}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
