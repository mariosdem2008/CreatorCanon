import type { Metadata } from 'next';

import { CreatorManualClaims, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualClaimsRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  return { title: `Claims - ${manifest.title}`, alternates: { canonical: getCreatorManualClaimsRoute(params.hubSlug) } };
}

export default async function CreatorManualClaimsPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="claims">
      <CreatorManualClaims manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
