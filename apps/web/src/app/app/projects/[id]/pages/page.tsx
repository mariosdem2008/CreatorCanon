import Link from 'next/link';
import { redirect } from 'next/navigation';

import { asc, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  hub,
  page,
  pageVersion,
  project,
  release,
} from '@creatorcanon/db/schema';

import {
  EmptyState,
  MetricCard,
  NoticeBanner,
  PageHeader,
  StatusPill,
} from '@/components/cc';
import { EvidenceChips, type SourceReferenceView } from '@/components/hub/EvidenceChips';
import { getHubTemplate } from '@/components/hub/templates';
import { requireWorkspace } from '@/lib/workspace';

import { CopyUrlButton } from '../CopyUrlButton';
import { publishCurrentRun } from '../publish';
import {
  approvePage,
  markPageReviewed,
  updatePageSummary,
  updatePageTitle,
  updateSectionBlock,
} from './actions';
import {
  ApprovePageButton,
  MarkReviewedButton,
  PublishHubButton,
  SaveButton,
} from './PageActionButtons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Page Studio' };

type BlockTree = {
  blocks: Array<{
    type: string;
    id: string;
    content: unknown;
    supportLabel?: 'strong' | 'review_recommended' | 'limited';
  }>;
};

type SectionContent = {
  heading?: string;
  body?: string;
  sourceRefs?: SourceReferenceView[];
};

const runStatusLabel: Record<string, string> = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  queued: 'Queued',
  running: 'Processing',
  audit_ready: 'Audit ready',
  awaiting_review: 'Draft ready',
  published: 'Published',
  failed: 'Failed',
  canceled: 'Canceled',
};

