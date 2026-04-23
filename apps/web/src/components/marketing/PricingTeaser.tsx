import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

export function PricingTeaser() {
  return (
    <section
      id="pricing-teaser"
      aria-labelledby="pricing-teaser-heading"
      className="border-b border-rule bg-paper"
    >
      <div className="mx-auto max-w-[1140px] px-6 py-16">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-[560px]">
            <div className="text-eyebrow uppercase text-ink-4">Pricing</div>
            <p
              id="pricing-teaser-heading"
              className="mt-2 text-body-lg text-ink-2 leading-[1.65]"
            >
              Alpha access is by invitation; pricing is published and straightforward — one hub, one flat rate, no seat fees.
            </p>
          </div>
          <Link
            href="/pricing"
            className="inline-flex shrink-0 items-center gap-2 rounded text-body-md font-medium text-ink underline-offset-4 transition-colors hover:text-amber-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            See pricing
            <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}
