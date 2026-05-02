import type { Metadata } from 'next';

import { CreatorManualHome, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualHomeRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from './manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  return {
    title: manifest.title,
    description: manifest.home.summary,
    alternates: { canonical: getCreatorManualHomeRoute(params.hubSlug) },
  };
}

export default async function HubHomePage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="home">
      <CreatorManualHome manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
