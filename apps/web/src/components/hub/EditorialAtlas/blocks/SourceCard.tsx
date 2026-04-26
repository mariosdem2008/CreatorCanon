// apps/web/src/components/hub/EditorialAtlas/blocks/SourceCard.tsx
import Link from 'next/link';
import Image from 'next/image';

import type { SourceVideo } from '@/lib/hub/manifest/schema';
import { getSourceRoute } from '@/lib/hub/routes';
import { MetaTagPill } from './MetaTagPill';

type Props = { source: SourceVideo; hubSlug: string };

export function SourceCard({ source, hubSlug }: Props) {
  return (
    <Link
      href={getSourceRoute(hubSlug, source.id)}
      className="group block rounded-[12px] border border-[#E5DECF] bg-white p-3 transition-all hover:border-[#D6CFC0]"
    >
      <div className="aspect-video overflow-hidden rounded-[8px] bg-[#F2EBDA]">
        <Image src={source.thumbnailUrl} alt="" width={320} height={180} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <h3 className="mt-3 text-[13px] font-medium leading-[1.35] text-[#1A1612] line-clamp-2">{source.title}</h3>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-[#9A8E7C]">
        <span>{Math.floor(source.durationSec / 60)} min</span>
        <span aria-hidden>·</span>
        <MetaTagPill size="xs" accent={source.transcriptStatus === 'available' ? 'sage' : source.transcriptStatus === 'partial' ? 'amber' : 'slate'}>
          {source.transcriptStatus === 'available' ? 'Transcript' : source.transcriptStatus === 'partial' ? 'Partial' : 'No transcript'}
        </MetaTagPill>
      </div>
    </Link>
  );
}
