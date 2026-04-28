// apps/web/src/app/h/[hubSlug]/start/page.tsx
import type { Metadata } from 'next';

import { ArtifactCard, PathCard, SourceMomentCard } from '@/components/hub/EditorialAtlas/blocks/WorkbenchCards';
import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { loadHubManifest } from '../manifest';
import { getStartRoute } from '@/lib/hub/routes';
import { deriveHubWorkbench } from '@/lib/hub/workbench';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  return { title: `Start here — ${manifest.title}`, alternates: { canonical: getStartRoute(params.hubSlug) } };
}

export default async function StartHere({ params }: { params: { hubSlug: string } }) {
  const { manifest: m } = await loadHubManifest(params.hubSlug);
  const workbench = deriveHubWorkbench(m);

  return (
    <HubShell manifest={m} activePathname={getStartRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Start here</p>
      <h1 className="mt-3 max-w-[760px] text-[36px] font-semibold leading-[1.08] tracking-[-0.02em]">Choose the job you came here to do</h1>
      <p className="mt-3 max-w-[680px] text-[14px] leading-[1.6] text-[#3D352A]">
        The hub is organized around action paths. Start with the path that matches your current job, then use the source moments and artifacts as support.
      </p>

      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        <PathCard path={workbench.startPath} hubSlug={params.hubSlug} />
        <PathCard path={workbench.buildPath} hubSlug={params.hubSlug} />
        <PathCard path={workbench.copyPath} hubSlug={params.hubSlug} />
      </div>

      {workbench.artifacts.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-[20px] font-semibold tracking-[-0.015em]">Artifacts to copy</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workbench.artifacts.slice(0, 6).map((artifact) => <ArtifactCard key={artifact.id} artifact={artifact} hubSlug={params.hubSlug} />)}
          </div>
        </section>
      ) : null}

      {workbench.sourceMoments.length > 0 ? (
        <section className="mt-12">
          <h2 className="text-[20px] font-semibold tracking-[-0.015em]">Best source moments</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workbench.sourceMoments.slice(0, 6).map((moment) => <SourceMomentCard key={moment.id} moment={moment} />)}
          </div>
        </section>
      ) : null}
    </HubShell>
  );
}
