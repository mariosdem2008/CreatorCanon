import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createR2Client } from '@creatorcanon/adapters';
import { auth } from '@creatorcanon/auth';
import { parseServerEnv } from '@creatorcanon/core';
import { eq, getDb } from '@creatorcanon/db';
import { generationRun, generationStageRun, project, workspaceMember } from '@creatorcanon/db/schema';
import {
  type V0ReviewArtifact,
  v0ReviewArtifactSchema,
  v0ReviewStageOutputSchema,
} from '@creatorcanon/pipeline';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review Draft' };

export default async function ProjectReviewPage({ params }: { params: { id: string } }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const db = getDb();
  const userId = session.user.id;

  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) redirect('/app');

  const projects = await db
    .select()
    .from(project)
    .where(eq(project.id, params.id))
    .limit(1);

  const proj = projects[0];
  if (!proj || proj.workspaceId !== workspaceId) redirect('/app');

  const runs = proj.currentRunId
    ? await db.select().from(generationRun).where(eq(generationRun.id, proj.currentRunId)).limit(1)
    : [];
  const run = runs[0];

  const reviewStageRuns = run
    ? await db
        .select()
        .from(generationStageRun)
        .where(eq(generationStageRun.runId, run.id))
        .orderBy(generationStageRun.createdAt)
    : [];

  const reviewStage = reviewStageRuns
    .filter((sr) => sr.stageName === 'synthesize_v0_review' && sr.status === 'succeeded')
    .at(-1);

  const parsedStageOutput = reviewStage?.outputJson != null
    ? v0ReviewStageOutputSchema.safeParse(reviewStage.outputJson)
    : null;

  let artifact: V0ReviewArtifact | null = null;
  let artifactError: string | null = null;

  if (parsedStageOutput?.success) {
    try {
      const env = parseServerEnv(process.env);
      const r2 = createR2Client(env);
      const obj = await r2.getObject(parsedStageOutput.data.r2Key);
      artifact = v0ReviewArtifactSchema.parse(
        JSON.parse(new TextDecoder().decode(obj.body)),
      );
    } catch (err) {
      artifactError = err instanceof Error ? err.message : String(err);
    }
  } else if (run?.status === 'awaiting_review') {
    artifactError = 'The review artifact was not produced for this run.';
  }

  return (
    <main className="min-h-screen bg-paper-studio">
      {/* Top bar */}
      <div className="border-b border-rule-dark bg-paper px-4 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/app"
              className="mb-1 inline-block text-eyebrow uppercase tracking-widest text-ink-4 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
            >
              Creator Studio
            </Link>
            <h1 className="font-serif text-heading-lg text-ink truncate">{proj.title}</h1>
          </div>
          <Link
            href={`/app/projects/${params.id}`}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            aria-label="Back to run status"
          >
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">Run status</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[880px] space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        {/* Run status row */}
        <div className="overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
            <div>
              <h2 className="text-body-sm font-semibold text-ink">Current run</h2>
              <p className="mt-1 text-body-sm text-ink-4">
                {run ? `Status: ${run.status}` : 'No generation run found for this project yet.'}
              </p>
            </div>
            {artifact && (
              <div className="text-right">
                <p className="text-body-sm font-semibold text-ink">
                  {artifact.videoCount} video{artifact.videoCount === 1 ? '' : 's'}
                </p>
                <p className="mt-0.5 text-caption text-ink-4">
                  {artifact.totalSegmentCount} transcript segments
                </p>
              </div>
            )}
          </div>
        </div>

        {/* States */}
        {!run && (
          <div className="rounded-xl border border-rule bg-paper px-6 py-8 text-center">
            <p className="text-body-sm font-medium text-ink">No run yet</p>
            <p className="mt-2 text-body-sm text-ink-3">
              Create and queue a project run before opening the review surface.
            </p>
          </div>
        )}

        {run && !artifact && !artifactError && (
          <div className="rounded-xl border border-rule bg-paper px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-paper-3">
              <span className="h-2 w-2 rounded-full bg-amber animate-pulse" aria-hidden="true" />
            </div>
            <p className="text-body-sm font-medium text-ink">Review draft not ready yet</p>
            <p className="mt-2 text-body-sm text-ink-3">
              Keep watching the run status page while the pipeline is still queued or running.
            </p>
            <Link
              href={`/app/projects/${params.id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-body-sm text-ink-4 underline hover:text-ink"
            >
              Back to run status
            </Link>
          </div>
        )}

        {artifactError && (
          <div className="rounded-xl border border-rose/30 bg-rose/8 px-6 py-5" role="alert">
            <h2 className="text-body-sm font-semibold text-rose">Review draft unavailable</h2>
            <p className="mt-2 text-body-sm text-ink-3 leading-relaxed">
              CreatorCanon expected a review artifact for this run but could not load a valid draft.
            </p>
            <p className="mt-2 font-mono text-caption text-ink-4">{artifactError}</p>
          </div>
        )}

        {artifact && (
          <>
            {/* Archive summary */}
            <div className="overflow-hidden rounded-xl border border-rule bg-paper">
              <div className="border-b border-rule bg-paper-2 px-6 py-4">
                <h2 className="text-body-sm font-semibold text-ink">Archive summary</h2>
              </div>
              <div className="px-6 py-5 space-y-5">
                <p className="text-body-md leading-7 text-ink-2">{artifact.archiveSummary}</p>

                <div>
                  <h3 className="mb-3 text-eyebrow uppercase tracking-widest text-ink-4">Top themes</h3>
                  {artifact.themes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {artifact.themes.map((theme: string) => (
                        <span
                          key={theme}
                          className="rounded-full border border-rule bg-paper-2 px-3 py-1 text-body-sm text-ink-3"
                        >
                          {theme}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-body-sm text-ink-4">
                      No repeated themes were strong enough to extract yet.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Per-video sections */}
            <div className="space-y-4">
              {artifact.videos.map((video: V0ReviewArtifact['videos'][number]) => (
                <article key={video.videoId} className="overflow-hidden rounded-xl border border-rule bg-paper">
                  <div className="flex items-start justify-between gap-4 border-b border-rule bg-paper-2 px-6 py-4">
                    <div className="min-w-0">
                      <h2 className="font-serif text-heading-sm text-ink">
                        {video.title ?? 'Untitled video'}
                      </h2>
                      <p className="mt-1 text-caption text-ink-4">
                        {video.segmentCount} segment{video.segmentCount === 1 ? '' : 's'}
                        {' · '}
                        {formatDuration(video.durationSeconds)}
                      </p>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}`}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Watch source video: ${video.title ?? 'Untitled'}`}
                      className="inline-flex shrink-0 items-center gap-1 text-caption text-ink-4 underline hover:text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
                    >
                      Watch source
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                  </div>
                  <div className="px-6 py-5">
                    <p className="text-body-sm leading-6 text-ink-2">{video.summary}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds == null || durationSeconds <= 0) return 'Duration unavailable';

  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const seconds = durationSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
