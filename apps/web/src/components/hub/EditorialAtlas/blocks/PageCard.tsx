// apps/web/src/components/hub/EditorialAtlas/blocks/PageCard.tsx
import Link from 'next/link';

import type { Page } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { MetaTagPill } from './MetaTagPill';

type Props = {
  page: Pick<Page, 'slug' | 'type' | 'title' | 'summary' | 'topicSlugs' | 'estimatedReadMinutes' | 'citationCount'>;
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
};

export function PageCard({ page, hubSlug, topicAccentBySlug = {} }: Props) {
  const primaryTopic = page.topicSlugs[0];
  return (
    <Link
      href={getPageRoute(hubSlug, page.slug)}
      className="group block rounded-[12px] border border-[#E5DECF] bg-white p-4 transition-all hover:-translate-y-px hover:border-[#D6CFC0] hover:shadow-[0_4px_16px_rgba(26,22,18,0.06)]"
    >
      <div className="flex items-center gap-2">
        <MetaTagPill size="xs" accent={primaryTopic ? topicAccentBySlug[primaryTopic] : undefined}>
          {page.type}
        </MetaTagPill>
        {primaryTopic && (
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#9A8E7C]">
            {primaryTopic.replace(/-/g, ' ')}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-[1.3] tracking-[-0.01em] text-[#1A1612] group-hover:text-[#1A1612]">
        {page.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.5] text-[#6B5F50]">{page.summary}</p>
      <div className="mt-4 flex items-center gap-3 text-[11px] text-[#9A8E7C]">
        <span>{page.estimatedReadMinutes} min read</span>
        <span aria-hidden>·</span>
        <span>{page.citationCount} citations</span>
      </div>
    </Link>
  );
}
