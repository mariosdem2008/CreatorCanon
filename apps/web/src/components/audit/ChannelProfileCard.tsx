import type { ChannelProfileView } from '@/lib/audit/types';

export function ChannelProfileCard({ profile }: { profile: ChannelProfileView | null }) {
  if (!profile) {
    return (
      <div className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        Channel profile not available yet.
      </div>
    );
  }
  return (
    <section className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
      <h2 className="text-[15px] font-semibold text-[var(--cc-ink)]">Channel profile</h2>
      <p className="mt-1 text-[11px] text-[var(--cc-ink-4)]">
        Who we identified the creator as, and how we&rsquo;ll write in their voice.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {profile.creatorName ? <Field label="Creator">{profile.creatorName}</Field> : null}
        {profile.niche ? <Field label="Niche">{profile.niche}</Field> : null}
        {profile.dominantTone ? <Field label="Tone">{profile.dominantTone}</Field> : null}
        {profile.recurringPromise ? (
          <Field label="Recurring promise">{profile.recurringPromise}</Field>
        ) : null}
      </dl>
      {profile.audience ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
            Audience
          </p>
          <p className="mt-1 text-[13px] leading-[1.6] text-[var(--cc-ink-2)]">{profile.audience}</p>
        </div>
      ) : null}
      {profile.creatorTerminology.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
            Vocabulary we&rsquo;ll preserve
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.creatorTerminology.map((term) => (
              <span
                key={term}
                className="rounded-[6px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 px-2 py-0.5 text-[11px] text-[var(--cc-ink-2)]"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-[var(--cc-ink)]">{children}</dd>
    </div>
  );
}
