export type SourceReferenceView = {
  videoId: string;
  youtubeVideoId: string;
  title: string | null;
  segmentId: string;
  startMs: number;
  endMs: number;
  quote: string;
  url: string | null;
};

type EvidenceVariant = 'paper' | 'midnight' | 'field';

const variantClasses: Record<EvidenceVariant, {
  empty: string;
  label: string;
  card: string;
  title: string;
  meta: string;
  quote: string;
  link: string;
}> = {
  paper: {
    empty: 'border-rule bg-paper text-ink-4',
    label: 'text-ink-4',
    card: 'border-rule bg-paper',
    title: 'text-ink',
    meta: 'text-ink-4',
    quote: 'text-ink-3',
    link: 'text-ink',
  },
  midnight: {
    empty: 'border-[#283241] bg-[#0b1118] text-[#94a39b]',
    label: 'text-[#94a39b]',
    card: 'border-[#283241] bg-[#0b1118]',
    title: 'text-[#eef5ef]',
    meta: 'text-[#d7ff70]',
    quote: 'text-[#b6c4bc]',
    link: 'text-[#d7ff70]',
  },
  field: {
    empty: 'border-[#cdbf9f] bg-[#fff8e7] text-[#76684f]',
    label: 'text-[#76684f]',
    card: 'border-[#cdbf9f] bg-[#fff8e7]',
    title: 'text-[#2f271b]',
    meta: 'text-[#8e5c2c]',
    quote: 'text-[#5f513d]',
    link: 'text-[#8e5c2c]',
  },
};

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function EvidenceChips({
  refs,
  variant = 'paper',
}: {
  refs?: SourceReferenceView[];
  variant?: EvidenceVariant;
}) {
  const classes = variantClasses[variant];

  if (!refs || refs.length === 0) {
    return (
      <div className={`mt-4 rounded-md border px-3 py-2 text-caption ${classes.empty}`}>
        Limited source support
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className={`text-caption uppercase tracking-widest ${classes.label}`}>
        Source evidence
      </div>
      <div className="grid gap-2">
        {refs.map((ref) => (
          <div
            key={ref.segmentId}
            className={`rounded-md border px-3 py-2 ${classes.card}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`text-caption font-medium ${classes.title}`}>
                {ref.title ?? 'Source video'}
              </span>
              <span className={`font-mono text-[11px] ${classes.meta}`}>
                {formatTime(ref.startMs)}-{formatTime(ref.endMs)}
              </span>
            </div>
            <p className={`mt-1 text-caption leading-5 ${classes.quote}`}>
              &quot;{ref.quote}&quot;
            </p>
            {ref.url && (
              <a
                href={ref.url}
                target="_blank"
                rel="noreferrer"
                className={`mt-2 inline-flex text-caption font-medium underline-offset-4 hover:underline ${classes.link}`}
              >
                Open source
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
