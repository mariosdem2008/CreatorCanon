// apps/web/src/app/h/[hubSlug]/[slug]/page.tsx
//
// Backwards-compatibility redirect for the old flat URL pattern.
// Old: /h/[hubSlug]/[slug]
// New: /h/[hubSlug]/pages/[slug]
//
// This dynamic segment only matches when no other dedicated segment
// (`pages`, `topics`, `sources`, `start`, `methodology`, `search`, `ask`) wins
// — Next.js routes specific segments first.
//
// Phase 1 acceptance includes a manual smoke test against
// /h/<slug>/start, /h/<slug>/topics, /h/<slug>/pages, etc. to confirm no
// shadowing. If a conflict surfaces (it shouldn't), delete this file and
// note the reason in the implementation PR.

import { notFound, permanentRedirect } from 'next/navigation';

import { isCreatorManualManifest } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { loadHubManifest } from '../manifest';

export default async function LegacyDetailRedirect({
  params,
}: {
  params: { hubSlug: string; slug: string };
}) {
  const { manifest } = await loadHubManifest(params.hubSlug);
  if (isCreatorManualManifest(manifest)) notFound();
  permanentRedirect(getPageRoute(params.hubSlug, params.slug));
}
