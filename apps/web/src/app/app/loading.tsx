export default function AppLoading() {
  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-5 shadow-[var(--cc-shadow-1)]">
        <div className="h-3 w-28 rounded bg-[var(--cc-surface-2)] animate-pulse" />
        <div className="mt-3 h-7 max-w-[480px] rounded bg-[var(--cc-surface-2)] animate-pulse" />
        <div className="mt-2.5 h-3.5 max-w-[640px] rounded bg-[var(--cc-surface-2)]/70 animate-pulse" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-4 shadow-[var(--cc-shadow-1)]"
          >
            <div className="h-3 w-20 rounded bg-[var(--cc-surface-2)] animate-pulse" />
            <div className="mt-3 h-7 w-14 rounded bg-[var(--cc-surface-2)] animate-pulse" />
            <div className="mt-2 h-2.5 w-24 rounded bg-[var(--cc-surface-2)]/70 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
