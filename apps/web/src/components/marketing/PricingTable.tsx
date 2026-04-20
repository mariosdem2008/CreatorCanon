import Link from 'next/link';

import { Icon } from '@creatorcanon/ui';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Tier {
  name: string;
  price: string;
  sub: string;
  desc: string;
  features: string[];
  cta: { label: string; href: string };
  highlight?: boolean;
  contactOnly?: boolean;
}

const TIERS: Tier[] = [
  {
    name: 'Starter',
    price: '€29',
    sub: 'per hub · archives up to ~5h',
    desc: 'A focused preview tier for small archives. Produces a structured hub with citations and section editing.',
    features: [
      'Up to 5 hours of selected source video',
      'Structured lessons and support labels',
      'Citations on every block',
      'Section-level editing',
      'Basic hub publishing on creatorcanon.com subdomain',
    ],
    cta: { label: 'Start a hub', href: '/signup' },
  },
  {
    name: 'Pro',
    price: '€149',
    sub: 'per hub · archives up to 20h',
    desc: 'The standard tier for a serious business hub. Frameworks, playbooks, grounded chat, and full editorial control.',
    features: [
      'Up to 20 hours of selected source video',
      'Frameworks, playbooks, and operator notes',
      'Grounded member chat with citations',
      'Priority pipeline queue',
      'Custom subdomain + paywall options',
    ],
    cta: { label: 'Connect your channel', href: '/signup' },
    highlight: true,
  },
  {
    name: 'Concierge',
    price: '€349+',
    sub: 'per hub · archives 20h+',
    desc: 'Hybrid engagement for large archives. Operator-led setup, transcript fixes, cluster overrides, and final QA polish.',
    features: [
      'Archives above the 20h self-serve cap',
      'Hands-on operator review before publish',
      'Transcript repair and topic renaming',
      'Custom domain and white-label options',
      'Direct line for first-week adjustments',
    ],
    cta: { label: 'Talk to us', href: 'mailto:hello@creatorcanon.com' },
    contactOnly: true,
  },
];

export function PricingTable() {
  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-[1140px] px-6 py-24">
        <div className="mx-auto max-w-[680px] text-center">
          <div className="text-eyebrow uppercase text-ink-4">Pricing</div>
          <h1 className="mt-3 font-serif text-display-lg text-ink">
            Pay for structure. Publish a business product.
          </h1>
          <p className="mt-5 text-body-lg text-ink-3">
            Start with one focused hub generation, then keep editing, hosting, and monetizing
            the frameworks your audience uses most.
          </p>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                'relative flex flex-col rounded-lg border p-8 shadow-1',
                tier.highlight
                  ? 'border-ink bg-ink text-paper'
                  : 'border-rule bg-paper text-ink',
              )}
            >
              {tier.highlight && (
                <div className="absolute -top-3 left-6">
                  <Badge variant="amber">Recommended</Badge>
                </div>
              )}

              <div
                className={cn(
                  'text-heading-md',
                  tier.highlight ? 'text-paper' : 'text-ink',
                )}
              >
                {tier.name}
              </div>

              <div className="mt-5 flex items-baseline gap-2">
                <span className="font-serif text-display-lg">{tier.price}</span>
                <span
                  className={cn(
                    'text-body-sm',
                    tier.highlight ? 'text-paper-2/70' : 'text-ink-3',
                  )}
                >
                  {tier.sub}
                </span>
              </div>

              <p
                className={cn(
                  'mt-4 min-h-[72px] text-body-sm',
                  tier.highlight ? 'text-paper-2/80' : 'text-ink-3',
                )}
              >
                {tier.desc}
              </p>

              <Button
                asChild
                variant={tier.highlight ? 'accent' : 'primary'}
                size="lg"
                className="mt-6 w-full"
              >
                <Link href={tier.cta.href}>{tier.cta.label}</Link>
              </Button>

              <ul className="mt-7 space-y-2.5 text-body-sm">
                {tier.features.map((f, j) => (
                  <li
                    key={j}
                    className={cn(
                      'flex items-start gap-3 border-t pt-2.5',
                      j === 0 && 'border-t-0 pt-0',
                      tier.highlight ? 'border-rule-dark' : 'border-rule',
                    )}
                  >
                    <Icon
                      name="check"
                      size={14}
                      className={cn(
                        'mt-0.5 shrink-0',
                        tier.highlight ? 'text-amber' : 'text-ink-3',
                      )}
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-caption text-ink-4">
          Self-serve tiers cap at 20 hours of selected source video to keep cost, quality, and
          pipeline time predictable. Larger archives move to Concierge, where an operator handles
          transcript repair and cluster review before publish.
        </p>
      </div>
    </section>
  );
}
