import { Panel, PanelHeader, StatusPill } from '@/components/cc';
import type { DistributionProfileDraft } from '@/lib/distribution/profiles';

interface DistributionConfigPanelProps {
  profile: DistributionProfileDraft;
}

export function DistributionConfigPanel({ profile }: DistributionConfigPanelProps) {
  return (
    <Panel>
      <PanelHeader
        title="Profile contract"
        meta={<StatusPill tone="neutral">{profile.type.replaceAll('_', ' ')}</StatusPill>}
      />
      <div className="grid gap-4 p-4 lg:grid-cols-3">
        <ConfigBlock title="Access rules">
          {profile.gatingRules.length > 0 ? (
            profile.gatingRules.map((rule) => (
              <p key={`${rule.routePattern}:${rule.requirement}`}>
                {rule.routePattern} requires {rule.requirement}
              </p>
            ))
          ) : (
            <p>No gates for this profile.</p>
          )}
        </ConfigBlock>
        <ConfigBlock title="Provider">
          <p>ESP: {profile.espProvider ?? 'none'}</p>
          <p>OAuth: {profile.oauthProvider ?? 'none'}</p>
        </ConfigBlock>
        <ConfigBlock title="Analytics tags">
          {profile.analyticsTags.map((tag) => (
            <p key={tag}>{tag}</p>
          ))}
        </ConfigBlock>
      </div>
    </Panel>
  );
}

function ConfigBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/55 p-3">
      <p className="text-[12px] font-semibold text-[var(--cc-ink)]">{title}</p>
      <div className="mt-2 grid gap-1 text-[12px] leading-[1.5] text-[var(--cc-ink-3)]">
        {children}
      </div>
    </div>
  );
}
