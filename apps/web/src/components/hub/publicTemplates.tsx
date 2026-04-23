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
    card: 'border-rule bg-paper transition-all duration-150 hover:shadow-1 hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber',
    // Status badges
    supportStrong: 'border-sage/30 bg-sage/10 text-sage',
    supportLimited: 'border-amber/30 bg-amber/10 text-amber-ink',
    // Divider
    rule: 'border-rule',
    // Sidebar nav active
    navActive: 'bg-paper-2 text-ink',
    navIdle: 'text-ink-4 hover:text-ink hover:bg-paper-2',
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
    card: 'border-[#263240] bg-[#0f151c] transition-all duration-150 hover:border-[#3a4f5e] hover:bg-[#131b24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#c8ef60]',
    supportStrong: 'border-[#c8ef60]/25 bg-[#c8ef60]/8 text-[#c8ef60]',
    supportLimited: 'border-[#f0b350]/25 bg-[#f0b350]/8 text-[#f0b350]',
    rule: 'border-[#263240]',
    navActive: 'bg-[#0f151c] text-[#eef5ef] border-[#263240]',
    navIdle: 'text-[#7e9188] border-transparent hover:text-[#eef5ef] hover:bg-[#0a1016]',
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
    card: 'border-[#c9b990] bg-[#fdf7e8] transition-all duration-150 hover:shadow-[0_4px_16px_rgba(47,39,27,0.08)] hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7a4e22]',
    supportStrong: 'border-[#5a8a68]/30 bg-[#5a8a68]/8 text-[#3f6b4e]',
    supportLimited: 'border-[#7a4e22]/25 bg-[#7a4e22]/8 text-[#7a4e22]',
    rule: 'border-[#c9b990]',
    navActive: 'bg-[#f5e9cc] text-[#2f271b] border-[#c9b990]',
    navIdle: 'text-[#6e5f45] border-transparent hover:text-[#2f271b] hover:bg-[#f5e9cc]',
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

