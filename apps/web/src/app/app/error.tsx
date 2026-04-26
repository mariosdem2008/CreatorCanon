'use client';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto max-w-[640px] rounded-[12px] border border-[var(--cc-danger)]/40 bg-[var(--cc-surface)] p-7 text-center shadow-[var(--cc-shadow-1)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-danger)]">
        Workspace error
      </p>
      <h1 className="mt-2.5 text-[24px] font-semibold tracking-[-0.01em] text-[var(--cc-ink)]">
        This workspace view couldn&apos;t load.
      </h1>
      <p className="mx-auto mt-2.5 max-w-[480px] text-[13px] leading-[1.55] text-[var(--cc-ink-3)]">
        Retry the request. If it fails again, use the support IDs on the related project page or
        check provider credentials.
      </p>
      {error.digest ? (
        <p className="mt-4 font-mono text-[11px] text-[var(--cc-ink-4)]">
          Digest: {error.digest}
        </p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="mt-5 inline-flex h-10 items-center rounded-[8px] bg-[var(--cc-accent)] px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] transition hover:bg-[var(--cc-accent-strong)]"
      >
        Retry
      </button>
    </section>
  );
}
