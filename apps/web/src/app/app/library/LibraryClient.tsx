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

type CaptionChipProps = {
  status: VideoRow['captionStatus'];
  hasCanonicalTranscript: boolean;
  hasAudioAsset: boolean;
};

function CaptionChip({ status, hasCanonicalTranscript, hasAudioAsset }: CaptionChipProps) {
  if (hasCanonicalTranscript || status === 'available') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sage/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sage">
        <span className="h-1 w-1 rounded-full bg-sage" aria-hidden="true" />
        Source ready
      </span>
    );
  }
  if (status === 'auto_only') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-ink">
        <span className="h-1 w-1 rounded-full bg-amber" aria-hidden="true" />
        Auto captions
      </span>
    );
  }
  if (hasAudioAsset) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-wash px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-ink">
        <span className="h-1 w-1 rounded-full bg-amber" aria-hidden="true" />
        Needs transcription
      </span>
    );
  }
  if (status === 'none') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-4">
        <span className="h-1 w-1 rounded-full bg-ink-4" aria-hidden="true" />
        Limited source
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-4">
      <span className="h-1 w-1 rounded-full bg-ink-4" aria-hidden="true" />
      Unchecked
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
        className="h-[58px] w-[104px] rounded-md object-cover"
        unoptimized={false}
      />
    );
  }
  const initials = title
    ? title.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
    : '?';
  return (
    <div className="flex h-[58px] w-[104px] items-center justify-center rounded-md bg-paper-3 text-body-sm font-medium text-ink-4">
      {initials}
    </div>
  );
}

