'use client';

import { useFormStatus } from 'react-dom';

const primary =
  'inline-flex items-center justify-center gap-1.5 rounded-[8px] bg-[var(--cc-accent)] text-white font-semibold transition-colors hover:bg-[var(--cc-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--cc-canvas)] shadow-[0_1px_2px_rgba(88,86,246,0.18)]';

const ghost =
  'inline-flex items-center justify-center gap-1.5 rounded-[8px] border border-[var(--cc-rule)] bg-white text-[var(--cc-ink)] font-semibold transition-colors hover:border-[var(--cc-ink-4)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cc-accent)]';

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
      className={`${primary} h-9 px-4 text-[13px]`}
    >
      {pending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          Publishing…
        </>
      ) : (
        label
      )}
    </button>
  );
}

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
      className={`${ghost} h-8 px-3 text-[12px]`}
    >
      {pending ? (
        <>
          <span
            className="size-3 animate-spin rounded-full border-2 border-[var(--cc-ink-4)]/30 border-t-[var(--cc-ink-4)]"
            aria-hidden
          />
          Saving…
        </>
      ) : (
        label
      )}
    </button>
  );
}

export function MarkReviewedButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${ghost} h-9 px-3.5 text-[12px]`}
    >
      {pending ? (
        <>
          <span
            className="size-3.5 animate-spin rounded-full border-2 border-[var(--cc-ink-4)]/30 border-t-[var(--cc-ink-4)]"
            aria-hidden
          />
          Marking…
        </>
      ) : (
        'Mark reviewed'
      )}
    </button>
  );
}

export function ApprovePageButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${primary} h-9 px-3.5 text-[12px]`}
    >
      {pending ? (
        <>
          <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
          Approving…
        </>
      ) : (
        'Approve page'
      )}
    </button>
  );
}
