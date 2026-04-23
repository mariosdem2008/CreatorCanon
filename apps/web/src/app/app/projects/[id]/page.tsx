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

const STATUS_COLOR: Record<string, string> = {
  pending: 'text-ink-4',
  running: 'text-amber-ink',
  succeeded: 'text-sage',
  failed_retryable: 'text-rose',
  failed_terminal: 'text-rose',
  skipped: 'text-ink-4',
};

const STATUS_DOT: Record<string, string> = {
  pending: 'bg-rule',
  running: 'bg-amber animate-pulse',
  succeeded: 'bg-sage',
  failed_retryable: 'bg-rose',
  failed_terminal: 'bg-rose',
  skipped: 'bg-rule',
};

const RUN_STATUS_COLOR: Record<string, string> = {
  draft: 'text-ink-4',
  awaiting_payment: 'text-amber-ink',
  queued: 'text-amber-ink',
  running: 'text-amber-ink',
  awaiting_review: 'text-sage',
  published: 'text-sage',
  failed: 'text-rose',
  canceled: 'text-ink-4',
};

const RUN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  queued: 'Payment received, queued',
  running: 'Processing',
  awaiting_review: 'Draft ready',
  published: 'Published',
  failed: 'Failed / needs support',
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

  return (
    <main className="min-h-screen bg-paper-studio">
      <div className="flex items-center justify-between border-b border-rule-dark bg-paper px-8 py-5">
        <div>
          <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
            Creator Studio
          </div>
          <h1 className="font-serif text-heading-lg text-ink">{proj.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {isActive && <RefreshButton />}
          <Link
            href="/app"
            className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] px-8 py-10 space-y-6">
        {/* Status card */}
        <div className="rounded-lg border border-rule bg-paper p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-body-md font-medium text-ink">Generation run</h2>
            {run && (
              <span className={`text-body-sm font-medium ${RUN_STATUS_COLOR[run.status] ?? 'text-ink-4'}`}>
                {RUN_STATUS_LABEL[run.status] ?? run.status}
              </span>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-4 rounded-md border border-rule bg-paper-2 p-4 text-center">
            <div>
              <dt className="text-caption text-ink-4">Videos</dt>
              <dd className="mt-1 font-mono text-body-md text-ink">{videoCount}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-4">Pipeline</dt>
              <dd className="mt-1 font-mono text-body-md text-ink">{run?.pipelineVersion ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-4">Status</dt>
              <dd className={`mt-1 font-mono text-body-md ${RUN_STATUS_COLOR[run?.status ?? ''] ?? 'text-ink-4'}`}>
                {run ? (RUN_STATUS_LABEL[run.status] ?? run.status) : '—'}
              </dd>
            </div>
          </dl>

          {run?.status === 'queued' && (
            <p className="text-body-sm text-ink-3 rounded-md border border-rule bg-paper-2 px-3 py-2">
              {hasStageRuns
                ? 'Payment is confirmed. Your run is queued and has started writing stage progress.'
                : 'Payment received, preparing your run. If this stays here for more than a few minutes, send the support ids below.'}
            </p>
          )}

          {run?.status === 'running' && (
            <p className="text-body-sm text-ink-3 rounded-md border border-rule bg-paper-2 px-3 py-2">
              CreatorCanon is processing your source library now. This page refreshes while the worker advances through the pipeline stages.
            </p>
          )}

          {run?.status === 'awaiting_payment' && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-sm font-medium text-ink">Payment required</p>
                  <p className="text-caption text-ink-4">
                    This run will not queue until Stripe confirms payment.
                  </p>
                </div>
                <Link
                  href={`/app/checkout?projectId=${params.id}`}
                  className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
                >
                  Complete payment
                </Link>
              </div>
            </div>
          )}

          {run?.status === 'failed' && (
            <p className="text-body-sm text-rose rounded-md border border-rose/30 bg-rose/10 px-3 py-2">
              {hasStageRuns
                ? 'This run failed during processing. Send the support ids below so we can inspect the failed stage and retry it.'
                : 'This run failed before pipeline work began. Send the support ids below so we can inspect payment, worker, and dispatch state.'}
            </p>
          )}

          {run && (
            <div className="rounded-md border border-rule bg-paper-2 px-4 py-3">
              <p className="text-caption uppercase tracking-widest text-ink-4">Support ids</p>
              <dl className="mt-2 space-y-1 text-caption text-ink-4">
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Project</dt>
                  <dd className="break-all font-mono text-ink-3">{proj.id}</dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-20 shrink-0">Run</dt>
                  <dd className="break-all font-mono text-ink-3">{run.id}</dd>
                </div>
              </dl>
            </div>
          )}

          {transcriptOutput && (transcriptOutput.skippedCount ?? 0) > 0 && (
            <div className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3">
              <p className="text-body-sm font-medium text-ink">Limited transcript coverage</p>
              <p className="mt-1 text-caption text-ink-4">
                {transcriptOutput.fetchedCount ?? 0} video{(transcriptOutput.fetchedCount ?? 0) === 1 ? '' : 's'} had usable captions; {transcriptOutput.skippedCount} video{transcriptOutput.skippedCount === 1 ? '' : 's'} did not. Atlas still generates draft pages with limited source support where needed.
              </p>
              {skippedTranscriptReasons.length > 0 && (
                <ul className="mt-2 space-y-1 text-caption text-ink-4">
                  {skippedTranscriptReasons.map((item) => (
                    <li key={`${item.youtubeVideoId}-${item.skipReason}`}>
                      {item.youtubeVideoId ?? 'Video'}: {item.skipReason ?? 'No usable transcript material.'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {draftPagesReady && (
            <div className="rounded-md border border-sage/30 bg-sage/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-sm font-medium text-ink">Draft pages ready</p>
                  <p className="text-caption text-ink-4">
                    {persistedPages.length} page{persistedPages.length === 1 ? '' : 's'} persisted from the current run.
                  </p>
                </div>
                <Link
                  href={`/app/projects/${params.id}/pages`}
                  className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
                >
                  Open draft pages
                </Link>
              </div>
            </div>
          )}

          {draftPagesReady && run?.status === 'awaiting_review' && (
            <form action={publishCurrentRun.bind(null, params.id)} className="rounded-md border border-amber/30 bg-amber/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-sm font-medium text-ink">Ready to publish a local preview</p>
                  <p className="text-caption text-ink-4">
                    This creates a public read-only hub using {selectedTemplate.name}.
                  </p>
                </div>
                <button
                  type="submit"
                  className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
                >
                  Publish preview hub with {selectedTemplate.name}
                </button>
              </div>
            </form>
          )}

          {publishedSubdomain && (
            <div className="rounded-md border border-sage/30 bg-sage/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-sm font-medium text-ink">Published preview hub</p>
                  <p className="text-caption text-ink-4">
                    {publishedTemplate.name} / <span className="font-mono">/h/{publishedSubdomain}</span>
                  </p>
                </div>
                <Link
                  href={`/h/${publishedSubdomain}`}
                  className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
                >
                  Open public hub
                </Link>
              </div>
            </div>
          )}

          {reviewReady && (
            <div className="rounded-md border border-sage/30 bg-sage/10 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-sm font-medium text-ink">Review draft ready</p>
                  <p className="text-caption text-ink-4">
                    {parsedReview.data.totalSegmentCount} transcript segments summarized into a first read-only draft.
                  </p>
                </div>
                <Link
                  href={`/app/projects/${params.id}/review`}
                  className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
                >
                  Open review
                </Link>
              </div>
            </div>
          )}

          {run?.status === 'awaiting_review' && !reviewReady && (
            <p className="text-body-sm text-rose rounded-md border border-rose/30 bg-rose/10 px-3 py-2">
              This run reached review status, but the review artifact is missing or invalid. Re-run the pipeline after fixing the stage output.
            </p>
          )}

          {reviewReady && !draftPagesReady && (
            <p className="text-body-sm text-rose rounded-md border border-rose/30 bg-rose/10 px-3 py-2">
              The review draft exists, but draft pages were not persisted for this run. Re-run the pipeline after fixing the page generation stage.
            </p>
          )}
        </div>

        {/* Stage progress */}
        {stageRuns.length > 0 && (
          <div className="rounded-lg border border-rule bg-paper p-6 space-y-3">
            <h2 className="text-body-md font-medium text-ink">Pipeline stages</h2>
            <ul className="space-y-2">
              {stageRuns.map((sr) => (
                <li key={sr.id} className="flex items-center gap-3">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[sr.status] ?? 'bg-rule'}`} />
                  <span className="flex-1 text-body-sm text-ink">
                    {STAGE_LABELS[sr.stageName] ?? sr.stageName}
                  </span>
                  <span className={`text-caption ${STATUS_COLOR[sr.status] ?? 'text-ink-4'}`}>
                    {sr.status === 'succeeded' && sr.durationMs
                      ? `${(sr.durationMs / 1000).toFixed(1)}s`
                      : sr.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Config summary */}
        {proj.config && (
          <div className="rounded-lg border border-rule bg-paper p-6 space-y-3">
            <h2 className="text-body-md font-medium text-ink">Configuration</h2>
            <dl className="space-y-2 text-body-sm">
              {proj.config.audience && (
                <div className="flex gap-3">
                  <dt className="w-28 shrink-0 text-ink-4">Audience</dt>
                  <dd className="text-ink">{proj.config.audience as string}</dd>
                </div>
              )}
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-4">Tone</dt>
                <dd className="text-ink capitalize">{proj.config.tone as string ?? 'Conversational'}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-4">Depth</dt>
                <dd className="text-ink capitalize">{String(proj.config.length_preset ?? 'standard')}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-4">Template</dt>
                <dd className="text-ink">{selectedTemplate.name}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 shrink-0 text-ink-4">Chat</dt>
                <dd className="text-ink">{proj.config.chat_enabled ? 'Enabled' : 'Disabled'}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </main>
  );
}
