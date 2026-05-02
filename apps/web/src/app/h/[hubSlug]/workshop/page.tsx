import type { Metadata } from 'next';

import { CreatorManualShell, CreatorManualWorkshop } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualWorkshopRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  return { title: `${manifest.brand.labels.workshop ?? 'Workshop'} - ${manifest.title}`, alternates: { canonical: getCreatorManualWorkshopRoute(params.hubSlug) } };
}

export default async function CreatorManualWorkshopPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="workshop">
      <CreatorManualWorkshop manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
