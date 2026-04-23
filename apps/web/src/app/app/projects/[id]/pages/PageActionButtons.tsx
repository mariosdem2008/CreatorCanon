'use client';

import { useFormStatus } from 'react-dom';

// ── Publish hub button (top-level publish form) ──────────────────────────────

interface PublishHubButtonProps {
  label: string;
}

export function PublishHubButton({ label }: PublishHubButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      aria-label={pending ? 'Publishing hub…' : label}
      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-ink px-5 text-body-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 sm:w-auto sm:justify-start"
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

// ── Save field button (title / summary / section) ────────────────────────────

interface SaveButtonProps {
  label: string;
}

export function SaveButton({ label }: SaveButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
    >
      {pending ? (
        <>
          <span
            className="h-3 w-3 rounded-full border-2 border-ink-4/30 border-t-ink-4 animate-spin"
            aria-hidden="true"
          />
          Saving…
        </>
      ) : (
        label
      )}
    </button>
  );
}

// ── Mark reviewed button ──────────────────────────────────────────────────────

export function MarkReviewedButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-4 text-body-sm text-ink-3 transition hover:bg-paper-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 rounded-full border-2 border-ink-4/30 border-t-ink-4 animate-spin"
            aria-hidden="true"
          />
          Marking…
        </>
      ) : (
        'Mark reviewed'
      )}
    </button>
  );
}

// ── Approve page button ───────────────────────────────────────────────────────

export function ApprovePageButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
    >
      {pending ? (
        <>
          <span
            className="h-3.5 w-3.5 rounded-full border-2 border-paper/30 border-t-paper animate-spin"
            aria-hidden="true"
          />
          Approving…
        </>
      ) : (
        'Approve page'
      )}
    </button>
  );
}
