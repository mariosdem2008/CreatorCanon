import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CreatorManualShell, CreatorManualWorkshopDetail } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex, getWorkshopStageBySlug } from '@/lib/hub/creator-manual/content';
import { getCreatorManualWorkshopStageRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; stageSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const stage = getWorkshopStageBySlug(index, params.stageSlug);
  if (!stage) return { title: 'Workshop stage not found' };
  return {
    title: `${stage.title} - ${manifest.title}`,
    description: stage.summary,
    alternates: { canonical: getCreatorManualWorkshopStageRoute(params.hubSlug, stage.slug) },
  };
}

export default async function CreatorManualWorkshopDetailPage({ params }: { params: { hubSlug: string; stageSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const stage = getWorkshopStageBySlug(index, params.stageSlug);
  if (!stage) notFound();
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="workshop">
      <CreatorManualWorkshopDetail manifest={manifest} index={index} stage={stage} />
    </CreatorManualShell>
  );
}
