// apps/web/src/components/hub/EditorialAtlas/blocks/SourceRow.tsx
import Link from 'next/link';
import Image from 'next/image';

import type { SourceVideo } from '@/lib/hub/manifest/schema';
import { getSourceRoute } from '@/lib/hub/routes';

type Props = { source: SourceVideo; hubSlug: string };

export function SourceRow({ source, hubSlug }: Props) {
  return (
    <Link
      href={getSourceRoute(hubSlug, source.id)}
      className="grid grid-cols-[80px_1fr_120px_100px] items-center gap-4 px-4 py-3 hover:bg-[#FAF6EE]"
    >
      <div className="aspect-video overflow-hidden rounded-[6px] bg-[#F2EBDA]">
        <Image src={source.thumbnailUrl} alt="" width={80} height={45} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[#1A1612]">{source.title}</p>
        <p className="text-[11px] text-[#9A8E7C]">
          {source.channelName} · {source.durationSec != null ? `${Math.floor(source.durationSec / 60)} min` : '—'} · {source.citedPageIds.length} pages cite
        </p>
      </div>
      <span className="text-[11px] text-[#6B5F50]">
        {source.transcriptStatus === 'available' ? 'Transcript' : source.transcriptStatus === 'partial' ? 'Partial' : 'No transcript'}
      </span>
      <span className="text-right text-[11px] tabular-nums text-[#9A8E7C]">
        {new Date(source.publishedAt).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
      </span>
    </Link>
  );
}
