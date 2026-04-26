// apps/web/src/app/h/[hubSlug]/pages/page.tsx
import type { Metadata } from 'next';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { PageTable } from '@/components/hub/EditorialAtlas/blocks/PageTable';
import { loadHubManifest } from '../manifest';
import { getPagesRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  return {
    title: `All pages — ${manifest.title}`,
    description: `${manifest.pages.length} source-grounded pages across the ${manifest.title}.`,
    alternates: { canonical: getPagesRoute(params.hubSlug) },
  };
}

export default async function AllPagesIndex({ params }: { params: { hubSlug: string } }) {
  const { manifest: m } = await loadHubManifest(params.hubSlug);
  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const published = m.pages.filter((p) => p.status === 'published');

  return (
    <HubShell manifest={m} activePathname={getPagesRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Reference hub</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">All pages</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Browse the entire archive of lessons, frameworks, and systems — every page source-backed and designed to help you learn, build, and decide.
      </p>
      <div className="mt-8">
        <PageTable pages={published} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
      </div>
    </HubShell>
  );
}
