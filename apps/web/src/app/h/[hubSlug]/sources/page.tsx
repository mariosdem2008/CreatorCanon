// apps/web/src/app/h/[hubSlug]/sources/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { SourceTable } from '@/components/hub/EditorialAtlas/blocks/SourceTable';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getSourcesRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Sources — ${mockManifest.title}`, alternates: { canonical: getSourcesRoute(params.hubSlug) } };
}

export default function SourcesLibrary({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  return (
    <HubShell manifest={m} activePathname={getSourcesRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Sources</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Videos &amp; source library</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Every video that grounds a page in this hub. Browse the full archive, see which pages cite each video, and open a source at the moment it&apos;s referenced.
      </p>
      <div className="mt-8">
        <SourceTable sources={m.sources} hubSlug={params.hubSlug} />
      </div>
    </HubShell>
  );
}
