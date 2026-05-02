import type { Metadata } from 'next';

import { CreatorManualLibrary, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualLibraryRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  return {
    title: `${manifest.brand.labels.library ?? 'Library'} - ${manifest.title}`,
    alternates: { canonical: getCreatorManualLibraryRoute(params.hubSlug) },
  };
}

export default async function CreatorManualLibraryPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="library">
      <CreatorManualLibrary manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
