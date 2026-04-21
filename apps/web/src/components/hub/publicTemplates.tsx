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

const styles = {
  paper: {
    page: 'bg-paper-studio text-ink',
    panel: 'border-rule bg-paper',
    soft: 'border-rule bg-paper-2',
    muted: 'text-ink-4',
    body: 'text-ink-2',
    accent: 'text-amber-ink',
    button: 'bg-ink text-paper hover:opacity-90',
    supportStrong: 'border-sage/30 bg-sage/10 text-sage',
    supportLimited: 'border-amber/30 bg-amber/10 text-amber-ink',
  },
  midnight: {
    page: 'bg-[#070b10] text-[#eef5ef]',
    panel: 'border-[#263240] bg-[#0f151c]',
    soft: 'border-[#263240] bg-[#0a1016]',
    muted: 'text-[#94a39b]',
    body: 'text-[#c3d0c9]',
    accent: 'text-[#d7ff70]',
    button: 'bg-[#d7ff70] text-[#07100d] hover:opacity-90',
    supportStrong: 'border-[#d7ff70]/30 bg-[#d7ff70]/10 text-[#d7ff70]',
    supportLimited: 'border-[#f2b85b]/30 bg-[#f2b85b]/10 text-[#f2b85b]',
  },
  field: {
    page: 'bg-[#f4ead3] text-[#2f271b]',
    panel: 'border-[#cdbf9f] bg-[#fffaf0]',
    soft: 'border-[#cdbf9f] bg-[#f8ebcc]',
    muted: 'text-[#76684f]',
    body: 'text-[#5f513d]',
    accent: 'text-[#8e5c2c]',
    button: 'bg-[#2f271b] text-[#fff8e7] hover:opacity-90',
    supportStrong: 'border-[#5a8a68]/30 bg-[#5a8a68]/10 text-[#40684c]',
    supportLimited: 'border-[#8e5c2c]/30 bg-[#8e5c2c]/10 text-[#8e5c2c]',
  },
} satisfies Record<TemplateVariant, Record<string, string>>;

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
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-widest ${strong ? cls.supportStrong : cls.supportLimited}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
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
    <div className={`rounded-lg border p-3 ${cls.soft}`}>
      <div className={`text-[10px] font-medium uppercase tracking-widest ${cls.accent}`}>
        Source moment / {formatTime(source.startMs)}-{formatTime(source.endMs)}
      </div>
      <div className="mt-2 text-body-sm font-medium">{source.title ?? 'Source video'}</div>
      <p className={`mt-2 text-caption leading-5 ${cls.body}`}>&quot;{source.quote}&quot;</p>
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className={`mt-2 inline-flex text-caption font-medium underline-offset-4 hover:underline ${cls.accent}`}
        >
          Open source
        </a>
      )}
    </div>
  );
}

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
      <div className={`rounded-lg border p-4 text-body-sm ${cls.soft} ${cls.muted}`}>
        Limited source support for this page.
      </div>
    );
  }

  return (
    <aside className="space-y-3">
      <div className={`text-caption uppercase tracking-widest ${cls.muted}`}>
        Source moments / {refs.length}
      </div>
      {refs.slice(0, 6).map((ref) => (
        <SourceMomentCard key={ref.segmentId} source={ref} variant={variant} />
      ))}
    </aside>
  );
}

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
      className={`block rounded-lg border p-4 transition hover:-translate-y-0.5 ${cls.panel}`}
    >
      <div className={`text-[10px] uppercase tracking-widest ${cls.muted}`}>
        No. {(page.position + 1).toString().padStart(2, '0')} / {readMinutes(page)} min read
      </div>
      <h3 className={`mt-2 ${compact ? 'text-body-md' : 'font-serif text-heading-sm'} leading-snug`}>
        {page.title}
      </h3>
      {!compact && page.summary && (
        <p className={`mt-3 text-body-sm leading-6 ${cls.body}`}>{page.summary}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SupportLabel sourceCount={refs.length} variant={variant} />
        <span className={`text-caption ${cls.muted}`}>{refs.length} source moments</span>
      </div>
    </Link>
  );
}

