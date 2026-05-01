import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CreatorManualSegmentDetail, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex, getSegmentById } from '@/lib/hub/creator-manual/content';
import { getCreatorManualSegmentRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; segmentId: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const segment = getSegmentById(index, params.segmentId);
  if (!segment) return { title: 'Segment not found' };
  return {
    title: `${segment.title} - ${manifest.title}`,
    description: segment.summary,
    alternates: { canonical: getCreatorManualSegmentRoute(params.hubSlug, segment.id) },
  };
}

export default async function CreatorManualSegmentDetailPage({ params }: { params: { hubSlug: string; segmentId: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const segment = getSegmentById(index, params.segmentId);
  if (!segment) notFound();
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="segments">
      <CreatorManualSegmentDetail manifest={manifest} index={index} segment={segment} />
    </CreatorManualShell>
  );
}
