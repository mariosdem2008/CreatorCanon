import type { Metadata } from 'next';

import { CreatorManualSearch, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualSearchRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../manifest';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  return { title: `Search - ${manifest.title}`, alternates: { canonical: getCreatorManualSearchRoute(params.hubSlug) } };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: { hubSlug: string };
  searchParams: { q?: string };
}) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const q = (searchParams.q ?? '').trim();
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="search">
      <CreatorManualSearch manifest={manifest} index={index} query={q} />
    </CreatorManualShell>
  );
}
