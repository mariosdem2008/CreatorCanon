import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { draftPagesV0StageOutputSchema, v0ReviewStageOutputSchema } from '@creatorcanon/pipeline';
import { eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  hub,
  page,
  project,
  videoSetItem,
  workspaceMember,
} from '@creatorcanon/db/schema';
import { getHubTemplate } from '@/components/hub/templates';
import { CopyUrlButton } from './CopyUrlButton';
import { PublishButton } from './PublishButton';
import { RefreshButton } from './RefreshButton';
import { publishCurrentRun } from './publish';

export const dynamic = 'force-dynamic';

const STAGE_LABELS: Record<string, string> = {
  import_selection_snapshot: 'Import selection',
  ensure_transcripts: 'Fetch transcripts',
  ensure_visual_assets: 'Prepare visual assets',
  normalize_transcripts: 'Normalize transcripts',
  segment_transcripts: 'Segment transcripts',
  synthesize_v0_review: 'Build review draft',
  draft_pages_v0: 'Persist draft pages',
  extract_text_atoms: 'Extract knowledge atoms',
  extract_visual_observations: 'Visual observations',
  merge_multimodal_atoms: 'Merge atoms',
  synthesize_videos: 'Synthesize per-video memos',
  cluster_archive: 'Cluster topics',
  build_outline: 'Build outline',
  draft_pages: 'Draft pages',
  qa_and_repair: 'QA & repair',
  index_chat: 'Index for chat',
  build_release: 'Build release',
};

type StageStatus = 'pending' | 'running' | 'succeeded' | 'failed_retryable' | 'failed_terminal' | 'skipped';

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-paper-3 border border-rule',
  running: 'bg-amber animate-pulse',
  succeeded: 'bg-sage',
  failed_retryable: 'bg-rose',
  failed_terminal: 'bg-rose',
  skipped: 'bg-paper-3',
};

const STATUS_TEXT: Record<string, string> = {
  pending: 'text-ink-5',
  running: 'text-amber-ink font-medium',
  succeeded: 'text-sage',
  failed_retryable: 'text-rose',
  failed_terminal: 'text-rose',
  skipped: 'text-ink-5',
};

type RunStatus = 'draft' | 'awaiting_payment' | 'queued' | 'running' | 'awaiting_review' | 'published' | 'failed' | 'canceled';

const RUN_STATUS_BADGE: Record<string, string> = {
  draft: 'bg-paper-3 text-ink-4 border-rule',
  awaiting_payment: 'bg-amber-wash text-amber-ink border-amber/30',
  queued: 'bg-amber-wash text-amber-ink border-amber/30',
  running: 'bg-amber-wash text-amber-ink border-amber/30',
  awaiting_review: 'bg-sage/10 text-sage border-sage/30',
  published: 'bg-sage/10 text-sage border-sage/30',
  failed: 'bg-rose/10 text-rose border-rose/30',
  canceled: 'bg-paper-3 text-ink-4 border-rule',
};

const RUN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  queued: 'Queued',
  running: 'Processing',
  awaiting_review: 'Draft ready',
  published: 'Published',
  failed: 'Failed',
  canceled: 'Canceled',
};

const ACTIVE_RUN_STATUSES = new Set(['queued', 'running']);

