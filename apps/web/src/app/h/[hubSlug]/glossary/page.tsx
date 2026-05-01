import type { Metadata } from 'next';

import { CreatorManualGlossary, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualGlossaryRoute } from '@/lib/hub/creator-manual/routes';
import { isCreatorManualManifest } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { loadCreatorManualManifestOrLegacyRedirect, loadHubManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  if (!isCreatorManualManifest(manifest)) {
    return { title: `Glossary - ${manifest.title}`, alternates: { canonical: getPageRoute(params.hubSlug, 'glossary') } };
  }
  return { title: `Glossary - ${manifest.title}`, alternates: { canonical: getCreatorManualGlossaryRoute(params.hubSlug) } };
}

export default async function CreatorManualGlossaryPage({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifestOrLegacyRedirect(params.hubSlug, 'glossary');
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="glossary">
      <CreatorManualGlossary manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
