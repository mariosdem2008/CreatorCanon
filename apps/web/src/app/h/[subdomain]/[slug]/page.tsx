import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PublicHubDetail } from '@/components/hub/publicTemplates';
import { loadHubManifest } from '../manifest';

// Public hub pages are content-only (no cookies/auth). Cache aggressively;
// publish actions revalidate via revalidatePath in publish.ts when content changes.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { subdomain: string; slug: string };
}): Promise<Metadata> {
  try {
    const { manifest } = await loadHubManifest(params.subdomain);
    const page = manifest.pages.find((p) => p.slug === params.slug);
    if (!page) return { title: 'Page not found' };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const canonicalUrl = `${appUrl}/h/${params.subdomain}/${params.slug}`;

    const description =
      page.summary ??
      `${page.title} — part of the ${manifest.title} knowledge hub on CreatorCanon.`;

    const title = `${page.title} — ${manifest.title}`;

    return {
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        type: 'article',
        siteName: 'CreatorCanon',
        title,
        description,
        url: canonicalUrl,
        // No OG image: manifest does not produce one yet — flagged for follow-up.
      },
      twitter: {
        card: 'summary',
        title,
        description,
        // No twitter:image for the same reason.
      },
    };
  } catch {
    return {
      title: 'Hub page not found',
    };
  }
}

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
