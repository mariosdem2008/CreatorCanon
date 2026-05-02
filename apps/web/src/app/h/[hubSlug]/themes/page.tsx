import type { Metadata } from 'next';

import { CreatorManualShell, CreatorManualThemes } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualThemesRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  return { title: `Themes - ${manifest.title}`, alternates: { canonical: getCreatorManualThemesRoute(params.hubSlug) } };
}

export default async function CreatorManualThemesPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="themes">
      <CreatorManualThemes manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
