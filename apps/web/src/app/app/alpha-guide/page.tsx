import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';

import { DashboardCard } from '../DashboardCard';
import { StepList } from '../StepList';

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

const STEP_ITEMS = STEPS.map(([title, detail]) => ({ title, detail }));

const OUTCOMES = [
  ['Structured pages', 'Drafts arrive with headings, summaries, and a starting information architecture.'],
  ['Attached evidence', 'Source moments keep transcript-backed quotes and timestamps tied to each section.'],
  ['Reviewable releases', 'Publish creates a versioned public hub you can revisit and republish later.'],
] as const;

export default async function AlphaGuidePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  return (
    <main className="min-h-screen bg-paper-studio px-4 py-6 sm:px-6 sm:py-8">
      <div className="relative mx-auto max-w-6xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 rounded-[36px] bg-[radial-gradient(circle_at_top_left,rgba(196,154,68,0.16),transparent_42%),radial-gradient(circle_at_top_right,rgba(21,25,33,0.09),transparent_36%)]" />

        <div className="relative overflow-hidden rounded-[32px] border border-rule bg-paper shadow-1">
          <div className="border-b border-rule px-5 py-5 sm:px-8 sm:py-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl">
                <div className="mb-2 text-eyebrow uppercase tracking-widest text-ink-4">
                  Private Alpha
                </div>
                <h1 className="font-serif text-heading-lg text-ink sm:text-display-sm">
                  Creator guide
                </h1>
                <p className="mt-3 max-w-2xl text-body-md leading-7 text-ink-3">
                  Use this as the operating brief for the authenticated flow: how a channel gets
                  connected, what makes a strong input set, and what to expect before a hub is
                  ready to publish.
                </p>
              </div>
              <Link
                href="/app"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-rule bg-paper-2 px-4 text-body-sm font-medium text-ink-3 transition hover:bg-paper hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                aria-label="Back to app dashboard"
              >
                Back to dashboard
              </Link>
            </div>
          </div>

          <div className="grid gap-6 px-5 py-5 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,1.35fr)_320px]">
            <div className="space-y-6">
              <DashboardCard eyebrow="What Ships" title="What CreatorCanon creates">
                <div className="space-y-5">
                  <p className="text-body-md leading-7 text-ink-3">
                    CreatorCanon turns a curated set of creator videos into a premium knowledge
                    hub: draft pages, editable summaries, public hub templates, and source moments
                    that point back to transcript-backed evidence.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {OUTCOMES.map(([title, body]) => (
                      <div key={title} className="rounded-2xl border border-rule bg-paper-2 p-4">
                        <p className="text-body-sm font-medium text-ink">{title}</p>
                        <p className="mt-2 text-caption leading-5 text-ink-4">{body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </DashboardCard>

              <DashboardCard eyebrow="Workflow" title="How the alpha run moves">
                <div className="grid gap-4 sm:grid-cols-2">
                  {STEP_ITEMS.map((item, index) => (
                    <article key={item.title} className="rounded-2xl border border-rule bg-paper-2 p-5">
                      <p className="text-eyebrow uppercase tracking-widest text-ink-4">
                        Step {index + 1}
                      </p>
                      <h3 className="mt-2 text-body-sm font-semibold text-ink">{item.title}</h3>
                      <p className="mt-2 text-body-sm leading-6 text-ink-3">{item.detail}</p>
                    </article>
                  ))}
                </div>
              </DashboardCard>

              <DashboardCard eyebrow="Evidence" title="How source moments work">
                <p className="text-body-md leading-7 text-ink-3">
                  Source moments are the evidence cards shown under generated sections. They include
                  source video, timestamp range, and quote when transcripts or audio-backed
                  transcription are available. Limited-source sections are labeled honestly so the
                  review pass stays grounded in what the system could actually verify.
                </p>
              </DashboardCard>

              <section className="overflow-hidden rounded-[28px] border border-amber/30 bg-amber/8">
                <div className="border-b border-amber/20 bg-amber-wash/50 px-5 py-4 sm:px-6">
                  <p className="text-eyebrow uppercase tracking-widest text-amber-ink/80">
                    Troubleshooting
                  </p>
                  <h2 className="mt-1 font-serif text-heading-sm text-amber-ink">
                    If something gets stuck
                  </h2>
                </div>
                <div className="px-5 py-5 sm:px-6 sm:py-6">
                  <p className="text-body-md leading-7 text-amber-ink/80">
                    Open the project page and send the support IDs shown there: project ID and run
                    ID. Those IDs let the operator inspect payment, pipeline stages, artifacts, and
                    release state without guessing which run failed.
                  </p>
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <DashboardCard eyebrow="Quick Read" title="Alpha checklist">
                <StepList
                  items={STEP_ITEMS.slice(0, 4).map((item, index) => ({
                    ...item,
                    status: index === 0 ? 'current' : 'upcoming',
                  }))}
                  compact
                />
              </DashboardCard>

              <DashboardCard eyebrow="Quality Bar" title="What produces stronger hubs">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-rule bg-paper-2 p-4">
                    <p className="text-body-sm font-medium text-ink">Focused video set</p>
                    <p className="mt-2 text-caption leading-5 text-ink-4">
                      Smaller, coherent selections generate cleaner outlines than broad channel-wide
                      mixes.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rule bg-paper-2 p-4">
                    <p className="text-body-sm font-medium text-ink">Transcript coverage</p>
                    <p className="mt-2 text-caption leading-5 text-ink-4">
                      Auto captions or seeded transcripts improve quote extraction and evidence
                      density.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rule bg-paper-2 p-4">
                    <p className="text-body-sm font-medium text-ink">Deliberate review pass</p>
                    <p className="mt-2 text-caption leading-5 text-ink-4">
                      Keep the edit pass close to the source evidence before you publish a release.
                    </p>
                  </div>
                </div>
              </DashboardCard>
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}