function CheckboxIcon({ checked }: { checked: boolean }) {
  return (
    <div
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
        checked
          ? 'border-transparent bg-ink text-paper'
          : 'border-ink-4 bg-paper hover:border-ink-2'
      }`}
      aria-hidden="true"
    >
      {checked && (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3L3.5 5.5L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
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
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">←</span>
            Dashboard
          </Link>
          <button
            disabled={selected.size === 0}
            onClick={() => {
              const ids = [...selected].join(',');
              router.push(`/app/configure?ids=${ids}`);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
          >
            Build hub from {selected.size > 0 ? selected.size : '…'} videos
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] px-8 py-7">
        {/* Filter bar */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative w-72">
            <svg
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-4"
              viewBox="0 0 16 16" fill="none" aria-hidden="true"
            >
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              placeholder="Search videos…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search videos"
              className="h-9 w-full rounded-lg border border-rule bg-paper pl-8 pr-3 text-body-sm text-ink placeholder:text-ink-4 transition focus:outline-none focus:ring-2 focus:ring-amber focus:border-transparent"
            />
          </div>

          {/* Duration segmented control */}
          <div
            className="flex items-center gap-0.5 rounded-lg border border-rule bg-paper p-0.5"
            role="group"
            aria-label="Filter by duration"
          >
            {durationLabels.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDurationFilter(key)}
                aria-pressed={durationFilter === key}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                  durationFilter === key
                    ? 'bg-ink text-paper shadow-sm'
                    : 'text-ink-3 hover:bg-paper-2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* View mode segmented control */}
          <div
            className="flex items-center gap-0.5 rounded-lg border border-rule bg-paper p-0.5"
            role="group"
            aria-label="View mode"
          >
            {(['list', 'grid'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                aria-pressed={view === v}
                aria-label={v === 'list' ? 'List view' : 'Grid view'}
                className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                  view === v ? 'bg-ink text-paper shadow-sm' : 'text-ink-3 hover:bg-paper-2 hover:text-ink'
                }`}
              >
                {v === 'list' ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 4h10M2 7h10M2 10h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state — no videos synced */}
        {videos.length === 0 && (
          <div className="flex flex-col items-center gap-5 rounded-xl border border-rule bg-paper px-8 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-paper-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="3" y="3" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" className="text-ink-4" />
                <path d="M10 8.5l5 3-5 3v-6z" fill="currentColor" className="text-ink-4" />
                <path d="M8 21h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink-4" />
                <path d="M12 17v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-ink-4" />
              </svg>
            </div>
            <div className="space-y-2">
              <p className="font-serif text-heading-md text-ink">No videos synced yet</p>
              <p className="max-w-sm text-body-md text-ink-3 leading-relaxed">
                Your YouTube channel is connected. Run a sync to import your video library and start building a hub.
              </p>
            </div>
            {channel.videoCount != null && (
              <p className="rounded-full border border-rule bg-paper-2 px-4 py-1.5 text-caption text-ink-4">
                {channel.videoCount.toLocaleString()} videos available on YouTube
              </p>
            )}
          </div>
        )}

        {/* Selection summary panel */}
        {selected.size > 0 && (
          <div className="mb-5 overflow-hidden rounded-xl border border-amber/30 bg-paper shadow-1">
            <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_auto] items-center gap-5 px-6 py-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-amber text-[14px]" aria-hidden="true">✦</span>
                  <span className="text-body-sm font-semibold text-ink">
                    {selected.size} video{selected.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <p className="mt-1.5 text-caption text-ink-3 leading-relaxed">
                  Citations and source evidence are preserved throughout the review process.
                </p>
              </div>
              <div>
                <p className="text-eyebrow uppercase tracking-widest text-ink-4">Archive scope</p>
                <p className="mt-1.5 font-serif text-heading-md text-ink">
                  {totalSelectedHours >= 1
                    ? `${totalSelectedHours.toFixed(1)}h`
                    : `${Math.round(totalSelectedSeconds / 60)}m`}
                </p>
                <p className="mt-0.5 text-caption text-ink-4">{selected.size} videos</p>
              </div>
              <div>
                <p className="text-eyebrow uppercase tracking-widest text-ink-4">Expected output</p>
                <p className="mt-1.5 font-serif text-heading-md text-ink">
                  ~{expectedLessons} lesson{expectedLessons !== 1 ? 's' : ''}
                </p>
                <p className="mt-0.5 text-caption text-ink-4">plus playbooks</p>
              </div>
              <div>
                <p className="text-eyebrow uppercase tracking-widest text-ink-4">Estimate</p>
                <p className="mt-1.5 font-serif text-heading-md text-ink">
                  {estimatePrice(totalSelectedSeconds)}
                </p>
                <p className="mt-0.5 text-caption text-ink-4">~4 min to draft</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelected(new Set())}
                  className="inline-flex h-9 items-center rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                >
                  Clear
                </button>
                <button
                  onClick={() => {
                    const ids = [...selected].join(',');
                    router.push(`/app/configure?ids=${ids}`);
                  }}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                >
                  Build hub
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* List view */}
        {view === 'list' && videos.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-rule bg-paper">
            {/* Header row */}
            <div className="grid grid-cols-[40px_112px_1fr_104px_96px_72px] items-center gap-3 border-b border-rule bg-paper-2 px-4 py-3">
              <div className="flex items-center">
                <button
                  onClick={toggleAll}
                  aria-label={allFilteredSelected ? 'Deselect all visible' : 'Select all visible'}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
                >
                  <CheckboxIcon checked={allFilteredSelected} />
                </button>
              </div>
              <div className="text-eyebrow uppercase tracking-widest text-ink-4">Thumb</div>
              <div className="text-eyebrow uppercase tracking-widest text-ink-4">Title</div>
              <div className="text-right text-eyebrow uppercase tracking-widest text-ink-4">Views</div>
              <div className="text-eyebrow uppercase tracking-widest text-ink-4">Date</div>
              <div className="text-eyebrow uppercase tracking-widest text-ink-4">Length</div>
            </div>

            {/* No-results within filter */}
            {filtered.length === 0 && (
              <div className="px-4 py-16 text-center">
                <p className="text-body-sm text-ink-3">No videos match your filter.</p>
                <button
                  onClick={() => { setQuery(''); setDurationFilter('all'); }}
                  className="mt-2 text-body-sm text-ink-4 underline hover:text-ink"
                >
                  Clear filters
                </button>
              </div>
            )}

            {filtered.map((v) => {
              const sel = selected.has(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggle(v.id)}
                  aria-pressed={sel}
                  aria-label={`${sel ? 'Deselect' : 'Select'} ${v.title ?? 'video'}`}
                  className={`grid w-full grid-cols-[40px_112px_1fr_104px_96px_72px] items-center gap-3 border-b border-rule px-4 py-3 text-left transition last:border-0 hover:bg-paper-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber ${
                    sel ? 'bg-amber-wash/40' : ''
                  }`}
                >
                  <div className="flex items-center">
                    <CheckboxIcon checked={sel} />
                  </div>
                  <VideoThumbnail url={v.thumbnailUrl} title={v.title} />
                  <div className="min-w-0">
                    <div className="mb-1.5 font-serif text-[15px] leading-snug text-ink line-clamp-2">
                      {v.title ?? 'Untitled'}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
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
                    {v.viewCount != null ? fmtViews(v.viewCount) : (
                      <span className="text-ink-5">—</span>
                    )}
                  </div>
                  <div className="text-[12px] text-ink-4">
                    {v.publishedAt ? fmtDate(v.publishedAt) : (
                      <span className="text-ink-5">—</span>
                    )}
                  </div>
                  <div className="font-mono text-[12px] text-ink-3">
                    {v.durationSeconds != null ? fmtDuration(v.durationSeconds) : (
                      <span className="text-ink-5">—</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Grid view */}
        {view === 'grid' && videos.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.length === 0 && (
              <div className="col-span-4 py-16 text-center">
                <p className="text-body-sm text-ink-3">No videos match your filter.</p>
                <button
                  onClick={() => { setQuery(''); setDurationFilter('all'); }}
                  className="mt-2 text-body-sm text-ink-4 underline hover:text-ink"
                >
                  Clear filters
                </button>
              </div>
            )}
            {filtered.map((v) => {
              const sel = selected.has(v.id);
              return (
                <button
                  key={v.id}
                  onClick={() => toggle(v.id)}
                  aria-pressed={sel}
                  aria-label={`${sel ? 'Deselect' : 'Select'} ${v.title ?? 'video'}`}
                  className={`group rounded-xl border text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                    sel
                      ? 'border-amber/40 bg-amber-wash/30'
                      : 'border-rule bg-paper hover:border-ink-4 hover:bg-paper-2'
                  }`}
                >
                  <div className="relative overflow-hidden rounded-t-xl">
                    {v.thumbnailUrl ? (
                      <Image
                        src={v.thumbnailUrl}
                        alt={v.title ?? 'Video thumbnail'}
                        width={320}
                        height={180}
                        className="aspect-video w-full object-cover"
                      />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center bg-paper-3 text-body-md font-medium text-ink-4">
                        {v.title?.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') ?? '?'}
                      </div>
                    )}
                    {/* Selection overlay */}
                    <div
                      className={`absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded border transition-all ${
                        sel
                          ? 'border-transparent bg-ink text-paper shadow-1'
                          : 'border-rule bg-paper/85 text-ink-3 group-hover:border-ink-3'
                      }`}
                      aria-hidden="true"
                    >
                      {sel && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path d="M1 3L3.5 5.5L8 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    {/* Duration badge */}
                    {v.durationSeconds != null && (
                      <div className="absolute bottom-1.5 right-1.5 rounded bg-ink/80 px-1.5 py-0.5 font-mono text-[10px] text-paper">
                        {fmtDuration(v.durationSeconds)}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="font-serif text-[14px] leading-snug text-ink line-clamp-2">
                      {v.title ?? 'Untitled'}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      {v.viewCount != null && (
                        <span className="text-[11px] text-ink-4">{fmtViews(v.viewCount)} views</span>
                      )}
                      {v.publishedAt && (
                        <span className="text-[11px] text-ink-4">· {fmtDate(v.publishedAt)}</span>
                      )}
                    </div>
                    <div className="mt-1.5">
                      <CaptionChip
                        status={v.captionStatus}
                        hasCanonicalTranscript={v.hasCanonicalTranscript}
                        hasAudioAsset={v.hasAudioAsset}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Footer count */}
        {videos.length > 0 && (
          <div className="mt-5 flex items-center justify-between text-caption text-ink-4">
            <span>
              {filtered.length === videos.length
                ? `${videos.length} videos`
                : `${filtered.length} of ${videos.length} videos`}
              {selected.size > 0 && (
                <span className="ml-2 font-medium text-ink-3">
                  · {selected.size} selected
                </span>
              )}
            </span>
            {selected.size > 0 && (
              <button
                onClick={() => {
                  const ids = [...selected].join(',');
                  router.push(`/app/configure?ids=${ids}`);
                }}
                className="text-caption font-medium text-ink-3 underline hover:text-ink"
              >
                Build hub →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
