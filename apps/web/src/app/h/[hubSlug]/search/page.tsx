// apps/web/src/app/h/[hubSlug]/search/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { PageRow } from '@/components/hub/EditorialAtlas/blocks/PageRow';
import { TopicCard } from '@/components/hub/EditorialAtlas/blocks/TopicCard';
import { SourceRow } from '@/components/hub/EditorialAtlas/blocks/SourceRow';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getSearchRoute } from '@/lib/hub/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Search' };

export default function SearchPage({
  params,
  searchParams,
}: {
  params: { hubSlug: string };
  searchParams: { q?: string };
}) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));

  const matchingPages = q
    ? m.pages.filter((p) => p.status === 'published' && `${p.title} ${p.summaryPlainText} ${p.searchKeywords.join(' ')}`.toLowerCase().includes(q))
    : [];
  const matchingTopics = q
    ? m.topics.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q))
    : [];
  const matchingSources = q
    ? m.sources.filter((s) => s.title.toLowerCase().includes(q))
    : [];

  return (
    <HubShell manifest={m} activePathname={getSearchRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Search</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Search results</h1>

      <form action={getSearchRoute(params.hubSlug)} method="get" className="mt-6 flex items-center gap-2 rounded-[12px] border border-[#E5DECF] bg-white p-2 pl-4">
        <input
          type="search" name="q" defaultValue={q} placeholder="Search this hub…"
          className="flex-1 bg-transparent text-[13px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:outline-none"
        />
        <button type="submit" className="inline-flex h-9 items-center rounded-[8px] bg-[#1A1612] px-3 text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90">
          Search
        </button>
      </form>

      {!q && (
        <p className="mt-6 text-[13px] text-[#9A8E7C]">Enter a query above to search pages, topics, and sources.</p>
      )}

      {q && (
        <>
          <Section title={`Pages (${matchingPages.length})`}>
            {matchingPages.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
                {matchingPages.map((p) => <li key={p.id}><PageRow page={p} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} /></li>)}
              </ul>
            )}
          </Section>

          <Section title={`Topics (${matchingTopics.length})`}>
            {matchingTopics.length === 0 ? <Empty /> : (
              <div className="grid gap-3 md:grid-cols-3">
                {matchingTopics.map((t) => <TopicCard key={t.id} topic={t} hubSlug={params.hubSlug} />)}
              </div>
            )}
          </Section>

          <Section title={`Sources (${matchingSources.length})`}>
            {matchingSources.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
                {matchingSources.map((s) => <li key={s.id}><SourceRow source={s} hubSlug={params.hubSlug} /></li>)}
              </ul>
            )}
          </Section>
        </>
      )}
    </HubShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="rounded-[10px] border border-dashed border-[#D6CFC0] bg-white px-4 py-6 text-center text-[12px] text-[#9A8E7C]">No matches.</p>;
}
