import Link from 'next/link';

export default function AppNotFound() {
  return (
    <section className="mx-auto max-w-[640px] rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-7 text-center shadow-[var(--cc-shadow-1)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--cc-ink-4)]">
        Not found
      </p>
      <h1 className="mt-2.5 text-[24px] font-semibold tracking-[-0.01em] text-[var(--cc-ink)]">
        This workspace page doesn&apos;t exist.
      </h1>
      <p className="mx-auto mt-2.5 max-w-[460px] text-[13px] leading-[1.55] text-[var(--cc-ink-3)]">
        The project, page, or workspace route may have moved.
      </p>
      <Link
        href="/app"
        className="mt-5 inline-flex h-10 items-center rounded-[8px] bg-[var(--cc-accent)] px-4 text-[13px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] transition hover:bg-[var(--cc-accent-strong)]"
      >
        Go to command center
      </Link>
    </section>
  );
}
