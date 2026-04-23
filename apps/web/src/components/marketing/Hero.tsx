import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const HERO_CHIPS = [
  'More useful than a playlist',
  'Looks premium enough to charge for',
  "Keeps the creator\u2019s core phrasing",
  'Built for members, not browsers',
];

export function Hero() {
  return (
    <section className="dotgrid border-b border-rule" aria-label="Introduction">
      <div className="mx-auto max-w-[1140px] px-6 py-24 animate-fade-up">
        <Badge variant="amber" className="mb-7">
          <span className="size-1.5 rounded-full bg-amber" aria-hidden />
          Framework creator studio
        </Badge>

        <h1 className="font-serif text-display-xl text-ink max-w-[980px] tracking-[-0.025em]">
          Turn your videos into a{' '}
          <em className="italic text-amber-ink">premium</em> business knowledge system.
        </h1>

        <p className="mt-6 max-w-[60ch] text-body-lg text-ink-2 leading-relaxed">
          CreatorCanon helps business creators turn repeat lessons, frameworks, and operating
          advice into a source-linked hub with playbooks, searchable lessons, grounded answers,
          and a product their audience can pay to use.
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
            <Link href="/sign-in">
              Start a hub
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/case-study">
              <Icon name="play" size={12} aria-hidden />
              View demo hub
            </Link>
          </Button>
          <span className="ml-2 text-caption text-ink-4" aria-hidden>
            Frameworks · playbooks · grounded answers
          </span>
        </div>
      </div>
    </section>
  );
}
