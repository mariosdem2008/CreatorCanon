// apps/web/src/app/h/[hubSlug]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { PageCard } from '@/components/hub/EditorialAtlas/blocks/PageCard';
import { TopicGrid } from '@/components/hub/EditorialAtlas/blocks/TopicGrid';
import { loadHubManifest } from './manifest';
import {
  getAskRoute,
  getHubRoute,
  getPageRoute,
  getPagesRoute,
  getStartRoute,
  getTopicsRoute,
} from '@/lib/hub/routes';

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
  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const startHerePages   = m.pages.filter((p) => p.evidenceQuality === 'strong').slice(0, 3);
  const exploreByTopic   = m.topics.slice(0, 6);
  const allPagesPreview  = [...m.pages].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 5);

  return (
    <HubShell manifest={m} activePathname={getHubRoute(params.hubSlug)}>
      {/* Hero */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Reference hub</p>
      <div className="mt-3 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.025em]">{m.title}</h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-[#3D352A]">{m.tagline}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={getStartRoute(params.hubSlug)} className="inline-flex h-10 items-center rounded-[10px] bg-[#1A1612] px-4 text-[13px] font-semibold text-[#F8F4EC] hover:opacity-90">Start here</Link>
            <Link href={getTopicsRoute(params.hubSlug)} className="inline-flex h-10 items-center rounded-[10px] border border-[#D6CFC0] bg-white px-4 text-[13px] font-semibold text-[#1A1612] hover:border-[#1A1612]">Explore by topic</Link>
          </div>
        </div>
        <div className="text-[#3D352A]">
          <LineIllustration illustrationKey="open-notebook" className="h-[160px] w-[240px]" />
        </div>
      </div>

      {/* Compact ask box (links to /ask — does NOT run inline per spec § 6.1) */}
      <form action={getAskRoute(params.hubSlug)} method="get" className="mt-8 flex items-center gap-2 rounded-[12px] border border-[#E5DECF] bg-white p-2 pl-4">
        <span aria-hidden className="text-[#9A8E7C]">✦</span>
        <input
          type="text" name="q" placeholder="Ask this hub a question…"
          className="flex-1 bg-transparent text-[13px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:outline-none"
        />
        <button type="submit" className="inline-flex h-9 items-center rounded-[8px] bg-[#1A1612] px-3 text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90">
          Ask →
        </button>
      </form>

      {/* Stats strip */}
      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-[#E5DECF] py-6 sm:grid-cols-5">
        <Stat label="Videos"           value={m.stats.videoCount.toLocaleString()} />
        <Stat label="Sources"          value={m.stats.sourceCount.toLocaleString()} />
        <Stat label="With transcripts" value={`${Math.round(m.stats.transcriptPercent * 100)}%`} />
        <Stat label="Years of archive" value={`${m.stats.archiveYears} yrs`} />
        <Stat label="Pages"            value={m.stats.pageCount.toLocaleString()} />
      </dl>

      {/* Start here */}
      <section className="mt-12">
        <SectionHeader title="Start here" linkLabel="View start guide →" linkHref={getStartRoute(params.hubSlug)} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {startHerePages.map((p) => (
            <PageCard key={p.id} page={p} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
          ))}
        </div>
      </section>

      {/* Explore by topic */}
      <section className="mt-12">
        <SectionHeader title="Explore by topic" linkLabel="All topics →" linkHref={getTopicsRoute(params.hubSlug)} />
        <div className="mt-4">
          <TopicGrid topics={exploreByTopic} hubSlug={params.hubSlug} columns={3} />
        </div>
      </section>

      {/* All pages preview */}
      <section className="mt-12">
        <SectionHeader title="All pages" linkLabel={`View all ${m.pages.length} pages →`} linkHref={getPagesRoute(params.hubSlug)} />
        <ul className="mt-4 divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
          {allPagesPreview.map((p) => (
            <li key={p.id}>
              <Link href={getPageRoute(params.hubSlug, p.slug)} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#FAF6EE]">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[#1A1612]">{p.title}</span>
                  <span className="block truncate text-[11px] text-[#9A8E7C]">{p.summary}</span>
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-[#9A8E7C]">{p.type}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
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
