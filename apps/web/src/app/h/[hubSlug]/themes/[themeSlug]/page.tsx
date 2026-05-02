import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CreatorManualShell, CreatorManualThemeDetail } from '@/components/hub/CreatorManual';
import { buildCreatorManualIndex, getThemeBySlug } from '@/lib/hub/creator-manual/content';
import { getCreatorManualThemeRoute } from '@/lib/hub/creator-manual/routes';
import { loadCreatorManualManifest } from '../../manifest';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; themeSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const theme = getThemeBySlug(index, params.themeSlug);
  if (!theme) return { title: 'Theme not found' };
  return {
    title: `${theme.title} - ${manifest.title}`,
    description: theme.summary,
    alternates: { canonical: getCreatorManualThemeRoute(params.hubSlug, theme.slug) },
  };
}

export default async function CreatorManualThemeDetailPage({ params }: { params: { hubSlug: string; themeSlug: string } }) {
  const { manifest } = await loadCreatorManualManifest(params.hubSlug);
  const index = buildCreatorManualIndex(manifest);
  const theme = getThemeBySlug(index, params.themeSlug);
  if (!theme) notFound();
  return (
    <CreatorManualShell manifest={manifest} activeRouteKey="themes">
      <CreatorManualThemeDetail manifest={manifest} index={index} theme={theme} />
    </CreatorManualShell>
  );
}
