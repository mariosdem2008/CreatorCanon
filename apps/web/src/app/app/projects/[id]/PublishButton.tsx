'use client';

import { useFormStatus } from 'react-dom';

interface PublishButtonProps {
  label: string;
}

export function PublishButton({ label }: PublishButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? 'Publishing…' : label}
      className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber sm:justify-start"
    >
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 rounded-full border-2 border-paper/30 border-t-paper animate-spin"
            aria-hidden="true"
          />
          Publishing…
        </>
      ) : (
        label
      )}
    </button>
  );
}
