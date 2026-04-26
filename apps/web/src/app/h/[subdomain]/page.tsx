import type { Metadata } from 'next';

import { PublicHubHome } from '@/components/hub/publicTemplates';
import { loadHubManifest } from './manifest';

// Public hub pages are content-only (no cookies/auth). Cache aggressively;
// publish actions revalidate via revalidatePath in publish.ts when content changes.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { subdomain: string };
}): Promise<Metadata> {
  try {
    const { manifest } = await loadHubManifest(params.subdomain);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const canonicalUrl = `${appUrl}/h/${params.subdomain}`;

    // Pull summary from the overview page if manifest has one
    const overviewPage =
      manifest.pages.find((p) => p.slug === 'overview') ?? manifest.pages[0];
    const description =
      overviewPage?.summary ??
      `A source-linked knowledge hub generated from the ${manifest.title} creator archive.`;

    return {
      title: manifest.title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        type: 'website',
        siteName: 'CreatorCanon',
        title: manifest.title,
        description,
        url: canonicalUrl,
        // No OG image: manifest does not produce one yet — flagged for follow-up.
      },
      twitter: {
        card: 'summary',
        title: manifest.title,
        description,
        // No twitter:image for the same reason.
      },
    };
  } catch {
    // If manifest load fails (not found, deleted, etc.), return minimal metadata
    return {
      title: 'Hub not found',
    };
  }
}

export default async function PublicHubPage({
  params,
}: {
  params: { subdomain: string };
}) {
  const data = await loadHubManifest(params.subdomain);
  return <PublicHubHome {...data} />;
}
