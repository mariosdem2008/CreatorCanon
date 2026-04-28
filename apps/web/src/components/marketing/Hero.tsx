import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const HERO_CHIPS = [
  'Source-grounded',
  'Cited every claim',
  'Members can chat your archive',
  'Premium templates',
];

export function Hero() {
  return (
    <section className="dotgrid border-b border-rule" aria-label="Introduction">
      <div className="mx-auto grid max-w-[1180px] gap-12 px-6 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-12 lg:py-28 animate-fade-up">
        <div className="min-w-0">
          <Badge variant="amber" className="mb-7">
            <span className="size-1.5 rounded-full bg-amber" aria-hidden />
            Private alpha — for serious business creators
          </Badge>

          <h1 className="font-serif text-display-xl text-ink max-w-[820px] tracking-[0]">
            Your archive becomes a{' '}
            <em className="italic text-amber-ink">premium</em> knowledge product your audience can actually use.
          </h1>

          <p className="mt-6 max-w-[58ch] text-body-lg text-ink-2 leading-relaxed">
            CreatorCanon turns the lessons you keep repeating on YouTube into a structured,
            source-cited hub — frameworks, playbooks, and a grounded chat that always points
            back to the exact moment in the source video.
          </p>

          <div className="mt-5 flex flex-wrap gap-2" role="list" aria-label="Key qualities">
            {HERO_CHIPS.map((chip) => (
              <span key={chip} role="listitem">
                <Badge variant="default">{chip}</Badge>
              </span>
            ))}
          </div>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/request-access">
                Request alpha access
                <Icon name="arrowRight" size={14} />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/case-study">
                <Icon name="play" size={12} aria-hidden />
                See a generated hub
              </Link>
            </Button>
          </div>

          <p className="mt-5 text-caption text-ink-4">
            $29 per generated hub during alpha · No subscription · You keep the URL
          </p>
        </div>

        <HubPreview />
      </div>
    </section>
  );
}

// Static, lightweight preview of what a finished CreatorCanon hub looks like.
// Pure presentation — no interactivity, no API calls.
function HubPreview() {
  return (
    <div
      aria-label="Preview of a published CreatorCanon hub"
      className="relative w-full max-w-[460px] justify-self-end"
    >
      <div className="relative overflow-hidden rounded-2xl border border-rule bg-paper shadow-pop">
        <div className="flex items-center justify-between border-b border-rule bg-paper-2 px-4 py-2.5 text-caption">
          <span className="font-mono text-ink-4 tabular-nums">creatorcanon.com/h/operator-ledger</span>
          <span className="rounded-full border border-sage/30 bg-sage/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sage">
            Live
          </span>
        </div>

        <div className="grid grid-cols-[140px_minmax(0,1fr)] divide-x divide-rule">
          <nav aria-hidden className="space-y-1.5 bg-paper-warm/60 p-3 text-[11px] text-ink-3">
            <div className="text-eyebrow uppercase text-ink-4">Tracks</div>
            {[
              ['01', 'Operator playbooks'],
              ['02', 'Pricing & offers'],
              ['03', 'Hiring & ops'],
              ['04', 'Sales motions'],
            ].map(([n, label], i) => (
              <div
                key={n}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 ${
                  i === 0 ? 'bg-paper text-ink shadow-1' : ''
                }`}
              >
                <span className="font-mono text-[10px] text-amber-ink">{n}</span>
                <span className="truncate">{label}</span>
              </div>
            ))}
          </nav>

          <div className="space-y-3 p-4">
            <div className="text-eyebrow uppercase text-amber-ink">Lesson 03</div>
            <h3 className="font-serif text-[20px] leading-[1.2] tracking-[0] text-ink">
              The four conversations that close a $50k contract.
            </h3>
            <p className="text-body-sm text-ink-3">
              Pricing anchors, scope guarantees, and the one objection that almost always wrecks
              a closed-won deal in the last 24 hours.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-sage/30 bg-sage/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sage">
                <span className="size-1.5 rounded-full bg-sage" aria-hidden />
                Well supported
              </span>
              <span className="text-caption text-ink-4">7 source moments</span>
            </div>

            <div className="rounded-lg border border-rule bg-paper-2 p-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-amber-ink">14:08–14:42</span>
                <Icon name="play" size={11} className="text-ink-4" aria-hidden />
              </div>
              <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.55] text-ink-2">
                &ldquo;Pricing isn&apos;t something you defend. It&apos;s something you earn the right to charge — by the third question, the answer is already obvious to them.&rdquo;
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-rule bg-paper-warm px-4 py-2 text-[11px] text-ink-4">
          <span>Grounded chat · members only</span>
          <span className="font-mono tabular-nums">18 lessons · 142 source moments</span>
        </div>
      </div>
    </div>
  );
}
