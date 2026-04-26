import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ExecutionTimeline } from '@/components/app/ExecutionTimeline';
import { and, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  hub,
  page,
  project,
  videoSetItem,
} from '@creatorcanon/db/schema';
import {
  draftPagesV0StageOutputSchema,
  v0ReviewStageOutputSchema,
} from '@creatorcanon/pipeline';

import {
  LinkButton,
  MetricCard,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
} from '@/components/cc';
import { getHubTemplate } from '@/components/hub/templates';
import { requireWorkspace } from '@/lib/workspace';

import { CopyUrlButton } from './CopyUrlButton';
import { LiveRefresh } from './LiveRefresh';
import { PublishButton } from './PublishButton';
import { StalledRunBanner } from './StalledRunBanner';
import { publishCurrentRun } from './publish';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Project' };

const activeRunStatuses = new Set(['queued', 'running']);

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const { workspaceId } = await requireWorkspace();
  const db = getDb();

  const projects = await db
    .select()
    .from(project)
    .where(eq(project.id, params.id))
    .limit(1);
  const proj = projects[0];
  if (!proj || proj.workspaceId !== workspaceId) redirect('/app/projects');

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

  const [stageRuns, selectedVideos, pages, publishedHubs] = await Promise.all([
    run
      ? db
          .select()
          .from(generationStageRun)
          .where(eq(generationStageRun.runId, run.id))
          .orderBy(generationStageRun.createdAt)
      : Promise.resolve([]),
    proj.videoSetId
      ? db.select().from(videoSetItem).where(eq(videoSetItem.videoSetId, proj.videoSetId))
      : Promise.resolve([]),
    run
      ? db
          .select({ id: page.id, status: page.status, supportLabel: page.supportLabel })
          .from(page)
          .where(eq(page.runId, run.id))
          .orderBy(page.position)
      : Promise.resolve([]),
    proj.publishedHubId
      ? db
          .select({
            subdomain: hub.subdomain,
            theme: hub.theme,
            liveReleaseId: hub.liveReleaseId,
          })
          .from(hub)
          .where(and(eq(hub.id, proj.publishedHubId), eq(hub.workspaceId, workspaceId)))
          .limit(1)
      : Promise.resolve([]),
  ]);

  const selectedTemplate = getHubTemplate(proj.config?.presentation_preset);
  const publishedHub = publishedHubs[0];
  const publishedTemplate = getHubTemplate(publishedHub?.theme ?? selectedTemplate.id);
  const isActive = Boolean(run && activeRunStatuses.has(run.status));
  const reviewStage = stageRuns.find(
    (stage) => stage.stageName === 'synthesize_v0_review' && stage.status === 'succeeded',
  );
  const draftPagesStage = stageRuns.find(
    (stage) => stage.stageName === 'draft_pages_v0' && stage.status === 'succeeded',
  );
  const parsedReview = reviewStage?.outputJson
    ? v0ReviewStageOutputSchema.safeParse(reviewStage.outputJson)
    : null;
  const parsedDraftPages = draftPagesStage?.outputJson
    ? draftPagesV0StageOutputSchema.safeParse(draftPagesStage.outputJson)
    : null;
  const reviewReady = parsedReview?.success === true;
  const draftPagesReady = parsedDraftPages?.success === true && pages.length > 0;
  const approvedCount = pages.filter((item) => item.status === 'approved').length;
  const failedStageCount = stageRuns.filter((stage) =>
    stage.status.startsWith('failed'),
  ).length;

  return (
    <div className="space-y-4">
      {isActive ? <LiveRefresh intervalMs={20000} /> : null}
      {isActive && run ? (
        <StalledRunBanner
          runCreatedAtIso={new Date(run.createdAt).toISOString()}
          lastStageUpdateAtIso={
            stageRuns.length > 0
              ? new Date(
                  stageRuns[stageRuns.length - 1]!.updatedAt ??
                    stageRuns[stageRuns.length - 1]!.createdAt,
                ).toISOString()
              : null
          }
          runStatus={run.status === 'queued' ? 'queued' : 'running'}
        />
      ) : null}

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link href="/app/projects" className="hover:text-[var(--cc-ink)]">
              Projects
            </Link>
            <span aria-hidden>·</span>
            {run ? <RunBadge status={run.status} /> : <StatusPill tone="neutral">Draft</StatusPill>}
          </span>
        }
        title={proj.title}
        body={projectBrief(
          run?.status,
          reviewReady,
          draftPagesReady,
          Boolean(publishedHub?.liveReleaseId),
        )}
        actions={
          <>
            {isActive ? (
              <span className="inline-flex items-center gap-1.5 text-body-sm text-amber-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
                Processing…
              </span>
            ) : null}
            {run?.status === 'awaiting_payment' ? (
              <LinkButton href={`/app/checkout?projectId=${params.id}`} variant="primary">
                Complete payment →
              </LinkButton>
            ) : null}
            {reviewReady ? (
              <Link
                href={`/app/projects/${params.id}/review`}
                className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
              >
                Open review
              </Link>
            ) : null}
            {draftPagesReady ? (
              <Link
                href={`/app/projects/${params.id}/pages`}
                className="inline-flex h-9 items-center rounded-[8px] bg-[var(--cc-accent)] px-3 text-[12px] font-semibold text-white hover:bg-[var(--cc-accent-strong)]"
              >
                Open pages
              </Link>
            ) : null}
            {publishedHub?.liveReleaseId ? (
              <Link
                href={`/h/${publishedHub.subdomain}`}
                className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
              >
                Open hub
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Videos selected"
          value={selectedVideos.length}
          sub="Source set size"
        />
        <MetricCard
          label="Pipeline stages"
          value={stageRuns.length}
          sub={
            failedStageCount > 0
              ? `${failedStageCount} need attention`
              : 'Worker activity'
          }
          tone={failedStageCount > 0 ? 'danger' : 'default'}
        />
        <MetricCard
          label="Draft pages"
          value={pages.length}
          sub={`${approvedCount} approved`}
          tone={approvedCount === pages.length && pages.length > 0 ? 'success' : 'default'}
        />
        <MetricCard
          label="Template"
          value={selectedTemplate.name}
          sub={proj.config?.chat_enabled ? 'Chat enabled' : 'Static hub'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Execution timeline" meta={`${stageRuns.length} stages`} />
            <ExecutionTimeline stages={stageRuns} />
          </Panel>

          <Panel>
            <PanelHeader title="Next actions" />
            <div className="grid gap-3 p-5 lg:grid-cols-2">
              {run?.status === 'awaiting_payment' ? (
                <ActionCard
                  title="Payment required"
                  body="This run will not queue until Stripe confirms checkout."
                  href={`/app/checkout?projectId=${params.id}`}
                  cta="Complete payment"
                  tone="warn"
                />
              ) : null}
              {run?.status === 'failed' ? (
                <ActionCard
                  title="Run needs attention"
                  body="A pipeline stage failed. Use the support IDs below when contacting support, then start a new project."
                  href={`/app/projects/${params.id}`}
                  cta="View support IDs"
                  tone="danger"
                />
              ) : null}
              {reviewReady ? (
                <ActionCard
                  title="Review archive brief"
                  body="Atlas summarized the source set. Check themes and source coverage before approving pages."
                  href={`/app/projects/${params.id}/review`}
                  cta="Open review"
                  tone="success"
                />
              ) : null}
              {draftPagesReady ? (
                <ActionCard
                  title="Review draft pages"
                  body={`${pages.length} generated page${pages.length === 1 ? '' : 's'} ready for approval and polish.`}
                  href={`/app/projects/${params.id}/pages`}
                  cta="Open pages"
                  tone="success"
                />
              ) : null}
              {draftPagesReady && run?.status === 'awaiting_review' ? (
                <form
                  action={publishCurrentRun.bind(null, params.id)}
                  className="rounded-[10px] border border-[var(--cc-accent)]/40 bg-[var(--cc-accent-wash)] p-4"
                >
                  <p className="text-[13px] font-semibold text-[var(--cc-accent)]">
                    Publish preview
                  </p>
                  <p className="mt-1.5 text-[12px] leading-[1.55] text-[var(--cc-ink-2)]">
                    Creates a public read-only hub using {selectedTemplate.name}.
                  </p>
                  <div className="mt-3">
                    <PublishButton label="Publish preview" />
                  </div>
                </form>
              ) : null}
              {!run ? (
                <ActionCard
                  title="No run yet"
                  body="This project exists, but it doesn't have a generation run attached."
                  href="/app/library"
                  cta="Select sources"
                />
              ) : null}
            </div>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel>
            <PanelHeader title="Configuration" />
            <dl className="divide-y divide-[var(--cc-rule)] px-4">
              <ConfigRow
                label="Audience"
                value={String(proj.config?.audience ?? 'Not specified')}
              />
              <ConfigRow
                label="Tone"
                value={String(proj.config?.tone ?? 'Conversational')}
              />
              <ConfigRow
                label="Depth"
                value={String(proj.config?.length_preset ?? 'standard')}
              />
              <ConfigRow
                label="Chat"
                value={proj.config?.chat_enabled ? 'Enabled' : 'Disabled'}
              />
            </dl>
          </Panel>

          {publishedHub?.liveReleaseId ? (
            <Panel>
              <PanelHeader
                title="Live release"
                meta={<StatusPill tone="success">Live</StatusPill>}
              />
              <div className="space-y-3 px-4 py-4">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--cc-ink)]">
                    /h/{publishedHub.subdomain}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--cc-ink-4)]">
                    {publishedTemplate.name}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/h/${publishedHub.subdomain}`}
                    className="inline-flex h-8 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
                  >
                    Open hub
                  </Link>
                  <CopyUrlButton url={`https://creatorcanon.com/h/${publishedHub.subdomain}`} />
                </div>
              </div>
            </Panel>
          ) : null}

          {run ? (
            <Panel>
              <PanelHeader title="Support IDs" />
              <dl className="space-y-2 px-4 py-4 text-[11px]">
                <SupportRow label="Project" value={proj.id} />
                <SupportRow label="Run" value={run.id} />
              </dl>
            </Panel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

function projectBrief(
  status?: string,
  reviewReady?: boolean,
  draftPagesReady?: boolean,
  published?: boolean,
): string {
  if (published)
    return 'This hub is live. Future edits move through a deliberate review and republish cycle.';
  if (status === 'failed')
    return 'The run failed and needs operator attention before the creator can continue.';
  if (status === 'queued' || status === 'running')
    return 'Generation is in progress. The timeline shows each stage as the worker advances.';
  if (draftPagesReady)
    return 'Draft pages are ready. Review evidence strength, approve strong pages, then publish.';
  if (reviewReady)
    return 'The archive review is ready. Use it to confirm direction before page approval.';
  if (status === 'awaiting_payment')
    return 'The plan exists, but payment must complete before the run can start.';
  return 'This project is waiting for its next setup step.';
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

function ActionCard({
  title,
  body,
  href,
  cta,
  tone = 'neutral',
}: {
  title: string;
  body: string;
  href: string;
  cta: string;
  tone?: 'neutral' | 'success' | 'warn' | 'danger';
}) {
  const border =
    tone === 'success'
      ? 'border-[var(--cc-success)]/40 bg-[var(--cc-success-wash)]/40'
      : tone === 'warn'
        ? 'border-[var(--cc-warn)]/40 bg-[var(--cc-warn-wash)]/40'
        : tone === 'danger'
          ? 'border-[var(--cc-danger)]/40 bg-[var(--cc-danger-wash)]/40'
          : 'border-[var(--cc-rule)] bg-[var(--cc-surface)]';

  return (
    <div className={`rounded-[10px] border p-4 ${border}`}>
      <p className="text-[13px] font-semibold text-[var(--cc-ink)]">{title}</p>
      <p className="mt-1.5 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">{body}</p>
      <Link
        href={href}
        className="mt-3 inline-flex text-[12px] font-semibold text-[var(--cc-accent)] hover:underline"
      >
        {cta} →
      </Link>
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 py-2.5 text-[12px]">
      <dt className="w-20 shrink-0 text-[var(--cc-ink-4)]">{label}</dt>
      <dd className="min-w-0 text-[var(--cc-ink)] font-medium">{value}</dd>
    </div>
  );
}

function SupportRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-[var(--cc-ink-4)]">{label}</dt>
      <dd className="break-all font-mono text-[var(--cc-ink-3)]">{value}</dd>
    </div>
  );
}
