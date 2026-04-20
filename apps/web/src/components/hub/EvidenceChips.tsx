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

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function EvidenceChips({ refs }: { refs?: SourceReferenceView[] }) {
  if (!refs || refs.length === 0) {
    return (
      <div className="mt-4 rounded-md border border-rule bg-paper px-3 py-2 text-caption text-ink-4">
        Limited source support
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="text-caption uppercase tracking-widest text-ink-4">
        Source evidence
      </div>
      <div className="grid gap-2">
        {refs.map((ref) => (
          <div
            key={ref.segmentId}
            className="rounded-md border border-rule bg-paper px-3 py-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-caption font-medium text-ink">
                {ref.title ?? 'Source video'}
              </span>
              <span className="font-mono text-[11px] text-ink-4">
                {formatTime(ref.startMs)}-{formatTime(ref.endMs)}
              </span>
            </div>
            <p className="mt-1 text-caption leading-5 text-ink-3">
              “{ref.quote}”
            </p>
            {ref.url && (
              <a
                href={ref.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex text-caption font-medium text-ink underline-offset-4 hover:underline"
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
