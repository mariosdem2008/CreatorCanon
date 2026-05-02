import { LinkButton, Panel, PanelHeader, StatusPill } from '@/components/cc';
import type { DistributionProfileDraft } from '@/lib/distribution/profiles';

interface ThankYouPageProps {
  profile: DistributionProfileDraft;
  hubHref: string;
  secondaryHref?: string;
}

export function ThankYouPage({
  profile,
  hubHref,
  secondaryHref = '/',
}: ThankYouPageProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--cc-canvas)] px-4 py-10">
      <Panel className="w-full max-w-[520px]">
        <PanelHeader title="Access confirmed" meta={<StatusPill tone="success">Unlocked</StatusPill>} />
        <div className="grid gap-4 p-5">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight text-[var(--cc-ink)]">
              {profile.funnel.thankYou.headline}
            </h1>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--cc-ink-3)]">
              {profile.funnel.thankYou.body}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={hubHref}>Open hub</LinkButton>
            <LinkButton href={secondaryHref} variant="secondary">
              Back to preview
            </LinkButton>
          </div>
        </div>
      </Panel>
    </main>
  );
}
