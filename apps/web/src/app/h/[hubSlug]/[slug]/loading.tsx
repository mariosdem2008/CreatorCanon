// Inner hub page skeleton — shown while the server component fetches the manifest.
// Uses .shimmer-bg (globals.css) with paper-theme safe defaults.
export default function HubPageLoading() {
  return (
    <div className="min-h-screen bg-paper-studio">
      {/* Breadcrumb skeleton */}
      <div className="border-b border-rule-dark bg-paper px-6 py-4 md:px-12">
        <div className="mx-auto max-w-4xl flex items-center gap-2">
          <div className="shimmer-bg h-4 w-24 rounded" />
          <span className="text-ink-4">/</span>
          <div className="shimmer-bg h-4 w-32 rounded" />
        </div>
      </div>

      {/* Article title skeleton */}
      <div className="bg-paper px-6 py-10 md:px-12">
        <div className="mx-auto max-w-4xl space-y-3">
          <div className="shimmer-bg h-9 w-3/4 rounded" />
          <div className="shimmer-bg h-5 w-full rounded" />
          <div className="shimmer-bg h-5 w-2/3 rounded" />
        </div>
      </div>

      {/* Sections skeleton */}
      <div className="mx-auto max-w-4xl space-y-8 px-6 py-8 md:px-12">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="space-y-3">
            <div className="shimmer-bg h-6 w-1/2 rounded" />
            <div className="shimmer-bg h-4 w-full rounded" />
            <div className="shimmer-bg h-4 w-full rounded" />
            <div className="shimmer-bg h-4 w-4/5 rounded" />
            {/* Source moment chips skeleton */}
            <div className="flex gap-2 pt-1">
              <div className="shimmer-bg h-6 w-24 rounded-full" />
              <div className="shimmer-bg h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
