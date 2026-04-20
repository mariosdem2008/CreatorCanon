import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Button } from '@/components/ui/button';

interface CTAProps {
  heading?: string;
  subheading?: string;
}

export function CTA({
  heading = 'See what your business archive looks like as a paid knowledge product.',
  subheading = 'Walk through the demo hub or connect your channel to preview your own.',
}: CTAProps) {
  return (
    <section className="bg-ink text-paper">
      <div className="mx-auto flex max-w-[1140px] flex-col items-start justify-between gap-8 px-6 py-20 md:flex-row md:items-center">
        <div className="max-w-[680px]">
          <h2 className="font-serif text-display-md">{heading}</h2>
          <p className="mt-3 text-body-md text-paper-2/70">{subheading}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="accent" size="lg">
            <Link href="/signup">
              Connect your channel
              <Icon name="arrowRight" size={14} />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            className="border border-paper/30 bg-transparent text-paper hover:bg-paper/10"
          >
            <Link href="/case-study">View demo hub</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
