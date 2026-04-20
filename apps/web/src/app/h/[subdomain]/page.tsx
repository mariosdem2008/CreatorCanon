import Link from 'next/link';

import { EvidenceChips, type SourceReferenceView } from '@/components/hub/EvidenceChips';
import { loadHubManifest } from './manifest';

export const dynamic = 'force-dynamic';

type SectionContent = {
  heading?: string;
  body?: string;
  sourceVideoIds?: string[];
  sourceRefs?: SourceReferenceView[];
};

export default async function PublicHubPage({
  params,
}: {
  params: { subdomain: string };
}) {
  const { manifest, release } = await loadHubManifest(params.subdomain);
  const overview = manifest.pages.find((page) => page.slug === 'overview') ?? manifest.pages[0];
  const summary = overview?.summary ?? 'A read-only preview hub generated from the creator archive.';

  return (
    <main className="min-h-screen bg-paper-studio">
      <section className="border-b border-rule-dark bg-paper px-8 py-12">
        <div className="mx-auto max-w-[980px]">
          <div className="text-eyebrow uppercase tracking-widest text-ink-4">
            Published preview hub
          </div>
          <h1 className="mt-3 max-w-[760px] font-serif text-heading-xl text-ink">
            {manifest.title}
          </h1>
          <p className="mt-4 max-w-[700px] text-body-lg leading-8 text-ink-2">
            {summary}
          </p>
          <p className="mt-4 text-caption text-ink-4">
            Release {manifest.releaseId.slice(0, 8)} · {release.liveAt?.toLocaleDateString() ?? 'Live'}
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-[980px] gap-6 px-8 py-10 md:grid-cols-[1fr_280px]">
        <section className="space-y-5">
          {manifest.pages.map((page) => {
            const sections = page.blocks.filter((block) => block.type === 'section');
            const firstSection = sections[0]?.content as SectionContent | undefined;

            return (
              <article key={page.slug} className="rounded-lg border border-rule bg-paper p-6">
                <p className="text-caption uppercase tracking-widest text-ink-4">
                  Page {page.position + 1}
                </p>
                <h2 className="mt-2 font-serif text-heading-sm text-ink">{page.title}</h2>
                {page.summary && (
                  <p className="mt-3 text-body-md leading-7 text-ink-2">{page.summary}</p>
                )}
                {firstSection?.body && (
                  <p className="mt-4 text-body-sm leading-6 text-ink-3">
                    {firstSection.body}
                  </p>
                )}
                <EvidenceChips refs={firstSection?.sourceRefs} />
                <Link
                  href={`/h/${manifest.subdomain}/${page.slug}`}
                  className="mt-5 inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
                >
                  Read page
                </Link>
              </article>
            );
          })}
        </section>

        <aside className="h-fit rounded-lg border border-rule bg-paper p-5">
          <h2 className="text-body-md font-medium text-ink">Pages</h2>
          <nav className="mt-4 space-y-2">
            {manifest.pages.map((page) => (
              <Link
                key={page.slug}
                href={`/h/${manifest.subdomain}/${page.slug}`}
                className="block rounded-md border border-rule bg-paper-2 px-3 py-2 text-body-sm text-ink-3 transition hover:text-ink"
              >
                {page.title}
              </Link>
            ))}
          </nav>
        </aside>
      </div>
    </main>
  );
}
