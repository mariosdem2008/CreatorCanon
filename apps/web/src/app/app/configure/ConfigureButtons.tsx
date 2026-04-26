'use client';

import { useFormStatus } from 'react-dom';

interface ConfigureSubmitButtonProps {
  label: string;
  pendingLabel?: string;
}

export function ConfigureSubmitButton({
  label,
  pendingLabel = 'Processing...',
}: ConfigureSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-[var(--cc-accent)] px-5 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] transition hover:bg-[var(--cc-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--cc-canvas)]"
    >
      {pending ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          {pendingLabel}
        </>
      ) : (
        <>
          {label}
          <span aria-hidden="true">&rarr;</span>
        </>
      )}
    </button>
  );
}

export function CheckSourceButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] transition hover:border-[var(--cc-ink-4)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)]"
    >
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--cc-ink-4)]/30 border-t-[var(--cc-ink-4)]"
            aria-hidden="true"
          />
          Checking...
        </>
      ) : (
        'Check transcript support'
      )}
    </button>
  );
}
