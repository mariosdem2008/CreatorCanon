// apps/web/src/app/h/[hubSlug]/topics/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { TopicGrid } from '@/components/hub/EditorialAtlas/blocks/TopicGrid';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getTopicsRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Topics — ${mockManifest.title}`, alternates: { canonical: getTopicsRoute(params.hubSlug) } };
}

export default function TopicsIndex({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  return (
    <HubShell manifest={m} activePathname={getTopicsRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Topics</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Explore by topic</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Browse ideas and pages by theme. Each topic brings together related lessons, frameworks, and playbooks to help you learn, apply, and create.
      </p>
      <div className="mt-8">
        <TopicGrid topics={m.topics} hubSlug={params.hubSlug} columns={3} />
      </div>
    </HubShell>
  );
}
