// apps/web/src/app/h/[hubSlug]/topics/[topicSlug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { PageCard } from '@/components/hub/EditorialAtlas/blocks/PageCard';
import { PageTable } from '@/components/hub/EditorialAtlas/blocks/PageTable';
import { TopicCard } from '@/components/hub/EditorialAtlas/blocks/TopicCard';
import { loadHubManifest } from '../../manifest';
import { getTopicRoute, getTopicsRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; topicSlug: string } }): Promise<Metadata> {
  const { manifest } = await loadHubManifest(params.hubSlug);
  const topic = manifest.topics.find((t) => t.slug === params.topicSlug);
  if (!topic) return { title: 'Topic not found' };
  return {
    title: `${topic.title} — ${manifest.title}`,
    description: topic.description,
    alternates: { canonical: getTopicRoute(params.hubSlug, topic.slug) },
  };
}

export default async function TopicDetail({ params }: { params: { hubSlug: string; topicSlug: string } }) {
  const { manifest: m } = await loadHubManifest(params.hubSlug);
  const topic = m.topics.find((t) => t.slug === params.topicSlug);
  if (!topic) notFound();

  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const topicPages = m.pages.filter((p) => p.topicSlugs.includes(topic.slug) && p.status === 'published');
  const startWithThese = topicPages.filter((p) => p.evidenceQuality === 'strong').slice(0, 3);
  const relatedTopics = m.topics.filter((t) => t.slug !== topic.slug).slice(0, 3);

  return (
    <HubShell
      manifest={m}
      activePathname={getTopicRoute(params.hubSlug, topic.slug)}
      rightRail={
        <div className="space-y-6">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Related topics</h2>
            <div className="mt-3 space-y-2">
              {relatedTopics.map((rt) => <TopicCard key={rt.id} topic={rt} hubSlug={params.hubSlug} />)}
            </div>
          </section>
        </div>
      }
    >
      <Breadcrumb crumbs={[{ label: 'Topics', href: getTopicsRoute(params.hubSlug) }, { label: topic.title }]} />
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">{topic.title}</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">{topic.description}</p>

      {startWithThese.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Start with these</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {startWithThese.map((p) => (
              <PageCard key={p.id} page={p} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">All pages in {topic.title}</h2>
        <div className="mt-3">
          <PageTable
            pages={topicPages} hubSlug={params.hubSlug}
            topicAccentBySlug={topicAccentBySlug} lockedTopicSlug={topic.slug}
          />
        </div>
      </section>
    </HubShell>
  );
}
