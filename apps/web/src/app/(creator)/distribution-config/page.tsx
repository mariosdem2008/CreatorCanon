import Link from 'next/link';

import {
  DistributionConfigPanel,
  OAuthProviderSetup,
  ProfileOptionGrid,
  ShareCard,
} from '@/components/distribution';
import {
  Button,
  LinkButton,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
} from '@/components/cc';
import {
  createDistributionProfileDraft,
  DISTRIBUTION_PROFILE_OPTIONS,
} from '@/lib/distribution/profiles';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Distribution profile' };

export default async function DistributionConfigPage() {
  await requireWorkspace();

  const selectedProfile = createDistributionProfileDraft('lead_magnet');

  return (
    <div className="mx-auto max-w-[1180px] space-y-4 px-4 py-6">
      <PageHeader
        eyebrow="Distribution"
        title="Configure how this hub is packaged"
        body="Choose the access model and funnel UI for a generated hub. Backend validation, ESP persistence, OAuth exchange, and export jobs are intentionally left to the Phase C backend branch."
        actions={
          <LinkButton href="/app/projects" variant="secondary">
            Back to projects
          </LinkButton>
        }
      />

      <form className="grid gap-4">
        <Panel>
          <PanelHeader title="Profile" meta={<StatusPill tone="info">UI contract</StatusPill>} />
          <div className="grid gap-4 p-4">
            <ProfileOptionGrid selectedType={selectedProfile.type} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/55 px-4 py-3">
              <p className="text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
                Saved values will map to Claude-owned `distribution_profile`
                persistence once that branch lands.
              </p>
              <Button type="button" variant="secondary">
                Save draft
              </Button>
            </div>
          </div>
        </Panel>

        <DistributionConfigPanel profile={selectedProfile} />

        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <Panel>
            <PanelHeader title="Funnel copy" />
            <div className="grid gap-3 p-4">
              <TextField
                label="Email capture headline"
                name="emailCaptureHeadline"
                defaultValue={selectedProfile.funnel.emailCapture.headline}
              />
              <TextArea
                label="Email capture body"
                name="emailCaptureBody"
                defaultValue={selectedProfile.funnel.emailCapture.body}
              />
              <TextField
                label="Paywall headline"
                name="paywallHeadline"
                defaultValue={selectedProfile.funnel.paywall.headline}
              />
              <TextArea
                label="Member gate body"
                name="memberGateBody"
                defaultValue={selectedProfile.funnel.memberGate.body}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Preview assets" meta="Share card" />
            <div className="p-4">
              <ShareCard
                quote="Make the lesson useful before you make it loud."
                creatorName="Creator name"
                hubTitle="Sample hub"
                attribution="Distribution preview"
              />
            </div>
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <OAuthProviderSetup
            provider="discord"
            callbackUrl="/api/distribution/oauth-callback?provider=discord"
          />
          <OAuthProviderSetup
            provider="circle"
            callbackUrl="/api/distribution/oauth-callback?provider=circle"
          />
        </div>
      </form>

      <Panel>
        <PanelHeader title="Profile coverage" />
        <div className="grid gap-px bg-[var(--cc-rule)] md:grid-cols-5">
          {DISTRIBUTION_PROFILE_OPTIONS.map((option) => (
            <Link
              key={option.type}
              href={
                option.type === 'member_library'
                  ? '/distribution-config/oauth/discord'
                  : '/distribution-config/preview'
              }
              className="bg-[var(--cc-surface)] px-4 py-3 transition hover:bg-[var(--cc-surface-2)]"
            >
              <p className="text-[12px] font-semibold text-[var(--cc-ink)]">
                {option.label}
              </p>
              <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">{option.authLabel}</p>
            </Link>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function TextField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--cc-ink-2)]">{label}</span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[14px] text-[var(--cc-ink)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[12px] font-semibold text-[var(--cc-ink-2)]">{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue}
        rows={4}
        className="rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[13px] leading-[1.55] text-[var(--cc-ink-2)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
      />
    </label>
  );
}
