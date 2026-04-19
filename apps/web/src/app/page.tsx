export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-24">
      <p className="text-xs uppercase tracking-widest text-zinc-500">Channel Atlas</p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-zinc-900">
        Scaffold is live.
      </h1>
      <p className="mt-4 max-w-prose text-zinc-600">
        This is the bare repo skeleton (ticket 0.1). Branding, typography, and the full
        marketing home page land after the design-token port (ticket 0.3). See{' '}
        <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-sm">plan/08-build-order-and-milestones.md</code>.
      </p>
    </main>
  );
}