export default async function ProjectPagesPage({ params }: { params: { id: string } }) {
  const { workspaceId } = await requireWorkspace();
  const db = getDb();

  const projects = await db.select().from(project).where(eq(project.id, params.id)).limit(1);
  const proj = projects[0];
  if (!proj || proj.workspaceId !== workspaceId) redirect('/app/projects');

  const selectedTemplate = getHubTemplate(proj.config?.presentation_preset);
  const run = proj.currentRunId
    ? (
        await db
          .select()
          .from(generationRun)
          .where(eq(generationRun.id, proj.currentRunId))
          .limit(1)
      )[0]
    : undefined;

  const pages = run
    ? await db
        .select({
          id: page.id,
          slug: page.slug,
          position: page.position,
          currentVersionId: page.currentVersionId,
          status: page.status,
          supportLabel: page.supportLabel,
        })
        .from(page)
        .where(eq(page.runId, run.id))
        .orderBy(asc(page.position))
    : [];

  const versionIds = pages
    .map((item) => item.currentVersionId)
    .filter((id): id is string => Boolean(id));
  const versions = versionIds.length
    ? await db
        .select({
          id: pageVersion.id,
          title: pageVersion.title,
          summary: pageVersion.summary,
          subtitle: pageVersion.subtitle,
          blockTreeJson: pageVersion.blockTreeJson,
        })
        .from(pageVersion)
        .where(inArray(pageVersion.id, versionIds))
    : [];
  const versionMap = new Map(versions.map((version) => [version.id, version]));

  const publishedHub = proj.publishedHubId
    ? (
        await db
          .select({
            subdomain: hub.subdomain,
            theme: hub.theme,
            liveReleaseId: hub.liveReleaseId,
          })
          .from(hub)
          .where(eq(hub.id, proj.publishedHubId))
          .limit(1)
      )[0]
    : undefined;
  const publishedTemplate = getHubTemplate(publishedHub?.theme ?? selectedTemplate.id);

  const approvedCount = pages.filter((item) => item.status === 'approved').length;
  const reviewedCount = pages.filter((item) => item.status === 'reviewed').length;
  const strongSupportCount = pages.filter((item) => item.supportLabel === 'strong').length;
  const allPagesApproved = pages.length > 0 && approvedCount === pages.length;

  const currentVersionIds = pages
    .map((p) => p.currentVersionId)
    .filter((id): id is string => Boolean(id));
  let liveReleaseVersionIds: string[] | undefined;
  if (publishedHub?.liveReleaseId) {
    const liveRows = await db
      .select({ metadata: release.metadata })
      .from(release)
      .where(eq(release.id, publishedHub.liveReleaseId))
      .limit(1);
    const meta = liveRows[0]?.metadata as { pageVersionIds?: unknown } | null | undefined;
    if (meta && Array.isArray(meta.pageVersionIds)) {
      liveReleaseVersionIds = meta.pageVersionIds.filter(
        (id): id is string => typeof id === 'string',
      );
    }
  }

  const isHubPublished = run?.status === 'published' && Boolean(publishedHub?.subdomain);
  const hasEditsSinceLiveRelease =
    isHubPublished &&
    (!liveReleaseVersionIds ||
      liveReleaseVersionIds.length !== currentVersionIds.length ||
      liveReleaseVersionIds.some((id, index) => id !== currentVersionIds[index]));
  const canPublishAwaitingReview = run?.status === 'awaiting_review' && pages.length > 0;
  const canPublish = canPublishAwaitingReview || (isHubPublished && hasEditsSinceLiveRelease);
  const publishButtonLabel = canPublishAwaitingReview
    ? allPagesApproved
      ? 'Publish approved hub'
      : `Publish with ${selectedTemplate.name}`
    : 'Publish updated hub';

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
        title="Pages"
        body="Review generated pages, tighten copy, preserve source evidence, and approve the pages ready for release."
        actions={
          <>
            <Link
              href={`/app/projects/${params.id}`}
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
            >
              Run status
            </Link>
            <Link
              href={`/app/projects/${params.id}/review`}
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
            >
              Review brief
            </Link>
            {publishedHub?.subdomain ? (
              <Link
                href={`/h/${publishedHub.subdomain}`}
                className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
              >
                Public hub
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Pages"
          value={pages.length}
          sub={run ? runStatusLabel[run.status] ?? run.status : 'No run'}
        />
        <MetricCard
          label="Approved"
          value={approvedCount}
          sub={`${reviewedCount} reviewed`}
          tone={allPagesApproved ? 'success' : 'default'}
        />
        <MetricCard
          label="Strong support"
          value={strongSupportCount}
          sub="Evidence-ready pages"
        />
        <MetricCard
          label="Template"
          value={selectedTemplate.name}
          sub={selectedTemplate.tagline}
        />
      </div>

      {canPublish ? (
        <div className="rounded-[12px] border border-[var(--cc-accent)]/40 bg-[var(--cc-accent-wash)] p-4 shadow-[var(--cc-shadow-1)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[14px] font-semibold text-[var(--cc-ink)]">
                {allPagesApproved
                  ? 'Ready to publish'
                  : 'Publish is available, but approval is incomplete'}
              </p>
              <p className="mt-1 text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
                {hasEditsSinceLiveRelease
                  ? 'You have edits not in the live hub yet.'
                  : allPagesApproved
                    ? 'All generated pages are approved for this release.'
                    : 'Approving pages first creates a cleaner creator-reviewed release.'}
              </p>
            </div>
            <form action={publishCurrentRun.bind(null, params.id)}>
              <PublishHubButton label={publishButtonLabel} />
            </form>
          </div>
        </div>
      ) : null}

      {isHubPublished && publishedHub?.subdomain ? (
        <NoticeBanner
          tone="success"
          badge="Live"
          title={`/h/${publishedHub.subdomain}`}
          body={`${publishedTemplate.name}${
            hasEditsSinceLiveRelease ? ' · unpublished edits exist' : ' · hub is current'
          }`}
          action={{
            label: 'Open hub',
            href: `/h/${publishedHub.subdomain}`,
          }}
        />
      ) : null}

      {!run ? (
        <EmptyState
          title="No run yet"
          body="Create and queue a project run before opening draft pages."
          action={{ label: 'Back to projects', href: '/app/projects' }}
        />
      ) : pages.length === 0 ? (
        <EmptyState
          title="Draft pages not ready yet"
          body="Keep watching the run status while the pipeline is queued or running."
          action={{ label: 'Back to run status', href: `/app/projects/${params.id}` }}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-2 xl:sticky xl:top-[66px] xl:self-start">
            {pages.map((item) => {
              const version = item.currentVersionId
                ? versionMap.get(item.currentVersionId)
                : undefined;
              return (
                <a
                  key={item.id}
                  href={`#page-${item.id}`}
                  className="block rounded-[10px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] p-3 transition hover:border-[var(--cc-ink-4)]"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                    Page {item.position + 1}
                  </p>
                  <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold text-[var(--cc-ink)]">
                    {version?.title ?? item.slug}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <PageStatusBadge status={item.status} />
                    <SupportBadge label={item.supportLabel} />
                  </div>
                </a>
              );
            })}
          </aside>

          <div className="space-y-4">
            {pages.map((item) => {
              const version = item.currentVersionId
                ? versionMap.get(item.currentVersionId)
                : undefined;
              const blockTree = (version?.blockTreeJson ?? { blocks: [] }) as BlockTree;
              const sections = blockTree.blocks.filter((block) => block.type === 'section');
              const sourceRefCount = sections.reduce((sum, section) => {
                const content = section.content as SectionContent;
                return sum + (content.sourceRefs?.length ?? 0);
              }, 0);

              return (
                <article
                  id={`page-${item.id}`}
                  key={item.id}
                  data-testid="page-version-block"
                  className="overflow-hidden rounded-[12px] border border-[var(--cc-rule)] bg-[var(--cc-surface)] shadow-[var(--cc-shadow-1)]"
                >
                  <div className="border-b border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 px-5 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
                          Page {item.position + 1}
                        </p>
                        <h2 className="mt-1.5 text-[20px] font-semibold leading-tight text-[var(--cc-ink)]">
                          {version?.title ?? item.slug}
                        </h2>
                        {version?.subtitle ? (
                          <p className="mt-1 text-[12px] text-[var(--cc-ink-4)]">
                            {version.subtitle}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <PageStatusBadge status={item.status} />
                        <SupportBadge label={item.supportLabel} />
                        <Link
                          href={`/app/projects/${params.id}/pages/${item.id}`}
                          className="inline-flex h-8 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[11px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
                        >
                          Focused editor
                        </Link>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-px bg-[var(--cc-rule)] sm:grid-cols-3">
                    <InlineStat label="Sections" value={String(sections.length)} />
                    <InlineStat label="Source moments" value={String(sourceRefCount)} />
                    <InlineStat
                      label="Readiness"
                      value={
                        item.status === 'approved'
                          ? 'Ready'
                          : item.status === 'reviewed'
                            ? 'Close'
                            : 'Needs pass'
                      }
                    />
                  </div>

                  {version?.summary ? (
                    <div className="border-b border-[var(--cc-rule)] px-5 py-4">
                      <p className="text-[13px] leading-[1.7] text-[var(--cc-ink-2)]">
                        {version.summary}
                      </p>
                    </div>
                  ) : null}

                  {version ? (
                    <div className="grid gap-4 border-b border-[var(--cc-rule)] px-5 py-4 lg:grid-cols-2">
                      <form
                        action={updatePageTitle.bind(null, params.id, item.id)}
                        className="space-y-2"
                      >
                        <label
                          className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                          htmlFor={`title-${item.id}`}
                        >
                          Page title
                        </label>
                        <input
                          id={`title-${item.id}`}
                          name="title"
                          defaultValue={version.title}
                          className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[14px] text-[var(--cc-ink)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
                        />
                        <SaveButton label="Save title" />
                      </form>
                      <form
                        action={updatePageSummary.bind(null, params.id, item.id)}
                        className="space-y-2"
                      >
                        <label
                          className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                          htmlFor={`summary-${item.id}`}
                        >
                          Page summary
                        </label>
                        <textarea
                          id={`summary-${item.id}`}
                          name="summary"
                          defaultValue={version.summary ?? ''}
                          rows={4}
                          className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[13px] leading-[1.55] text-[var(--cc-ink-2)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
                        />
                        <SaveButton label="Save summary" />
                      </form>
                    </div>
                  ) : null}

                  <div className="divide-y divide-[var(--cc-rule)]">
                    {sections.length > 0 ? (
                      sections.map((section) => {
                        const content = section.content as SectionContent;
                        return (
                          <section key={section.id} className="px-5 py-4">
                            <form
                              action={updateSectionBlock.bind(
                                null,
                                params.id,
                                item.id,
                                section.id,
                              )}
                              className="space-y-3"
                            >
                              <div className="space-y-2">
                                <label
                                  className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                                  htmlFor={`heading-${item.id}-${section.id}`}
                                >
                                  Section heading
                                </label>
                                <input
                                  id={`heading-${item.id}-${section.id}`}
                                  name="heading"
                                  defaultValue={content.heading ?? ''}
                                  className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[14px] font-medium text-[var(--cc-ink)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
                                />
                              </div>
                              <div className="space-y-2">
                                <label
                                  className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                                  htmlFor={`body-${item.id}-${section.id}`}
                                >
                                  Section body
                                </label>
                                <textarea
                                  id={`body-${item.id}-${section.id}`}
                                  name="body"
                                  defaultValue={content.body ?? ''}
                                  rows={5}
                                  className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[13px] leading-[1.55] text-[var(--cc-ink-2)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
                                />
                              </div>
                              <SaveButton label="Save section" />
                            </form>
                            <div className="mt-3">
                              <EvidenceChips
                                refs={content.sourceRefs}
                                variant={selectedTemplate.evidenceVariant}
                              />
                            </div>
                          </section>
                        );
                      })
                    ) : (
                      <div className="px-5 py-4">
                        <p className="text-[12px] text-[var(--cc-ink-4)]">
                          This page does not have generated sections yet.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-[var(--cc-rule)] bg-[var(--cc-surface-2)]/60 px-5 py-3.5">
                    <form action={markPageReviewed.bind(null, params.id, item.id)}>
                      <MarkReviewedButton />
                    </form>
                    <form action={approvePage.bind(null, params.id, item.id)}>
                      <ApprovePageButton />
                    </form>
                    <p className="ml-auto text-[11px] text-[var(--cc-ink-4)]">
                      Edits create a fresh version while keeping source evidence attached.
                    </p>
                    {publishedHub?.subdomain ? (
                      <CopyUrlButton
                        url={`https://creatorcanon.com/h/${publishedHub.subdomain}`}
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--cc-surface)] px-5 py-3.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--cc-ink-4)]">
        {label}
      </p>
      <p className="mt-1 text-[12px] font-semibold text-[var(--cc-ink)]">{value}</p>
    </div>
  );
}

function RunBadge({ status }: { status: string }) {
  const tone =
    status === 'published'
      ? 'success'
      : status === 'audit_ready'
        ? 'warn'
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

function PageStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'approved'
      ? 'success'
      : status === 'reviewed'
        ? 'warn'
        : 'neutral';
  return (
    <StatusPill tone={tone as 'success' | 'warn' | 'neutral'}>
      {status === 'needs_review' ? 'draft' : status}
    </StatusPill>
  );
}

function SupportBadge({ label }: { label: string }) {
  const tone =
    label === 'strong'
      ? 'success'
      : label === 'limited'
        ? 'warn'
        : 'neutral';
  return (
    <StatusPill tone={tone as 'success' | 'warn' | 'neutral'}>
      {label.replaceAll('_', ' ')}
    </StatusPill>
  );
}
