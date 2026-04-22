'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

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
type ViewMode = 'list' | 'grid';

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function estimatePrice(totalSeconds: number): string {
  const hrs = totalSeconds / 3600;
  if (hrs < 2) return '$29';
  if (hrs < 8) return '$79';
  if (hrs < 20) return '$149';
  return '$299';
}

function CaptionChip({
  status,
  hasCanonicalTranscript,
  hasAudioAsset,
}: {
  status: VideoRow['captionStatus'];
  hasCanonicalTranscript: boolean;
  hasAudioAsset: boolean;
}) {
  if (hasCanonicalTranscript || status === 'available') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sage/10 px-2 py-0.5 text-[10px] font-medium text-sage">
        Source ready
      </span>
    );
  }
  if (status === 'auto_only') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-medium text-amber-ink">
        Auto captions
      </span>
    );
  }
  if (hasAudioAsset) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-medium text-amber-ink">
        Needs transcription
      </span>
    );
  }
  if (status === 'none') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-medium text-ink-4">
        Limited source
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-medium text-ink-4">
      Needs transcript check
    </span>
  );
}

function VideoThumbnail({ url, title }: { url: string | null; title: string | null }) {
  if (url) {
    return (
      <Image
        src={url}
        alt={title ?? 'Video thumbnail'}
        width={120}
        height={68}
        className="h-[56px] w-[100px] rounded object-cover"
        unoptimized={false}
      />
    );
  }
  return (
    <div className="flex h-[56px] w-[100px] items-center justify-center rounded bg-paper-3 text-[10px] text-ink-4">
      {title?.slice(0, 2) ?? '?'}
    </div>
  );
}

