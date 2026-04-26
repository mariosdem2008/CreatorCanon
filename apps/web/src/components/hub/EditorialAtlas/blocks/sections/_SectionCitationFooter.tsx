// apps/web/src/components/hub/EditorialAtlas/blocks/sections/_SectionCitationFooter.tsx
import type { Citation } from '@/lib/hub/manifest/schema';

type Props = {
  citationIds?: string[];
  citationsById?: Record<string, Citation>;
};

export function SectionCitationFooter({ citationIds, citationsById }: Props) {
  if (!citationIds?.length || !citationsById) return null;
  const cited = citationIds.map((id) => citationsById[id]).filter(Boolean) as Citation[];
  if (cited.length === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-[#9A8E7C]">
      Supported by {cited.length} {cited.length === 1 ? 'source' : 'sources'} · {cited.map((c) => c.videoTitle).join(' · ')}
    </p>
  );
}
