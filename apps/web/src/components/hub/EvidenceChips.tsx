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
    empty: 'border-rule bg-paper-2 text-ink-4',
    label: 'text-ink-4',
    card: 'border-rule bg-paper shadow-[0_1px_0_rgba(36,28,21,0.05)]',
    title: 'text-ink',
    meta: 'text-ink-4',
    quote: 'text-ink-3',
    link: 'text-ink',
  },
  midnight: {
    empty: 'border-[#283241] bg-[#0b1118] text-[#94a39b]',
    label: 'text-[#94a39b]',
    card: 'border-[#283241] bg-[#0b1118] shadow-[0_0_28px_rgba(215,255,112,0.04)]',
    title: 'text-[#eef5ef]',
    meta: 'text-[#d7ff70]',
    quote: 'text-[#b6c4bc]',
    link: 'text-[#d7ff70]',
  },
  field: {
    empty: 'border-[#cdbf9f] bg-[#f8ebcc] text-[#76684f]',
    label: 'text-[#76684f]',
    card: 'border-[#cdbf9f] bg-[#fff8e7] shadow-[0_10px_24px_rgba(86,62,32,0.06)]',
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
      <div className={`mt-4 rounded-xl border px-4 py-3 text-caption leading-5 ${classes.empty}`}>
        <span className="block font-medium uppercase tracking-widest">Evidence</span>
        <span className="mt-1 block">Limited source support for this section.</span>
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
            className={`rounded-xl border px-4 py-3 ${classes.card}`}
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className={`min-w-0 text-caption font-medium ${classes.title}`}>
                {ref.title ?? 'Source video'}
              </span>
              <span className={`shrink-0 rounded-full border border-current/20 px-2 py-0.5 font-mono text-[11px] ${classes.meta}`}>
                {formatTime(ref.startMs)}-{formatTime(ref.endMs)}
              </span>
            </div>
            <p className={`mt-2 break-words text-caption leading-5 ${classes.quote}`}>
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
