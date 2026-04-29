import type { VideoIntelligenceCardView } from '@/lib/audit/types';

export function VideoIntelligenceCardList({ cards }: { cards: VideoIntelligenceCardView[] }) {
  if (cards.length === 0) {
    return (
      <section className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        No video intelligence extracted yet.
      </section>
    );
  }
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">
        Per-video intelligence ({cards.length})
      </h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        Counts of structured ideas extracted from each source video.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <div
            key={c.videoId}
            className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-3"
          >
            <p className="truncate text-[13px] font-semibold text-[var(--cc-ink)]">{c.videoTitle}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              <Stat label="Main ideas" value={c.mainIdeaCount} />
              <Stat label="Frameworks" value={c.frameworkCount} />
              <Stat label="Lessons" value={c.lessonCount} />
              <Stat label="Examples" value={c.exampleCount} />
              <Stat label="Mistakes" value={c.mistakeCount} />
              <Stat label="Quotes" value={c.quoteCount} />
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[var(--cc-ink-4)]">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums text-[var(--cc-ink)]">{value}</dd>
    </div>
  );
}
