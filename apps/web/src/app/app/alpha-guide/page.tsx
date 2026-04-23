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
      <div className="border-b border-rule-dark bg-paper px-8 py-5">
        <div className="mx-auto flex max-w-[920px] items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
              Private Alpha
            </div>
            <h1 className="font-serif text-heading-lg text-ink">Creator guide</h1>
          </div>
          <Link
            href="/app"
            className="inline-flex h-8 items-center rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
          >
            Back to app
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] space-y-6 px-8 py-10">
        <section className="rounded-lg border border-rule bg-paper p-6">
          <h2 className="text-body-md font-medium text-ink">What CreatorCanon creates</h2>
          <p className="mt-2 text-body-sm leading-6 text-ink-3">
            CreatorCanon turns a curated set of creator videos into a premium knowledge hub:
            draft pages, editable summaries, public hub templates, and source moments that
            point back to transcript-backed evidence.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {STEPS.map(([title, body], index) => (
            <article key={title} className="rounded-lg border border-rule bg-paper p-5">
              <div className="text-caption uppercase tracking-widest text-ink-4">
                Step {index + 1}
              </div>
              <h2 className="mt-2 text-body-md font-medium text-ink">{title}</h2>
              <p className="mt-2 text-body-sm leading-6 text-ink-3">{body}</p>
            </article>
          ))}
        </section>

        <section className="rounded-lg border border-rule bg-paper p-6">
          <h2 className="text-body-md font-medium text-ink">Source moments</h2>
          <p className="mt-2 text-body-sm leading-6 text-ink-3">
            Source moments are the evidence cards shown under generated sections. They include
            source video, timestamp range, and quote when transcripts or audio-backed transcription
            are available. Limited-source sections are labeled honestly.
          </p>
        </section>

        <section className="rounded-lg border border-amber/30 bg-amber/10 p-6">
          <h2 className="text-body-md font-medium text-ink">If something gets stuck</h2>
          <p className="mt-2 text-body-sm leading-6 text-ink-3">
            Open the project page and send the support ids shown there: project id and run id.
            Those ids let the operator inspect payment, pipeline stages, artifacts, and release state.
          </p>
        </section>
      </div>
    </main>
  );
}
