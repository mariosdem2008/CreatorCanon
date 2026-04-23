// Hub home skeleton — shown while the server component fetches the manifest.
// Uses .shimmer-bg (globals.css) with paper-theme safe defaults.
export default function HubHomeLoading() {
  return (
    <div className="min-h-screen bg-paper-studio">
      {/* Hero skeleton */}
      <div className="border-b border-rule-dark bg-paper px-6 py-12 md:px-12">
        <div className="mx-auto max-w-4xl space-y-4">
          <div className="shimmer-bg h-10 w-2/3 rounded" />
          <div className="shimmer-bg h-5 w-full rounded" />
          <div className="shimmer-bg h-5 w-4/5 rounded" />
        </div>
      </div>

      {/* Page list skeleton */}
      <div className="mx-auto max-w-4xl space-y-3 px-6 py-10 md:px-12">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded border border-rule bg-paper p-4"
          >
            <div className="shimmer-bg h-5 w-5 shrink-0 rounded-full" />
            <div className="shimmer-bg h-5 flex-1 rounded" />
            <div className="shimmer-bg h-4 w-20 rounded" />
          </div>
        ))}
      </div>

      {/* Source rail skeleton */}
      <div className="border-t border-rule px-6 py-6 md:px-12">
        <div className="mx-auto max-w-4xl flex gap-3 overflow-hidden">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="shimmer-bg h-8 w-28 shrink-0 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
