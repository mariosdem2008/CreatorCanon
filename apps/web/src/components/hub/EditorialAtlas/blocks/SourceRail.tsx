// apps/web/src/components/hub/EditorialAtlas/blocks/SourceRail.tsx
import type { Citation, SourceVideo } from '@/lib/hub/manifest/schema';
import { formatTimestampLabel, safeCitationHref, safeSourceTitle } from '@/lib/hub/manifest/empty-state';

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
        {citations.map((c, index) => {
          const v = sourcesById[c.sourceVideoId];
          if (!v) return null;
          const href = safeCitationHref(c, v);
          const title = safeSourceTitle(v.title || c.videoTitle, index + 1);
          const body = (
            <>
              <p className="text-[12px] font-medium text-[#1A1612] line-clamp-2">{title}</p>
              <p className="mt-0.5 text-[11px] text-[#9A8E7C]">
                {href ? 'Open' : 'Source moment'} at {c.timestampLabel || formatTimestampLabel(c.timestampStart)}
              </p>
              <p className="mt-1 text-[11px] italic leading-[1.5] text-[#6B5F50] line-clamp-2">{`"${c.excerpt}"`}</p>
            </>
          );
          return (
            <li key={c.id}>
              {href ? (
                <a href={href} target="_blank" rel="noreferrer" className="-mx-2 block rounded-[8px] px-2 py-1.5 hover:bg-[#FAF6EE]">
                  {body}
                </a>
              ) : (
                <span className="-mx-2 block rounded-[8px] px-2 py-1.5">
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
