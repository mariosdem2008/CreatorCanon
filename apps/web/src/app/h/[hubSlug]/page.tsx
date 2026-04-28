// apps/web/src/app/h/[hubSlug]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { ArtifactCard, PathCard, QuickWinCard, SourceMomentCard } from '@/components/hub/EditorialAtlas/blocks/WorkbenchCards';
import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { loadHubManifest } from './manifest';
import {
  getAskRoute,
  getHubRoute,
  getPagesRoute,
  getStartRoute,
} from '@/lib/hub/routes';
import { deriveHubWorkbench } from '@/lib/hub/workbench';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  return {
    title: manifest.title,
    description: manifest.tagline,
    alternates: { canonical: getHubRoute(params.hubSlug) },
  };
}

export default async function HubHomePage({ params }: { params: { hubSlug: string } }) {
  const { manifest: m } = await loadHubManifest(params.hubSlug);
  const workbench = deriveHubWorkbench(m);

  return (
    <HubShell manifest={m} activePathname={getHubRoute(params.hubSlug)}>
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Source-backed workbench</p>
          <h1 className="mt-3 max-w-[760px] text-[44px] font-semibold leading-[1.04] tracking-[-0.02em] text-[#1A1612]">{m.title}</h1>
          <p className="mt-4 max-w-[680px] text-[15px] leading-[1.6] text-[#3D352A]">{m.tagline}</p>
          <form action={getAskRoute(params.hubSlug)} method="get" className="mt-6 flex max-w-[760px] items-center gap-2 rounded-[12px] border border-[#D8D0C0] bg-white p-2 pl-4">
            <span aria-hidden className="text-[#9A8E7C]">✦</span>
            <input type="text" name="q" aria-label="Ask this hub" placeholder="Ask for a template, workflow, or source moment…" className="min-w-0 flex-1 bg-transparent text-[13px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:outline-none" />
            <button type="submit" className="inline-flex h-9 shrink-0 items-center rounded-[8px] bg-[#1A1612] px-3 text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90">Ask</button>
          </form>
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-[12px] border border-[#E5DECF] bg-white p-4">
          <Stat label="Videos" value={m.stats.videoCount.toLocaleString()} />
          <Stat label="Footage" value={`${m.stats.totalDurationMinutes} min`} />
          <Stat label="Pages" value={m.stats.pageCount.toLocaleString()} />
          <Stat label="Sources" value={m.stats.sourceCount.toLocaleString()} />
        </dl>
      </section>

      <section className="mt-10 grid gap-4 lg:grid-cols-3">
        <PathCard path={workbench.startPath} hubSlug={params.hubSlug} />
        <PathCard path={workbench.buildPath} hubSlug={params.hubSlug} />
        <PathCard path={workbench.copyPath} hubSlug={params.hubSlug} />
      </section>

      <section className="mt-12">
        <SectionHeader title="Quick wins" linkLabel="View all pages →" linkHref={getPagesRoute(params.hubSlug)} />
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {workbench.quickWins.map((page) => <QuickWinCard key={page.id} page={page} hubSlug={params.hubSlug} />)}
        </div>
      </section>

      {workbench.artifacts.length > 0 ? (
        <section className="mt-12">
          <SectionHeader title="Copyable artifacts" linkLabel="Open start guide →" linkHref={getStartRoute(params.hubSlug)} />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workbench.artifacts.slice(0, 4).map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} hubSlug={params.hubSlug} />)}
          </div>
        </section>
      ) : null}

      {workbench.sourceMoments.length > 0 ? (
        <section className="mt-12">
          <SectionHeader title="Source moments" linkLabel="Browse sources →" linkHref={`/h/${params.hubSlug}/sources`} />
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {workbench.sourceMoments.slice(0, 4).map((moment) => <SourceMomentCard key={moment.id} moment={moment} />)}
          </div>
        </section>
      ) : null}
    </HubShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">{label}</dt>
      <dd className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.015em] text-[#1A1612] [font-feature-settings:'tnum']">{value}</dd>
    </div>
  );
}

function SectionHeader({ title, linkLabel, linkHref }: { title: string; linkLabel: string; linkHref: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-[20px] font-semibold tracking-[-0.015em]">{title}</h2>
      <Link href={linkHref} className="text-[12px] font-semibold text-[#1A1612] hover:underline">{linkLabel}</Link>
    </div>
  );
}
