// apps/web/src/components/hub/EditorialAtlas/blocks/CitationBlock.tsx
import type { Citation, SourceVideo } from '@/lib/hub/manifest/schema';
import { citationUrl, formatTimestampLabel } from '@/lib/hub/manifest/empty-state';

type Props = {
  citation: Citation;
  source: SourceVideo;
  variant?: 'inline' | 'card';
};

export function CitationBlock({ citation, source, variant = 'card' }: Props) {
  const url = citationUrl(citation, source);
  const label = citation.timestampLabel || formatTimestampLabel(citation.timestampStart);

  if (variant === 'inline') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-[#1A1612] underline underline-offset-2 hover:no-underline">
        {citation.videoTitle} · {label}
      </a>
    );
  }
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      className="block rounded-[10px] border border-[#E5DECF] bg-white p-3 transition-colors hover:border-[#D6CFC0] hover:bg-[#FAF6EE]"
    >
      <p className="text-[12px] font-semibold text-[#1A1612] line-clamp-2">{citation.videoTitle}</p>
      <p className="mt-1 text-[11px] text-[#9A8E7C]">Watch at {label}</p>
      <p className="mt-2 text-[12px] italic leading-[1.5] text-[#3D352A] line-clamp-3">{`“${citation.excerpt}”`}</p>
    </a>
  );
}
