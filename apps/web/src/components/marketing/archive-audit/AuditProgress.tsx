'use client';

import { useFormStatus } from 'react-dom';

import { Icon } from '@creatorcanon/ui';

const STEPS = [
  'Resolving channel',
  'Reading public archive',
  'Sampling transcripts',
  'Mapping hub potential',
  'Preparing report',
];

export function AuditProgress() {
  const { pending } = useFormStatus();
  if (!pending) return null;

  return (
    <div className="mt-6 border-t border-rule pt-5">
      <div className="flex items-center gap-2 text-caption font-medium uppercase text-amber-ink">
        <Icon name="sparkle" size={14} />
        Audit running
      </div>
      <ol className="mt-4 grid gap-2">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-3 text-body-sm text-ink-3">
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                index === 0
                  ? 'border-amber bg-amber text-paper'
                  : 'border-rule-strong bg-paper text-ink-4'
              }`}
            >
              {index === 0 ? <Icon name="refresh" size={12} className="animate-spin" /> : index + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}
