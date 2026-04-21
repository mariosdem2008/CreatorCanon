import { notFound } from 'next/navigation';

import { PublicHubDetail } from '@/components/hub/publicTemplates';
import { loadHubManifest } from '../manifest';

export const dynamic = 'force-dynamic';

export default async function PublicHubPageDetail({
  params,
}: {
  params: { subdomain: string; slug: string };
}) {
  const data = await loadHubManifest(params.subdomain);
  const page = data.manifest.pages.find((item) => item.slug === params.slug);
  if (!page) notFound();

  return <PublicHubDetail {...data} page={page} />;
}