export function TemplateEmptyState({
  variant,
  message,
}: {
  variant: TemplateVariant;
  message: string;
}) {
  const cls = styles[variant];
  return (
    <div className={`rounded-lg border p-6 text-body-sm ${cls.soft} ${cls.muted}`}>
      {message}
    </div>
  );
}

function EditorialAtlasHome({ manifest, release }: HubHomeProps) {
  const template = getHubTemplate('paper');
  const cls = styles.paper;
  const overview = overviewPage(manifest);
  return (
    <main className={`min-h-screen ${cls.page}`}>
      <header className={`border-b px-6 py-4 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <Link href={`/h/${manifest.subdomain}`} className="font-serif text-heading-sm">
            Creator<span className={cls.accent}>Canon</span>
          </Link>
          <nav className={`hidden gap-6 text-body-sm md:flex ${cls.muted}`}>
            <a href="#start">Start here</a>
            <a href="#atlas">The atlas</a>
            <a href="#sources">Sources</a>
          </nav>
          <span className={`font-mono text-[11px] ${cls.muted}`}>
            Release {manifest.releaseId.slice(0, 8)}
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-[1180px] px-6 py-12 md:py-16">
        <div className={`text-eyebrow uppercase tracking-widest ${cls.muted}`}>
          {template.name} / Public preview
        </div>
        <h1 className="mt-4 max-w-[900px] font-serif text-[44px] leading-[1.05] tracking-[-0.03em] md:text-[72px]">
          {manifest.title}
        </h1>
        <p className={`mt-6 max-w-[760px] text-body-lg leading-8 ${cls.body}`}>
          {overview.summary ?? 'A source-linked subject atlas generated from the creator archive.'}
        </p>
        <div className={`mt-8 grid gap-4 border-y py-5 md:grid-cols-4 ${cls.muted}`}>
          <div><span className="block text-caption uppercase tracking-widest">Pages</span><b className="mt-1 block text-ink">{manifest.pages.length}</b></div>
          <div><span className="block text-caption uppercase tracking-widest">Sources</span><b className="mt-1 block text-ink">{manifest.pages.reduce((sum, page) => sum + pageSourceRefs(page).length, 0)}</b></div>
          <div><span className="block text-caption uppercase tracking-widest">Format</span><b className="mt-1 block text-ink">Subject atlas</b></div>
          <div><span className="block text-caption uppercase tracking-widest">Live</span><b className="mt-1 block text-ink">{release.liveAt?.toLocaleDateString() ?? 'Published'}</b></div>
        </div>
      </section>

      <section id="start" className={`mx-auto max-w-[1180px] px-6 pb-8`}>
        <div className={`grid gap-6 border-y p-6 md:grid-cols-[220px_1fr] ${cls.panel}`}>
          <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>Start here</div>
          <div>
            <h2 className="font-serif text-heading-lg">{overview.title}</h2>
            <p className={`mt-3 max-w-[760px] text-body-md leading-7 ${cls.body}`}>
              {firstSection(overview)?.body ?? overview.summary}
            </p>
            <Link href={`/h/${manifest.subdomain}/${overview.slug}`} className={`mt-5 inline-flex h-9 items-center rounded-md px-4 text-body-sm font-medium ${cls.button}`}>
              Begin reading
            </Link>
          </div>
        </div>
      </section>

      <section id="atlas" className="mx-auto max-w-[1180px] px-6 pb-16">
        <div className={`mb-4 text-caption uppercase tracking-widest ${cls.muted}`}>
          The atlas / filed by generated page
        </div>
        <div className="space-y-3">
          {manifest.pages.map((page) => (
            <PageIndexItem key={page.slug} manifest={manifest} page={page} variant="paper" />
          ))}
        </div>
      </section>
    </main>
  );
}

function PlaybookOsHome({ manifest, release }: HubHomeProps) {
  const template = getHubTemplate('midnight');
  const cls = styles.midnight;
  const overview = overviewPage(manifest);
  return (
    <main className={`min-h-screen ${cls.page}`}>
      <div className="mx-auto grid max-w-[1280px] gap-6 px-5 py-5 md:grid-cols-[260px_1fr]">
        <aside className={`rounded-2xl border p-5 md:sticky md:top-5 md:h-[calc(100vh-40px)] ${cls.panel}`}>
          <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>Playbook OS</div>
          <h1 className="mt-3 font-serif text-heading-lg leading-tight">{manifest.title}</h1>
          <p className={`mt-3 text-body-sm leading-6 ${cls.muted}`}>{template.tagline}</p>
          <nav className="mt-8 space-y-2">
            {manifest.pages.map((page) => (
              <Link key={page.slug} href={`/h/${manifest.subdomain}/${page.slug}`} className={`block rounded-md border px-3 py-2 text-body-sm ${cls.soft}`}>
                {page.title}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="space-y-6">
          <div className={`rounded-2xl border p-6 md:p-8 ${cls.panel}`}>
            <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>Command center / {release.liveAt?.toLocaleDateString() ?? 'Live'}</div>
            <h2 className="mt-3 max-w-[820px] font-serif text-[38px] leading-[1.05] md:text-[58px]">
              Run the archive like an operating system.
            </h2>
            <p className={`mt-5 max-w-[720px] text-body-lg leading-8 ${cls.body}`}>
              {overview.summary ?? 'A tactical readout generated from the creator archive.'}
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className={`rounded-lg border p-4 ${cls.soft}`}><span className={cls.muted}>Pages</span><b className="mt-1 block text-heading-sm">{manifest.pages.length}</b></div>
              <div className={`rounded-lg border p-4 ${cls.soft}`}><span className={cls.muted}>Sources</span><b className="mt-1 block text-heading-sm">{manifest.pages.reduce((sum, page) => sum + pageSourceRefs(page).length, 0)}</b></div>
              <div className={`rounded-lg border p-4 ${cls.soft}`}><span className={cls.muted}>Mode</span><b className="mt-1 block text-heading-sm">Read-only alpha</b></div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {manifest.pages.map((page) => (
              <PageIndexItem key={page.slug} manifest={manifest} page={page} variant="midnight" />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StudioVaultHome({ manifest, release }: HubHomeProps) {
  const template = getHubTemplate('field');
  const cls = styles.field;
  const overview = overviewPage(manifest);
  return (
    <main className={`min-h-screen ${cls.page}`}>
      <header className={`border-b px-6 py-4 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between">
          <Link href={`/h/${manifest.subdomain}`} className="font-serif text-heading-md">Studio Vault</Link>
          <span className={`text-caption uppercase tracking-widest ${cls.muted}`}>Public archive</span>
        </div>
      </header>

      <section className="mx-auto max-w-[1180px] px-6 py-12 md:py-16">
        <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>{template.name}</div>
        <h1 className="mt-3 max-w-[900px] font-serif text-[42px] leading-[1.05] tracking-[-0.03em] md:text-[68px]">
          {manifest.title}
        </h1>
        <p className={`mt-5 max-w-[740px] text-body-lg leading-8 ${cls.body}`}>
          {overview.summary ?? 'A warm source-forward vault generated from the creator archive.'}
        </p>
        <div className={`mt-8 rounded-2xl border p-5 ${cls.panel}`}>
          <div className={`text-caption uppercase tracking-widest ${cls.muted}`}>Archive note</div>
          <p className={`mt-3 max-w-[780px] font-serif text-heading-sm leading-8 ${cls.body}`}>
            This preview contains {manifest.pages.length} generated pages and {manifest.pages.reduce((sum, page) => sum + pageSourceRefs(page).length, 0)} source moments. It was built as a read-only knowledge vault from the creator archive.
          </p>
          <p className={`mt-3 text-caption ${cls.muted}`}>{release.liveAt?.toLocaleDateString() ?? 'Published'}</p>
        </div>
      </section>

      <section className="mx-auto max-w-[1180px] px-6 pb-16">
        <div className={`mb-4 text-caption uppercase tracking-widest ${cls.muted}`}>Collections</div>
        <div className="grid gap-4 md:grid-cols-3">
          {manifest.pages.map((page) => (
            <PageIndexItem key={page.slug} manifest={manifest} page={page} variant="field" compact />
          ))}
        </div>
      </section>
    </main>
  );
}

function EditorialAtlasDetail({ manifest, page }: HubDetailProps) {
  const cls = styles.paper;
  const refs = pageSourceRefs(page);
  const sections = sectionBlocks(page);
  return (
    <main className={`min-h-screen ${cls.page}`}>
      <header className={`border-b px-6 py-4 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
          <Link href={`/h/${manifest.subdomain}`} className={`text-body-sm ${cls.muted}`}>Back to atlas</Link>
          <span className={`font-mono text-[11px] ${cls.muted}`}>{manifest.title}</span>
        </div>
      </header>
      <article className="mx-auto grid max-w-[1180px] gap-8 px-6 py-10 lg:grid-cols-[180px_1fr_240px]">
        <aside className={`hidden lg:block ${cls.muted}`}>
          <div className="sticky top-8 text-caption uppercase tracking-widest">On this page</div>
        </aside>
        <main>
          <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>Lesson No. {(page.position + 1).toString().padStart(2, '0')}</div>
          <h1 className="mt-3 font-serif text-[42px] leading-[1.05] tracking-[-0.025em] md:text-[58px]">{page.title}</h1>
          {page.summary && <p className={`mt-5 font-serif text-heading-sm italic leading-8 ${cls.body}`}>{page.summary}</p>}
          <div className={`mt-6 flex flex-wrap gap-3 border-y py-4 ${cls.muted}`}>
            <SupportLabel sourceCount={refs.length} variant="paper" />
            <span className="text-caption">{readMinutes(page)} min read</span>
            <span className="text-caption">{refs.length} source moments</span>
          </div>
          <div className="mt-8 space-y-8">
            {sections.length > 0 ? sections.map((block) => {
              const content = sectionContent(block);
              return (
                <section key={block.id}>
                  <h2 className="font-serif text-heading-lg">{content.heading ?? 'Untitled section'}</h2>
                  <p className={`mt-3 text-body-lg leading-8 ${cls.body}`}>{content.body ?? 'No section body was generated.'}</p>
                  {(content.sourceRefs ?? []).slice(0, 1).map((ref) => (
                    <div key={ref.segmentId} className="mt-5">
                      <SourceMomentCard source={ref} variant="paper" />
                    </div>
                  ))}
                </section>
              );
            }) : <TemplateEmptyState variant="paper" message="This published page does not contain generated sections." />}
          </div>
        </main>
        <SourceRail refs={refs} variant="paper" />
      </article>
    </main>
  );
}

function PlaybookOsDetail({ manifest, page }: HubDetailProps) {
  const cls = styles.midnight;
  const refs = pageSourceRefs(page);
  const sections = sectionBlocks(page);
  return (
    <main className={`min-h-screen ${cls.page}`}>
      <div className="mx-auto grid max-w-[1280px] gap-6 px-5 py-5 lg:grid-cols-[260px_1fr_280px]">
        <aside className={`rounded-2xl border p-5 lg:sticky lg:top-5 lg:h-[calc(100vh-40px)] ${cls.panel}`}>
          <Link href={`/h/${manifest.subdomain}`} className={`text-caption uppercase tracking-widest ${cls.accent}`}>Back to OS</Link>
          <h2 className="mt-4 font-serif text-heading-md">{manifest.title}</h2>
          <nav className="mt-6 space-y-2">
            {manifest.pages.map((item) => (
              <Link key={item.slug} href={`/h/${manifest.subdomain}/${item.slug}`} className={`block rounded-md border px-3 py-2 text-body-sm ${item.slug === page.slug ? cls.panel : cls.soft}`}>
                {item.title}
              </Link>
            ))}
          </nav>
        </aside>
        <article className={`rounded-2xl border p-6 md:p-8 ${cls.panel}`}>
          <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>Active lesson / No. {(page.position + 1).toString().padStart(2, '0')}</div>
          <h1 className="mt-3 font-serif text-[40px] leading-[1.05] md:text-[56px]">{page.title}</h1>
          {page.summary && <p className={`mt-5 text-body-lg leading-8 ${cls.body}`}>{page.summary}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <SupportLabel sourceCount={refs.length} variant="midnight" />
            <span className={`rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-widest ${cls.soft}`}>{readMinutes(page)} min</span>
          </div>
          <div className="mt-8 space-y-4">
            {sections.length > 0 ? sections.map((block, index) => {
              const content = sectionContent(block);
              return (
                <section key={block.id} className={`rounded-xl border p-5 ${cls.soft}`}>
                  <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>Step {(index + 1).toString().padStart(2, '0')}</div>
                  <h2 className="mt-2 text-heading-sm">{content.heading ?? 'Untitled section'}</h2>
                  <p className={`mt-3 text-body-md leading-7 ${cls.body}`}>{content.body ?? 'No section body was generated.'}</p>
                  <div className="mt-4 grid gap-3">
                    {(content.sourceRefs ?? []).slice(0, 2).map((ref) => (
                      <SourceMomentCard key={ref.segmentId} source={ref} variant="midnight" />
                    ))}
                    {(content.sourceRefs ?? []).length === 0 && <TemplateEmptyState variant="midnight" message="Limited source support for this block." />}
                  </div>
                </section>
              );
            }) : <TemplateEmptyState variant="midnight" message="This published page does not contain generated sections." />}
          </div>
        </article>
        <SourceRail refs={refs} variant="midnight" />
      </div>
    </main>
  );
}

function StudioVaultDetail({ manifest, page }: HubDetailProps) {
  const cls = styles.field;
  const refs = pageSourceRefs(page);
  const sections = sectionBlocks(page);
  return (
    <main className={`min-h-screen ${cls.page}`}>
      <header className={`border-b px-6 py-4 ${cls.panel}`}>
        <div className="mx-auto flex max-w-[1180px] items-center justify-between">
          <Link href={`/h/${manifest.subdomain}`} className={`text-body-sm ${cls.muted}`}>Vault index</Link>
          <span className={`text-caption uppercase tracking-widest ${cls.muted}`}>{manifest.title}</span>
        </div>
      </header>
      <section className="mx-auto max-w-[1180px] px-6 py-10">
        <div className={`text-caption uppercase tracking-widest ${cls.accent}`}>Vault lesson / No. {(page.position + 1).toString().padStart(2, '0')}</div>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_280px]">
          <div>
            <h1 className="font-serif text-[42px] leading-[1.05] tracking-[-0.025em] md:text-[64px]">{page.title}</h1>
            {page.summary && <p className={`mt-5 max-w-[760px] text-body-lg leading-8 ${cls.body}`}>{page.summary}</p>}
          </div>
          <div className={`h-fit rounded-2xl border p-5 ${cls.panel}`}>
            <div className={`text-caption uppercase tracking-widest ${cls.muted}`}>Archive card</div>
            <div className="mt-4 space-y-3 text-body-sm">
              <div className="flex justify-between gap-4"><span className={cls.muted}>Read time</span><b>{readMinutes(page)} min</b></div>
              <div className="flex justify-between gap-4"><span className={cls.muted}>Sources</span><b>{refs.length}</b></div>
              <SupportLabel sourceCount={refs.length} variant="field" />
            </div>
          </div>
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_300px]">
          <article className="space-y-6">
            {sections.length > 0 ? sections.map((block) => {
              const content = sectionContent(block);
              return (
                <section key={block.id} className={`rounded-2xl border p-6 ${cls.panel}`}>
                  <h2 className="font-serif text-heading-lg">{content.heading ?? 'Untitled section'}</h2>
                  <p className={`mt-4 text-body-md leading-7 ${cls.body}`}>{content.body ?? 'No section body was generated.'}</p>
                  {(content.sourceRefs ?? []).length > 0 ? (
                    <div className="mt-5 grid gap-3">
                      {(content.sourceRefs ?? []).slice(0, 2).map((ref) => (
                        <SourceMomentCard key={ref.segmentId} source={ref} variant="field" />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5">
                      <TemplateEmptyState variant="field" message="Limited source support for this section." />
                    </div>
                  )}
                </section>
              );
            }) : <TemplateEmptyState variant="field" message="This published page does not contain generated sections." />}
          </article>
          <SourceRail refs={refs} variant="field" />
        </div>
      </section>
    </main>
  );
}

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