export function SourceMomentCard({
  source,
  variant,
}: {
  source: SourceReferenceView;
  variant: TemplateVariant;
}) {
  const cls = styles[variant];
  return (
    <div className={`rounded-lg border p-4 ${cls.soft}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${cls.accent}`}>
        {formatTime(source.startMs)}–{formatTime(source.endMs)}
      </div>
      <div className="mt-1.5 text-[13px] font-medium leading-snug">
        {source.title ?? 'Source video'}
      </div>
      <p className={`mt-2 text-[12px] leading-[1.6] ${cls.body}`}>
        &ldquo;{source.quote}&rdquo;
      </p>
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open source: ${source.title ?? 'Source video'}`}
          className={`mt-2.5 inline-flex text-[12px] font-medium underline-offset-3 hover:underline ${cls.accent} transition-opacity duration-150 hover:opacity-80`}
        >
          Open source ↗
        </a>
      )}
    </div>
  );
}

// Source rail — right column on detail pages
export function SourceRail({
  refs,
  variant,
}: {
  refs: SourceReferenceView[];
  variant: TemplateVariant;
}) {
  const cls = styles[variant];

  if (refs.length === 0) {
    return (
      <aside aria-label="Source moments">
        <div
          className={`rounded-lg border px-4 py-6 text-[13px] leading-relaxed ${cls.soft} ${cls.muted}`}
        >
          <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] mb-2">
            Source moments
          </span>
          No source moments were linked to this page.
        </div>
      </aside>
    );
  }

  return (
    <aside aria-label={`Source moments (${refs.length})`} className="space-y-3">
      <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${cls.muted}`}>
        Source moments / {refs.length}
      </div>
      <div className="space-y-2.5">
        {refs.slice(0, 6).map((ref) => (
          <SourceMomentCard key={ref.segmentId} source={ref} variant={variant} />
        ))}
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
  return (
    <Link
      href={`/h/${manifest.subdomain}/${page.slug}`}
      className={`block rounded-lg border p-4 ${cls.card}`}
      aria-label={`${page.title} — ${readMinutes(page)} min read`}
    >
      <div className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${cls.muted}`}>
        No.&thinsp;{(page.position + 1).toString().padStart(2, '0')} &middot; {readMinutes(page)}&thinsp;min read
      </div>
      <h3
        className={`mt-2 ${
          compact
            ? 'text-[14px] font-semibold leading-snug'
            : 'font-serif text-[17px] leading-[1.3]'
        }`}
      >
        {page.title}
      </h3>
      {!compact && page.summary && (
        <p className={`mt-2 max-w-prose text-[13px] leading-[1.65] ${cls.body}`}>
          {page.summary}
        </p>
      )}
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <SupportLabel sourceCount={refs.length} variant={variant} />
        <span className={`text-[11px] ${cls.muted}`}>{refs.length} moments</span>
      </div>
    </Link>
  );
}

// Empty state — intentional, not apologetic
export function TemplateEmptyState({
  variant,
  message,
}: {
  variant: TemplateVariant;
  message: string;
}) {
  const cls = styles[variant];
  return (
    <div
      role="status"
      className={`rounded-lg border px-5 py-8 text-center text-[13px] leading-relaxed ${cls.soft} ${cls.muted}`}
    >
      <span className="block text-[10px] font-semibold uppercase tracking-[0.1em] mb-2 opacity-60">
        Note
      </span>
      {message}
    </div>
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

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* Top nav bar */}
      <header className={`sticky top-0 z-10 border-b px-6 py-3.5 backdrop-blur-sm ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`font-serif text-[18px] tracking-[-0.02em] ${cls.navLink}`}
            aria-label={`${manifest.title} — home`}
          >
            Creator<span className={cls.accent}>Canon</span>
          </Link>
          <nav aria-label="Hub navigation" className={`hidden gap-8 text-[13px] md:flex ${cls.muted}`}>
            <a href="#start" className={cls.navLink}>Start here</a>
            <a href="#atlas" className={cls.navLink}>The atlas</a>
          </nav>
          <span className={`font-mono text-[11px] tabular-nums ${cls.muted}`} aria-label="Release ID">
            {manifest.releaseId.slice(0, 8)}
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1180px] px-6 pt-16 pb-12 md:pt-20 md:pb-16">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${cls.muted}`}>
          Editorial Atlas
        </div>
        <h1 className="mt-4 max-w-[820px] font-serif text-[42px] leading-[1.04] tracking-[-0.03em] md:text-[68px]">
          {manifest.title}
        </h1>
        <p className={`mt-5 max-w-[640px] text-[16px] leading-[1.7] ${cls.body}`}>
          {overview.summary ?? 'A source-linked subject atlas generated from the creator archive.'}
        </p>
        {/* Stats strip */}
        <dl className={`mt-10 grid gap-px border-y ${cls.rule}`}>
          <div className={`grid grid-cols-2 gap-px md:grid-cols-4 ${cls.rule}`}>
            {[
              { label: 'Pages', value: manifest.pages.length },
              { label: 'Source moments', value: totalSources },
              { label: 'Format', value: 'Subject atlas' },
              {
                label: 'Published',
                value: release.liveAt?.toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                }) ?? 'Live',
              },
            ].map(({ label, value }) => (
              <div
                key={label}
                className={`px-5 py-4 bg-paper`}
              >
                <dt className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
                  {label}
                </dt>
                <dd className="mt-1.5 text-[22px] font-serif leading-none tracking-tight">
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
        className="mx-auto max-w-[1180px] px-6 pb-12"
        aria-labelledby="start-heading"
      >
        <div className={`rounded-xl border p-6 md:p-8 ${cls.panel}`}>
          <div className={`grid gap-6 md:grid-cols-[160px_1fr]`}>
            <div>
              <div
                id="start-heading"
                className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}
              >
                Start here
              </div>
            </div>
            <div>
              <h2 className="font-serif text-[22px] leading-[1.25] tracking-[-0.01em]">
                {overview.title}
              </h2>
              <p className={`mt-3 max-w-[640px] text-[14px] leading-[1.75] ${cls.body}`}>
                {firstSection(overview)?.body ?? overview.summary}
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
        className="mx-auto max-w-[1180px] px-6 pb-20"
        aria-labelledby="atlas-heading"
      >
        <h2
          id="atlas-heading"
          className={`mb-4 text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.muted}`}
        >
          The atlas
        </h2>
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

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* Nav */}
      <header className={`sticky top-0 z-10 border-b px-6 py-3.5 backdrop-blur-sm ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`text-[13px] ${cls.muted} ${cls.navLink}`}
            aria-label="Back to atlas index"
          >
            ← Back to atlas
          </Link>
          <span className={`hidden font-mono text-[11px] md:block ${cls.muted}`}>
            {manifest.title}
          </span>
        </div>
      </header>

      {/* Three-column layout */}
      <div className="mx-auto grid max-w-[1180px] gap-10 px-6 py-10 lg:grid-cols-[160px_1fr_260px]">

        {/* Left: page nav / TOC stub */}
        <aside className={`hidden lg:block`} aria-label="Page position">
          <div
            className={`sticky top-20 text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}
          >
            <div>Lesson {(page.position + 1).toString().padStart(2, '0')}</div>
            <div className={`mt-2 w-8 border-t ${cls.rule}`} />
            <div className="mt-3 space-y-1">
              {sections.slice(0, 8).map((block) => {
                const content = sectionContent(block);
                return (
                  <div
                    key={block.id}
                    className={`truncate text-[11px] leading-5 ${cls.muted}`}
                    title={content.heading}
                  >
                    {content.heading}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Centre: article body */}
        <main>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
            Lesson No.&thinsp;{(page.position + 1).toString().padStart(2, '0')}
          </div>
          <h1 className="mt-3 font-serif text-[38px] leading-[1.06] tracking-[-0.025em] md:text-[54px]">
            {page.title}
          </h1>
          {page.summary && (
            <p className={`mt-4 font-serif text-[18px] italic leading-[1.6] ${cls.body}`}>
              {page.summary}
            </p>
          )}
          <div className={`mt-6 flex flex-wrap items-center gap-3 border-y py-4 ${cls.rule}`}>
            <SupportLabel sourceCount={refs.length} variant="paper" />
            <span className={`text-[12px] ${cls.muted}`}>{readMinutes(page)} min read</span>
            <span className={`text-[12px] ${cls.muted}`}>{refs.length} source moments</span>
          </div>

          <div className="mt-8 space-y-10">
            {sections.length > 0 ? (
              sections.map((block) => {
                const content = sectionContent(block);
                return (
                  <section key={block.id}>
                    <h2 className="font-serif text-[20px] leading-[1.3] tracking-[-0.01em]">
                      {content.heading ?? 'Untitled section'}
                    </h2>
                    <p
                      className={`mt-3 max-w-[65ch] text-[15px] leading-[1.78] ${cls.body}`}
                    >
                      {content.body ?? 'No section body was generated.'}
                    </p>
                    {(content.sourceRefs ?? []).slice(0, 1).map((ref) => (
                      <div key={ref.segmentId} className="mt-5">
                        <SourceMomentCard source={ref} variant="paper" />
                      </div>
                    ))}
                  </section>
                );
              })
            ) : (
              <TemplateEmptyState
                variant="paper"
                message="This published page does not contain generated sections."
              />
            )}
          </div>
        </main>

        {/* Right: source rail */}
        <SourceRail refs={refs} variant="paper" />
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

  return (
    <div className={`min-h-screen ${cls.page}`}>
      <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-5 md:grid-cols-[256px_1fr]">

        {/* Left sidebar — sticky nav */}
        <nav
          aria-label="Playbook navigation"
          className={`rounded-2xl border p-5 md:sticky md:top-5 md:h-[calc(100vh-40px)] md:overflow-y-auto ${cls.panel}`}
        >
          <div
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}
            aria-hidden="true"
          >
            Playbook OS
          </div>
          <h1 className="mt-3 font-serif text-[18px] leading-[1.3] tracking-[-0.01em]">
            {manifest.title}
          </h1>
          <p className={`mt-2 text-[12px] leading-[1.6] ${cls.muted}`}>
            {release.liveAt?.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
            }) ?? 'Live'}
          </p>
          <div className={`my-4 border-t ${cls.rule}`} />
          <ul className="space-y-1" role="list">
            {manifest.pages.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/h/${manifest.subdomain}/${p.slug}`}
                  className={`block rounded-md border px-3 py-2 text-[13px] leading-snug transition-colors duration-150 ${cls.navIdle}`}
                >
                  <span className={`mr-2 font-mono text-[10px] ${cls.accent}`}>
                    {(p.position + 1).toString().padStart(2, '0')}
                  </span>
                  {p.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Main content */}
        <div className="space-y-5 min-w-0">
          {/* Hero card */}
          <div className={`rounded-2xl border p-6 md:p-10 ${cls.panel}`}>
            <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
              Command center &middot; {release.liveAt?.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) ?? 'Live'}
            </div>
            <h2 className="mt-4 max-w-[700px] font-serif text-[34px] leading-[1.06] tracking-[-0.02em] md:text-[52px]">
              Run the archive like an operating system.
            </h2>
            <p className={`mt-4 max-w-[580px] text-[15px] leading-[1.7] ${cls.body}`}>
              {overview.summary ?? 'A tactical readout generated from the creator archive.'}
            </p>
            <Link
              href={`/h/${manifest.subdomain}/${overview.slug}`}
              className={`mt-6 inline-flex h-9 items-center rounded-md px-5 text-[13px] ${cls.button}`}
            >
              Open first module
            </Link>
            {/* Stats row */}
            <dl className="mt-8 grid grid-cols-3 gap-3">
              {[
                { label: 'Modules', value: manifest.pages.length },
                { label: 'Source moments', value: totalSources },
                { label: 'Mode', value: 'Read-only' },
              ].map(({ label, value }) => (
                <div key={label} className={`rounded-lg border px-4 py-3 ${cls.soft}`}>
                  <dt className={`text-[10px] font-semibold uppercase tracking-[0.1em] ${cls.muted}`}>
                    {label}
                  </dt>
                  <dd className="mt-1 text-[22px] font-serif leading-none tracking-tight">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Module grid */}
          <div
            className="grid gap-3 sm:grid-cols-2"
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

  return (
    <div className={`min-h-screen ${cls.page}`}>
      <div className="mx-auto grid max-w-[1280px] gap-5 px-4 py-5 lg:grid-cols-[256px_1fr_268px]">

        {/* Sidebar */}
        <nav
          aria-label="Module navigation"
          className={`rounded-2xl border p-5 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] lg:overflow-y-auto ${cls.panel}`}
        >
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent} ${cls.navLink}`}
            aria-label="Back to command center"
          >
            ← Back to OS
          </Link>
          <p className={`mt-3 text-[13px] font-medium leading-snug`}>{manifest.title}</p>
          <div className={`my-4 border-t ${cls.rule}`} />
          <ul className="space-y-1" role="list">
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
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Article */}
        <article className={`rounded-2xl border p-6 md:p-8 min-w-0 ${cls.panel}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
            Module {(page.position + 1).toString().padStart(2, '0')}
          </div>
          <h1 className="mt-3 font-serif text-[34px] leading-[1.06] tracking-[-0.02em] md:text-[50px]">
            {page.title}
          </h1>
          {page.summary && (
            <p className={`mt-4 max-w-[58ch] text-[15px] leading-[1.7] ${cls.body}`}>
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

          <div className="mt-8 space-y-4">
            {sections.length > 0 ? (
              sections.map((block, index) => {
                const content = sectionContent(block);
                return (
                  <section key={block.id} className={`rounded-xl border p-5 ${cls.soft}`}>
                    <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
                      Step {(index + 1).toString().padStart(2, '0')}
                    </div>
                    <h2 className="mt-2 text-[16px] font-semibold leading-[1.3] tracking-[-0.005em]">
                      {content.heading ?? 'Untitled section'}
                    </h2>
                    <p className={`mt-3 max-w-[60ch] text-[14px] leading-[1.72] ${cls.body}`}>
                      {content.body ?? 'No section body was generated.'}
                    </p>
                    {(content.sourceRefs ?? []).length > 0 ? (
                      <div className="mt-4 space-y-2.5">
                        {(content.sourceRefs ?? []).slice(0, 2).map((ref) => (
                          <SourceMomentCard key={ref.segmentId} source={ref} variant="midnight" />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4">
                        <TemplateEmptyState
                          variant="midnight"
                          message="Limited source support for this block."
                        />
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              <TemplateEmptyState
                variant="midnight"
                message="This published page does not contain generated sections."
              />
            )}
          </div>
        </article>

        {/* Source rail */}
        <SourceRail refs={refs} variant="midnight" />
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

  return (
    <div className={`min-h-screen ${cls.page}`}>
      {/* Header */}
      <header className={`border-b px-6 py-4 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`font-serif text-[20px] tracking-[-0.02em] ${cls.navLink}`}
            aria-label={`${manifest.title} — vault index`}
          >
            {template.name}
          </Link>
          <span className={`hidden text-[11px] font-semibold uppercase tracking-[0.1em] md:block ${cls.muted}`}>
            Public archive
          </span>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-[1180px] px-6 pt-14 pb-10 md:pt-20 md:pb-14">
        <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
          {template.name}
        </div>
        <h1 className="mt-4 max-w-[820px] font-serif text-[40px] leading-[1.04] tracking-[-0.03em] md:text-[64px]">
          {manifest.title}
        </h1>
        <p className={`mt-5 max-w-[600px] text-[16px] leading-[1.75] ${cls.body}`}>
          {overview.summary ?? 'A warm source-forward vault generated from the creator archive.'}
        </p>

        {/* Archive note card */}
        <div className={`mt-10 rounded-2xl border p-6 md:p-8 ${cls.panel}`}>
          <div className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${cls.muted}`}>
            Archive note
          </div>
          <p className={`mt-3 max-w-[680px] font-serif text-[17px] italic leading-[1.65] ${cls.body}`}>
            This preview contains {manifest.pages.length} generated pages and{' '}
            {totalSources} source moments. Built as a read-only knowledge vault from the creator
            archive.
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

      {/* Collections grid */}
      <section
        className="mx-auto max-w-[1180px] px-6 pb-20"
        aria-labelledby="collections-heading"
      >
        <h2
          id="collections-heading"
          className={`mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.muted}`}
        >
          Collections
        </h2>
        <div className="grid gap-3.5 sm:grid-cols-2 md:grid-cols-3">
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
      {/* Header */}
      <header className={`border-b px-6 py-4 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between">
          <Link
            href={`/h/${manifest.subdomain}`}
            className={`text-[13px] ${cls.muted} ${cls.navLink}`}
            aria-label="Back to vault index"
          >
            ← Vault index
          </Link>
          <span className={`hidden text-[11px] font-semibold uppercase tracking-[0.1em] md:block ${cls.muted}`}>
            {manifest.title}
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-6 py-10">
        {/* Eyebrow */}
        <div className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${cls.accent}`}>
          Vault lesson &middot; No.&thinsp;{(page.position + 1).toString().padStart(2, '0')}
        </div>

        {/* Title + archive card */}
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_260px]">
          <div>
            <h1 className="font-serif text-[38px] leading-[1.05] tracking-[-0.025em] md:text-[58px]">
              {page.title}
            </h1>
            {page.summary && (
              <p className={`mt-4 max-w-[60ch] text-[16px] leading-[1.75] ${cls.body}`}>
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
            className={`h-fit rounded-2xl border p-5 ${cls.panel}`}
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
            </dl>
            <div className="mt-4">
              <SupportLabel sourceCount={refs.length} variant="field" />
            </div>
          </aside>
        </div>

        {/* Body + source rail */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_288px]">
          <article className="min-w-0 space-y-6">
            {sections.length > 0 ? (
              sections.map((block) => {
                const content = sectionContent(block);
                return (
                  <section key={block.id} className={`rounded-2xl border p-6 md:p-7 ${cls.panel}`}>
                    <h2 className="font-serif text-[20px] leading-[1.3] tracking-[-0.01em]">
                      {content.heading ?? 'Untitled section'}
                    </h2>
                    <p className={`mt-3.5 max-w-[62ch] text-[14px] leading-[1.78] ${cls.body}`}>
                      {content.body ?? 'No section body was generated.'}
                    </p>
                    {(content.sourceRefs ?? []).length > 0 ? (
                      <div className="mt-5 space-y-2.5">
                        {(content.sourceRefs ?? []).slice(0, 2).map((ref) => (
                          <SourceMomentCard key={ref.segmentId} source={ref} variant="field" />
                        ))}
                      </div>
                    ) : (
                      <div className="mt-5">
                        <TemplateEmptyState
                          variant="field"
                          message="Limited source support for this section."
                        />
                      </div>
                    )}
                  </section>
                );
              })
            ) : (
              <TemplateEmptyState
                variant="field"
                message="This published page does not contain generated sections."
              />
            )}
          </article>
          <SourceRail refs={refs} variant="field" />
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
