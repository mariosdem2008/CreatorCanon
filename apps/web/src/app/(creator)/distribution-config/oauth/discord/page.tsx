import { MembersOnlyGate, OAuthProviderSetup } from '@/components/distribution';
import { PageHeader } from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Discord member access' };

export default async function DiscordOAuthSetupPage() {
  await requireWorkspace();

  return (
    <div className="mx-auto grid max-w-[960px] gap-4 px-4 py-6">
      <PageHeader
        eyebrow="Distribution OAuth"
        title="Discord member access"
        body="Creator-side setup UI for Discord membership gating. The backend branch owns code exchange, token storage, and role validation."
      />
      <OAuthProviderSetup
        provider="discord"
        callbackUrl="/api/distribution/oauth-callback?provider=discord"
      />
      <MembersOnlyGate
        hubTitle="Preview hub"
        providers={[
          {
            provider: 'discord',
            label: 'Discord',
            connectHref: '#discord-auth-url-pending',
            requiredRole: 'members',
          },
        ]}
      />
    </div>
  );
}
