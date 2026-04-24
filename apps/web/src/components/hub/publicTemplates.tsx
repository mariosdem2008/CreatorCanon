'use client';

import { useState } from 'react';
import Link from 'next/link';

import type {
  ReleaseManifestV0,
  ReleaseManifestV0Page,
  ReleaseManifestV0Block,
} from '@creatorcanon/pipeline';

import type { SourceReferenceView } from './EvidenceChips';
import { getHubTemplate, type HubTemplate } from './templates';

type SectionContent = {
  heading?: string;
  body?: string;
  sourceVideoIds?: string[];
  sourceRefs?: SourceReferenceView[];
};

type ReleaseView = {
  liveAt: Date | null;
};

type HubView = {
  theme: string;
};

type HubHomeProps = {
  hub: HubView;
  manifest: ReleaseManifestV0;
  release: ReleaseView;
};

type HubDetailProps = HubHomeProps & {
  page: ReleaseManifestV0Page;
};

type TemplateVariant = HubTemplate['evidenceVariant'];

// ---------------------------------------------------------------------------
// Theme style maps — refined for premium editorial feel
// ---------------------------------------------------------------------------
const styles = {
  paper: {
    // Backgrounds
    page: 'bg-paper-studio text-ink',
    panel: 'border-rule bg-paper',
    soft: 'border-rule bg-paper-2',
    // Text
    muted: 'text-ink-4',
    body: 'text-ink-2',
    accent: 'text-amber-ink',
    // Interactions
    button:
      'bg-ink text-paper transition-opacity duration-150 hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber',
    navLink:
      'transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 focus-visible:decoration-amber',
    // R2 — hover adds underline offset for nav items (not just color shift)
    navLinkUnderline:
      'transition-colors duration-150 hover:text-ink hover:underline hover:underline-offset-4 hover:decoration-[currentColor] focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 focus-visible:decoration-amber',
    card: 'border-rule bg-paper transition-all duration-150 hover:shadow-1 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber',
    // Status badges
    supportStrong: 'border-sage/30 bg-sage/10 text-sage',
    supportLimited: 'border-amber/30 bg-amber/10 text-amber-ink',
    // Divider
    rule: 'border-rule',
    // Sidebar nav active
    navActive: 'bg-paper-2 text-ink',
    navIdle: 'text-ink-4 hover:text-ink hover:bg-paper-2',
    // R2 — source card active/visited state
    cardActive: 'border-rule bg-paper-2 ring-1 ring-amber/30',
  },
  midnight: {
    page: 'bg-[#070b10] text-[#eef5ef]',
    panel: 'border-[#263240] bg-[#0f151c]',
    soft: 'border-[#263240] bg-[#0a1016]',
    muted: 'text-[#7e9188]',
    body: 'text-[#b8c9c0]',
    // Accent changed to slightly desaturated yellow-green for WCAG AA on dark bg
    accent: 'text-[#c8ef60]',
    button:
      'bg-[#c8ef60] text-[#07100d] font-semibold transition-opacity duration-150 hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8ef60]',
    navLink:
      'transition-colors duration-150 hover:text-[#eef5ef] focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 focus-visible:decoration-[#c8ef60]',
    // R2 — nav links get underline on hover too
    navLinkUnderline:
      'transition-colors duration-150 hover:text-[#eef5ef] hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 focus-visible:decoration-[#c8ef60]',
    card: 'border-[#263240] bg-[#0f151c] transition-all duration-150 hover:border-[#3a4f5e] hover:bg-[#131b24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8ef60]',
    supportStrong: 'border-[#c8ef60]/25 bg-[#c8ef60]/8 text-[#c8ef60]',
    supportLimited: 'border-[#f0b350]/25 bg-[#f0b350]/8 text-[#f0b350]',
    rule: 'border-[#263240]',
    // R2 — active nav item gets 2px left accent line
    navActive: 'bg-[#0f151c] text-[#eef5ef] border-[#263240] border-l-2 border-l-[#c8ef60]',
    navIdle: 'text-[#7e9188] border-transparent hover:text-[#eef5ef] hover:bg-[#0a1016]',
    // R2 — source card active state
    cardActive: 'border-[#3a4f5e] bg-[#131b24] ring-1 ring-[#c8ef60]/30',
  },
  field: {
    page: 'bg-[#f2e8cf] text-[#2f271b]',
    panel: 'border-[#c9b990] bg-[#fdf7e8]',
    soft: 'border-[#c9b990] bg-[#f5e9cc]',
    muted: 'text-[#6e5f45]',
    body: 'text-[#4e4030]',
    accent: 'text-[#7a4e22]',
    button:
      'bg-[#2f271b] text-[#fdf7e8] transition-opacity duration-150 hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a4e22]',
    navLink:
      'transition-colors duration-150 hover:text-[#2f271b] focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 focus-visible:decoration-[#7a4e22]',
    // R2 — nav links get underline on hover
    navLinkUnderline:
      'transition-colors duration-150 hover:text-[#2f271b] hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:underline focus-visible:underline-offset-4 focus-visible:decoration-[#7a4e22]',
    card: 'border-[#c9b990] bg-[#fdf7e8] transition-all duration-150 hover:shadow-[0_4px_16px_rgba(47,39,27,0.08)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7a4e22]',
    supportStrong: 'border-[#5a8a68]/30 bg-[#5a8a68]/8 text-[#3f6b4e]',
    supportLimited: 'border-[#7a4e22]/25 bg-[#7a4e22]/8 text-[#7a4e22]',
    rule: 'border-[#c9b990]',
    navActive: 'bg-[#f5e9cc] text-[#2f271b] border-[#c9b990]',
    navIdle: 'text-[#6e5f45] border-transparent hover:text-[#2f271b] hover:bg-[#f5e9cc]',
    // R2 — source card active state
    cardActive: 'border-[#c9b990] bg-[#f5e9cc] ring-1 ring-[#7a4e22]/25',
  },
} satisfies Record<TemplateVariant, Record<string, string>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sectionBlocks(page: ReleaseManifestV0Page): ReleaseManifestV0Block[] {
  return page.blocks.filter((block) => block.type === 'section');
}

