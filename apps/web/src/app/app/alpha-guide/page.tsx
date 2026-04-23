import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Private Alpha Guide' };

const STEPS = [
  ['Sign in with Google', 'Use the Google account that owns or manages the YouTube channel you want to turn into a hub.'],
  ['Connect and sync YouTube', 'CreatorCanon imports channel metadata and your video list. Videos with captions or seeded audio assets produce stronger source evidence.'],
  ['Select source-ready videos', 'Choose a focused set of videos. Source ready and auto captions are best; limited-source videos can still run but may produce weaker evidence.'],
  ['Configure and pay', 'Pick title, audience, tone, depth, and one hub template. Stripe test payment queues the generation run.'],
  ['Review, edit, approve', 'Edit page titles, summaries, and section text. Source moments stay attached while you review and approve the page.'],
  ['Publish and republish', 'Publish a public read-only hub, then republish if you make later edits. Each publish creates a versioned release.'],
] as const;

export default async function AlphaGuidePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  return (
    <main className="min-h-screen bg-paper-studio">
      {/* Top bar */}
      <div className="border-b border-rule-dark bg-paper px-4 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-[920px] items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
              Private Alpha
            </div>
            <h1 className="font-serif text-heading-lg text-ink">Creator guide</h1>
          </div>
          <Link
            href="/app"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            aria-label="Back to app dashboard"
          >
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">Back to app</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        {/* What is it */}
        <div className="overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="border-b border-rule bg-paper-2 px-4 py-4 sm:px-6">
            <h2 className="text-body-sm font-semibold text-ink">What CreatorCanon creates</h2>
          </div>
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-body-md leading-7 text-ink-3">
              CreatorCanon turns a curated set of creator videos into a premium knowledge hub:
              draft pages, editable summaries, public hub templates, and source moments that
              point back to transcript-backed evidence.
            </p>
          </div>
        </div>

        {/* Steps — single column on mobile, 2-col on md+ */}
        <div className="grid gap-4 sm:grid-cols-2">
          {STEPS.map(([title, body], index) => (
            <article key={title} className="overflow-hidden rounded-xl border border-rule bg-paper">
              <div className="border-b border-rule bg-paper-2 px-5 py-3">
                <span className="text-eyebrow uppercase tracking-widest text-ink-4">
                  Step {index + 1}
                </span>
              </div>
              <div className="px-5 py-4">
                <h3 className="text-body-sm font-semibold text-ink">{title}</h3>
                <p className="mt-2 text-body-sm leading-6 text-ink-3">{body}</p>
              </div>
            </article>
          ))}
        </div>

        {/* Source moments */}
        <div className="overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="border-b border-rule bg-paper-2 px-4 py-4 sm:px-6">
            <h2 className="text-body-sm font-semibold text-ink">Source moments</h2>
          </div>
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-body-md leading-7 text-ink-3">
              Source moments are the evidence cards shown under generated sections. They include
              source video, timestamp range, and quote when transcripts or audio-backed transcription
              are available. Limited-source sections are labeled honestly.
            </p>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="overflow-hidden rounded-xl border border-amber/30 bg-amber/8">
          <div className="border-b border-amber/20 bg-amber-wash/50 px-4 py-4 sm:px-6">
            <h2 className="text-body-sm font-semibold text-amber-ink">If something gets stuck</h2>
          </div>
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            <p className="text-body-md leading-7 text-amber-ink/80">
              Open the project page and send the support IDs shown there: project ID and run ID.
              Those IDs let the operator inspect payment, pipeline stages, artifacts, and release state.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
