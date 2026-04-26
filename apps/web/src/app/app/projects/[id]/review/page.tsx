import Link from 'next/link';
import { redirect } from 'next/navigation';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { and, eq, getDb } from '@creatorcanon/db';
import { generationRun, generationStageRun, project } from '@creatorcanon/db/schema';
import {
  type V0ReviewArtifact,
  v0ReviewArtifactSchema,
  v0ReviewStageOutputSchema,
} from '@creatorcanon/pipeline';

import {
  EmptyState,
  MetricCard,
  NoticeBanner,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
  Tag,
} from '@/components/cc';
import { requireWorkspace } from '@/lib/workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Review Draft' };

export default async function ProjectReviewPage({
  params,
}: {
  params: { id: string };
}) {
  const { workspaceId } = await requireWorkspace();
  const db = getDb();

  const projects = await db
    .select()
    .from(project)
    .where(and(eq(project.id, params.id), eq(project.workspaceId, workspaceId)))
    .limit(1);
  const proj = projects[0];
  if (!proj) redirect('/app/projects');

  const run = proj.currentRunId
    ? (
        await db
          .select()
          .from(generationRun)
          .where(
            and(
              eq(generationRun.id, proj.currentRunId),
              eq(generationRun.workspaceId, workspaceId),
            ),
          )
          .limit(1)
      )[0]
    : undefined;

  const stageRuns = run
    ? await db
        .select()
        .from(generationStageRun)
        .where(eq(generationStageRun.runId, run.id))
        .orderBy(generationStageRun.createdAt)
    : [];

  const reviewStage = stageRuns
    .filter(
      (stage) => stage.stageName === 'synthesize_v0_review' && stage.status === 'succeeded',
    )
    .at(-1);
  const parsedStageOutput = reviewStage?.outputJson
    ? v0ReviewStageOutputSchema.safeParse(reviewStage.outputJson)
    : null;

  let artifact: V0ReviewArtifact | null = null;
  let artifactError: string | null = null;

  if (parsedStageOutput?.success) {
    try {
      const env = parseServerEnv(process.env);
      const r2 = createR2Client(env);
      const obj = await r2.getObject(parsedStageOutput.data.r2Key);
      artifact = v0ReviewArtifactSchema.parse(JSON.parse(new TextDecoder().decode(obj.body)));
    } catch (err) {
      artifactError = err instanceof Error ? err.message : String(err);
    }
  } else if (run?.status === 'awaiting_review') {
    artifactError = 'The review artifact was not produced for this run.';
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link
              href={`/app/projects/${params.id}`}
              className="hover:text-[var(--cc-ink)]"
            >
              {proj.title}
            </Link>
            <span aria-hidden>·</span>
            <RunBadge status={run?.status ?? 'draft'} />
          </span>
        }
        title="Archive review"
        body="Validate Atlas's understanding of the source set before approving pages. This is the strategy layer — themes, coverage, and per-video summaries."
        actions={
          <>
            <Link
              href={`/app/projects/${params.id}`}
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
            >
              Run status
            </Link>
            <Link
              href={`/app/projects/${params.id}/pages`}
              className="inline-flex h-9 items-center rounded-[8px] bg-[var(--cc-accent)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--cc-accent-strong)]"
            >
              Open pages →
            </Link>
          </>
        }
      />

      {artifact ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard label="Videos" value={artifact.videoCount} sub="Included in review" />
            <MetricCard
              label="Segments"
              value={artifact.totalSegmentCount}
              sub="Transcript moments"
            />
            <MetricCard
              label="Themes"
              value={artifact.themes.length}
              sub="Repeated patterns"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <Panel>
                <PanelHeader title="Atlas summary" />
                <div className="px-5 py-4">
                  <p className="text-[14px] leading-[1.7] text-[var(--cc-ink-2)]">
                    {artifact.archiveSummary}
                  </p>
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="Source videos" meta={`${artifact.videos.length} total`} />
                <div className="divide-y divide-[var(--cc-rule)]">
                  {artifact.videos.map((video) => (
                    <article key={video.videoId} className="px-5 py-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h2 className="text-[14px] font-semibold text-[var(--cc-ink)]">
                            {video.title ?? 'Untitled video'}
                          </h2>
                          <p className="mt-0.5 text-[11px] text-[var(--cc-ink-4)]">
                            {video.segmentCount} segments · {formatDuration(video.durationSeconds)}
                          </p>
                        </div>
                        <a
                          href={`https://www.youtube.com/watch?v=${video.youtubeVideoId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
                        >
                          Watch source ↗
                        </a>
                      </div>
                      <p className="mt-3 text-[13px] leading-[1.65] text-[var(--cc-ink-3)]">
                        {video.summary}
                      </p>
                    </article>
                  ))}
                </div>
              </Panel>
            </div>

            <aside className="space-y-4 xl:sticky xl:top-[66px] xl:self-start">
              <Panel>
                <PanelHeader title="Themes" meta={`${artifact.themes.length}`} />
                <div className="flex flex-wrap gap-1.5 px-4 py-4">
                  {artifact.themes.length > 0 ? (
                    artifact.themes.map((theme) => <Tag key={theme}>{theme}</Tag>)
                  ) : (
                    <p className="text-[12px] leading-[1.55] text-[var(--cc-ink-4)]">
                      No repeated themes were strong enough to extract.
                    </p>
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="Atlas recommendation" />
                <div className="space-y-3 px-4 py-4 text-[12px] leading-[1.6] text-[var(--cc-ink-3)]">
                  <p>
                    Use this review to verify direction, then move to pages for line-level edits
                    and approval.
                  </p>
                  <Link
                    href={`/app/projects/${params.id}/pages`}
                    className="inline-flex h-9 items-center rounded-[8px] bg-[var(--cc-accent)] px-3 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(88,86,246,0.18)] hover:bg-[var(--cc-accent-strong)]"
                  >
                    Open pages →
                  </Link>
                </div>
              </Panel>
            </aside>
          </div>
        </>
      ) : artifactError ? (
        <NoticeBanner
          tone="warn"
          badge="Unavailable"
          title="Review draft unavailable."
          body={artifactError}
        />
      ) : run ? (
        <EmptyState
          title="Review draft not ready yet"
          body="Keep watching the run status page while the pipeline is queued or running."
          action={{ label: 'Back to run status', href: `/app/projects/${params.id}` }}
        />
      ) : (
        <EmptyState
          title="No run yet"
          body="Create and queue a project run before opening the review surface."
          action={{ label: 'Back to projects', href: '/app/projects' }}
        />
      )}
    </div>
  );
}

function RunBadge({ status }: { status: string }) {
  const tone =
    status === 'published'
      ? 'success'
      : status === 'awaiting_review'
        ? 'warn'
        : status === 'failed'
          ? 'danger'
          : status === 'running' || status === 'queued' || status === 'awaiting_payment'
            ? 'info'
            : 'neutral';
  return (
    <StatusPill tone={tone as 'success' | 'warn' | 'danger' | 'info' | 'neutral'}>
      {status.replaceAll('_', ' ')}
    </StatusPill>
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