function sectionContent(block: ReleaseManifestV0Block): SectionContent {
  return block.content as SectionContent;
}

function pageSourceRefs(page: ReleaseManifestV0Page): SourceReferenceView[] {
  return sectionBlocks(page).flatMap((block) => sectionContent(block).sourceRefs ?? []);
}

function firstSection(page: ReleaseManifestV0Page): SectionContent | undefined {
  const block = sectionBlocks(page)[0];
  return block ? sectionContent(block) : undefined;
}

function pageLead(page: ReleaseManifestV0Page): string | null {
  return firstSection(page)?.body ?? page.summary ?? null;
}

function sourcedSectionCount(page: ReleaseManifestV0Page): number {
  return sectionBlocks(page).filter((block) => (sectionContent(block).sourceRefs ?? []).length > 0)
    .length;
}

function overviewPage(manifest: ReleaseManifestV0): ReleaseManifestV0Page {
  return manifest.pages.find((page) => page.slug === 'overview') ?? manifest.pages[0]!;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function readMinutes(page: ReleaseManifestV0Page): number {
  const words = sectionBlocks(page)
    .map((block) => sectionContent(block).body ?? '')
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 180));
}

function formatCalendarDate(value: Date | string | null | undefined, month: 'short' | 'long' = 'short') {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month,
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------
export function SupportLabel({
  sourceCount,
  variant,
}: {
  sourceCount: number;
  variant: TemplateVariant;
}) {
  const cls = styles[variant];
  const strong = sourceCount > 0;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] ${strong ? cls.supportStrong : cls.supportLimited}`}
      aria-label={strong ? 'Well supported by source moments' : 'Limited source support'}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {strong ? 'Well supported' : 'Limited support'}
    </span>
  );
}

// R2: SourceMomentCard with active/visited micro-interaction
export function SourceMomentCard({
  source,
  variant,
}: {
  source: SourceReferenceView;
  variant: TemplateVariant;
}) {
  const cls = styles[variant];
  const [activated, setActivated] = useState(false);

  const handleActivate = () => setActivated(true);

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-200 sm:p-5 ${activated ? cls.cardActive : cls.soft}`}
    >
      <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${cls.accent}`}>
        {formatTime(source.startMs)}–{formatTime(source.endMs)}
      </div>
      {/* R2: text-balance on card title for better line-breaking */}
      <div className="mt-1.5 text-[13px] font-medium leading-snug [text-wrap:balance]">
        {source.title ?? 'Source video'}
      </div>
      {/* R2: line-clamp for density safety — prevents very long quotes overflowing */}
      <p className={`mt-2 line-clamp-4 text-[12px] leading-[1.6] ${cls.body}`}>
        &ldquo;{source.quote}&rdquo;
      </p>
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open source: ${source.title ?? 'Source video'}`}
          onClick={handleActivate}
          className={`mt-2.5 inline-flex text-[12px] font-medium underline-offset-3 hover:underline ${cls.accent} transition-opacity duration-150 hover:opacity-80`}
        >
          Open source ↗
        </a>
      )}
      {/* R2: visual cue when activated (no URL) */}
      {!source.url && activated && (
        <div className={`mt-2.5 text-[11px] ${cls.muted}`} aria-live="polite">
          No link available
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// R2: SourceRail — with "show more" at 10+ items + mobile inline affordance
// ---------------------------------------------------------------------------
const SOURCE_RAIL_INITIAL = 10;

export function SourceRail({
  refs,
  variant,
}: {
  refs: SourceReferenceView[];
  variant: TemplateVariant;
}) {
  const cls = styles[variant];
  const [expanded, setExpanded] = useState(false);

  if (refs.length === 0) {
    return (
      <aside aria-label="Source moments" className="lg:sticky lg:top-5">
        <div
          className={`rounded-2xl border px-4 py-6 text-[13px] leading-relaxed sm:px-5 ${cls.soft} ${cls.muted}`}
        >
          <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em]">
            Source moments
          </span>
          This page is published without linked source moments yet.
        </div>
      </aside>
    );
  }

  const visible = expanded ? refs : refs.slice(0, SOURCE_RAIL_INITIAL);
  const hasMore = refs.length > SOURCE_RAIL_INITIAL;

  return (
    <aside aria-label={`Source moments (${refs.length})`} className="lg:sticky lg:top-5">
      <div className={`rounded-2xl border p-4 sm:p-5 ${cls.panel}`}>
        <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
          Source moments
        </div>
        <div className="mt-2 flex items-end justify-between gap-3">
          <p className="font-serif text-[24px] leading-none tracking-tight">{refs.length}</p>
          <p className={`text-right text-[11px] leading-[1.5] ${cls.muted}`}>
            Reader-visible clips linked to this page.
          </p>
        </div>
        <div className={`mt-4 border-t ${cls.rule}`} />
        <div
          className="mt-4 space-y-2.5 max-h-[70vh] overflow-y-auto pr-0.5 lg:max-h-[calc(100vh-220px)]"
          aria-label="Source moment cards"
        >
          {visible.map((ref) => (
            <SourceMomentCard key={ref.segmentId} source={ref} variant={variant} />
          ))}
        </div>
        {hasMore && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className={`mt-3 w-full rounded-md border px-3 py-2 text-[12px] font-medium transition-opacity duration-150 hover:opacity-80 ${cls.soft} ${cls.muted}`}
          >
            Show {refs.length - SOURCE_RAIL_INITIAL} more moments
          </button>
        )}
        {hasMore && expanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className={`mt-3 w-full rounded-md border px-3 py-2 text-[12px] font-medium transition-opacity duration-150 hover:opacity-80 ${cls.soft} ${cls.muted}`}
          >
            Show fewer
          </button>
        )}
      </div>
    </aside>
  );
}

