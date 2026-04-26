import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Button } from '@/components/ui/button';

interface CTAProps {
  heading?: string;
  subheading?: string;
}

export function CTA({
  heading = 'See what your archive looks like as a paid knowledge product.',
  subheading = 'Request alpha access — we email you when your seat is ready, then you generate your first hub for $29.',
}: CTAProps) {
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto flex max-w-[1180px] flex-col items-start justify-between gap-10 px-6 py-24 lg:flex-row lg:items-center">
        <div className="max-w-[720px]">
          <span className="inline-flex items-center gap-2 rounded-full border border-paper/15 px-3 py-1 text-caption text-paper-2/80">
            <span className="size-1.5 rounded-full bg-amber" aria-hidden />
            Private alpha · invite-only
          </span>
          <h2 className="mt-5 font-serif text-display-md">{heading}</h2>
          <p className="mt-4 max-w-[60ch] text-body-md text-paper-2/70">{subheading}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="accent" size="lg">
            <Link href="/request-access">
              Request alpha access
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="border border-paper/30 bg-transparent text-paper hover:bg-paper/10"
          >
            <Link href="/case-study">View a generated hub</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