export default async function ProjectPage({ params }: { params: { id: string } }) {
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
  const selectedTemplate = getHubTemplate(proj.config?.presentation_preset);

  const runs = proj.currentRunId
    ? await db.select().from(generationRun).where(eq(generationRun.id, proj.currentRunId)).limit(1)
    : [];
  const run = runs[0];

  const stageRuns = run
    ? await db
        .select()
        .from(generationStageRun)
        .where(eq(generationStageRun.runId, run.id))
        .orderBy(generationStageRun.createdAt)
    : [];

  const videoCount = proj.videoSetId
    ? (await db.select().from(videoSetItem).where(eq(videoSetItem.videoSetId, proj.videoSetId))).length
    : 0;

  const isActive = run && ACTIVE_RUN_STATUSES.has(run.status);
  const hasStageRuns = stageRuns.length > 0;
  const transcriptStage = stageRuns.find((sr) => sr.stageName === 'ensure_transcripts' && sr.status === 'succeeded');
  const reviewStage = stageRuns.find((sr) => sr.stageName === 'synthesize_v0_review' && sr.status === 'succeeded');
  const draftPagesStage = stageRuns.find((sr) => sr.stageName === 'draft_pages_v0' && sr.status === 'succeeded');
  const transcriptOutput = transcriptStage?.outputJson as {
    fetchedCount?: number;
    skippedCount?: number;
    transcripts?: Array<{ youtubeVideoId?: string; skipped?: boolean; skipReason?: string }>;
  } | null | undefined;
  const skippedTranscriptReasons = transcriptOutput?.transcripts
    ?.filter((item) => item.skipped)
    .slice(0, 3) ?? [];
  const parsedReview = reviewStage?.outputJson != null
    ? v0ReviewStageOutputSchema.safeParse(reviewStage.outputJson)
    : null;
  const parsedDraftPages = draftPagesStage?.outputJson != null
    ? draftPagesV0StageOutputSchema.safeParse(draftPagesStage.outputJson)
    : null;
  const reviewReady = parsedReview?.success === true;
  const persistedPages = run
    ? await db
        .select({ id: page.id })
        .from(page)
        .where(eq(page.runId, run.id))
        .orderBy(page.position)
    : [];
  const draftPagesReady = parsedDraftPages?.success === true && persistedPages.length > 0;
  const publishedHubs = proj.publishedHubId
    ? await db
        .select({ subdomain: hub.subdomain, theme: hub.theme })
        .from(hub)
        .where(eq(hub.id, proj.publishedHubId))
        .limit(1)
    : [];
  const publishedSubdomain = publishedHubs[0]?.subdomain;
  const publishedTemplate = getHubTemplate(publishedHubs[0]?.theme ?? selectedTemplate.id);

  const runStatus = (run?.status ?? '') as RunStatus;

  return (
    <main className="min-h-screen bg-paper-studio">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-rule-dark bg-paper px-4 py-4 sm:px-8 sm:py-5">
        <div className="min-w-0">
          <Link
            href="/app"
            className="mb-1 inline-block text-eyebrow uppercase tracking-widest text-ink-4 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
          >
            Creator Studio
          </Link>
          <h1 className="font-serif text-heading-lg text-ink truncate">{proj.title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {isActive && <RefreshButton />}
          <Link
            href="/app"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            aria-label="Back to Dashboard"
          >
            <span aria-hidden="true">←</span>
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] space-y-5 px-4 py-6 sm:px-8 sm:py-10">
        {/* Status card */}
        <div className="overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="flex items-center justify-between border-b border-rule bg-paper-2 px-4 py-4 sm:px-6">
            <h2 className="text-body-sm font-semibold text-ink">Generation run</h2>
            {run && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-caption font-medium ${RUN_STATUS_BADGE[runStatus] ?? 'bg-paper-3 text-ink-4 border-rule'}`}>
                {RUN_STATUS_LABEL[runStatus] ?? runStatus}
              </span>
            )}
          </div>

          {/* Run stats — compact on mobile */}
          <div className="grid grid-cols-3 divide-x divide-rule border-b border-rule">
            <div className="px-3 py-4 sm:px-6">
              <p className="text-eyebrow uppercase tracking-widest text-ink-4">Videos</p>
              <p className="mt-2 font-serif text-heading-md text-ink">{videoCount}</p>
            </div>
            <div className="px-3 py-4 sm:px-6">
              <p className="text-eyebrow uppercase tracking-widest text-ink-4">Pipeline</p>
              <p className="mt-2 font-mono text-[11px] text-ink break-all sm:text-body-sm">{run?.pipelineVersion ?? (
                <span className="text-ink-5">—</span>
              )}</p>
            </div>
            <div className="px-3 py-4 sm:px-6">
              <p className="text-eyebrow uppercase tracking-widest text-ink-4">Status</p>
              <p className={`mt-2 text-body-sm font-medium ${runStatus ? (RUN_STATUS_BADGE[runStatus]?.includes('sage') ? 'text-sage' : RUN_STATUS_BADGE[runStatus]?.includes('amber') ? 'text-amber-ink' : RUN_STATUS_BADGE[runStatus]?.includes('rose') ? 'text-rose' : 'text-ink-4') : 'text-ink-5'}`}>
                {run ? (RUN_STATUS_LABEL[runStatus] ?? runStatus) : (
                  <span className="text-ink-5">No run yet</span>
                )}
              </p>
            </div>
          </div>

          {/* Status messages */}
          <div className="space-y-3 px-4 py-4 sm:px-6">
            {run?.status === 'queued' && (
              <div className="rounded-lg border border-amber/30 bg-amber-wash/50 px-4 py-3">
                <p className="text-body-sm text-ink-3">
                  {hasStageRuns
                    ? 'Payment confirmed. Your run is queued and has started writing stage progress.'
                    : 'Payment received — preparing your run. If this persists for more than a few minutes, send the support IDs below.'}
                </p>
              </div>
            )}

            {run?.status === 'running' && (
              <div className="rounded-lg border border-amber/30 bg-amber-wash/50 px-4 py-3">
                <p className="text-body-sm text-ink-3">
                  CreatorCanon is processing your source library. This page refreshes while the worker advances through pipeline stages.
                </p>
              </div>
            )}

            {run?.status === 'awaiting_payment' && (
              <div className="flex flex-col gap-3 rounded-lg border border-amber/30 bg-amber-wash/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-body-sm font-semibold text-ink">Payment required</p>
                  <p className="mt-0.5 text-caption text-ink-4">
                    This run will not queue until Stripe confirms payment.
                  </p>
                </div>
                <Link
                  href={`/app/checkout?projectId=${params.id}`}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber sm:justify-start"
                >
                  Complete payment
                </Link>
              </div>
            )}

            {run?.status === 'failed' && (
              <div className="rounded-lg border border-rose/30 bg-rose/8 px-4 py-3">
                <p className="text-body-sm text-rose">
                  {hasStageRuns
                    ? 'This run failed during processing. Send the support IDs below so we can inspect the failed stage and retry it.'
                    : 'This run failed before pipeline work began. Send the support IDs below so we can inspect payment, worker, and dispatch state.'}
                </p>
              </div>
            )}

            {transcriptOutput && (transcriptOutput.skippedCount ?? 0) > 0 && (
              <div className="rounded-lg border border-amber/30 bg-amber-wash/50 px-4 py-3">
                <p className="text-body-sm font-semibold text-ink">Limited transcript coverage</p>
                <p className="mt-1 text-caption text-ink-4 leading-relaxed">
                  {transcriptOutput.fetchedCount ?? 0} video{(transcriptOutput.fetchedCount ?? 0) === 1 ? '' : 's'} had usable captions; {transcriptOutput.skippedCount} video{transcriptOutput.skippedCount === 1 ? '' : 's'} did not. Atlas still generates draft pages with limited source support where needed.
                </p>
                {skippedTranscriptReasons.length > 0 && (
                  <ul className="mt-2 space-y-1 text-caption text-ink-4">
                    {skippedTranscriptReasons.map((item) => (
                      <li key={`${item.youtubeVideoId}-${item.skipReason}`} className="flex gap-1.5">
                        <span className="shrink-0">·</span>
                        <span>{item.youtubeVideoId ?? 'Video'}: {item.skipReason ?? 'No usable transcript material.'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {draftPagesReady && (
              <div className="flex flex-col gap-3 rounded-lg border border-sage/30 bg-sage/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-body-sm font-semibold text-ink">Draft pages ready</p>
                  <p className="mt-0.5 text-caption text-ink-4">
                    {persistedPages.length} page{persistedPages.length === 1 ? '' : 's'} persisted from the current run.
                  </p>
                </div>
                <Link
                  href={`/app/projects/${params.id}/pages`}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber sm:justify-start"
                >
                  Open draft pages
                </Link>
              </div>
            )}

            {draftPagesReady && run?.status === 'awaiting_review' && (
              <form action={publishCurrentRun.bind(null, params.id)}>
                <div className="flex flex-col gap-3 rounded-lg border border-amber/30 bg-amber-wash/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-body-sm font-semibold text-ink">Ready to publish a preview</p>
                    <p className="mt-0.5 text-caption text-ink-4">
                      Creates a public read-only hub using {selectedTemplate.name}.
                    </p>
                  </div>
                  <PublishButton label="Publish preview now" />
                </div>
              </form>
            )}

            {publishedSubdomain && (
              <div className="rounded-lg border border-sage/30 bg-sage/8 px-4 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-body-sm font-semibold text-ink">Your hub is live!</p>
                    <p className="mt-0.5 text-caption text-ink-4">
                      {publishedTemplate.name} · <span className="font-mono">/h/{publishedSubdomain}</span>
                    </p>
                  </div>
                  <Link
                    href={`/h/${publishedSubdomain}`}
                    className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber sm:justify-start"
                  >
                    Open hub
                  </Link>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <CopyUrlButton url={`https://creatorcanon.com/h/${publishedSubdomain}`} />
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just published my knowledge hub — ${proj.title}`)}&url=${encodeURIComponent(`https://creatorcanon.com/h/${publishedSubdomain}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-4 text-body-sm font-medium text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                  >
                    Share on X
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                      <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </div>
              </div>
            )}

            {reviewReady && (
              <div className="flex flex-col gap-3 rounded-lg border border-sage/30 bg-sage/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-body-sm font-semibold text-ink">Review draft ready</p>
                  <p className="mt-0.5 text-caption text-ink-4">
                    {parsedReview.data.totalSegmentCount} transcript segments summarized into a first draft.
                  </p>
                </div>
                <Link
                  href={`/app/projects/${params.id}/review`}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber sm:justify-start"
                >
                  Open review
                </Link>
              </div>
            )}

            {run?.status === 'awaiting_review' && !reviewReady && (
              <div className="rounded-lg border border-rose/30 bg-rose/8 px-4 py-3">
                <p className="text-body-sm text-rose">
                  This run reached review status, but the review artifact is missing or invalid. Re-run the pipeline after fixing the stage output.
                </p>
              </div>
            )}

            {reviewReady && !draftPagesReady && (
              <div className="rounded-lg border border-rose/30 bg-rose/8 px-4 py-3">
                <p className="text-body-sm text-rose">
                  The review draft exists, but draft pages were not persisted for this run. Re-run the pipeline after fixing the page generation stage.
                </p>
              </div>
            )}

            {/* Support IDs */}
            {run && (
              <details className="group">
                <summary className="cursor-pointer list-none text-caption text-ink-4 hover:text-ink-3">
                  <span className="group-open:hidden">Show support IDs</span>
                  <span className="hidden group-open:inline">Hide support IDs</span>
                </summary>
                <div className="mt-3 rounded-lg border border-rule bg-paper-2 px-4 py-3">
                  <p className="text-eyebrow uppercase tracking-widest text-ink-4">Support IDs</p>
                  <dl className="mt-2 space-y-1.5">
                    <div className="flex gap-3 text-caption">
                      <dt className="w-16 shrink-0 text-ink-4">Project</dt>
                      <dd className="break-all font-mono text-ink-3">{proj.id}</dd>
                    </div>
                    <div className="flex gap-3 text-caption">
                      <dt className="w-16 shrink-0 text-ink-4">Run</dt>
                      <dd className="break-all font-mono text-ink-3">{run.id}</dd>
                    </div>
                  </dl>
                </div>
              </details>
            )}
          </div>
        </div>

        {/* Stage progress */}
        {run && ACTIVE_RUN_STATUSES.has(run.status) && stageRuns.length === 0 && (
          /* First-run state: queued/running but pipeline hasn't emitted stages yet */
          <div className="overflow-hidden rounded-xl border border-rule bg-paper">
            <div className="border-b border-rule bg-paper-2 px-4 py-4 sm:px-6">
              <h2 className="text-body-sm font-semibold text-ink">Pipeline stages</h2>
            </div>
            <div className="flex items-center gap-3 px-4 py-6 sm:px-6">
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber animate-pulse" aria-hidden="true" />
              <p className="text-body-sm text-ink-3">Waiting for pipeline to start — stages will appear here once the worker begins.</p>
            </div>
          </div>
        )}

        {stageRuns.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-rule bg-paper">
            <div className="border-b border-rule bg-paper-2 px-4 py-4 sm:px-6">
              <h2 className="text-body-sm font-semibold text-ink">Pipeline stages</h2>
            </div>
            <ul className="divide-y divide-rule px-0">
              {stageRuns.map((sr) => {
                const status = sr.status as StageStatus;
                return (
                  <li key={sr.id} className="flex items-center gap-3 px-4 py-3 sm:px-6">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status] ?? 'bg-rule'}`} aria-hidden="true" />
                    <span className="flex-1 text-body-sm text-ink">
                      {STAGE_LABELS[sr.stageName] ?? sr.stageName}
                    </span>
                    <span className={`font-mono text-[11px] ${STATUS_TEXT[status] ?? 'text-ink-5'}`}>
                      {status === 'succeeded' && sr.durationMs
                        ? `${(sr.durationMs / 1000).toFixed(1)}s`
                        : RUN_STATUS_LABEL[status] ?? status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Config summary */}
        {proj.config && (
          <div className="overflow-hidden rounded-xl border border-rule bg-paper">
            <div className="border-b border-rule bg-paper-2 px-4 py-4 sm:px-6">
              <h2 className="text-body-sm font-semibold text-ink">Configuration</h2>
            </div>
            <dl className="divide-y divide-rule px-4 sm:px-6">
              {proj.config.audience && (
                <div className="flex gap-4 py-3 text-body-sm">
                  <dt className="w-24 shrink-0 text-ink-4 sm:w-28">Audience</dt>
                  <dd className="text-ink">{proj.config.audience as string}</dd>
                </div>
              )}
              <div className="flex gap-4 py-3 text-body-sm">
                <dt className="w-24 shrink-0 text-ink-4 sm:w-28">Tone</dt>
                <dd className="capitalize text-ink">{proj.config.tone as string ?? 'Conversational'}</dd>
              </div>
              <div className="flex gap-4 py-3 text-body-sm">
                <dt className="w-24 shrink-0 text-ink-4 sm:w-28">Depth</dt>
                <dd className="capitalize text-ink">{String(proj.config.length_preset ?? 'standard')}</dd>
              </div>
              <div className="flex gap-4 py-3 text-body-sm">
                <dt className="w-24 shrink-0 text-ink-4 sm:w-28">Template</dt>
                <dd className="text-ink">{selectedTemplate.name}</dd>
              </div>
              <div className="flex gap-4 py-3 text-body-sm">
                <dt className="w-24 shrink-0 text-ink-4 sm:w-28">Chat</dt>
                <dd className="text-ink">{proj.config.chat_enabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}
