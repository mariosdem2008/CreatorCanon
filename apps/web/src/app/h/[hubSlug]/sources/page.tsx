import type { Metadata } from 'next';

import { CreatorManualShell, CreatorManualSources } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { getCreatorManualSourcesRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  return { title: `Sources - ${manifest.title}`, alternates: { canonical: getCreatorManualSourcesRoute(params.hubSlug) } };
}

export default async function SourcesLibrary({ params }: { params: { hubSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="sources">
      <CreatorManualSources manifest={manifest} index={index} />
    </CreatorManualShell>
  );
}
