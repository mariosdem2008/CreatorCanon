import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CreatorManualShell, CreatorManualSourceDetail } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex, getSourceById } from '@/lib/hub/creator-manual/content';
import { getCreatorManualSourceRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; videoId: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const source = getSourceById(index, params.videoId);
  if (!source) return { title: 'Source not found' };
  return {
    title: `${source.title} - ${manifest.title}`,
    alternates: { canonical: getCreatorManualSourceRoute(params.hubSlug, source.id) },
  };
}

export default async function SourceDetail({ params }: { params: { hubSlug: string; videoId: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const source = getSourceById(index, params.videoId);
  if (!source) notFound();
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="sources">
      <CreatorManualSourceDetail manifest={manifest} index={index} source={source} />
    </CreatorManualShell>
  );
}
