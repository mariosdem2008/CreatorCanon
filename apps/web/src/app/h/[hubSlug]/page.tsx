// apps/web/src/app/h/[hubSlug]/page.tsx
//
// Editorial Atlas — Hub Home.
//
// Phase 1: shell-only stub. Hero, stat strip, "Phase 2 coming next" copy.
// The full home page (PageCard grid, TopicGrid preview, compact ask box) is
// built in Phase 2 — this stub exists so the chrome can be visually reviewed.
//
// Reads from the mock manifest directly. The pipeline-fed loader stays in
// `./manifest.ts` for OG/Twitter images and the legacy renderer.

import type { Metadata } from 'next';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getHubRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { hubSlug: string };
}): Promise<Metadata> {
  // Phase 1 stub: title from the mock. Phase 2 wires real lookup + canonical URL.
  if (params.hubSlug !== mockManifest.hubSlug) {
    return { title: 'Hub not found' };
  }
  return {
    title: mockManifest.title,
    description: mockManifest.tagline,
    alternates: { canonical: getHubRoute(params.hubSlug) },
  };
}

export default function HubHomePage({ params }: { params: { hubSlug: string } }) {
  // Phase 1: only the mock hub renders. Real DB-backed hubs 404 here for now.
  if (params.hubSlug !== mockManifest.hubSlug) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] p-8 text-[#1A1612]">
        <p>Hub not found.</p>
      </div>
    );
  }

  return (
    <HubShell manifest={mockManifest} activePathname={`/h/${params.hubSlug}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">
        Reference hub
      </p>
      <div className="mt-3 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.025em] text-[#1A1612]">
            {mockManifest.title}
          </h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-[#3D352A]">
            {mockManifest.tagline}
          </p>
        </div>
        <div className="text-[#3D352A]">
          <LineIllustration illustrationKey="open-notebook" className="h-[120px] w-[180px]" />
        </div>
      </div>

      {/* Stats strip */}
      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-[#E5DECF] py-6 sm:grid-cols-5">
        <Stat label="Videos"            value={mockManifest.stats.videoCount.toLocaleString()} />
        <Stat label="Sources"           value={mockManifest.stats.sourceCount.toLocaleString()} />
        <Stat label="With transcripts"  value={`${Math.round(mockManifest.stats.transcriptPercent * 100)}%`} />
        <Stat label="Years of archive"  value={`${mockManifest.stats.archiveYears} yrs`} />
        <Stat label="Pages"             value={mockManifest.stats.pageCount.toLocaleString()} />
      </dl>

      {/* Phase-1 placeholder for the rest of Hub Home */}
      <section className="mt-12 rounded-[12px] border border-dashed border-[#D6CFC0] bg-white p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">
          Phase 1 stop gate
        </p>
        <p className="mt-2 text-[14px] leading-[1.55] text-[#3D352A]">
          Chrome is in. Phase 2 builds the rest of Hub Home (page card grid, topic grid preview,
          compact ask box) plus the All Pages and Generic Lesson surfaces. Review the layout,
          sidebar, illustrations, and trust strip before approving Phase 2.
        </p>
      </section>
    </HubShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">{label}</dt>
      <dd className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.015em] text-[#1A1612] [font-feature-settings:'tnum']">
        {value}
      </dd>
    </div>
  );
}