export default function LibraryClient({
  channel,
  videos,
}: {
  channel: ChannelRow;
  videos: VideoRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>('list');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');
  const [query, setQuery] = useState('');

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((v) => v.id)));
    }
  };

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (query) {
        const q = query.toLowerCase();
        if (!v.title?.toLowerCase().includes(q)) return false;
      }
      if (durationFilter !== 'all') {
        const s = v.durationSeconds ?? 0;
        if (durationFilter === 'short' && s >= 600) return false;
        if (durationFilter === 'medium' && (s < 600 || s >= 1800)) return false;
        if (durationFilter === 'long' && s < 1800) return false;
      }
      return true;
    });
  }, [videos, query, durationFilter]);

  const selectedVideos = useMemo(
    () => videos.filter((v) => selected.has(v.id)),
    [videos, selected],
  );

  const totalSelectedSeconds = selectedVideos.reduce(
    (acc, v) => acc + (v.durationSeconds ?? 0),
    0,
  );
  const totalSelectedHours = totalSelectedSeconds / 3600;
  const expectedLessons = Math.max(1, Math.round(totalSelectedHours * 2));

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((v) => selected.has(v.id));

  const durationLabels: { key: DurationFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'short', label: '< 10 min' },
    { key: 'medium', label: '10–30 min' },
    { key: 'long', label: '> 30 min' },
  ];

  return (
    <div className="min-h-screen bg-paper-studio">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-rule-dark bg-paper px-8 py-5">
        <div>
          <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
            Creator Studio
          </div>
          <h1 className="font-serif text-heading-lg text-ink">Source library</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/app"
            className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
          >
            ← Dashboard
          </Link>
          <button
            disabled={selected.size === 0}
            onClick={() => {
              const ids = [...selected].join(',');
              router.push(`/app/configure?ids=${ids}`);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-ink px-3 text-body-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ✦ Build from {selected.size > 0 ? selected.size : '…'} selected
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] px-8 py-7">
        {/* Filter bar */}
        <div className="mb-5 flex items-center gap-3">
          <div className="relative max-w-[360px] flex-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 text-[13px]">
              ⌕
            </span>
            <input
              type="search"
              placeholder="Search videos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 w-full rounded border border-rule bg-paper pl-7 pr-3 text-body-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-1 focus:ring-amber"
            />
          </div>

          <div className="flex items-center gap-0.5 rounded border border-rule bg-paper p-0.5">
            {durationLabels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDurationFilter(key)}
                className={`rounded px-2.5 py-1 text-[12px] transition ${
                  durationFilter === key
                    ? 'bg-paper-3 font-medium text-ink'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-0.5 rounded border border-rule bg-paper p-0.5">
            {(['list', 'grid'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-2.5 py-1 text-[12px] transition ${
                  view === v ? 'bg-paper-3 font-medium text-ink' : 'text-ink-3 hover:text-ink'
                }`}
              >
                {v === 'list' ? '≡ List' : '⊞ Grid'}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {videos.length === 0 && (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-rule bg-paper px-8 py-16 text-center">
            <p className="font-serif text-heading-md text-ink">No videos synced yet</p>
            <p className="max-w-sm text-body-md text-ink-3">
              Run{' '}
              <code className="rounded bg-paper-3 px-1.5 py-0.5 font-mono text-caption">
                pnpm trigger:dev
              </code>{' '}
              in the worker app to sync up to {channel.videoCount ?? 'all'} videos from{' '}
              {channel.title ?? 'your channel'}.
            </p>
            <p className="text-caption text-ink-4">
              {channel.videoCount != null
                ? `${channel.videoCount.toLocaleString()} videos available on YouTube`
                : ''}
            </p>
          </div>
        )}

        {/* Selection panel */}
        {selected.size > 0 && (
          <div className="mb-4 rounded-lg border border-amber/30 bg-paper px-5 py-4 shadow-1">
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr_auto] items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-amber text-[14px]">✦</span>
                  <span className="text-body-sm font-medium text-ink">
                    {selected.size} video{selected.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <p className="mt-1.5 text-caption text-ink-3">
                  CreatorCanon will preserve all citations and source evidence throughout review.
                </p>
              </div>
              <div>
                <div className="text-caption text-ink-4">Archive scope</div>
                <div className="mt-1 font-serif text-heading-md text-ink">
                  {totalSelectedHours >= 1
                    ? `${totalSelectedHours.toFixed(1)}h`
                    : `${Math.round(totalSelectedSeconds / 60)}m`}
                </div>
                <div className="mt-0.5 text-caption text-ink-4">
                  {selected.size} videos
                </div>
              </div>
              <div>
                <div className="text-caption text-ink-4">Expected output</div>
                <div className="mt-1 font-serif text-heading-md text-ink">
                  ~{expectedLessons} lesson{expectedLessons !== 1 ? 's' : ''}
                </div>
                <div className="mt-0.5 text-caption text-ink-4">plus playbooks</div>
              </div>
              <div>
                <div className="text-caption text-ink-4">Estimate</div>
                <div className="mt-1 font-serif text-heading-md text-ink">
                  {estimatePrice(totalSelectedSeconds)}
                </div>
                <div className="mt-0.5 text-caption text-ink-4">~4 min to draft</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setSelected(new Set())}
                  className="inline-flex h-8 items-center rounded border border-rule px-3 text-body-sm text-ink-3 transition hover:text-ink"
                >
                  Clear
                </button>
                <button className="inline-flex h-8 items-center gap-1 rounded bg-ink px-3 text-body-sm font-medium text-paper transition hover:opacity-90">
                  Build your hub →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List view */}
        {view === 'list' && videos.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-rule bg-paper">
            {/* Header row */}
            <div className="grid grid-cols-[36px_100px_1fr_100px_90px_70px] gap-3 border-b border-rule bg-paper-2 px-4 py-2.5">
              <div className="flex items-center">
                <button
                  onClick={toggleAll}
                  className={`h-4 w-4 rounded border transition ${
                    allFilteredSelected
                      ? 'border-transparent bg-ink text-paper'
                      : 'border-ink-4 hover:border-ink-2'
                  } flex items-center justify-center text-[10px]`}
                >
                  {allFilteredSelected && '✓'}
                </button>
              </div>
              <div className="text-eyebrow text-[10px] uppercase tracking-widest text-ink-4">
                Thumb
              </div>
              <div className="text-eyebrow text-[10px] uppercase tracking-widest text-ink-4">
                Title
              </div>
              <div className="text-right text-eyebrow text-[10px] uppercase tracking-widest text-ink-4">
                Views
              </div>
              <div className="text-eyebrow text-[10px] uppercase tracking-widest text-ink-4">
                Date
              </div>
              <div className="text-eyebrow text-[10px] uppercase tracking-widest text-ink-4">
                Length
              </div>
            </div>

            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-body-sm text-ink-4">
                No videos match your filter.
              </div>
            )}

            {filtered.map((v) => {
              const sel = selected.has(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggle(v.id)}
                  className={`grid w-full grid-cols-[36px_100px_1fr_100px_90px_70px] items-center gap-3 border-b border-rule px-4 py-2.5 text-left transition last:border-0 hover:bg-paper-2 ${
                    sel ? 'bg-paper-warm' : ''
                  }`}
                >
                  <div
                    className={`flex h-4 w-4 items-center justify-center rounded border transition ${
                      sel
                        ? 'border-transparent bg-ink text-paper'
                        : 'border-ink-4 hover:border-ink-2'
                    } text-[10px]`}
                  >
                    {sel && '✓'}
                  </div>
                  <VideoThumbnail url={v.thumbnailUrl} title={v.title} />
                  <div>
                    <div className="mb-0.5 font-serif text-[15px] leading-snug text-ink line-clamp-2">
                      {v.title ?? 'Untitled'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CaptionChip
                        status={v.captionStatus}
                        hasCanonicalTranscript={v.hasCanonicalTranscript}
                        hasAudioAsset={v.hasAudioAsset}
                      />
                      {v.categories[0] && (
                        <span className="inline-flex items-center rounded-full bg-paper-3 px-2 py-0.5 text-[10px] text-ink-3">
                          {v.categories[0]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[12px] text-ink-3">
                    {v.viewCount != null ? fmtViews(v.viewCount) : '—'}
                  </div>
                  <div className="text-[12px] text-ink-4">
                    {v.publishedAt ? fmtDate(v.publishedAt) : '—'}
                  </div>
                  <div className="font-mono text-[12px] text-ink-3">
                    {v.durationSeconds != null ? fmtDuration(v.durationSeconds) : '—'}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Grid view */}
        {view === 'grid' && videos.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            {filtered.length === 0 && (
              <div className="col-span-4 py-10 text-center text-body-sm text-ink-4">
                No videos match your filter.
              </div>
            )}
            {filtered.map((v) => {
              const sel = selected.has(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggle(v.id)}
                  className="group text-left"
                >
                  <div className="relative mb-2.5 overflow-hidden rounded">
                    {v.thumbnailUrl ? (
                      <Image
                        src={v.thumbnailUrl}
                        alt={v.title ?? 'Video thumbnail'}
                        width={320}
                        height={180}
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center bg-paper-3 text-[11px] text-ink-4">
                        {v.title?.slice(0, 2) ?? '?'}
                      </div>
                    )}
                    {/* Checkbox overlay */}
                    <div
                      className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border text-[11px] transition ${
                        sel
                          ? 'border-transparent bg-ink text-paper'
                          : 'border-rule bg-paper/85 text-ink-3 group-hover:border-ink-3'
                      }`}
                    >
                      {sel && '✓'}
                    </div>
                    {/* Duration badge */}
                    {v.durationSeconds != null && (
                      <div className="absolute bottom-1.5 right-1.5 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[10px] text-paper">
                        {fmtDuration(v.durationSeconds)}
                      </div>
                    )}
                  </div>
                  <div className="font-serif text-[14px] leading-snug text-ink line-clamp-2">
                    {v.title ?? 'Untitled'}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    {v.viewCount != null && (
                      <span className="text-[11px] text-ink-4">{fmtViews(v.viewCount)} views</span>
                    )}
                    {v.publishedAt && (
                      <span className="text-[11px] text-ink-4">· {fmtDate(v.publishedAt)}</span>
                    )}
                  </div>
                  <div className="mt-1">
                    <CaptionChip
                      status={v.captionStatus}
                      hasCanonicalTranscript={v.hasCanonicalTranscript}
                      hasAudioAsset={v.hasAudioAsset}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {videos.length > 0 && (
          <div className="mt-4 text-right text-caption text-ink-4">
            {filtered.length === videos.length
              ? `${videos.length} videos`
              : `${filtered.length} of ${videos.length} videos`}
          </div>
        )}
      </div>
    </div>
  );
}
