import type { Metadata } from 'next';

import { CreatorManualShell, CreatorManualThemes } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualThemesRoute } from '@/lib/hub/creator-manual/routes';
import { isCreatorManualManifest } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { loadCreatorManualManifestOrLegacyRedirect, loadHubManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  if (!isCreatorManualManifest(manifest)) {
    return { title: `Themes - ${manifest.title}`, alternates: { canonical: getPageRoute(params.hubSlug, 'themes') } };
  }
  return { title: `Themes - ${manifest.title}`, alternates: { canonical: getCreatorManualThemesRoute(params.hubSlug) } };
}

export default async function CreatorManualThemesPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifestOrLegacyRedirect(params.hubSlug, 'themes');
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="themes">
      <CreatorManualThemes manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
