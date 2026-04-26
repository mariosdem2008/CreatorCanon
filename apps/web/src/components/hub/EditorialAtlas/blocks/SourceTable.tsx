// apps/web/src/components/hub/EditorialAtlas/blocks/SourceTable.tsx
'use client';

import { useMemo, useState } from 'react';
import type { SourceVideo } from '@/lib/hub/manifest/schema';
import { SourceRow } from './SourceRow';

type Props = { sources: SourceVideo[]; hubSlug: string };

const STATUS_OPTIONS = ['available', 'partial', 'unavailable'] as const;

export function SourceTable({ sources, hubSlug }: Props) {
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<typeof STATUS_OPTIONS[number][]>([]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources.filter((s) => {
      if (statuses.length > 0 && !statuses.includes(s.transcriptStatus)) return false;
      if (q && !`${s.title} ${s.channelName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sources, query, statuses]);

  return (
    <div className="rounded-[12px] border border-[#E5DECF] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E5DECF] px-4 py-3">
        <input
          type="search" placeholder="Search videos…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="h-8 flex-1 min-w-[200px] rounded-[8px] border border-[#E5DECF] px-3 text-[12px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:border-[#1A1612] focus:outline-none"
        />
        {STATUS_OPTIONS.map((s) => {
          const active = statuses.includes(s);
          return (
            <button key={s} type="button"
              onClick={() => setStatuses((cur) => active ? cur.filter((x) => x !== s) : [...cur, s])}
              className={
                'h-8 rounded-[8px] border px-3 text-[11px] font-medium capitalize ' +
                (active ? 'border-[#1A1612] bg-[#1A1612] text-[#F8F4EC]' : 'border-[#E5DECF] text-[#3D352A] hover:border-[#D6CFC0]')
              }
            >{s}</button>
          );
        })}
      </div>
      <div className="grid grid-cols-[80px_1fr_120px_100px] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">
        <span></span><span>Title</span><span>Transcript</span><span className="text-right">Published</span>
      </div>
      <div className="divide-y divide-[#E5DECF]">
        {visible.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-[#9A8E7C]">No sources match.</div>}
        {visible.map((s) => <SourceRow key={s.id} source={s} hubSlug={hubSlug} />)}
      </div>
    </div>
  );
}
