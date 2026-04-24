import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Pricing — CreatorCanon',
  description:
    'One flat price per hub — $29 during private alpha. No subscriptions, no seat fees.',
  openGraph: {
    title: 'Pricing — CreatorCanon',
    description:
      'One flat price per hub — $29 during private alpha. No subscriptions, no seat fees.',
    url: 'https://www.creatorcanon.com/pricing',
  },
  twitter: {
    title: 'Pricing — CreatorCanon',
    description:
      'One flat price per hub — $29 during private alpha. No subscriptions, no seat fees.',
  },
};

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-24">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        Pricing
      </p>
      <h1 className="mt-3 font-serif text-[44px] leading-[1.05] tracking-[-0.025em] md:text-[56px]">
        One hub. One price.
      </h1>
      <p className="mt-6 max-w-[60ch] text-body-lg leading-relaxed text-ink-2">
        CreatorCanon is in private alpha. Every generated hub is a flat{' '}
        <strong>$29</strong> — unlimited section regenerations after publish,
        unlimited edits, your own URL. No subscription, no seat fees.
      </p>

      <div className="mt-10 rounded-xl border border-rule bg-paper-2 p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Included
        </p>
        <ul className="mt-4 space-y-2 text-ink-2">
          <li>LLM-grounded prose with citation moments linked to the source video timestamps.</li>
          <li>Three premium hub templates: Editorial Atlas, Playbook OS, Studio Vault.</li>
          <li>Full review + edit workflow before you publish.</li>
          <li>Hub hosted at a public URL you own.</li>
        </ul>
        <Link
          href="/request-access"
          className="mt-8 inline-flex h-11 items-center rounded-md bg-ink px-5 font-semibold text-paper transition hover:bg-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
        >
          Request alpha access →
        </Link>
      </div>

      <p className="mt-10 text-sm text-ink-3">
        Higher-volume tiers are post-alpha. Reach out if you have a 50+ video
        archive and want to be first.
      </p>
    </main>
  );
}
