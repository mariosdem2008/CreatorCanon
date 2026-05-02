import type { Metadata } from 'next';

import { ChannelMark, Icon } from '@creatorcanon/ui';

import { CreatorManualHome, CreatorManualShell } from '@/components/hub/CreatorManual';
import { CTA } from '@/components/marketing/CTA';
import { Features } from '@/components/marketing/Features';
import { Hero } from '@/components/marketing/Hero';
import { HowItWorks } from '@/components/marketing/HowItWorks';
import { TrustGrid } from '@/components/marketing/TrustGrid';
import { buildCreatorManualIndex } from '@/lib/hub/creator-manual/content';
import { loadCreatorManualManifest } from '../h/[hubSlug]/manifest';

const marketingMetadata: Metadata = {
  title: 'CreatorCanon — turn your videos into a premium business knowledge system',
  description:
    'CreatorCanon turns the lessons you keep repeating on YouTube into a structured, source-cited knowledge hub members can pay to use.',
  openGraph: {
    title: 'CreatorCanon — turn your videos into a premium business knowledge system',
    description:
      'Turn your YouTube archive into a structured, source-cited knowledge hub with playbooks, grounded answers, and member access.',
    url: 'https://www.creatorcanon.com',
  },
  twitter: {
    title: 'CreatorCanon — turn your videos into a premium business knowledge system',
    description:
      'Turn your YouTube archive into a structured, source-cited knowledge hub with playbooks, grounded answers, and member access.',
  },
};

export async function generateMetadata(): Promise<Metadata> {
  if (isPerHubVercelProject()) {
    const { manifest } = await loadCreatorManualManifest(null);
    return {
      title: manifest.title,
      description: manifest.home.summary,
      alternates: { canonical: '/' },
    };
  }

  return marketingMetadata;
}

const OUTCOMES = [
  { n: 'Structured', l: 'Framework-first navigation' },
  { n: 'Cited', l: 'Source-linked lessons and answers' },
  { n: 'Yours', l: 'You approve every page before it ships' },
  { n: 'Sellable', l: 'Member-only playbooks and templates' },
];

export default async function MarketingHomePage() {
  if (isPerHubVercelProject()) {
    const { manifest } = await loadCreatorManualManifest(null);
    const index = buildCreatorManualIndex(manifest);
    return (
      <CreatorManualShell manifest={manifest} activeRouteKey="home">
        <CreatorManualHome manifest={manifest} index={index} />
      </CreatorManualShell>
    );
  }

  return (
    <>
      <Hero />
      <HowItWorks />
      <Features />
      <TrustGrid />

      {/* Outcomes proof row */}
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-[1180px] px-6 py-20">
          <div className="text-eyebrow uppercase text-ink-4">Outcomes the hub is built for</div>
          <div className="mt-8 grid gap-10 border-y border-rule py-10 md:grid-cols-4">
            {OUTCOMES.map((s) => (
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
        <div className="mx-auto max-w-[900px] px-6 py-24">
          <Icon name="quote" size={28} className="text-amber" />
          <blockquote className="mt-5 font-serif text-display-md italic text-ink">
            “The backlog finally feels like a product. My lessons, frameworks, and answers all
            live in one place — and members can actually use them, with the receipts.”
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

function isPerHubVercelProject(): boolean {
  return Boolean(process.env.HUB_ID?.trim());
}
