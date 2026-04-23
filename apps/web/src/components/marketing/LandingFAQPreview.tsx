import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { FAQItem } from '@/components/marketing/FAQItem';

const FAQ_PREVIEW = [
  {
    q: 'What kind of creator is CreatorCanon built for?',
    a: 'Solopreneur YouTubers with two or more years of consistent teaching content — people who have built up a library of lessons, frameworks, and repeating ideas across their uploads. It is not aimed at entertainment channels, vlog archives, or channels still finding their niche.',
  },
  {
    q: 'Do I need to give CreatorCanon access to my whole channel?',
    a: 'No. You choose which videos to include. Most creators start with 20–50 of their strongest teaching videos rather than their entire archive. You can expand the source set later.',
  },
  {
    q: 'What does the finished hub actually look like?',
    a: 'A hosted website your audience can browse. It has framework tracks, lesson pages with source citations, and a grounded Q&A. Browse the live demos on this page to see exactly what the reading experience is like.',
  },
  {
    q: 'Is this alpha, and what does that mean for me?',
    a: "Yes. CreatorCanon is in private alpha. Access is invite-only, the feature set is focused, and you'll be working directly with the team. Pricing is locked for alpha participants.",
  },
  {
    q: 'Can I charge my audience to access the hub?',
    a: 'Member paywall access is on the roadmap. Right now, hubs can be published publicly or with link-based privacy. Monetisation controls are being designed alongside the first alpha cohort.',
  },
];

export function LandingFAQPreview() {
  return (
    <section
      id="faq-preview"
      aria-labelledby="faq-preview-heading"
      className="border-b border-rule bg-paper-2"
    >
      <div className="mx-auto max-w-[1140px] px-6 py-20">
        <div className="grid gap-12 md:grid-cols-[280px_1fr]">
          <div>
            <div className="text-eyebrow uppercase text-ink-4">Questions</div>
            <h2
              id="faq-preview-heading"
              className="mt-3 font-serif text-display-md text-ink tracking-[-0.025em]"
            >
              Common questions.
            </h2>
            <Link
              href="/faq"
              className="mt-6 inline-flex items-center gap-2 text-body-sm text-ink-3 underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
            >
              See all questions
              <Icon name="arrowRight" size={13} />
            </Link>
          </div>

          <div className="divide-y divide-rule">
            {FAQ_PREVIEW.map((item, i) => (
              <FAQItem key={item.q} q={item.q} a={item.a} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
