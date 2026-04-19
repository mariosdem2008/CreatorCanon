import type { Metadata } from 'next';

import { CTA } from '@/components/marketing/CTA';

export const metadata: Metadata = {
  title: 'About',
  description:
    'Channel Atlas is a studio for turning business teaching archives into structured, cited knowledge products.',
};

const PRINCIPLES = [
  {
    title: 'Grounded, not generative theatre.',
    body: 'Every block in a hub resolves back to a real video timestamp or is labeled as weak support. No hidden hallucination, no first-person impersonation in chat.',
  },
  {
    title: 'Editorial feel over generic UI.',
    body: 'Warm paper, Newsreader serif displays, a single amber accent, restrained motion. The hub has to feel worth paying for on first scroll.',
  },
  {
    title: 'Creator-owned.',
    body: 'Your URL, your content, your subscribers. Export is always available. No lock-in, no revenue share outside paywalled hubs.',
  },
  {
    title: 'Hybrid operating model.',
    body: 'The first customers are high-touch relationships, not queue numbers. Concierge covers the human rescue work that a fully automated pipeline can’t yet guarantee.',
  },
];

export default function AboutPage() {
  return (
    <>
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-[840px] px-6 py-24">
          <div className="text-eyebrow uppercase text-ink-4">About</div>
          <h1 className="mt-3 font-serif text-display-lg text-ink">
            A studio for turning teaching archives into structured, cited knowledge products.
          </h1>
          <p className="mt-6 font-serif text-body-lg leading-relaxed text-ink-2">
            Channel Atlas exists for creators whose best teaching is already on YouTube but whose
            audience can’t easily find, sequence, or pay for it. We take a focused selection of
            videos and build a premium knowledge hub around them — frameworks, playbooks, cited
            lessons, and grounded member chat called Iris.
          </p>
          <p className="mt-5 font-serif text-body-lg leading-relaxed text-ink-2">
            The product’s moat is not the model, it’s the editorial discipline: citation integrity
            on every block, section-level safe regeneration, visible pipeline stages instead of
            fake percentages, and an unpublish button that actually works in under thirty seconds.
          </p>
        </div>
      </section>

      <section className="border-b border-rule bg-paper-2">
        <div className="mx-auto max-w-[1140px] px-6 py-24">
          <div className="text-eyebrow uppercase text-ink-4">Operating principles</div>
          <h2 className="mt-3 max-w-[720px] font-serif text-display-md text-ink">
            What we hold ourselves to while building this.
          </h2>
          <div className="mt-12 grid gap-10 md:grid-cols-2">
            {PRINCIPLES.map((p, i) => (
              <article key={p.title} className="border-t border-rule-strong pt-6">
                <div className="font-mono text-caption text-amber-ink">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="mt-3 text-heading-lg text-ink">{p.title}</h3>
                <p className="mt-2 text-body-md text-ink-3">{p.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <CTA
        heading="Want to build your archive into a product with us?"
        subheading="Tell us about your channel and we’ll walk you through what a hub of your material would look like."
      />
    </>
  );
}
