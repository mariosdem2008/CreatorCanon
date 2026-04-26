'use client';

import { useFormStatus } from 'react-dom';

export function CheckoutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? 'Processing payment' : 'Pay to queue run'}
      className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--cc-accent)] px-6 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] transition hover:bg-[var(--cc-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--cc-canvas)]"
    >
      {pending ? (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
            aria-hidden="true"
          />
          Processing...
        </>
      ) : (
        'Pay to queue run'
      )}
    </button>
  );
}
