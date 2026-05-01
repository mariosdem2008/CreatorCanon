import type { Metadata } from 'next';

import { CreatorManualSegments, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualSegmentsRoute } from '@/lib/hub/creator-manual/routes';
import { isCreatorManualManifest } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { loadCreatorManualManifestOrLegacyRedirect, loadHubManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  if (!isCreatorManualManifest(manifest)) {
    return { title: `Segments - ${manifest.title}`, alternates: { canonical: getPageRoute(params.hubSlug, 'segments') } };
  }
  return { title: `Segments - ${manifest.title}`, alternates: { canonical: getCreatorManualSegmentsRoute(params.hubSlug) } };
}

export default async function CreatorManualSegmentsPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifestOrLegacyRedirect(params.hubSlug, 'segments');
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="segments">
      <CreatorManualSegments manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
