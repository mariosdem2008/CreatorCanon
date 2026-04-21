import { PublicHubHome } from '@/components/hub/publicTemplates';
import { loadHubManifest } from './manifest';

export const dynamic = 'force-dynamic';

export default async function PublicHubPage({
  params,
}: {
  params: { subdomain: string };
}) {
  const data = await loadHubManifest(params.subdomain);
  return <PublicHubHome {...data} />;
}
