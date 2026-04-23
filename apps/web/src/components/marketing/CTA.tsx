import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Button } from '@/components/ui/button';

interface CTAProps {
  heading?: string;
  subheading?: string;
}

export function CTA({
  heading = 'Your archive already contains the knowledge. CreatorCanon gives it a structure readers can use.',
  subheading = 'Alpha access is by invitation. Browse the live demo hubs to see what a finished hub looks like, then apply.',
}: CTAProps) {
  return (
    <section
      id="footer-cta"
      aria-labelledby="footer-cta-heading"
      className="bg-ink text-paper"
    >
      <div className="mx-auto flex max-w-[1140px] flex-col items-start justify-between gap-8 px-6 py-24 md:flex-row md:items-center">
        <div className="max-w-[640px]">
          <h2
            id="footer-cta-heading"
            className="font-serif text-display-md tracking-[-0.025em] leading-[1.15]"
          >
            {heading}
          </h2>
          <p className="mt-4 text-body-md text-paper-2/70 leading-[1.65]">{subheading}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <Button asChild variant="accent" size="lg">
            <Link href="/sign-in">
              Request alpha access
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="border border-paper/30 bg-transparent text-paper hover:bg-paper/10"
          >
            <Link href="#demo">View demo hubs</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
