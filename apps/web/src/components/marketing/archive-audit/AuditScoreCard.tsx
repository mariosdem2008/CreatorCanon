import { cn } from '@/lib/utils';

interface AuditScoreCardProps {
  label: string;
  score: number;
  description: string;
}

export function AuditScoreCard({ label, score, description }: AuditScoreCardProps) {
  return (
    <div className="border border-rule bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-caption uppercase text-ink-4">{label}</div>
          <p className="mt-2 text-body-sm leading-relaxed text-ink-3">{description}</p>
        </div>
        <div className={cn('font-mono text-heading-lg tabular-nums', scoreClass(score))}>
          {score}
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-2">
        <div
          className={cn('h-full rounded-full', barClass(score))}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function scoreClass(score: number): string {
  if (score >= 75) return 'text-sage';
  if (score >= 50) return 'text-amber-ink';
  return 'text-rose';
}

function barClass(score: number): string {
  if (score >= 75) return 'bg-sage';
  if (score >= 50) return 'bg-amber';
  return 'bg-rose';
}
