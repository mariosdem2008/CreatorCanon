import type { Metadata } from 'next';

import { CreatorManualLibrary, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualLibraryRoute } from '@/lib/hub/creator-manual/routes';
import { isCreatorManualManifest } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { loadCreatorManualManifestOrLegacyRedirect, loadHubManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  if (!isCreatorManualManifest(manifest)) {
    return { title: `Library - ${manifest.title}`, alternates: { canonical: getPageRoute(params.hubSlug, 'library') } };
  }
  return {
    title: `${manifest.brand.labels.library ?? 'Library'} - ${manifest.title}`,
    alternates: { canonical: getCreatorManualLibraryRoute(params.hubSlug) },
  };
}

export default async function CreatorManualLibraryPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifestOrLegacyRedirect(params.hubSlug, 'library');
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="library">
      <CreatorManualLibrary manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
