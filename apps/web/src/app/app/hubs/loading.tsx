export default function HubsLoading() {
  return (
    <main className="mx-auto max-w-[960px] px-4 py-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        My hubs
      </p>
      <ul className="mt-8 space-y-4" aria-busy="true">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="shimmer-bg h-16 rounded-md border border-rule bg-paper-2"
          />
        ))}
      </ul>
    </main>
  );
}
