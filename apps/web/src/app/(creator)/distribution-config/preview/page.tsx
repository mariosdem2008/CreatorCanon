import {
  EmailCaptureOverlay,
  MembersOnlyGate,
  PaywallPage,
  ThankYouPage,
} from '@/components/distribution';
import { createDistributionProfileDraft } from '@/lib/distribution/profiles';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Distribution preview' };

export default async function DistributionPreviewPage() {
  await requireWorkspace();

  const leadMagnet = createDistributionProfileDraft('lead_magnet');
  const paidProduct = createDistributionProfileDraft('paid_product');
  const memberLibrary = createDistributionProfileDraft('member_library');

  return (
    <div className="grid gap-8">
      <PaywallPage
        profile={paidProduct}
        hubTitle="Sample creator manual"
        creatorName="Creator name"
        checkoutHref="#stripe-phase-e"
        previewHref="/distribution-config"
      />
      <section className="mx-auto grid w-full max-w-[920px] gap-4 px-4">
        <EmailCaptureOverlay
          profile={leadMagnet}
          hubTitle="Sample creator manual"
          initiallyUnlocked
        />
        <MembersOnlyGate
          hubTitle="Sample creator manual"
          providers={[
            {
              provider: 'discord',
              label: 'Discord',
              connectHref: '/distribution-config/oauth/discord',
              requiredRole: 'members',
            },
            {
              provider: 'circle',
              label: 'Circle',
              connectHref: '/distribution-config/oauth/circle',
            },
          ]}
        />
        <ThankYouPage
          profile={leadMagnet}
          hubHref="/h/creator-manual-preview"
          secondaryHref="/distribution-config"
        />
        <div className="hidden">{memberLibrary.type}</div>
      </section>
    </div>
  );
}
