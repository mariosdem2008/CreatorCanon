// apps/web/src/app/h/[hubSlug]/start/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import type { Page } from '@/lib/hub/manifest/schema';
import { getPageRoute, getStartRoute, getTopicsRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Start here — ${mockManifest.title}`, alternates: { canonical: getStartRoute(params.hubSlug) } };
}

export default function StartHere({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;

  // Three "paths" curated from the published pages.
  const beginnerPath = m.pages.filter((p) => p.type === 'lesson' && p.evidenceQuality === 'strong').slice(0, 3);
  const builderPath  = m.pages.filter((p) => p.type === 'framework' && p.status === 'published').slice(0, 3);
  const deepPath     = m.pages.filter((p) => p.type === 'playbook' && p.status === 'published').slice(0, 3);

  return (
    <HubShell manifest={m} activePathname={getStartRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Start here</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">New to the hub?</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Three paths into the archive — pick the one that matches how you want to use it. Each path is three pages long and source-backed end to end.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Path title="Beginner path" body="Start with the most-cited foundational lessons."   pages={beginnerPath} hubSlug={params.hubSlug} />
        <Path title="Builder path"  body="Frameworks you can apply to your own work this week." pages={builderPath} hubSlug={params.hubSlug} />
        <Path title="Deep dive"     body="Full systems you can adopt end to end."              pages={deepPath}    hubSlug={params.hubSlug} />
      </div>

      <section className="mt-12 rounded-[12px] border border-[#E5DECF] bg-white p-6">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">How to know where to start</h2>
        <p className="mt-2 text-[13px] leading-[1.55] text-[#3D352A]">
          If you want a foundation, start with the lessons. If you have a problem this week, start with a framework.
          If you want to overhaul a habit or workflow, start with a playbook. You can always switch — pages link to each other.
        </p>
        <Link href={getTopicsRoute(params.hubSlug)} className="mt-3 inline-flex text-[13px] font-semibold text-[#1A1612] hover:underline">
          Or browse by topic →
        </Link>
      </section>
    </HubShell>
  );
}

function Path({ title, body, pages, hubSlug }: {
  title: string; body: string; pages: Page[]; hubSlug: string;
}) {
  return (
    <section className="rounded-[12px] border border-[#E5DECF] bg-white p-5">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[#1A1612]">{title}</h2>
      <p className="mt-1 text-[13px] leading-[1.55] text-[#6B5F50]">{body}</p>
      <ol className="mt-4 space-y-2">
        {pages.map((p, i) => (
          <li key={p.id}>
            <Link href={getPageRoute(hubSlug, p.slug)} className="flex items-center gap-3 rounded-[8px] border border-transparent px-2 py-1.5 hover:border-[#E5DECF] hover:bg-[#FAF6EE]">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#F2EBDA] text-[10px] font-semibold text-[#3D352A] [font-feature-settings:'tnum']">{i + 1}</span>
              <span className="min-w-0 truncate text-[13px] font-medium text-[#1A1612]">{p.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
