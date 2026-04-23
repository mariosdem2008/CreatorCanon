'use client';

import { useFormStatus } from 'react-dom';

export function CheckoutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? 'Processing payment…' : 'Pay to queue run'}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-ink px-6 text-body-sm font-semibold text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <span
            className="h-4 w-4 rounded-full border-2 border-paper/30 border-t-paper animate-spin"
            aria-hidden="true"
          />
          Processing…
        </>
      ) : (
        'Pay to queue run'
      )}
    </button>
  );
}