// Page index card — used on hub home pages
export function PageIndexItem({
  manifest,
  page,
  variant,
  compact = false,
}: {
  manifest: ReleaseManifestV0;
  page: ReleaseManifestV0Page;
  variant: TemplateVariant;
  compact?: boolean;
}) {
  const cls = styles[variant];
  const refs = pageSourceRefs(page);
  const sourcedSections = sourcedSectionCount(page);
  return (
    <Link
      href={`/h/${manifest.subdomain}/${page.slug}`}
      className={`block rounded-xl border p-4 sm:p-5 ${cls.card}`}
      aria-label={`${page.title} — ${readMinutes(page)} min read`}
    >
      <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${cls.muted}`}>
        No.&thinsp;{(page.position + 1).toString().padStart(2, '0')} &middot; {readMinutes(page)}&thinsp;min read
      </div>
      {/* R2: text-balance on titles to avoid orphan words at 3+ lines */}
      <h3
        className={`mt-2 [text-wrap:balance] ${
          compact
            ? 'text-[14px] font-semibold leading-snug'
            : 'font-serif text-[17px] leading-[1.3]'
        }`}
      >
        {page.title}
      </h3>
      {!compact && pageLead(page) && (
        <p className={`mt-2 line-clamp-3 max-w-prose text-[13px] leading-[1.7] ${cls.body}`}>
          {pageLead(page)}
        </p>
      )}
      {compact && page.summary && (
        <p className={`mt-2 line-clamp-2 text-[12px] leading-[1.65] ${cls.body}`}>{page.summary}</p>
      )}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 gap-y-1.5">
        <SupportLabel sourceCount={refs.length} variant={variant} />
        <span className={`text-[11px] ${cls.muted}`}>{refs.length} moments</span>
        <span className={`text-[11px] ${cls.muted}`}>{sourcedSections} sourced sections</span>
      </div>
    </Link>
  );
}

// Empty state — intentional, not apologetic
export function TemplateEmptyState({
  variant,
  message,
  label = 'Published state',
}: {
  variant: TemplateVariant;
  message: string;
  label?: string;
}) {
  const cls = styles[variant];
  return (
    <div
      role="status"
      className={`rounded-2xl border px-5 py-7 text-center text-[13px] leading-relaxed sm:px-6 ${cls.soft} ${cls.muted}`}
    >
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.12em] opacity-70">
        {label}
      </span>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// R2: Mobile menu toggle — shared across themes that have sidebar navs
// ---------------------------------------------------------------------------
function MobileMenuToggle({
  open,
  onToggle,
  label,
  cls,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  cls: (typeof styles)[TemplateVariant];
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      onClick={onToggle}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[13px] font-medium transition-opacity duration-150 hover:opacity-80 lg:hidden ${cls.soft} ${cls.muted}`}
    >
      <span className="block w-4 space-y-[3px]" aria-hidden="true">
        <span className={`block h-px w-full bg-current transition-transform duration-200 ${open ? 'translate-y-[4px] rotate-45' : ''}`} />
        <span className={`block h-px w-full bg-current transition-opacity duration-200 ${open ? 'opacity-0' : ''}`} />
        <span className={`block h-px w-full bg-current transition-transform duration-200 ${open ? '-translate-y-[4px] -rotate-45' : ''}`} />
      </span>
      {open ? 'Close menu' : 'Pages'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Editorial Atlas — paper theme
// ---------------------------------------------------------------------------
function EditorialAtlasHome({ manifest, release }: HubHomeProps) {
  const cls = styles.paper;
  const overview = overviewPage(manifest);
  const totalSources = manifest.pages.reduce(
    (sum, p) => sum + pageSourceRefs(p).length,
    0,
  );
  const sourcedPages = manifest.pages.filter((page) => pageSourceRefs(page).length > 0).length;
  const publishedLabel = formatCalendarDate(release.liveAt, 'short') ?? 'Live';
  const updatedLabel = formatCalendarDate(manifest.generatedAt, 'long');

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* Top nav bar — R2: hamburger on mobile, wrap-safe flex */}
      <header className={`sticky top-0 z-10 border-b px-4 py-3.5 backdrop-blur-sm sm:px-6 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`shrink-0 font-serif text-[18px] tracking-[-0.02em] ${cls.navLink}`}
            aria-label={`${manifest.title} — home`}
          >
            Creator<span className={cls.accent}>Canon</span>
          </Link>
          {/* R2: nav links hidden below md — no hamburger needed here since it's a simple header nav, not sidebar */}
          <nav aria-label="Hub navigation" className={`hidden gap-6 text-[13px] md:flex ${cls.muted}`}>
            <a href="#start" className={cls.navLinkUnderline}>Start here</a>
            <a href="#atlas" className={cls.navLinkUnderline}>The atlas</a>
          </nav>
          <span className={`hidden font-mono text-[11px] tabular-nums sm:block ${cls.muted}`} aria-label="Release ID">
            {manifest.releaseId.slice(0, 8)}
          </span>
        </div>
      </header>

      {/* Hero — R2: responsive text scale */}
      <section className="mx-auto max-w-[1180px] px-4 pt-10 pb-8 sm:px-6 md:pt-16 md:pb-12 lg:pt-20 lg:pb-16">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${cls.muted}`}>
          Editorial Atlas
        </div>
        {/* R2: text-balance + responsive font size — avoids 3-line wrap at 375px */}
        <h1 className="mt-4 max-w-[820px] [text-wrap:balance] font-serif text-[36px] leading-[1.06] tracking-[-0.03em] sm:text-[48px] md:text-[60px] lg:text-[68px]">
          {manifest.title}
        </h1>
        <p className={`mt-5 max-w-[640px] text-[15px] leading-[1.78] sm:text-[16px] ${cls.body}`}>
          {overview.summary ?? 'A source-linked subject atlas generated from the creator archive.'}
        </p>
        <div className={`mt-8 max-w-[320px] rounded-2xl border p-5 sm:p-6 ${cls.panel}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
            Reading note
          </div>
          <p className="mt-3 font-serif text-[18px] leading-[1.45] tracking-[-0.01em]">
            {sourcedPages} of {manifest.pages.length} pages already carry linked source moments.
          </p>
          <div className={`mt-4 border-t ${cls.rule}`} />
          <dl className={`mt-4 space-y-2.5 text-[12px] ${cls.muted}`}>
            <div className="flex justify-between gap-4">
              <dt>Published</dt>
              <dd className="text-right text-ink">{publishedLabel}</dd>
            </div>
            {updatedLabel && (
              <div className="flex justify-between gap-4">
                <dt>Manifest</dt>
                <dd className="text-right text-ink">{updatedLabel}</dd>
              </div>
            )}
          </dl>
        </div>
        {/* Stats strip — R2: 2-col on mobile, 4-col on md */}
        <dl className={`mt-8 grid gap-px border-y md:mt-10 ${cls.rule}`}>
          <div className={`grid grid-cols-2 gap-px md:grid-cols-4 ${cls.rule}`}>
            {[
              { label: 'Pages', value: manifest.pages.length },
              { label: 'Source moments', value: totalSources },
              { label: 'Sourced pages', value: sourcedPages },
              {
                label: 'Published',
                value: publishedLabel,
              },
            ].map(({ label, value }) => (
              <div key={label} className="bg-paper px-4 py-3 sm:px-5 sm:py-4">
                <dt className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
                  {label}
                </dt>
                <dd className="mt-1.5 text-[20px] font-serif leading-none tracking-tight sm:text-[22px]">
                  {value}
                </dd>
              </div>
            ))}
          </div>
        </dl>
      </section>

      {/* Start here */}
      <section
        id="start"
        className="mx-auto max-w-[1180px] px-4 pb-10 sm:px-6 sm:pb-12"
        aria-labelledby="start-heading"
      >
        <div className={`rounded-xl border p-5 sm:p-6 md:p-8 ${cls.panel}`}>
          {/* R2: single-col on mobile, 2-col grid on md */}
          <div className="grid gap-5 md:grid-cols-[160px_1fr]">
            <div>
              <div
                id="start-heading"
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}
              >
                Start here
              </div>
            </div>
            <div>
              {/* R2: text-balance heading */}
              <h2 className="[text-wrap:balance] font-serif text-[20px] leading-[1.25] tracking-[-0.01em] sm:text-[22px]">
                {overview.title}
              </h2>
              <p className={`mt-3 max-w-[640px] text-[14px] leading-[1.82] ${cls.body}`}>
                {pageLead(overview)}
              </p>
              <Link
                href={`/h/${manifest.subdomain}/${overview.slug}`}
                className={`mt-5 inline-flex h-9 items-center rounded-md px-5 text-[13px] font-medium ${cls.button}`}
              >
                Begin reading
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Atlas index */}
      <section
        id="atlas"
        className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6 sm:pb-20"
        aria-labelledby="atlas-heading"
      >
        <h2
          id="atlas-heading"
          className={`mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.muted}`}
        >
          The atlas
        </h2>
        {/* R2: single-col always on home (not grid) — fits dense lists */}
        <div className="space-y-2.5">
          {manifest.pages.map((page) => (
            <PageIndexItem key={page.slug} manifest={manifest} page={page} variant="paper" />
          ))}
        </div>
      </section>
    </div>
  );
}

function EditorialAtlasDetail({ manifest, page }: HubDetailProps) {
  const cls = styles.paper;
  const refs = pageSourceRefs(page);
  const sections = sectionBlocks(page);
  // R2: collapsible TOC on mobile
  const [tocOpen, setTocOpen] = useState(false);

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* Nav */}
      <header className={`sticky top-0 z-10 border-b px-4 py-3.5 backdrop-blur-sm sm:px-6 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`shrink-0 text-[13px] ${cls.muted} ${cls.navLinkUnderline}`}
            aria-label="Back to atlas index"
          >
            ← Back to atlas
          </Link>
          <span className={`hidden font-mono text-[11px] md:block ${cls.muted} truncate`}>
            {manifest.title}
          </span>
        </div>
      </header>

      {/* R2: mobile TOC toggle — renders above content on mobile */}
      {sections.length > 2 && (
        <div className="mx-auto max-w-[1180px] px-4 pt-4 sm:px-6 lg:hidden">
          <button
            type="button"
            aria-expanded={tocOpen}
            onClick={() => setTocOpen(!tocOpen)}
            className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-[12px] font-medium ${cls.soft} ${cls.muted}`}
          >
            <span>Table of contents</span>
            <span aria-hidden="true">{tocOpen ? '▲' : '▼'}</span>
          </button>
          {tocOpen && (
            <div className={`mt-1 rounded-lg border px-4 py-3 ${cls.soft}`}>
              <ol className="space-y-1">
                {sections.map((block, i) => {
                  const content = sectionContent(block);
                  return (
                    <li key={block.id} className={`text-[12px] leading-5 ${cls.muted}`}>
                      <span className={`mr-1.5 font-mono text-[10px] ${cls.accent}`}>{(i + 1).toString().padStart(2, '0')}</span>
                      <span className="line-clamp-1">{content.heading}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Three-column layout — R2: no left col below lg, source rail below main on mobile */}
      <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-8 sm:px-6 sm:py-10 lg:grid-cols-[160px_1fr_260px] lg:gap-10">

        {/* Left: TOC — only visible on lg */}
        <aside className="hidden lg:block" aria-label="Page position">
          <div
            className={`sticky top-20 text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}
          >
            <div>Lesson {(page.position + 1).toString().padStart(2, '0')}</div>
            <div className={`mt-2 w-8 border-t ${cls.rule}`} />
            {/* R2: TOC itself scrollable when 10+ sections */}
            <div className="mt-3 max-h-[calc(100vh-160px)] space-y-1 overflow-y-auto">
              {sections.map((block, i) => {
                const content = sectionContent(block);
                return (
                  <div
                    key={block.id}
                    className={`truncate text-[11px] leading-5 ${cls.muted}`}
                    title={content.heading}
                  >
                    <span className={`mr-1 font-mono text-[10px] opacity-60`}>{(i + 1).toString().padStart(2, '0')}</span>
                    {content.heading}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Centre: article body */}
        <main className="min-w-0">
          <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
            Lesson No.&thinsp;{(page.position + 1).toString().padStart(2, '0')}
          </div>
          {/* R2: responsive heading scale + text-balance */}
          <h1 className="mt-3 [text-wrap:balance] font-serif text-[34px] leading-[1.06] tracking-[-0.025em] sm:text-[44px] md:text-[54px]">
            {page.title}
          </h1>
          {page.summary && (
            <p className={`mt-4 font-serif text-[17px] italic leading-[1.6] sm:text-[18px] ${cls.body}`}>
              {page.summary}
            </p>
          )}
          <div className={`mt-6 flex flex-wrap items-center gap-3 border-y py-4 ${cls.rule}`}>
            <SupportLabel sourceCount={refs.length} variant="paper" />
            <span className={`text-[12px] ${cls.muted}`}>{readMinutes(page)} min read</span>
            <span className={`text-[12px] ${cls.muted}`}>{refs.length} source moments</span>
          </div>

          <div className="mt-8 space-y-6 sm:space-y-8">
            {sections.length > 0 ? (
              sections.map((block, index) => {
                const content = sectionContent(block);
                return (
                  <section key={block.id} className={`rounded-2xl border p-5 sm:p-6 ${cls.panel}`}>
                    <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
                      Section {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <h2 className="mt-2 [text-wrap:balance] font-serif text-[20px] leading-[1.3] tracking-[-0.01em]">
                      {content.heading ?? 'Untitled section'}
                    </h2>
                    <p
                      className={`mt-3 max-w-[65ch] text-[15px] leading-[1.82] ${cls.body}`}
                    >
                      {content.body ?? 'No section body was generated.'}
                    </p>
                    {(content.sourceRefs ?? []).length > 0 ? (
                      <div className="mt-5">
                        <SourceMomentCard source={(content.sourceRefs ?? [])[0]!} variant="paper" />
                      </div>
                    ) : (
                      <div className="mt-5">
                        <TemplateEmptyState
                          variant="paper"
                          label="Source status"
                          message="This section reads cleanly, but no source moment is linked to it yet."
                        />
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              <TemplateEmptyState
                variant="paper"
                label="Page structure"
                message="This published page does not contain generated sections."
              />
            )}
          </div>
        </main>

        {/* Right: source rail — R2: on mobile renders below main via DOM order */}
        <div className="lg:min-w-0">
          <SourceRail refs={refs} variant="paper" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Playbook OS — midnight theme
// ---------------------------------------------------------------------------
function PlaybookOsHome({ manifest, release }: HubHomeProps) {
  const cls = styles.midnight;
  const overview = overviewPage(manifest);
  const totalSources = manifest.pages.reduce(
    (sum, p) => sum + pageSourceRefs(p).length,
    0,
  );
  const sourcedPages = manifest.pages.filter((page) => pageSourceRefs(page).length > 0).length;
  const publishedLabel = formatCalendarDate(release.liveAt, 'short') ?? 'Live';
  // R2: mobile sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* R2: mobile top bar (visible < md) */}
      <div className={`sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 md:hidden ${cls.panel}`}>
        <span className={`font-serif text-[15px] tracking-tight truncate`}>{manifest.title}</span>
        <MobileMenuToggle
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          label="Toggle page navigation"
          cls={cls}
        />
      </div>

      <div className="mx-auto grid max-w-[1280px] gap-4 px-3 py-4 sm:gap-5 sm:px-4 sm:py-5 md:grid-cols-[256px_1fr]">

        {/* Left sidebar — sticky nav. R2: hidden on mobile unless toggled */}
        <nav
          aria-label="Playbook navigation"
          className={`rounded-2xl border p-4 sm:p-5 md:sticky md:top-5 md:h-[calc(100vh-40px)] md:overflow-y-auto ${cls.panel} ${
            sidebarOpen ? 'block' : 'hidden md:block'
          }`}
        >
          <div
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}
            aria-hidden="true"
          >
            Playbook OS
          </div>
          <h1 className="mt-3 [text-wrap:balance] font-serif text-[17px] leading-[1.3] tracking-[-0.01em] sm:text-[18px]">
            {manifest.title}
          </h1>
          <p className={`mt-2 text-[12px] leading-[1.6] ${cls.muted}`}>
            {release.liveAt?.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
            }) ?? 'Live'}
          </p>
          <div className={`my-4 border-t ${cls.rule}`} />
          {/* R2: sidebar scroll for 10+ pages */}
          <ul className="space-y-1 overflow-y-auto max-h-[60vh] md:max-h-none" role="list">
            {manifest.pages.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/h/${manifest.subdomain}/${p.slug}`}
                  className={`block rounded-md border px-3 py-2 text-[13px] leading-snug transition-colors duration-150 ${cls.navIdle}`}
                >
                  <span className={`mr-2 font-mono text-[10px] ${cls.accent}`}>
                    {(p.position + 1).toString().padStart(2, '0')}
                  </span>
                  {/* R2: line-clamp for very long page titles */}
                  <span className="line-clamp-2">{p.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <div className="min-w-0 space-y-4 sm:space-y-5">
          {/* Hero card */}
          <div className={`rounded-2xl border p-5 sm:p-6 md:p-10 ${cls.panel}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
              Command center &middot; {publishedLabel}
            </div>
            {/* R2: text-balance + responsive scale */}
            <h2 className="mt-4 max-w-[700px] [text-wrap:balance] font-serif text-[28px] leading-[1.06] tracking-[-0.02em] sm:text-[38px] md:text-[52px]">
              Run the archive like an operating system.
            </h2>
            <p className={`mt-4 max-w-[580px] text-[14px] leading-[1.7] sm:text-[15px] ${cls.body}`}>
              {overview.summary ?? 'A tactical readout generated from the creator archive.'}
            </p>
            <Link
              href={`/h/${manifest.subdomain}/${overview.slug}`}
              className={`mt-5 inline-flex h-9 items-center rounded-md px-5 text-[13px] sm:mt-6 ${cls.button}`}
            >
              Open first module
            </Link>
            <div className={`mt-6 rounded-xl border px-4 py-3 sm:mt-7 ${cls.soft}`}>
              <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
                Signal
              </div>
              <p className="mt-2 max-w-[52ch] text-[13px] leading-[1.65] text-[#d9e4de]">
                {sourcedPages} of {manifest.pages.length} modules already expose source-linked moments for verification.
              </p>
            </div>
            {/* Stats row — R2: 2-col on mobile, 3-col on sm */}
            <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:mt-8 sm:grid-cols-3 sm:gap-3">
              {[
                { label: 'Modules', value: manifest.pages.length },
                { label: 'Source moments', value: totalSources },
                { label: 'Sourced modules', value: sourcedPages },
              ].map(({ label, value }) => (
                <div key={label} className={`rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3 ${cls.soft}`}>
                  <dt className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${cls.muted}`}>
                    {label}
                  </dt>
                  <dd className="mt-1 text-[18px] font-serif leading-none tracking-tight sm:text-[22px]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Module grid — R2: 1-col on mobile, 2-col on sm */}
          <div
            className="grid gap-2.5 sm:grid-cols-2 sm:gap-3"
            aria-label="All modules"
          >
            {manifest.pages.map((p) => (
              <PageIndexItem key={p.slug} manifest={manifest} page={p} variant="midnight" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaybookOsDetail({ manifest, page }: HubDetailProps) {
  const cls = styles.midnight;
  const refs = pageSourceRefs(page);
  const sections = sectionBlocks(page);
  // R2: mobile sidebar toggle
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* R2: mobile top bar */}
      <div className={`sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 lg:hidden ${cls.panel}`}>
        <Link
          href={`/h/${manifest.subdomain}`}
          className={`text-[12px] font-medium ${cls.accent} ${cls.navLink} shrink-0`}
          aria-label="Back to command center"
        >
          ← Back
        </Link>
        <MobileMenuToggle
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          label="Toggle module navigation"
          cls={cls}
        />
      </div>

      <div className="mx-auto grid max-w-[1280px] gap-4 px-3 py-4 sm:gap-5 sm:px-4 sm:py-5 lg:grid-cols-[256px_1fr_268px]">

        {/* Sidebar — R2: hidden on mobile unless toggled, shown on lg */}
        <nav
          aria-label="Module navigation"
          className={`rounded-2xl border p-4 sm:p-5 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] lg:overflow-y-auto ${cls.panel} ${
            sidebarOpen ? 'block' : 'hidden lg:block'
          }`}
        >
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`hidden text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent} ${cls.navLink} lg:inline-block`}
            aria-label="Back to command center"
          >
            ← Back to OS
          </Link>
          <p className="mt-3 hidden text-[13px] font-medium leading-snug lg:block">{manifest.title}</p>
          <div className={`my-4 border-t ${cls.rule} hidden lg:block`} />
          {/* R2: sidebar list scrollable for 10+ pages, with line-clamp on titles */}
          <ul className="max-h-[50vh] space-y-1 overflow-y-auto lg:max-h-none" role="list">
            {manifest.pages.map((item) => (
              <li key={item.slug}>
                <Link
                  href={`/h/${manifest.subdomain}/${item.slug}`}
                  aria-current={item.slug === page.slug ? 'page' : undefined}
                  className={`block rounded-md border px-3 py-2 text-[13px] leading-snug transition-colors duration-150 ${
                    item.slug === page.slug ? cls.navActive : cls.navIdle
                  }`}
                >
                  <span className={`mr-2 font-mono text-[10px] ${cls.accent}`}>
                    {(item.position + 1).toString().padStart(2, '0')}
                  </span>
                  {/* R2: clamp long titles to prevent sidebar from blowing up */}
                  <span className="line-clamp-2">{item.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Article */}
        <article className={`min-w-0 rounded-2xl border p-5 sm:p-6 md:p-8 ${cls.panel}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
            Module {(page.position + 1).toString().padStart(2, '0')}
          </div>
          {/* R2: responsive scale + text-balance */}
          <h1 className="mt-3 [text-wrap:balance] font-serif text-[28px] leading-[1.06] tracking-[-0.02em] sm:text-[38px] md:text-[50px]">
            {page.title}
          </h1>
          {page.summary && (
            <p className={`mt-4 max-w-[58ch] text-[14px] leading-[1.7] sm:text-[15px] ${cls.body}`}>
              {page.summary}
            </p>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <SupportLabel sourceCount={refs.length} variant="midnight" />
            <span
              className={`rounded-full border border-current/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${cls.muted}`}
            >
              {readMinutes(page)} min
            </span>
          </div>

          <div className="mt-6 space-y-3 sm:mt-8 sm:space-y-4">
            {sections.length > 0 ? (
              sections.map((block, index) => {
                const content = sectionContent(block);
                return (
                  <section key={block.id} className={`rounded-xl border p-4 sm:p-5 ${cls.soft}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
                          Step {(index + 1).toString().padStart(2, '0')}
                        </div>
                        <h2 className="mt-2 [text-wrap:balance] text-[15px] font-semibold leading-[1.3] tracking-[-0.005em] sm:text-[16px]">
                          {content.heading ?? 'Untitled section'}
                        </h2>
                      </div>
                      <span className={`shrink-0 rounded-full border border-current/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${cls.muted}`}>
                        {(content.sourceRefs ?? []).length} moments
                      </span>
                    </div>
                    <p className={`mt-3 max-w-[60ch] text-[13px] leading-[1.72] sm:text-[14px] ${cls.body}`}>
                      {content.body ?? 'No section body was generated.'}
                    </p>
                    {(content.sourceRefs ?? []).length > 0 ? (
                      <div className="mt-3 space-y-2.5 sm:mt-4">
                        {(content.sourceRefs ?? []).slice(0, 2).map((ref) => (
                          <SourceMomentCard key={ref.segmentId} source={ref} variant="midnight" />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 sm:mt-4">
                        <TemplateEmptyState
                          variant="midnight"
                          label="Evidence status"
                          message="This step is published, but it does not yet expose a linked source moment."
                        />
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              <TemplateEmptyState
                variant="midnight"
                label="Module structure"
                message="This published page does not contain generated sections."
              />
            )}
          </div>
        </article>

        {/* Source rail — R2: renders below article on mobile via DOM order */}
        <div className="min-w-0">
          <SourceRail refs={refs} variant="midnight" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Studio Vault — field theme
// ---------------------------------------------------------------------------
function StudioVaultHome({ manifest, release }: HubHomeProps) {
  const template = getHubTemplate('field');
  const cls = styles.field;
  const overview = overviewPage(manifest);
  const totalSources = manifest.pages.reduce(
    (sum, p) => sum + pageSourceRefs(p).length,
    0,
  );
  const sourcedPages = manifest.pages.filter((page) => pageSourceRefs(page).length > 0).length;
  const publishedLabel = formatCalendarDate(release.liveAt, 'long') ?? 'Live';

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* Header — R2: responsive padding */}
      <header className={`border-b px-4 py-4 sm:px-6 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`shrink-0 font-serif text-[18px] tracking-[-0.02em] sm:text-[20px] ${cls.navLink}`}
            aria-label={`${manifest.title} — vault index`}
          >
            {template.name}
          </Link>
          <span className={`hidden text-[11px] font-semibold uppercase tracking-[0.1em] sm:block ${cls.muted}`}>
            Public archive
          </span>
        </div>
      </header>

      {/* Hero — R2: responsive text scale */}
      <section className="mx-auto max-w-[1180px] px-4 pt-10 pb-8 sm:px-6 md:pt-16 md:pb-10 lg:pt-20 lg:pb-14">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
          {template.name}
        </div>
        {/* R2: text-balance + responsive sizes */}
        <h1 className="mt-4 max-w-[820px] [text-wrap:balance] font-serif text-[34px] leading-[1.04] tracking-[-0.03em] sm:text-[46px] md:text-[56px] lg:text-[64px]">
          {manifest.title}
        </h1>
        <p className={`mt-5 max-w-[600px] text-[15px] leading-[1.75] sm:text-[16px] ${cls.body}`}>
          {overview.summary ?? 'A warm source-forward vault generated from the creator archive.'}
        </p>
        <p className={`mt-3 text-[12px] ${cls.muted}`}>Published {publishedLabel}</p>

        {/* Archive note card */}
        <div className={`mt-8 rounded-2xl border p-5 sm:p-6 md:p-8 ${cls.panel}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
            Archive note
          </div>
          <p className={`mt-3 max-w-[680px] font-serif text-[16px] italic leading-[1.72] sm:text-[17px] ${cls.body}`}>
            This preview contains {manifest.pages.length} generated pages, {totalSources} source
            moments, and {sourcedPages} pages with linked evidence already in place.
          </p>
          <p className={`mt-4 text-[12px] ${cls.muted}`}>
            Published{' '}
            {release.liveAt?.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }) ?? '—'}
          </p>
        </div>
      </section>

      {/* Collections grid — R2: 1-col mobile, 2-col sm, 3-col md */}
      <section
        className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6 sm:pb-20"
        aria-labelledby="collections-heading"
      >
        <h2
          id="collections-heading"
          className={`mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.muted}`}
        >
          Collections
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 sm:gap-3.5">
          {manifest.pages.map((p) => (
            <PageIndexItem key={p.slug} manifest={manifest} page={p} variant="field" compact />
          ))}
        </div>
      </section>
    </div>
  );
}

function StudioVaultDetail({ manifest, page }: HubDetailProps) {
  const cls = styles.field;
  const refs = pageSourceRefs(page);
  const sections = sectionBlocks(page);

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* Header — R2: responsive padding */}
      <header className={`border-b px-4 py-4 sm:px-6 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`shrink-0 text-[13px] ${cls.muted} ${cls.navLinkUnderline}`}
            aria-label="Back to vault index"
          >
            ← Vault index
          </Link>
          <span className={`hidden text-[11px] font-semibold uppercase tracking-[0.1em] sm:block ${cls.muted} truncate`}>
            {manifest.title}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-6 sm:py-10">
        {/* Eyebrow */}
        <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
          Vault lesson &middot; No.&thinsp;{(page.position + 1).toString().padStart(2, '0')}
        </div>

        {/* Title + archive card — R2: stacked on mobile, side-by-side on lg */}
        <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_260px] lg:gap-6">
          <div>
            {/* R2: text-balance + responsive scale */}
            <h1 className="[text-wrap:balance] font-serif text-[34px] leading-[1.05] tracking-[-0.025em] sm:text-[46px] md:text-[58px]">
              {page.title}
            </h1>
            {page.summary && (
              <p className={`mt-4 max-w-[60ch] text-[15px] leading-[1.75] sm:text-[16px] ${cls.body}`}>
                {page.summary}
              </p>
            )}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <SupportLabel sourceCount={refs.length} variant="field" />
              <span className={`text-[12px] ${cls.muted}`}>{readMinutes(page)} min read</span>
            </div>
          </div>
          {/* Archive metadata card */}
          <aside
            aria-label="Archive metadata"
            className={`h-fit rounded-2xl border p-4 sm:p-5 ${cls.panel}`}
          >
            <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
              Archive card
            </div>
            <dl className="mt-4 space-y-3 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className={cls.muted}>Read time</dt>
                <dd className="font-semibold">{readMinutes(page)} min</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className={cls.muted}>Source moments</dt>
                <dd className="font-semibold">{refs.length}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className={cls.muted}>Sourced sections</dt>
                <dd className="font-semibold">{sourcedSectionCount(page)}</dd>
              </div>
            </dl>
            <div className="mt-4">
              <SupportLabel sourceCount={refs.length} variant="field" />
            </div>
          </aside>
        </div>

        {/* Body + source rail — R2: stacked on mobile (source rail below), side-by-side on lg */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_288px] lg:gap-8">
          <article className="min-w-0 space-y-5 sm:space-y-6">
            {sections.length > 0 ? (
              sections.map((block) => {
                const content = sectionContent(block);
                return (
                  <section key={block.id} className={`rounded-2xl border p-5 sm:p-6 md:p-7 ${cls.panel}`}>
                    {/* R2: text-balance on section headings */}
                    <h2 className="[text-wrap:balance] font-serif text-[19px] leading-[1.3] tracking-[-0.01em] sm:text-[20px]">
                      {content.heading ?? 'Untitled section'}
                    </h2>
                    <p className={`mt-3.5 max-w-[62ch] text-[14px] leading-[1.78] ${cls.body}`}>
                      {content.body ?? 'No section body was generated.'}
                    </p>
                    {(content.sourceRefs ?? []).length > 0 ? (
                      <div className="mt-4 space-y-2.5 sm:mt-5">
                        {(content.sourceRefs ?? []).slice(0, 2).map((ref) => (
                          <SourceMomentCard key={ref.segmentId} source={ref} variant="field" />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 sm:mt-5">
                        <TemplateEmptyState
                          variant="field"
                          label="Evidence status"
                          message="This section is published without a linked source moment yet."
                        />
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              <TemplateEmptyState
                variant="field"
                label="Page structure"
                message="This published page does not contain generated sections."
              />
            )}
          </article>
          {/* R2: source rail renders below article on mobile */}
          <div className="min-w-0">
            <SourceRail refs={refs} variant="field" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------
export function PublicHubHome(props: HubHomeProps) {
  const template = getHubTemplate(props.hub.theme);
  if (template.id === 'midnight') return <PlaybookOsHome {...props} />;
  if (template.id === 'field') return <StudioVaultHome {...props} />;
  return <EditorialAtlasHome {...props} />;
}

export function PublicHubDetail(props: HubDetailProps) {
  const template = getHubTemplate(props.hub.theme);
  if (template.id === 'midnight') return <PlaybookOsDetail {...props} />;
  if (template.id === 'field') return <StudioVaultDetail {...props} />;
  return <EditorialAtlasDetail {...props} />;
}
