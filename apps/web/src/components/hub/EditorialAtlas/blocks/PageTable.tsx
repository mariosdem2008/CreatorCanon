// apps/web/src/components/hub/EditorialAtlas/blocks/PageTable.tsx
'use client';

import { useMemo, useState } from 'react';

import type { Page } from '@/lib/hub/manifest/schema';
import { filterPages, sortPages, type PageFilters, type PageSort } from '@/lib/hub/manifest/pageFilters';

import { PageRow } from './PageRow';

type Props = {
  pages: Page[];
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
  initialQuery?: string;
  /** When false, hide the type-filter chips (used on Topic Detail). */
  showTypeFilter?: boolean;
  /** Restrict to a single topic; chips for other topics are hidden. */
  lockedTopicSlug?: string;
};

const TYPE_OPTIONS = ['lesson', 'framework', 'playbook'] as const;

export function PageTable({
  pages, hubSlug, topicAccentBySlug = {},
  initialQuery = '', showTypeFilter = true, lockedTopicSlug,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [types, setTypes] = useState<typeof TYPE_OPTIONS[number][]>([]);
  const [sort, setSort] = useState<PageSort>('newest');

  const visible = useMemo(() => {
    const filters: PageFilters = {
      query, types,
      topicSlugs: lockedTopicSlug ? [lockedTopicSlug] : [],
    };
    return sortPages(filterPages(pages, filters), sort);
  }, [pages, query, types, lockedTopicSlug, sort]);

  return (
    <div className="rounded-[12px] border border-[#E5DECF] bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E5DECF] px-4 py-3">
        <input
          type="search" placeholder="Search pages…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          className="h-8 flex-1 min-w-[200px] rounded-[8px] border border-[#E5DECF] px-3 text-[12px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:border-[#1A1612] focus:outline-none"
        />
        {showTypeFilter && (
          <div className="flex items-center gap-1">
            {TYPE_OPTIONS.map((t) => {
              const active = types.includes(t);
              return (
                <button key={t} type="button"
                  onClick={() => setTypes((cur) => active ? cur.filter((x) => x !== t) : [...cur, t])}
                  className={
                    'h-8 rounded-[8px] border px-3 text-[11px] font-medium capitalize ' +
                    (active
                      ? 'border-[#1A1612] bg-[#1A1612] text-[#F8F4EC]'
                      : 'border-[#E5DECF] text-[#3D352A] hover:border-[#D6CFC0]')
                  }
                >{t}</button>
              );
            })}
          </div>
        )}
        <select
          value={sort} onChange={(e) => setSort(e.target.value as PageSort)}
          className="h-8 rounded-[8px] border border-[#E5DECF] bg-white px-2 text-[11px] text-[#3D352A]"
        >
          <option value="newest">Newest</option>
          <option value="most-cited">Most cited</option>
          <option value="title">Title A→Z</option>
        </select>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_120px_120px_80px_100px] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">
        <span>Page</span><span>Type</span><span>Topics</span>
        <span className="text-right">Length</span><span className="text-right">Updated</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#E5DECF]">
        {visible.length === 0 && (
          <div className="px-4 py-8 text-center text-[12px] text-[#9A8E7C]">No pages match.</div>
        )}
        {visible.map((p) => (
          <PageRow key={p.id} page={p} hubSlug={hubSlug} topicAccentBySlug={topicAccentBySlug} />
        ))}
      </div>
    </div>
  );
}
