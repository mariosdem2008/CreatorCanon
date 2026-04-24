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
      className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-6 text-body-sm font-semibold text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 sm:w-auto sm:justify-start"
    >
      {pending ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper"
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
      className="inline-flex h-9 whitespace-nowrap items-center gap-1.5 rounded-lg border border-rule bg-paper px-4 text-body-sm font-medium text-ink transition hover:bg-paper-2 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
    >
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-ink-4/30 border-t-ink-4"
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
