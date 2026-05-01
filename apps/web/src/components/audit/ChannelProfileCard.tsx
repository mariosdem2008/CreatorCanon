import type { ChannelProfileView } from '@/lib/audit/types';

const KNOWN_KEYS = new Set([
  'creatorName',
  'niche',
  'audience',
  'dominantTone',
  'recurringPromise',
  'whyPeopleFollow',
  'expertiseCategory',
  'monetizationAngle',
  'positioningSummary',
  'contentFormats',
  'recurringThemes',
  'creatorTerminology',
]);

export function ChannelProfileCard({ profile }: { profile: ChannelProfileView | null }) {
  if (!profile) {
    return (
      <div className="rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/40 p-4 text-[12px] text-[var(--cc-ink-3)]">
        Channel profile not available yet.
      </div>
    );
  }
  const extras = Object.entries(profile.payload).filter(([k, v]) => !KNOWN_KEYS.has(k) && v != null);
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
        {profile.expertiseCategory ? (
          <Field label="Expertise category">{profile.expertiseCategory}</Field>
        ) : null}
        {profile.monetizationAngle ? (
          <Field label="Monetization angle">{profile.monetizationAngle}</Field>
        ) : null}
        {profile.recurringPromise ? (
          <Field label="Recurring promise">{profile.recurringPromise}</Field>
        ) : null}
      </dl>

      {profile.audience ? (
        <Block label="Audience">{profile.audience}</Block>
      ) : null}
      {profile.whyPeopleFollow ? (
        <Block label="Why people follow">{profile.whyPeopleFollow}</Block>
      ) : null}
      {profile.positioningSummary ? (
        <Block label="Positioning summary">{profile.positioningSummary}</Block>
      ) : null}

      {profile.contentFormats.length > 0 ? (
        <ChipBlock label="Content formats" items={profile.contentFormats} />
      ) : null}
      {profile.recurringThemes.length > 0 ? (
        <ChipBlock label="Recurring themes" items={profile.recurringThemes} />
      ) : null}
      {profile.creatorTerminology.length > 0 ? (
        <ChipBlock label="Vocabulary we’ll preserve" items={profile.creatorTerminology} />
      ) : null}

      {extras.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-[var(--cc-rule)]/60 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
            Other extracted fields
          </p>
          {extras.map(([k, v]) => (
            <ExtrasRow key={k} label={prettyKey(k)} value={v} />
          ))}
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

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
        {label}
      </p>
      <p className="mt-1 text-[13px] leading-[1.6] text-[var(--cc-ink-2)]">{children}</p>
    </div>
  );
}

function ChipBlock({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
        {label} ({items.length})
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {items.map((term) => (
          <span
            key={term}
            className="rounded-[6px] border border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 px-2 py-0.5 text-[11px] text-[var(--cc-ink-2)]"
          >
            {term}
          </span>
        ))}
      </div>
    </div>
  );
}

function ExtrasRow({ label, value }: { label: string; value: unknown }) {
  if (typeof value === 'string') {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
          {label}
        </p>
        <p className="mt-0.5 text-[12px] leading-[1.55] text-[var(--cc-ink-2)]">{value}</p>
      </div>
    );
  }
  if (Array.isArray(value)) {
    return (
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
          {label}
        </p>
        <ul className="mt-0.5 list-disc pl-5 text-[12px] text-[var(--cc-ink-2)]">
          {value.map((item, i) => (
            <li key={i}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

function prettyKey(camel: string): string {
  const out = camel.replace(/([A-Z])/g, ' $1').toLowerCase();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
