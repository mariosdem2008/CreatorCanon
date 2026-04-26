// apps/web/src/components/hub/EditorialAtlas/blocks/PageRow.tsx
import Link from 'next/link';

import type { Page } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { MetaTagPill } from './MetaTagPill';

type Props = {
  page: Page;
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
};

export function PageRow({ page, hubSlug, topicAccentBySlug = {} }: Props) {
  return (
    <Link
      href={getPageRoute(hubSlug, page.slug)}
      className="grid grid-cols-[1fr_120px_120px_80px_100px] items-center gap-4 px-4 py-3 text-[13px] hover:bg-[#FAF6EE]"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-[#1A1612]">{page.title}</p>
        <p className="truncate text-[11px] text-[#9A8E7C]">{page.summary}</p>
      </div>
      <MetaTagPill size="xs" accent={topicAccentBySlug[page.topicSlugs[0] ?? '']}>
        {page.type}
      </MetaTagPill>
      <span className="truncate text-[11px] text-[#6B5F50]">
        {page.topicSlugs.map((s) => s.replace(/-/g, ' ')).join(', ')}
      </span>
      <span className="text-right text-[11px] tabular-nums text-[#6B5F50]">{page.estimatedReadMinutes}m</span>
      <span className="text-right text-[11px] tabular-nums text-[#9A8E7C]">
        {new Date(page.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    </Link>
  );
}
