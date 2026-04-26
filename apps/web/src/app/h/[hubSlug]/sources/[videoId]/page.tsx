// apps/web/src/app/h/[hubSlug]/sources/[videoId]/page.tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { MetaTagPill } from '@/components/hub/EditorialAtlas/blocks/MetaTagPill';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { formatTimestampLabel } from '@/lib/hub/manifest/empty-state';
import { getPageRoute, getSourceRoute, getSourcesRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; videoId: string } }): Promise<Metadata> {
  const source = mockManifest.sources.find((s) => s.id === params.videoId);
  if (!source || params.hubSlug !== mockManifest.hubSlug) return { title: 'Source not found' };
  return {
    title: `${source.title} — ${mockManifest.title}`,
    alternates: { canonical: getSourceRoute(params.hubSlug, source.id) },
  };
}

export default function SourceDetail({ params }: { params: { hubSlug: string; videoId: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const source = m.sources.find((s) => s.id === params.videoId);
  if (!source) notFound();

  const youtubeWatch = `https://www.youtube.com/watch?v=${source.youtubeId}`;
  const citingPages = m.pages.filter((p) => source.citedPageIds.includes(p.id) && p.status === 'published');

  return (
    <HubShell
      manifest={m}
      activePathname={getSourceRoute(params.hubSlug, source.id)}
      rightRail={
        <section className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Source coverage</h2>
          <dl className="mt-3 space-y-2 text-[12px]">
            <Row label="Platform"          value="YouTube" />
            <Row label="Channel"           value={source.channelName} />
            <Row label="Published"         value={new Date(source.publishedAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })} />
            <Row label="Duration"          value={`${Math.floor(source.durationSec / 60)} min`} />
            <Row label="Transcript"        value={source.transcriptStatus} />
            <Row label="Pages citing"      value={`${citingPages.length}`} />
            <Row label="Key moments"       value={`${source.keyMoments.length}`} />
          </dl>
          <a href={youtubeWatch} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[8px] bg-[#1A1612] text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90">
            Open on YouTube
          </a>
        </section>
      }
    >
      <Breadcrumb crumbs={[{ label: 'Sources', href: getSourcesRoute(params.hubSlug) }, { label: source.title }]} />
      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="aspect-video w-full max-w-[480px] overflow-hidden rounded-[12px] bg-[#F2EBDA]">
          <Image src={source.thumbnailUrl} alt="" width={480} height={270} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <MetaTagPill accent="slate">Video</MetaTagPill>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.015em] text-[#1A1612]">{source.title}</h1>
          <p className="mt-2 text-[12px] text-[#9A8E7C]">{source.channelName} · {Math.floor(source.durationSec / 60)} min</p>
        </div>
      </div>

      {/* Pages that cite this video */}
      {citingPages.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Pages that cite this video</h2>
          <ul className="mt-3 divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
            {citingPages.map((p) => (
              <li key={p.id}>
                <Link href={getPageRoute(params.hubSlug, p.slug)} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#FAF6EE]">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[#1A1612]">{p.title}</span>
                    <span className="block truncate text-[11px] text-[#9A8E7C]">{p.summary}</span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[#9A8E7C]">{p.type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Key moments */}
      {source.keyMoments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Key moments</h2>
          <ol className="mt-3 space-y-2">
            {source.keyMoments.map((moment, i) => (
              <li key={i}>
                <a
                  href={`${youtubeWatch}&t=${moment.timestampStart}s`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 rounded-[8px] border border-[#E5DECF] bg-white px-3 py-2 hover:border-[#D6CFC0]"
                >
                  <span className="size-9 shrink-0 rounded-[6px] bg-[#F2EBDA] grid place-items-center text-[11px] font-semibold tabular-nums text-[#3D352A]">
                    {formatTimestampLabel(moment.timestampStart)}
                  </span>
                  <span className="text-[13px] font-medium text-[#1A1612]">{moment.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Transcript excerpts */}
      {source.transcriptExcerpts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Transcript excerpts</h2>
          <ul className="mt-3 space-y-3">
            {source.transcriptExcerpts.map((e, i) => (
              <li key={i} className="rounded-[10px] border border-[#E5DECF] bg-white p-4">
                <p className="text-[11px] tabular-nums text-[#9A8E7C]">{formatTimestampLabel(e.timestampStart)}</p>
                <p className="mt-1 text-[13px] italic leading-[1.55] text-[#3D352A]">{`“${e.body}”`}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </HubShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#9A8E7C]">{label}</dt>
      <dd className="text-right text-[#3D352A] truncate">{value}</dd>
    </div>
  );
}
