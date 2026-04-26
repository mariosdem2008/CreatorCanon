// apps/web/src/app/h/[hubSlug]/pages/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { PageTable } from '@/components/hub/EditorialAtlas/blocks/PageTable';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getPagesRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return {
    title: `All pages — ${mockManifest.title}`,
    description: `${mockManifest.pages.length} source-grounded pages across the ${mockManifest.title}.`,
    alternates: { canonical: getPagesRoute(params.hubSlug) },
  };
}

export default function AllPagesIndex({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
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
