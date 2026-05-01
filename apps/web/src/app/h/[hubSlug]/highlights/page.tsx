// apps/web/src/app/h/[hubSlug]/highlights/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { loadEditorialAtlasManifest } from '../manifest';
import { getHighlightsRoute, getSourceRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadEditorialAtlasManifest(params.hubSlug);
  return {
    title: `Highlights — ${manifest.title}`,
    alternates: { canonical: getHighlightsRoute(params.hubSlug) },
  };
}

export default async function HighlightsPage({ params }: { params: { hubSlug: string } }) {
  const { manifest: m } = await loadEditorialAtlasManifest(params.hubSlug);
  if (!m.highlights || m.highlights.length === 0) notFound();

  // Group by source video for a "found while reading" feel.
  const groups = new Map<string, typeof m.highlights>();
  for (const h of m.highlights) {
    const arr = groups.get(h.evidence.sourceVideoId) ?? [];
    arr.push(h);
    groups.set(h.evidence.sourceVideoId, arr);
  }

  return (
    <HubShell manifest={m} activePathname={getHighlightsRoute(params.hubSlug)}>
      <Breadcrumb crumbs={[{ label: 'Highlights' }]} />
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Highlights</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Pull-quotes and aha moments collected from the archive that didn&apos;t fit on a primary page.
      </p>

      <div className="mt-10 space-y-10">
        {[...groups.entries()].map(([videoId, items]) => {
          const source = m.sources.find((s) => s.id === videoId);
          return (
            <section key={videoId}>
              <a
                href={source ? getSourceRoute(params.hubSlug, source.id) : '#'}
                className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C] hover:text-[#1A1612]"
              >
                {source?.title ?? videoId}
              </a>
              <ul className="mt-3 space-y-3">
                {items.map((h) => (
                  <li key={h.id} className="rounded-[10px] border border-[#E5DECF] bg-white p-4">
                    <p className="text-[11px] tabular-nums text-[#9A8E7C]">{h.evidence.timestampLabel}</p>
                    <p className="mt-1 text-[15px] italic leading-[1.55] text-[#1A1612]">{`"${h.text}"`}</p>
                    {h.context && <p className="mt-2 text-[13px] text-[#6B5F50]">{h.context}</p>}
                    {h.attribution && <p className="mt-2 text-[12px] text-[#9A8E7C]">— {h.attribution}</p>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </HubShell>
  );
}
