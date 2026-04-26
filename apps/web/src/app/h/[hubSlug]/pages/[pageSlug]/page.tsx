// apps/web/src/app/h/[hubSlug]/pages/[pageSlug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { MetaTagPill } from '@/components/hub/EditorialAtlas/blocks/MetaTagPill';
import { EvidenceQualityBadge } from '@/components/hub/EditorialAtlas/blocks/EvidenceQualityBadge';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { SectionRenderer } from '@/components/hub/EditorialAtlas/blocks/SectionRenderer';
import { RelatedPages } from '@/components/hub/EditorialAtlas/blocks/RelatedPages';
import { SourceRail } from '@/components/hub/EditorialAtlas/blocks/SourceRail';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getPageRoute, getPagesRoute, getTopicRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; pageSlug: string } }): Promise<Metadata> {
  const page = mockManifest.pages.find((p) => p.slug === params.pageSlug && p.status === 'published');
  if (!page || params.hubSlug !== mockManifest.hubSlug) return { title: 'Page not found' };
  return {
    title: `${page.title} — ${mockManifest.title}`,
    description: page.summaryPlainText,
    alternates: { canonical: getPageRoute(params.hubSlug, page.slug) },
  };
}

export default function HubPageDetail({ params }: { params: { hubSlug: string; pageSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const page = m.pages.find((p) => p.slug === params.pageSlug && p.status === 'published');
  if (!page) notFound();

  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const sourcesById = Object.fromEntries(m.sources.map((s) => [s.id, s]));
  const citationsById = Object.fromEntries(page.citations.map((c) => [c.id, c]));
  const related = m.pages.filter((p) => page.relatedPageIds.includes(p.id) && p.status === 'published');
  const primaryTopic = m.topics.find((t) => t.slug === page.topicSlugs[0]);

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

      <div className="mt-3 flex items-center gap-2">
        <MetaTagPill accent={primaryTopic?.accentColor}>{page.type}</MetaTagPill>
        <EvidenceQualityBadge quality={page.evidenceQuality} />
      </div>

      <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[36px] font-semibold leading-[1.08] tracking-[-0.02em] text-[#1A1612]">{page.title}</h1>
          <p className="mt-3 text-[15px] leading-[1.55] text-[#3D352A]">{page.summary}</p>
          <p className="mt-3 text-[11px] text-[#9A8E7C]">
            {page.estimatedReadMinutes} min read · {page.citationCount} citations · Updated {new Date(page.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
            {page.reviewedBy ? ` · Reviewed by ${page.reviewedBy}` : ''}
          </p>
        </div>
        {page.hero?.illustrationKey && (
          <div className="text-[#3D352A]">
            <LineIllustration illustrationKey={page.hero.illustrationKey} className="h-[140px] w-[200px]" />
          </div>
        )}
      </div>

      <div className="mt-10 space-y-10">
        {page.sections.map((s, i) => (
          <SectionRenderer key={i} section={s} citationsById={citationsById} sourcesById={sourcesById} />
        ))}
      </div>

      {related.length > 0 && (
        <div className="mt-16 border-t border-[#E5DECF] pt-10">
          <RelatedPages pages={related} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
        </div>
      )}
    </HubShell>
  );
}
