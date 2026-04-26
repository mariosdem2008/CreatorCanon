import type { Metadata } from 'next';
import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Pricing — CreatorCanon',
  description:
    'One flat price per generated hub — $29 during private alpha. No subscriptions, no seat fees. You own the hub.',
  openGraph: {
    title: 'Pricing — CreatorCanon',
    description:
      'One flat price per generated hub — $29 during private alpha. No subscriptions, no seat fees.',
    url: 'https://www.creatorcanon.com/pricing',
  },
  twitter: {
    title: 'Pricing — CreatorCanon',
    description:
      'One flat price per generated hub — $29 during private alpha. No subscriptions, no seat fees.',
  },
};

const INCLUDED: Array<{ title: string; body: string }> = [
  {
    title: 'Source-grounded prose',
    body: 'Every section is generated from your own footage with timestamped citations.',
  },
  {
    title: 'Three premium templates',
    body: 'Editorial Atlas, Playbook OS, and Studio Vault — each tuned for a different reader.',
  },
  {
    title: 'Section-level review',
    body: 'Edit, regenerate, or reject any section before publish. No auto-publish, ever.',
  },
  {
    title: 'Hosted on a URL you own',
    body: 'CreatorCanon subdomain on day one. Custom domains land post-alpha.',
  },
  {
    title: 'Unlimited regeneration',
    body: 'Re-run sections as your channel grows. Your hub stays current with your work.',
  },
  {
    title: 'Members-only chat',
    body: 'Grounded chat that always cites the lesson and source moment behind each answer.',
  },
];

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Is this a subscription?',
    a: 'No. $29 is a one-time fee per generated hub during alpha. You can regenerate sections as often as you like after publishing — there’s no clock running.',
  },
  {
    q: 'What happens to my hub if I stop using CreatorCanon?',
    a: 'Hubs you have already paid for stay live during alpha. We will give you concrete export options before any change to that policy, and a written notice with at least 30 days lead time.',
  },
  {
    q: 'Can I bring my own LLM key?',
    a: 'Not in alpha. The pipeline is opinionated about model choice and source grounding so quality stays consistent. BYO-key is on the roadmap for the team tier.',
  },
  {
    q: 'What about higher-volume archives?',
    a: 'If you have 50+ videos and need recurring generation, talk to us. The team tier (post-alpha) is built for that — flat per-archive pricing instead of per-hub.',
  },
];

export default function PricingPage() {
  return (
    <>
      <section className="border-b border-rule bg-paper">
        <div className="mx-auto max-w-[1180px] px-6 py-24">
          <p className="text-eyebrow uppercase text-ink-4">Pricing</p>
          <h1 className="mt-3 max-w-[900px] font-serif text-display-lg text-ink">
            One generated hub. One flat price.
          </h1>
          <p className="mt-5 max-w-[60ch] text-body-lg text-ink-2">
            CreatorCanon is in private alpha. Every generated hub is a flat <strong>$29</strong>{' '}
            — unlimited section regenerations, unlimited edits, hosted at a URL you own. No
            subscription, no seat fees.
          </p>

          <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
            <div className="rounded-2xl border border-rule bg-paper-warm p-8 shadow-1">
              <div className="flex items-baseline gap-3">
                <span className="font-serif text-[64px] leading-none tracking-tight text-ink">
                  $29
                </span>
                <span className="text-body-md text-ink-3">per generated hub · alpha price</span>
              </div>
              <p className="mt-4 max-w-[60ch] text-body-md text-ink-2">
                Pay once when you publish a hub. Regenerate sections, edit copy, and ship updates
                forever — no recurring charge.
              </p>

              <ul className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item.title} className="flex gap-3">
                    <span
                      className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-wash text-amber-ink"
                      aria-hidden
                    >
                      <Icon name="check" size={11} />
                    </span>
                    <div>
                      <div className="text-body-sm font-semibold text-ink">{item.title}</div>
                      <div className="mt-0.5 text-body-sm text-ink-3">{item.body}</div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Button asChild variant="accent" size="lg">
                  <Link href="/request-access">
                    Request alpha access
                    <Icon name="arrowRight" size={14} />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="lg">
                  <Link href="/case-study">View a generated hub</Link>
                </Button>
              </div>
            </div>

            <aside
              aria-label="What is and isn't in the alpha price"
              className="rounded-2xl border border-rule bg-paper p-7 shadow-1"
            >
              <div className="text-eyebrow uppercase text-ink-4">What you don&apos;t pay for</div>
              <ul className="mt-4 space-y-3 text-body-sm text-ink-2">
                <li className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
                  No platform subscription, no seat fees.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
                  No charge for regenerating sections after publish.
                </li>
                <li className="flex gap-2">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-sage" aria-hidden />
                  No revenue share when members pay you.
                </li>
              </ul>

              <div className="mt-7 border-t border-rule pt-5">
                <div className="text-eyebrow uppercase text-ink-4">Coming after alpha</div>
                <ul className="mt-4 space-y-3 text-body-sm text-ink-3">
                  <li>Team tier · per-archive flat pricing</li>
                  <li>Custom domains for hubs</li>
                  <li>Stripe Connect for paid memberships</li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="border-b border-rule bg-paper-2" aria-label="Pricing FAQ">
        <div className="mx-auto max-w-[1180px] px-6 py-24">
          <div className="text-eyebrow uppercase text-ink-4">Pricing FAQ</div>
          <h2 className="mt-3 max-w-[760px] font-serif text-display-md text-ink">
            The questions every alpha creator has asked us already.
          </h2>

          <div className="mt-10 grid gap-px overflow-hidden rounded-lg border border-rule bg-rule md:grid-cols-2">
            {FAQ.map((item) => (
              <article key={item.q} className="bg-paper p-6">
                <h3 className="text-heading-md text-ink">{item.q}</h3>
                <p className="mt-3 text-body-sm text-ink-3">{item.a}</p>
              </article>
            ))}
          </div>

          <p className="mt-10 max-w-[60ch] text-body-sm text-ink-3">
            Have a question that&apos;s not in here?{' '}
            <a
              href="mailto:hello@creatorcanon.com"
              className="font-semibold text-ink underline-offset-4 hover:underline"
            >
              hello@creatorcanon.com
            </a>{' '}
            — usually replied to within a day during alpha.
          </p>
        </div>
      </section>
    </>
  );
}
