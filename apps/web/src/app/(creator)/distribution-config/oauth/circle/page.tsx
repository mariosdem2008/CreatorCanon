import { MembersOnlyGate, OAuthProviderSetup } from '@/components/distribution';
import { PageHeader } from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Circle member access' };

export default async function CircleOAuthSetupPage() {
  await requireWorkspace();

  return (
    <div className="mx-auto grid max-w-[960px] gap-4 px-4 py-6">
      <PageHeader
        eyebrow="Distribution OAuth"
        title="Circle member access"
        body="Creator-side setup UI for Circle membership gating. Backend validation is intentionally deferred to Claude's Phase C branch."
      />
      <OAuthProviderSetup
        provider="circle"
        callbackUrl="/api/distribution/oauth-callback?provider=circle"
      />
      <MembersOnlyGate
        hubTitle="Preview hub"
        providers={[
          {
            provider: 'circle',
            label: 'Circle',
            connectHref: '#circle-auth-url-pending',
            requiredRole: 'active member',
          },
        ]}
      />
    </div>
  );
}
