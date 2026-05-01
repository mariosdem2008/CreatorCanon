import type { Metadata } from 'next';

import { CreatorManualPillars, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualPillarsRoute } from '@/lib/hub/creator-manual/routes';
import { isCreatorManualManifest } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { loadCreatorManualManifestOrLegacyRedirect, loadHubManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  if (!isCreatorManualManifest(manifest)) {
    return { title: `Pillars - ${manifest.title}`, alternates: { canonical: getPageRoute(params.hubSlug, 'pillars') } };
  }
  return { title: `Pillars - ${manifest.title}`, alternates: { canonical: getCreatorManualPillarsRoute(params.hubSlug) } };
}

export default async function CreatorManualPillarsPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifestOrLegacyRedirect(params.hubSlug, 'pillars');
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="pillars">
      <CreatorManualPillars manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
