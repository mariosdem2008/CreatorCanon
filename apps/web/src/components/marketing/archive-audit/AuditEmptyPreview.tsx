import { Icon } from '@creatorcanon/ui';

const PREVIEW_SECTIONS = [
  [
    '01',
    'Archive readiness',
    'A score across source depth, knowledge density, positioning, and monetization potential.',
  ],
  [
    '02',
    'Hidden knowledge',
    'Frameworks, playbooks, proof moments, and repeated themes worth turning into pages.',
  ],
  [
    '03',
    'Hub blueprint',
    'A preview title, tracks, candidate lessons, and the strongest next build path.',
  ],
];

export function AuditEmptyPreview() {
  return (
    <div className="border border-rule bg-paper p-5 shadow-pop">
      <div className="flex items-center justify-between gap-4 border-b border-rule pb-4">
        <div>
          <p className="text-caption uppercase text-ink-4">Audit preview</p>
          <h2 className="mt-1 font-serif text-heading-lg text-ink">What the scan returns</h2>
        </div>
        <span className="flex size-10 items-center justify-center rounded-full bg-amber-wash text-amber-ink">
          <Icon name="flask" size={18} />
        </span>
      </div>

      <div className="mt-5 grid gap-3">
        {PREVIEW_SECTIONS.map(([number, title, body]) => (
          <div
            key={number}
            className="grid grid-cols-[40px_minmax(0,1fr)] gap-3 border-b border-rule pb-3 last:border-0 last:pb-0"
          >
            <span className="font-mono text-caption text-amber-ink">{number}</span>
            <div>
              <div className="text-heading-sm text-ink">{title}</div>
              <p className="mt-1 text-body-sm leading-relaxed text-ink-3">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-sage/25 bg-sage/10 mt-5 rounded-[var(--r-sm)] border px-3 py-2 text-caption text-sage">
        The audit diagnoses the opportunity. CreatorCanon builds the cited hub.
      </div>
    </div>
  );
}
