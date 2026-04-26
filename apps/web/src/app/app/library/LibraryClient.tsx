'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import {
  ChannelHeaderCard,
  EmptyState,
  NoticeBanner,
  PageHeader,
  Panel,
  StatusPill,
  Tag,
} from '@/components/cc';
import { cn } from '@/lib/utils';

export interface ChannelRow {
  id: string;
  title: string | null;
  handle: string | null;
  subsCount: number | null;
  videoCount: number | null;
  avatarUrl: string | null;
  uploadsPlaylistId: string | null;
}

export interface VideoRow {
  id: string;
  youtubeVideoId: string;
  title: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  viewCount: number | null;
  thumbnailUrl: string | null;
  captionStatus: 'available' | 'auto_only' | 'none' | 'unknown';
  hasCanonicalTranscript: boolean;
  hasAudioAsset: boolean;
  categories: string[];
}

type DurationFilter = 'all' | 'short' | 'medium' | 'long';
type SourceFilter = 'all' | 'ready' | 'limited';

export default function LibraryClient({
  channel,
  videos,
}: {
  channel: ChannelRow;
  videos: VideoRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return videos.filter((video) => {
      if (query) {
        const q = query.toLowerCase();
        if (!video.title?.toLowerCase().includes(q)) return false;
      }
      const duration = video.durationSeconds ?? 0;
      if (durationFilter === 'short' && duration >= 600) return false;
      if (durationFilter === 'medium' && (duration < 600 || duration >= 1800)) return false;
      if (durationFilter === 'long' && duration < 1800) return false;

      const ready = isSourceReady(video);
      if (sourceFilter === 'ready' && !ready) return false;
      if (sourceFilter === 'limited' && ready) return false;

      return true;
    });
  }, [videos, query, durationFilter, sourceFilter]);

  const selectedVideos = useMemo(
    () => videos.filter((video) => selected.has(video.id)),
    [videos, selected],
  );
  const selectedSeconds = selectedVideos.reduce((acc, v) => acc + (v.durationSeconds ?? 0), 0);
  const readyCount = videos.filter(isSourceReady).length;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((video) => selected.has(video.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const video of filtered) next.delete(video.id);
      } else {
        for (const video of filtered) next.add(video.id);
      }
      return next;
    });
  }

  function buildHub() {
    if (selected.size === 0) return;
    router.push(`/app/configure?ids=${encodeURIComponent([...selected].join(','))}`);
  }

  function clearAll() {
    setQuery('');
    setDurationFilter('all');
    setSourceFilter('all');
  }

  if (videos.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Source library"
          title="Videos"
          body="Select source videos from your YouTube channel to build your knowledge hub."
        />
        <ChannelHeaderCard
          channel={{
            avatarUrl: channel.avatarUrl,
            name: channel.title ?? 'Connected channel',
            handle: channel.handle,
            videoCount: channel.videoCount ?? 0,
            subscriberCount: channel.subsCount ?? undefined,
            captionReadyCount: 0,
            isConnected: true,
            cta: null,
          }}
        />
        <EmptyState
          title="No videos synced yet"
          body="The channel is connected but the source inventory has not landed yet. Trigger a resync from settings or the command center."
          action={{ label: 'Back to command center', href: '/app' }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <PageHeader
        eyebrow="Source library"
        title="Videos"
        body="Select source videos from your YouTube channel to build your knowledge hub."
      />

      <ChannelHeaderCard
        channel={{
          avatarUrl: channel.avatarUrl,
          name: channel.title ?? 'Connected channel',
          handle: channel.handle,
          videoCount: channel.videoCount ?? videos.length,
          subscriberCount: channel.subsCount ?? undefined,
          captionReadyCount: readyCount,
          isConnected: true,
          cta: null,
        }}
      />

      {readyCount > 0 ? (
        <NoticeBanner
          tone="atlas"
          badge="Atlas"
          title={`${readyCount} candidate ${readyCount === 1 ? 'video' : 'videos'} found.`}
          body="Atlas suggests starting with caption-ready, high-engagement teaching videos. Filter by source quality to focus on those first."
        />
      ) : null}

      <Panel>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--cc-rule)] px-4 py-3">
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos..."
              className="h-9 w-full rounded-[8px] border border-[var(--cc-rule)] bg-white pl-9 pr-3 text-[13px] text-[var(--cc-ink)] placeholder:text-[var(--cc-ink-4)] focus:outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
            />
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[var(--cc-ink-4)]"
              aria-hidden
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="m13 13-2.5-2.5" strokeLinecap="round" />
            </svg>
          </div>
          <FilterChip
            label="Source"
            value={sourceFilter}
            options={[
              ['all', 'All'],
              ['ready', 'Ready'],
              ['limited', 'Limited'],
            ]}
            onChange={setSourceFilter}
          />
          <FilterChip
            label="Duration"
            value={durationFilter}
            options={[
              ['all', 'All'],
              ['short', '< 10m'],
              ['medium', '10–30m'],
              ['long', '> 30m'],
            ]}
            onChange={setDurationFilter}
          />
          {(query || durationFilter !== 'all' || sourceFilter !== 'all') ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
            >
              Clear
            </button>
          ) : null}
          <span className="ml-auto text-[12px] text-[var(--cc-ink-4)] tabular-nums">
            {filtered.length} of {videos.length}
          </span>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[14px] font-semibold text-[var(--cc-ink)]">
              No videos match these filters
            </p>
            <button
              type="button"
              onClick={clearAll}
              className="mt-2 text-[13px] font-semibold text-[var(--cc-accent)] hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead className="bg-[var(--cc-surface-2)]/60">
                <tr className="text-[11px] uppercase tracking-[0.08em] text-[var(--cc-ink-4)]">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleAllFiltered}
                      aria-label="Select all"
                      className="size-3.5 cursor-pointer accent-[var(--cc-accent)]"
                    />
                  </th>
                  <th className="px-2 py-2.5 font-semibold">Video</th>
                  <th className="px-2 py-2.5 font-semibold">Duration</th>
                  <th className="px-2 py-2.5 font-semibold">Views</th>
                  <th className="px-2 py-2.5 font-semibold">Source</th>
                  <th className="px-2 py-2.5 font-semibold">Topics</th>
                  <th className="px-2 py-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((video) => {
                  const isSelected = selected.has(video.id);
                  const ready = isSourceReady(video);
                  return (
                    <tr
                      key={video.id}
                      onClick={() => toggle(video.id)}
                      className={cn(
                        'cursor-pointer border-t border-[var(--cc-rule)] transition-colors',
                        isSelected
                          ? 'bg-[var(--cc-accent-wash)]/40'
                          : 'hover:bg-[var(--cc-surface-2)]/50',
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(video.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select video"
                          className="size-3.5 cursor-pointer accent-[var(--cc-accent)]"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-3 min-w-[260px]">
                          {video.thumbnailUrl ? (
                            <Image
                              src={video.thumbnailUrl}
                              alt=""
                              width={64}
                              height={36}
                              loading="lazy"
                              className="rounded-[6px] object-cover shrink-0 bg-[var(--cc-surface-2)]"
                            />
                          ) : (
                            <div className="size-9 w-16 rounded-[6px] bg-[var(--cc-surface-2)] shrink-0" />
                          )}
                          <span className="min-w-0 truncate font-medium text-[var(--cc-ink)]">
                            {video.title ?? 'Untitled video'}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-[var(--cc-ink-3)] tabular-nums">
                        {video.durationSeconds ? fmtDuration(video.durationSeconds) : '—'}
                      </td>
                      <td className="px-2 py-2.5 text-[var(--cc-ink-3)] tabular-nums">
                        {video.viewCount ? fmtNumber(video.viewCount) : '—'}
                      </td>
                      <td className="px-2 py-2.5">
                        <StatusPill tone={ready ? 'success' : 'warn'}>
                          {ready ? 'Ready' : sourceLabelFor(video)}
                        </StatusPill>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {(video.categories ?? []).slice(0, 2).map((cat) => (
                            <Tag key={cat}>{cat}</Tag>
                          ))}
                          {(video.categories ?? []).length > 2 ? (
                            <Tag>+{video.categories.length - 2}</Tag>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-[var(--cc-ink-3)] whitespace-nowrap">
                        {video.publishedAt ? fmtDate(video.publishedAt) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {selected.size > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--cc-rule)] bg-[var(--cc-surface)]/95 backdrop-blur lg:left-[232px]">
          <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-5">
              <p className="text-[14px] font-semibold text-[var(--cc-ink)]">
                <span className="tabular-nums">{selected.size}</span>{' '}
                {selected.size === 1 ? 'video' : 'videos'} selected
              </p>
              <span className="text-[12px] text-[var(--cc-ink-4)] tabular-nums">
                {fmtScope(selectedSeconds)} total · {selectedVideos.filter(isSourceReady).length} source-ready
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[12px] font-semibold text-[var(--cc-ink-3)] hover:border-[var(--cc-ink-4)] hover:text-[var(--cc-ink)]"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={buildHub}
                disabled={selected.size === 0}
                className="rounded-[8px] bg-[var(--cc-accent)] px-3.5 py-2 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] hover:bg-[var(--cc-accent-strong)]"
              >
                Configure hub →
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: Array<[V, string]>;
  onChange: (v: V) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--cc-rule)] bg-white px-2 py-1 text-[12px]">
      <span className="text-[var(--cc-ink-4)]">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className="bg-transparent font-medium text-[var(--cc-ink)] focus:outline-none"
      >
        {options.map(([key, lbl]) => (
          <option key={key} value={key}>
            {lbl}
          </option>
        ))}
      </select>
    </label>
  );
}

function isSourceReady(video: VideoRow): boolean {
  return video.hasCanonicalTranscript || video.captionStatus === 'available';
}

function sourceLabelFor(video: VideoRow): string {
  if (video.captionStatus === 'auto_only') return 'Auto only';
  if (video.captionStatus === 'none') return 'No captions';
  return 'Limited';
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtScope(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  return `${Math.max(1, Math.round(seconds / 60))}m`;
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}
