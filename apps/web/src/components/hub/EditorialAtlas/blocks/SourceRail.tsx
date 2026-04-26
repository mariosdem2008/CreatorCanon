// apps/web/src/components/hub/EditorialAtlas/blocks/SourceRail.tsx
import type { Citation, SourceVideo } from '@/lib/hub/manifest/schema';
import { citationUrl, formatTimestampLabel } from '@/lib/hub/manifest/empty-state';

type Props = { citations: Citation[]; sourcesById: Record<string, SourceVideo> };

export function SourceRail({ citations, sourcesById }: Props) {
  if (citations.length === 0) {
    return (
      <section className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Evidence &amp; sources</h2>
        <p className="mt-2 text-[12px] text-[#6B5F50]">No sources cited yet.</p>
      </section>
    );
  }
  return (
    <section className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Evidence &amp; sources</h2>
      <ol className="mt-3 space-y-3">
        {citations.map((c) => {
          const v = sourcesById[c.sourceVideoId];
          if (!v) return null;
          const url = citationUrl(c, v);
          return (
            <li key={c.id}>
              <a href={url} target="_blank" rel="noreferrer" className="block hover:bg-[#FAF6EE] -mx-2 px-2 py-1.5 rounded-[8px]">
                <p className="text-[12px] font-medium text-[#1A1612] line-clamp-2">{c.videoTitle}</p>
                <p className="mt-0.5 text-[11px] text-[#9A8E7C]">
                  Open at {c.timestampLabel || formatTimestampLabel(c.timestampStart)}
                </p>
                <p className="mt-1 text-[11px] italic leading-[1.5] text-[#6B5F50] line-clamp-2">{`“${c.excerpt}”`}</p>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
