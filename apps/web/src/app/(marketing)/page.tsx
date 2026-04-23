import type { Metadata } from 'next';

import { Icon, ChannelMark } from '@creatorcanon/ui';

import { CTA } from '@/components/marketing/CTA';
import { Features } from '@/components/marketing/Features';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';

export const metadata: Metadata = {
  title: 'CreatorCanon — turn your videos into a premium business knowledge system',
  description:
    'CreatorCanon helps business creators turn repeat lessons, frameworks, and operating advice into a source-linked hub their audience can pay to use.',
  openGraph: {
    title: 'CreatorCanon — turn your videos into a premium business knowledge system',
    description:
      'Turn your YouTube archive into a structured, source-linked knowledge hub with playbooks, grounded answers, and member paywall.',
    url: 'https://www.creatorcanon.com',
  },
  twitter: {
    title: 'CreatorCanon — turn your videos into a premium business knowledge system',
    description:
      'Turn your YouTube archive into a structured, source-linked knowledge hub with playbooks, grounded answers, and member paywall.',
  },
};

const PROOFS = [
  { n: 'Structured', l: 'framework-first navigation' },
  { n: 'Grounded', l: 'source-linked lessons and answers' },
  { n: 'Monetizable', l: 'member-only playbooks and templates' },
  { n: 'Editable', l: 'section-level refinement before publish' },
];

export default function MarketingHomePage() {
  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />

      {/* Proof points row */}
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-[1140px] px-6 py-20">
          <div className="text-eyebrow uppercase text-ink-4">Design notes</div>
          <div className="mt-8 grid gap-10 border-y border-rule py-8 md:grid-cols-4">
            {PROOFS.map((s) => (
              <div key={s.n}>
                <div className="font-serif text-display-md text-ink">{s.n}</div>
                <div className="mt-1 text-caption text-ink-3">{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote block */}
      <section className="border-b border-rule bg-paper-warm">
        <div className="mx-auto max-w-[840px] px-6 py-24">
          <Icon name="quote" size={28} className="text-amber" />
          <blockquote className="mt-5 font-serif text-display-md italic text-ink">
            “The backlog finally feels like a product. My lessons, frameworks, and answers all
            live in one place, and readers can actually use them.”
          </blockquote>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ChannelMark name="Mason" size={40} palette={1} />
            <div>
              <div className="text-heading-sm text-ink">Mason Vale</div>
              <div className="text-caption text-ink-3">
                Example creator profile · business education
              </div>
            </div>
          </div>
        </div>
      </section>

      <CTA />
    </>
  );
}
