import { LinkButton, Panel, PanelHeader, StatusPill } from '@/components/cc';
import type { OAuthProvider } from '@/lib/distribution/profiles';

interface OAuthProviderOption {
  provider: OAuthProvider;
  label: string;
  connectHref: string;
  requiredRole?: string;
}

interface MembersOnlyGateProps {
  hubTitle: string;
  body?: string;
  providers: OAuthProviderOption[];
  deniedReason?: string | null;
}

export function MembersOnlyGate({
  hubTitle,
  body = 'Connect your community account so CreatorCanon can confirm membership before opening the private hub.',
  providers,
  deniedReason = null,
}: MembersOnlyGateProps) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--cc-canvas)] px-4 py-10">
      <Panel className="w-full max-w-[560px]">
        <PanelHeader title="Members only" meta={<StatusPill tone="info">Community</StatusPill>} />
        <div className="grid gap-4 p-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-ink-4)]">
              {hubTitle}
            </p>
            <h1 className="mt-2 text-[26px] font-semibold leading-tight text-[var(--cc-ink)]">
              Verify your membership
            </h1>
            <p className="mt-2 text-[13px] leading-[1.6] text-[var(--cc-ink-3)]">
              {body}
            </p>
          </div>
          {deniedReason ? (
            <div className="rounded-[8px] border border-[var(--cc-danger)]/40 bg-[var(--cc-danger-wash)]/50 px-3 py-2 text-[12px] text-[var(--cc-ink-2)]">
              {deniedReason}
            </div>
          ) : null}
          <div className="grid gap-2">
            {providers.map((item) => (
              <div
                key={item.provider}
                className="flex flex-col gap-2 rounded-[10px] border border-[var(--cc-rule)] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-[13px] font-semibold text-[var(--cc-ink)]">
                    {item.label}
                  </p>
                  <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
                    {item.requiredRole
                      ? `Requires ${item.requiredRole}`
                      : 'Uses community membership status'}
                  </p>
                </div>
                <LinkButton href={item.connectHref} variant="secondary">
                  Connect
                </LinkButton>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </main>
  );
}
