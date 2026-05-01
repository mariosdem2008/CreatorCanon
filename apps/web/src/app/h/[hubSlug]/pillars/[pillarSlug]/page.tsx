import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CreatorManualPillarDetail, CreatorManualShell } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex, getPillarBySlug } from '@/lib/hub/creator-manual/content';
import { getCreatorManualPillarRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; pillarSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const pillar = getPillarBySlug(index, params.pillarSlug);
  if (!pillar) return { title: 'Pillar not found' };
  return {
    title: `${pillar.title} - ${manifest.title}`,
    description: pillar.summary,
    alternates: { canonical: getCreatorManualPillarRoute(params.hubSlug, pillar.slug) },
  };
}

export default async function CreatorManualPillarDetailPage({ params }: { params: { hubSlug: string; pillarSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const pillar = getPillarBySlug(index, params.pillarSlug);
  if (!pillar) notFound();
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="pillars">
      <CreatorManualPillarDetail manifest={manifest} index={index} pillar={pillar} />
    </CreatorManualShell>
  );
}
