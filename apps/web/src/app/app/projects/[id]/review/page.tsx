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
      <div className="border-b border-rule-dark bg-paper px-8 py-5">
        <div className="mx-auto flex max-w-[880px] items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
              Review Draft
            </div>
            <h1 className="font-serif text-heading-lg text-ink">{proj.title}</h1>
          </div>
          <Link
            href={`/app/projects/${params.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
          >
            ← Run status
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[880px] space-y-6 px-8 py-10">
        <section className="rounded-lg border border-rule bg-paper p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-body-md font-medium text-ink">Current run</h2>
              <p className="mt-1 text-body-sm text-ink-4">
                {run ? `Status: ${run.status}` : 'No generation run found for this project yet.'}
              </p>
            </div>
            {artifact && (
              <div className="text-right">
                <div className="text-body-sm font-medium text-ink">
                  {artifact.videoCount} videos
                </div>
                <div className="text-caption text-ink-4">
                  {artifact.totalSegmentCount} transcript segments
                </div>
              </div>
            )}
          </div>
        </section>

        {!run && (
          <section className="rounded-lg border border-rule bg-paper p-6 text-body-sm text-ink-3">
            Create and queue a project run before opening the review surface.
          </section>
        )}

        {run && !artifact && !artifactError && (
          <section className="rounded-lg border border-rule bg-paper p-6 text-body-sm text-ink-3">
            This review draft is not ready yet. Keep watching the run status page while the pipeline is still queued or running.
          </section>
        )}

        {artifactError && (
          <section className="rounded-lg border border-rose/30 bg-rose/10 p-6">
            <h2 className="text-body-md font-medium text-ink">Review draft unavailable</h2>
            <p className="mt-2 text-body-sm text-ink-3">
              CreatorCanon expected a review artifact for this run but could not load a valid draft.
            </p>
            <p className="mt-2 text-caption text-ink-4">{artifactError}</p>
          </section>
        )}

        {artifact && (
          <>
            <section className="rounded-lg border border-rule bg-paper p-6 space-y-4">
              <div>
                <h2 className="text-body-md font-medium text-ink">Archive summary</h2>
                <p className="mt-2 text-body-md text-ink-2">{artifact.archiveSummary}</p>
              </div>

              <div>
                <h3 className="text-body-sm font-medium text-ink">Top themes</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {artifact.themes.length > 0 ? artifact.themes.map((theme: string) => (
                    <span
                      key={theme}
                      className="rounded-full border border-rule bg-paper-2 px-3 py-1 text-caption text-ink-3"
                    >
                      {theme}
                    </span>
                  )) : (
                    <span className="text-body-sm text-ink-4">
                      No repeated themes were strong enough to extract yet.
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              {artifact.videos.map((video: V0ReviewArtifact['videos'][number]) => (
                <article key={video.videoId} className="rounded-lg border border-rule bg-paper p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-body-md font-medium text-ink">
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
                      className="text-caption text-ink-4 underline hover:text-ink-2"
                    >
                      Watch source
                    </a>
                  </div>
                  <p className="mt-4 text-body-sm leading-6 text-ink-2">
                    {video.summary}
                  </p>
                </article>
              ))}
            </section>
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
