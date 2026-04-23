import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Button } from '@/components/ui/button';

export function Hero() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-heading"
      className="border-b border-rule bg-paper"
    >
      {/* Top rule lines — typographic anchor */}
      <div className="border-b border-rule/40" aria-hidden />

      <div className="mx-auto max-w-[1140px] px-6 py-20 md:py-28">
        {/* Alpha badge */}
        <div className="mb-8 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber-wash px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-amber-ink">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-ink" aria-hidden />
            Private alpha
          </span>
        </div>

        {/* Headline */}
        <h1
          id="hero-heading"
          className="max-w-[840px] font-serif text-display-xl text-ink tracking-[-0.025em] leading-[1.08]"
        >
          Your YouTube archive,{' '}
          <br className="hidden sm:block" />
          rebuilt as a knowledge hub.
        </h1>

        {/* Subheader — one sentence */}
        <p className="mt-7 max-w-[56ch] text-body-lg text-ink-2 leading-[1.7]">
          CreatorCanon turns a creator&apos;s video archive into a hosted, searchable website
          where every lesson is structured, every claim links back to its source moment, and
          readers can navigate your ideas like an encyclopedia.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button asChild variant="accent" size="lg">
            <Link href="/sign-in">
              Request alpha access
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="#demo">
              View live demo
            </Link>
          </Button>
        </div>

        {/* Contextual note */}
        <p className="mt-6 text-caption text-ink-4">
          Invite-only · no credit card required during alpha
        </p>

        {/* Horizontal rule divider — editorial visual anchor */}
        <div className="mt-16 grid grid-cols-[1fr_auto_1fr] items-center gap-4" aria-hidden>
          <div className="h-px bg-rule" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-5">
            creator canon
          </span>
          <div className="h-px bg-rule" />
        </div>

        {/* Value props row */}
        <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
          {[
            { term: 'Archive', def: 'Any YouTube channel with 2+ years of teaching content' },
            { term: 'Structure', def: 'Framework tracks, lesson pages, citation links' },
            { term: 'Ownership', def: 'Your hub, your domain, your content' },
            { term: 'Readability', def: 'Prose chapters — not transcripts, not summaries' },
          ].map(({ term, def }) => (
            <div key={term}>
              <dt className="text-eyebrow uppercase text-ink-4">{term}</dt>
              <dd className="mt-1.5 text-body-sm text-ink-2 leading-[1.6]">{def}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
