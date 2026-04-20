import Link from 'next/link';
import { notFound } from 'next/navigation';

import { EvidenceChips, type SourceReferenceView } from '@/components/hub/EvidenceChips';
import { loadHubManifest } from '../manifest';

export const dynamic = 'force-dynamic';

type SectionContent = {
  heading?: string;
  body?: string;
  sourceVideoIds?: string[];
  sourceRefs?: SourceReferenceView[];
};

export default async function PublicHubPageDetail({
  params,
}: {
  params: { subdomain: string; slug: string };
}) {
  const { manifest } = await loadHubManifest(params.subdomain);
  const page = manifest.pages.find((item) => item.slug === params.slug);
  if (!page) notFound();

  const sections = page.blocks.filter((block) => block.type === 'section');

  return (
    <main className="min-h-screen bg-paper-studio">
      <div className="border-b border-rule-dark bg-paper px-8 py-5">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
              {manifest.title}
            </div>
            <h1 className="font-serif text-heading-lg text-ink">{page.title}</h1>
          </div>
          <Link
            href={`/h/${manifest.subdomain}`}
            className="inline-flex h-8 items-center rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
          >
            Back to hub
          </Link>
        </div>
      </div>

      <article className="mx-auto max-w-[760px] px-8 py-10">
        {page.summary && (
          <p className="text-body-lg leading-8 text-ink-2">{page.summary}</p>
        )}

        <div className="mt-8 space-y-5">
          {sections.length > 0 ? sections.map((section) => {
            const content = section.content as SectionContent;
            return (
              <section key={section.id} className="rounded-lg border border-rule bg-paper p-6">
                <h2 className="font-serif text-heading-sm text-ink">
                  {content.heading ?? 'Untitled section'}
                </h2>
                <p className="mt-3 text-body-md leading-7 text-ink-2">
                  {content.body ?? 'No body was generated for this section.'}
                </p>
                <EvidenceChips refs={content.sourceRefs} />
              </section>
            );
          }) : (
            <section className="rounded-lg border border-rule bg-paper p-6 text-body-sm text-ink-3">
              This published page does not contain generated sections.
            </section>
          )}
        </div>
      </article>
    </main>
  );
}
