// apps/web/src/app/h/[hubSlug]/pages/[pageSlug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { EvidenceQualityBadge } from '@/components/hub/EditorialAtlas/blocks/EvidenceQualityBadge';
import { MetaTagPill } from '@/components/hub/EditorialAtlas/blocks/MetaTagPill';
import { SectionRenderer } from '@/components/hub/EditorialAtlas/blocks/SectionRenderer';
import { SourceRail } from '@/components/hub/EditorialAtlas/blocks/SourceRail';
import { ArtifactCard, QuickWinCard } from '@/components/hub/EditorialAtlas/blocks/WorkbenchCards';
import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { getPageRoute, getPagesRoute, getTopicRoute } from '@/lib/hub/routes';
import { deriveWorkbenchPageView } from '@/lib/hub/workbench';
import { loadEditorialAtlasManifest } from '../../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; pageSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadEditorialAtlasManifest(params.hubSlug);
  const page = manifest.pages.find((p) => p.slug === params.pageSlug && p.status === 'published');
  if (!page) return { title: 'Page not found' };
  return {
    title: `${page.title} — ${manifest.title}`,
    description: page.summaryPlainText,
    alternates: { canonical: getPageRoute(params.hubSlug, page.slug) },
  };
}

export default async function HubPageDetail({ params }: { params: { hubSlug: string; pageSlug: string } }) {
  const { manifest: m } = await loadEditorialAtlasManifest(params.hubSlug);
  const page = m.pages.find((p) => p.slug === params.pageSlug && p.status === 'published');
  if (!page) notFound();

  const sourcesById = Object.fromEntries(m.sources.map((s) => [s.id, s]));
  const citationsById = Object.fromEntries(page.citations.map((c) => [c.id, c]));
  const primaryTopic = m.topics.find((t) => t.slug === page.topicSlugs[0]);
  const pageView = deriveWorkbenchPageView(m, page);

  return (
    <HubShell
      manifest={m}
      activePathname={getPageRoute(params.hubSlug, page.slug)}
      rightRail={<SourceRail citations={page.citations} sourcesById={sourcesById} />}
    >
      <Breadcrumb crumbs={[
        { label: 'All pages', href: getPagesRoute(params.hubSlug) },
        ...(primaryTopic ? [{ label: primaryTopic.title, href: getTopicRoute(params.hubSlug, primaryTopic.slug) }] : []),
        { label: page.title },
      ]} />

      <section className="mt-4 space-y-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <MetaTagPill accent={primaryTopic?.accentColor}>{page.type}</MetaTagPill>
            <EvidenceQualityBadge quality={page.evidenceQuality} />
            <span className="rounded-full bg-[#F2EBDA] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#6B5F50]">{pageView.intent}</span>
          </div>
          <h1 className="mt-4 max-w-[780px] text-[40px] font-semibold leading-[1.05] tracking-[-0.02em] text-[#1A1612]">{page.title}</h1>
          <p className="mt-4 max-w-[700px] text-[16px] leading-[1.6] text-[#3D352A]">{page.summary}</p>
          <p className="mt-3 text-[11px] text-[#9A8E7C]">
            {page.estimatedReadMinutes} min read &middot; {page.citationCount} citations &middot; Updated {new Date(page.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
            {page.reviewedBy ? <> &middot; Reviewed by {page.reviewedBy}</> : null}
          </p>
        </div>
        <aside className="max-w-[760px] rounded-[12px] border border-[#D8D0C0] bg-white p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Outcome</p>
          <p className="mt-2 text-[14px] font-medium leading-[1.45] text-[#1A1612]">{pageView.outcome}</p>
          <ul className="mt-4 space-y-2">
            {pageView.useWhen.map((item) => (
              <li key={item} className="flex gap-2 text-[12px] leading-[1.45] text-[#6B5F50]">
                <span aria-hidden className="mt-1 size-1.5 rounded-full bg-[#3C8A5F]" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      {pageView.primaryArtifact ? (
        <section className="mt-10">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Use this first</h2>
          <div className="mt-3 max-w-[760px]">
            <ArtifactCard artifact={pageView.primaryArtifact} hubSlug={params.hubSlug} />
          </div>
        </section>
      ) : null}

      <div className="mt-10 max-w-[760px] space-y-8">
        {page.sections.map((s, i) => (
          <SectionRenderer key={i} section={s} citationsById={citationsById} sourcesById={sourcesById} />
        ))}
      </div>

      {pageView.nextPages.length > 0 ? (
        <section className="mt-14 border-t border-[#E5DECF] pt-8">
          <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Next best steps</h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {pageView.nextPages.map((nextPage) => <QuickWinCard key={nextPage.id} page={nextPage} hubSlug={params.hubSlug} />)}
          </div>
        </section>
      ) : null}
    </HubShell>
  );
}
