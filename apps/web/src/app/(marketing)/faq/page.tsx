import type { Metadata } from 'next';

import { CTA } from '@/components/marketing/CTA';
import { FAQItem } from '@/components/marketing/FAQItem';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Common questions about CreatorCanon — what it is, how it works, and who owns what.',
};

const GROUPS: Array<{
  title: string;
  items: Array<{ q: string; a: string }>;
}> = [
  {
    title: 'What CreatorCanon actually is',
    items: [
      {
        q: 'What does CreatorCanon do?',
        a: 'It turns a selection of your YouTube videos into a hosted knowledge hub — structured lessons, named frameworks, playbooks, citations, and an optional grounded chat called Iris. The hub lives on your own subdomain and you can paywall it.',
      },
      {
        q: 'Who is it for?',
        a: 'Business, education, and technical creators whose best teaching is on YouTube but whose audience can’t easily sequence or pay for that material today.',
      },
      {
        q: 'How is this different from “chat with your videos” tools?',
        a: 'CreatorCanon produces a full editorial product — structured tracks, lessons, and playbooks — not a chat box on top of transcripts. Every block carries a visible citation or explicit weak-support label, and Iris never speaks in first person as the creator.',
      },
    ],
  },
  {
    title: 'Generating a hub',
    items: [
      {
        q: 'How long does it take?',
        a: 'Usually 30–90 minutes from click to draft. A small 5-hour archive lands faster; a full 20-hour archive takes the long end of that range.',
      },
      {
        q: 'Do you need my whole channel?',
        a: 'No. You select the strongest teaching videos — one focused source set per hub is better than a sprawling dump.',
      },
      {
        q: 'What’s the 20-hour cap?',
        a: 'The self-serve cap on selected source video. It keeps pipeline cost, time, and quality predictable. Archives larger than that move to the Concierge tier where an operator reviews before generation.',
      },
      {
        q: 'Can I edit what CreatorCanon writes?',
        a: 'Yes. Every word. You can also regenerate any single section as many times as you want after the first generation charge.',
      },
    ],
  },
  {
    title: 'Citations, chat, and trust',
    items: [
      {
        q: 'How do citations work?',
        a: 'Every block in a published hub has either a visible citation chip pointing to a specific video timestamp, or an explicit “limited support” label. No silent unsupported claims.',
      },
      {
        q: 'Does the chat speak as me?',
        a: 'No. Iris always answers as a neutral guide that cites your lessons and source moments. First-person impersonation of the creator is a compliance-level rule — we treat it as a bug if it ever happens.',
      },
      {
        q: 'What if a video gets deleted on YouTube?',
        a: 'Your hub stays up. CreatorCanon caches the transcript once it’s generated, so lessons survive even if a source video is unlisted or removed.',
      },
    ],
  },
  {
    title: 'Ownership and exit',
    items: [
      {
        q: 'Who owns the generated content?',
        a: 'You do. CreatorCanon is a drafting and publishing service — we claim no rights to your lessons, your chat answers, or your subscriber list.',
      },
      {
        q: 'How do I move off CreatorCanon?',
        a: 'Settings → Advanced → Export. You get clean markdown and JSON. Most creators re-host on Ghost or a static site.',
      },
      {
        q: 'Can I unpublish instantly?',
        a: 'Yes. Unpublish takes under 30 seconds and visitors see a polite 404.',
      },
    ],
  },
];

export default function FAQPage() {
  return (
    <>
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-[820px] px-6 pt-20 pb-10">
          <div className="text-eyebrow uppercase text-ink-4">Frequently asked</div>
          <h1 className="mt-3 font-serif text-display-lg text-ink">
            Questions we hear from serious creators.
          </h1>
          <p className="mt-5 text-body-lg text-ink-3">
            If something is missing, email{' '}
            <a
              href="mailto:hello@creatorcanon.com"
              className="text-amber-ink underline-offset-4 hover:underline"
            >
              hello@creatorcanon.com
            </a>{' '}
            — we answer within one business day.
          </p>
        </div>
      </section>

      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-[820px] px-6 pb-24">
          {GROUPS.map((group) => (
            <div key={group.title} className="mb-12 last:mb-0">
              <h2 className="mb-4 font-serif text-display-sm text-ink">{group.title}</h2>
              <div>
                {group.items.map((item) => (
                  <FAQItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <CTA />
    </>
  );
}
