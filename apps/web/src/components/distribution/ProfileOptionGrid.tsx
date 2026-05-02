import { StatusPill } from '@/components/cc';
import {
  DISTRIBUTION_PROFILE_OPTIONS,
  type DistributionProfileType,
} from '@/lib/distribution/profiles';

interface ProfileOptionGridProps {
  selectedType: DistributionProfileType;
}

export function ProfileOptionGrid({ selectedType }: ProfileOptionGridProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-5">
      {DISTRIBUTION_PROFILE_OPTIONS.map((option) => (
        <label
          key={option.type}
          className="grid min-h-[172px] cursor-pointer gap-3 rounded-[8px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-4 transition hover:border-[var(--cc-ink-4)] has-[:checked]:border-[var(--cc-accent)] has-[:checked]:bg-[var(--cc-accent-wash)]"
        >
          <div className="flex items-start justify-between gap-2">
            <input
              className="mt-1"
              name="profileType"
              type="radio"
              value={option.type}
              defaultChecked={option.type === selectedType}
            />
            <StatusPill tone={option.backendOwner === 'none' ? 'success' : 'info'}>
              {option.badge}
            </StatusPill>
          </div>
          <div>
            <p className="text-[14px] font-semibold text-[var(--cc-ink)]">{option.label}</p>
            <p className="mt-1 text-[12px] leading-[1.5] text-[var(--cc-ink-3)]">
              {option.description}
            </p>
          </div>
          <p className="mt-auto text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--cc-ink-4)]">
            {option.authLabel}
          </p>
        </label>
      ))}
    </div>
  );
}
