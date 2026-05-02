import { LinkButton, Panel, PanelHeader, StatusPill } from '@/components/cc';
import type { OAuthProvider } from '@/lib/distribution/profiles';

interface OAuthProviderSetupProps {
  provider: OAuthProvider;
  callbackUrl: string;
  docsHref?: string;
}

const providerLabels: Record<OAuthProvider, string> = {
  discord: 'Discord',
  circle: 'Circle',
};

export function OAuthProviderSetup({
  provider,
  callbackUrl,
  docsHref = '/help',
}: OAuthProviderSetupProps) {
  return (
    <Panel>
      <PanelHeader
        title={`${providerLabels[provider]} OAuth`}
        meta={<StatusPill tone="info">Creator setup</StatusPill>}
      />
      <div className="grid gap-4 p-4">
        <p className="text-[13px] leading-[1.6] text-[var(--cc-ink-3)]">
          Add this callback URL to your {providerLabels[provider]} app. Claude's
          backend branch will handle code exchange and membership validation.
        </p>
        <div className="rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 font-mono text-[12px] text-[var(--cc-ink-2)]">
          {callbackUrl}
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href={docsHref} variant="secondary">
            Setup guide
          </LinkButton>
          <LinkButton href={`/distribution-config/oauth/${provider}`} variant="ghost">
            Open setup
          </LinkButton>
        </div>
      </div>
    </Panel>
  );
}
