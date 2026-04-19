import type { Metadata } from 'next';

import { CTA } from '@/components/marketing/CTA';
import { FAQItem } from '@/components/marketing/FAQItem';
import { PricingTable } from '@/components/marketing/PricingTable';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Starter, Pro, and Concierge tiers for turning a YouTube archive into a hosted knowledge hub.',
};

const PRICING_FAQS = [
  {
    q: 'What am I paying for, exactly?',
    a: 'A one-time fee per hub generation. You connect your channel, pick the strongest teaching videos, and Atlas produces structured lessons, frameworks, playbooks, citations, and optional grounded chat — all yours to edit and publish.',
  },
  {
    q: 'Why is there a 20-hour cap on self-serve?',
    a: 'It keeps cost, pipeline time, and quality predictable. Above 20 hours of selected video, an operator reviews the archive for transcript gaps and cluster overrides before running — that work happens in Concierge.',
  },
  {
    q: 'Do I pay a revenue share if my hub is paywalled?',
    a: 'Atlas takes 15% on paywalled hubs in addition to Stripe fees (2.9% + €0.30). Concierge and custom deployments can negotiate this down.',
  },
  {
    q: 'Can I edit the output after generation?',
    a: 'Yes. Every section is editable, and you can regenerate any single section as many times as you want after the first generation charge.',
  },
  {
    q: 'What if the output quality is not good enough?',
    a: 'You review a draft before publishing. If support on a section is weak, Atlas labels it and suggests a rerun or operator help. Nothing ships without your explicit publish click.',
  },
];

export default function PricingPage() {
  return (
    <>
      <PricingTable />

      <section className="border-t border-rule bg-paper-2">
        <div className="mx-auto max-w-[820px] px-6 py-24">
          <div className="text-eyebrow uppercase text-ink-4">Pricing FAQ</div>
          <h2 className="mt-3 font-serif text-display-md text-ink">
            Common questions before you start.
          </h2>
          <div className="mt-10">
            {PRICING_FAQS.map((f) => (
              <FAQItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </div>
      </section>

      <CTA
        heading="Ready to see your archive as a paid product?"
        subheading="Connect your channel and preview the structure before paying."
      />
    </>
  );
}
