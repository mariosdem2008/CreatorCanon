import { LinkButton, Panel, PanelHeader, StatusPill } from '@/components/cc';
import type { DistributionProfileDraft } from '@/lib/distribution/profiles';

interface PaywallPageProps {
  profile: DistributionProfileDraft;
  hubTitle: string;
  creatorName: string;
  checkoutHref?: string;
  previewHref?: string;
  features?: string[];
}

const DEFAULT_FEATURES = [
  'Full source-cited library',
  'Implementation notes and summaries',
  'Future hub updates',
  'Email magic-link access',
];

export function PaywallPage({
  profile,
  hubTitle,
  creatorName,
  checkoutHref = '#stripe-checkout-pending',
  previewHref = '/',
  features = DEFAULT_FEATURES,
}: PaywallPageProps) {
  return (
    <main className="min-h-screen bg-[var(--cc-canvas)] px-4 py-10">
      <div className="mx-auto grid max-w-[1040px] gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-6 shadow-[var(--cc-shadow-1)]">
          <StatusPill tone="info">Paid access</StatusPill>
          <h1 className="mt-4 text-[32px] font-semibold leading-[1.08] text-[var(--cc-ink)]">
            {profile.funnel.paywall.headline}
          </h1>
          <p className="mt-3 max-w-[680px] text-[14px] leading-[1.65] text-[var(--cc-ink-3)]">
            {profile.funnel.paywall.body}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <LinkButton href={checkoutHref}>{profile.funnel.paywall.cta}</LinkButton>
            <LinkButton href={previewHref} variant="secondary">
              View free preview
            </LinkButton>
          </div>
        </section>

        <Panel>
          <PanelHeader title="Included" meta={profile.funnel.paywall.priceLabel} />
          <div className="grid gap-3 p-4">
            <div>
              <p className="text-[13px] font-semibold text-[var(--cc-ink)]">{hubTitle}</p>
              <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">By {creatorName}</p>
            </div>
            <ul className="grid gap-2">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 px-3 py-2 text-[12px] font-medium text-[var(--cc-ink-2)]"
                >
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>
    </main>
  );
}
