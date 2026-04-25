import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { asc, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  hub,
  page,
  pageVersion,
  project,
  release,
  workspaceMember,
} from '@creatorcanon/db/schema';
import { EvidenceChips, type SourceReferenceView } from '@/components/hub/EvidenceChips';
import { getHubTemplate } from '@/components/hub/templates';
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
import { CopyUrlButton } from '../CopyUrlButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Draft Pages' };

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
  sourceVideoIds?: string[];
  sourceRefs?: SourceReferenceView[];
};

const RUN_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  awaiting_payment: 'Awaiting payment',
  queued: 'Queued — pipeline starting',
  running: 'Processing',
  awaiting_review: 'Draft ready — awaiting your review',
  published: 'Published',
  failed: 'Failed',
  canceled: 'Canceled',
};

function supportToneClass(label: string) {
  if (label === 'strong') return 'border-sage/30 bg-sage/10 text-sage';
  if (label === 'limited') return 'border-amber/30 bg-amber-wash text-amber-ink';
  return 'border-rule bg-paper-3 text-ink-4';
}

function statusBadgeClass(status: string) {
  if (status === 'approved') return 'border-sage/30 bg-sage/10 text-sage';
  if (status === 'reviewed') return 'border-amber/30 bg-amber-wash text-amber-ink';
  return 'border-rule bg-paper-3 text-ink-4';
}

function statusLabel(status: string) {
  if (status === 'approved') return 'Approved';
  if (status === 'reviewed') return 'Reviewed';
  return 'Draft';
}

export default async function ProjectPagesPage({ params }: { params: { id: string } }) {
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

  const versionIds = pages.map((item) => item.currentVersionId).filter(Boolean) as string[];
  const versions = versionIds.length > 0
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
  const publishedHubs = proj.publishedHubId
    ? await db
        .select({ subdomain: hub.subdomain, theme: hub.theme, liveReleaseId: hub.liveReleaseId })
        .from(hub)
        .where(eq(hub.id, proj.publishedHubId))
        .limit(1)
    : [];
  const publishedSubdomain = publishedHubs[0]?.subdomain;
  const publishedTemplate = getHubTemplate(publishedHubs[0]?.theme ?? selectedTemplate.id);
  const approvedCount = pages.filter((item) => item.status === 'approved').length;
  const allPagesApproved = pages.length > 0 && approvedCount === pages.length;
  const reviewedCount = pages.filter((item) => item.status === 'reviewed').length;
  const strongSupportCount = pages.filter((item) => item.supportLabel === 'strong').length;

  const currentVersionIds = pages
    .map((p) => p.currentVersionId)
    .filter((id): id is string => Boolean(id));
  let liveReleaseVersionIds: string[] | undefined;
  if (publishedHubs[0]?.liveReleaseId) {
    const liveRows = await db
      .select({ metadata: release.metadata })
      .from(release)
      .where(eq(release.id, publishedHubs[0].liveReleaseId))
      .limit(1);
    const meta = liveRows[0]?.metadata as { pageVersionIds?: unknown } | null | undefined;
    if (meta && Array.isArray(meta.pageVersionIds)) {
      liveReleaseVersionIds = meta.pageVersionIds.filter((id): id is string => typeof id === 'string');
    }
  }
  const isHubPublished = run?.status === 'published' && !!publishedSubdomain;
  const hasEditsSinceLiveRelease =
    isHubPublished &&
    (!liveReleaseVersionIds ||
      liveReleaseVersionIds.length !== currentVersionIds.length ||
      liveReleaseVersionIds.some((id, i) => id !== currentVersionIds[i]));
  const canPublishAwaitingReview = run?.status === 'awaiting_review' && pages.length > 0;
  const canPublish = canPublishAwaitingReview || (isHubPublished && hasEditsSinceLiveRelease);
  const publishButtonLabel = canPublishAwaitingReview
    ? allPagesApproved
      ? 'Publish approved hub'
      : `Publish with ${selectedTemplate.name}`
    : 'Publish updated hub';

  return (
    <main className="min-h-screen bg-paper-studio">
      {/* Top bar */}
      <div className="border-b border-rule-dark bg-paper px-4 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-[920px] items-center justify-between gap-3">
          <div className="min-w-0">
            <Link
              href="/app"
              className="mb-1 inline-block text-eyebrow uppercase tracking-widest text-ink-4 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber rounded"
            >
              Creator Studio
            </Link>
            <h1 className="font-serif text-heading-lg text-ink truncate">{proj.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Link
              href={`/app/projects/${params.id}`}
              aria-label="Back to run status"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
            >
              <span className="hidden sm:inline">Run status</span>
              <span className="sm:hidden" aria-hidden="true">←</span>
            </Link>
            <Link
              href={`/app/projects/${params.id}/review`}
              className="hidden h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 sm:inline-flex"
            >
              Review draft
            </Link>
            {publishedSubdomain && (
              <Link
                href={`/h/${publishedSubdomain}`}
                className="hidden h-9 items-center gap-1.5 rounded-lg border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 sm:inline-flex"
              >
                Public hub
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] space-y-6 px-4 py-6 sm:px-8 sm:py-10">
        <section className="overflow-hidden rounded-[28px] border border-rule bg-paper shadow-1">
          <div className="border-b border-rule bg-[linear-gradient(135deg,rgba(168,138,75,0.14),rgba(250,247,239,0.96)_48%,rgba(248,241,224,0.98))] px-4 py-6 sm:px-6 sm:py-7">
            <p className="text-eyebrow uppercase tracking-widest text-ink-4">
              Creator review workspace
            </p>
            <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-[560px]">
                <h2 className="font-serif text-heading-lg text-ink">
                  Shape the public hub before it goes live.
                </h2>
                <p className="mt-2 text-body-sm leading-6 text-ink-3">
                  Tighten the headline, refine the summary, and keep the grounded
                  source moments intact. Publishing uses the current page version,
                  so this screen is the final pass before the hub becomes the
                  product.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center sm:max-w-[340px]">
                <div className="rounded-2xl border border-rule bg-paper px-3 py-3">
                  <div className="text-eyebrow uppercase tracking-widest text-ink-4">Approved</div>
                  <div className="mt-2 font-serif text-heading-md text-ink">{approvedCount}</div>
                </div>
                <div className="rounded-2xl border border-rule bg-paper px-3 py-3">
                  <div className="text-eyebrow uppercase tracking-widest text-ink-4">Reviewed</div>
                  <div className="mt-2 font-serif text-heading-md text-ink">{reviewedCount}</div>
                </div>
                <div className="rounded-2xl border border-rule bg-paper px-3 py-3">
                  <div className="text-eyebrow uppercase tracking-widest text-ink-4">Strong</div>
                  <div className="mt-2 font-serif text-heading-md text-ink">{strongSupportCount}</div>
                </div>
              </div>
            </div>
          </div>
          <div className="grid gap-px bg-rule sm:grid-cols-3">
            {[
              {
                title: '1. Review structure',
                body: 'Confirm page order, headings, and summaries read like a coherent premium hub.',
              },
              {
                title: '2. Keep evidence visible',
                body: 'Section edits preserve attached source moments, so improve prose without losing trust signals.',
              },
              {
                title: '3. Publish intentionally',
                body: allPagesApproved
                  ? 'All pages are approved. You can publish a creator-reviewed hub.'
                  : 'Unapproved pages can still publish, but the cleaner alpha move is to approve them first.',
              },
            ].map((item) => (
              <div key={item.title} className="bg-paper px-4 py-4 sm:px-5">
                <p className="text-body-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-1.5 text-caption leading-5 text-ink-4">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Run summary */}
        <div className="overflow-hidden rounded-xl border border-rule bg-paper">
          <div className="border-b border-rule bg-paper-2 px-4 py-4 sm:px-6">
            <h2 className="text-body-sm font-semibold text-ink">Run overview</h2>
          </div>
          <div className="space-y-2 px-4 py-4 sm:px-6">
            <p className="text-body-sm text-ink-4">
              {run
                ? `${RUN_STATUS_LABEL[run.status] ?? run.status}. Edit and approve generated draft pages before publishing.`
                : 'No generation run was found for this project yet.'}
            </p>
            <p className="text-body-sm text-ink-4">
              Template:{' '}
              <span className="font-medium text-ink">{selectedTemplate.name}</span>
              {' — '}
              <span>{selectedTemplate.tagline}</span>
            </p>
            {pages.length > 0 && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <p className="text-body-sm text-ink-4">
                  Review progress:{' '}
                  <span className="font-semibold text-ink">{approvedCount}</span>
                  {' approved, '}
                  <span className="font-semibold text-ink">{reviewedCount}</span>
                  {' reviewed, '}
                  <span className="font-semibold text-ink">{pages.length - approvedCount - reviewedCount}</span>
                  {' still in draft'}
                </p>
                <div className="flex-1 max-w-[220px]">
                  <div className="h-1.5 rounded-full bg-paper-3 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-sage transition-all"
                      style={{ width: `${pages.length > 0 ? (approvedCount / pages.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
            {publishedSubdomain && (
              <p className="text-body-sm text-ink-4">
                Published with{' '}
                <span className="font-medium text-ink">{publishedTemplate.name}</span>
                {' at '}
                <Link href={`/h/${publishedSubdomain}`} className="font-mono text-ink underline hover:text-ink-2">
                  /h/{publishedSubdomain}
                </Link>
                {isHubPublished && !hasEditsSinceLiveRelease
                  ? ' — hub is current.'
                  : hasEditsSinceLiveRelease
                    ? ' — you have edits not yet in the live hub.'
                    : ''}
              </p>
            )}
          </div>

          {canPublish && (
            <div className="border-t border-rule px-4 py-4 sm:px-6">
              <form action={publishCurrentRun.bind(null, params.id)} className="space-y-3">
                {canPublishAwaitingReview && !allPagesApproved && (
                  <div className="rounded-lg border border-amber/30 bg-amber-wash px-4 py-3">
                    <p className="text-body-sm text-amber-ink">
                      You can publish now, but at least one page still needs approval. Approving pages first makes this a cleaner creator-reviewed preview.
                    </p>
                  </div>
                )}
                <PublishHubButton label={publishButtonLabel} />
              </form>
            </div>
          )}
        </div>

        {/* Publish success celebration */}
        {isHubPublished && publishedSubdomain && (
          <div className="overflow-hidden rounded-xl border border-sage/40 bg-sage/8">
            <div className="px-4 py-5 sm:px-6">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sage text-paper text-[13px] font-bold" aria-hidden="true">✓</span>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-ink">Your hub is live!</p>
                  <p className="mt-1 text-body-sm text-ink-3 leading-relaxed">
                    Shared with the world at{' '}
                    <Link
                      href={`/h/${publishedSubdomain}`}
                      className="font-mono text-sage underline underline-offset-2 hover:text-sage/80"
                    >
                      creatorcanon.com/h/{publishedSubdomain}
                    </Link>
                    {hasEditsSinceLiveRelease && (
                      <span className="ml-1 text-ink-4">(you have unpublished edits)</span>
                    )}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <CopyUrlButton url={`https://creatorcanon.com/h/${publishedSubdomain}`} />
                    <a
                      href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`Just published my knowledge hub — ${proj.title}`)}&url=${encodeURIComponent(`https://creatorcanon.com/h/${publishedSubdomain}`)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-paper px-4 text-body-sm font-medium text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                    >
                      Share on X (Twitter)
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </a>
                    <Link
                      href={`/h/${publishedSubdomain}`}
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-rule bg-paper px-4 text-body-sm font-medium text-ink-3 transition hover:bg-paper-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2"
                    >
                      Open hub
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                        <path d="M2 8L8 2M8 2H4M8 2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty states */}
        {!run && (
          <div className="rounded-xl border border-rule bg-paper px-6 py-10 text-center">
            <p className="text-body-sm font-medium text-ink">No run yet</p>
            <p className="mt-2 text-body-sm text-ink-3">
              Create and queue a project run before opening draft pages.
            </p>
          </div>
        )}

        {run && pages.length === 0 && (
          <div className="rounded-xl border border-rule bg-paper px-6 py-10 text-center">
            <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-paper-3">
              <span className="h-2 w-2 rounded-full bg-amber animate-pulse" aria-hidden="true" />
            </div>
            <p className="text-body-sm font-medium text-ink">Draft pages not ready yet</p>
            <p className="mt-2 text-body-sm text-ink-3">
              Keep watching the run status page while the pipeline is queued or running.
            </p>
            <Link
              href={`/app/projects/${params.id}`}
              className="mt-4 inline-flex items-center gap-1.5 text-body-sm text-ink-4 underline hover:text-ink"
            >
              Back to run status
            </Link>
          </div>
        )}

        {/* Page cards */}
        {pages.map((item) => {
          const version = item.currentVersionId ? versionMap.get(item.currentVersionId) : undefined;
          const blockTree = (version?.blockTreeJson ?? { blocks: [] }) as BlockTree;
          const sections = blockTree.blocks.filter((block) => block.type === 'section');
          const sourceRefCount = sections.reduce((sum, section) => {
            const content = section.content as SectionContent;
            return sum + (content.sourceRefs?.length ?? 0);
          }, 0);

          return (
            <article
              key={item.id}
              data-testid="page-version-block"
              className="overflow-hidden rounded-xl border border-rule bg-paper"
            >
              {/* Page header */}
              <div className="flex items-start justify-between gap-3 border-b border-rule bg-paper-2 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5">
                <div className="min-w-0">
                  <p className="text-eyebrow uppercase tracking-widest text-ink-4">
                    Page {item.position + 1}
                  </p>
                  <h2 className="mt-1.5 font-serif text-heading-sm text-ink">
                    {version?.title ?? item.slug}
                  </h2>
                  {version?.subtitle && (
                    <p className="mt-1 text-body-sm text-ink-4">{version.subtitle}</p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-eyebrow uppercase tracking-widest ${statusBadgeClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize ${supportToneClass(item.supportLabel)}`}>
                    {item.supportLabel.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="grid gap-px border-b border-rule bg-rule sm:grid-cols-3">
                {[
                  {
                    label: 'Sections',
                    value: sections.length,
                  },
                  {
                    label: 'Source moments',
                    value: sourceRefCount,
                  },
                  {
                    label: 'Live status',
                    value: item.status === 'approved' ? 'Ready' : item.status === 'reviewed' ? 'Close' : 'Needs pass',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="bg-paper px-4 py-3 sm:px-6">
                    <p className="text-eyebrow uppercase tracking-widest text-ink-4">{stat.label}</p>
                    <p className="mt-1.5 text-body-sm font-semibold text-ink">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Summary */}
              {version?.summary && (
                <div className="border-b border-rule px-6 py-5">
                  <p className="text-body-md leading-7 text-ink-2">{version.summary}</p>
                </div>
              )}

              {/* Edit forms */}
              {version && (
                <div className="grid gap-5 border-b border-rule px-4 py-4 sm:px-6 sm:py-5 md:grid-cols-2">
                  <form action={updatePageTitle.bind(null, params.id, item.id)} className="space-y-2">
                    <label
                      className="block text-body-sm font-semibold text-ink"
                      htmlFor={`title-${item.id}`}
                    >
                      Page title
                    </label>
                    <input
                      id={`title-${item.id}`}
                      name="title"
                      defaultValue={version.title}
                      className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-body-sm text-ink outline-none transition focus:ring-2 focus:ring-amber focus:border-transparent"
                    />
                    <SaveButton label="Save title" />
                  </form>

                  <form action={updatePageSummary.bind(null, params.id, item.id)} className="space-y-2">
                    <label
                      className="block text-body-sm font-semibold text-ink"
                      htmlFor={`summary-${item.id}`}
                    >
                      Page summary
                    </label>
                    <textarea
                      id={`summary-${item.id}`}
                      name="summary"
                      defaultValue={version.summary ?? ''}
                      rows={4}
                      className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-body-sm leading-6 text-ink outline-none transition focus:ring-2 focus:ring-amber focus:border-transparent"
                    />
                    <SaveButton label="Save summary" />
                  </form>
                </div>
              )}

              {/* Sections */}
              <div className="divide-y divide-rule">
                {sections.length > 0 ? sections.map((section) => {
                  const content = section.content as SectionContent;
                  return (
                    <section key={section.id} className="px-4 py-4 sm:px-6 sm:py-5">
                      <form
                        action={updateSectionBlock.bind(null, params.id, item.id, section.id)}
                        className="space-y-4"
                      >
                        <div className="space-y-1.5">
                          <label
                            className="block text-body-sm font-semibold text-ink"
                            htmlFor={`heading-${item.id}-${section.id}`}
                          >
                            Section heading
                          </label>
                          <input
                            id={`heading-${item.id}-${section.id}`}
                            name="heading"
                            defaultValue={content.heading ?? ''}
                            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-body-sm font-medium text-ink outline-none transition focus:ring-2 focus:ring-amber focus:border-transparent"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label
                            className="block text-body-sm font-semibold text-ink"
                            htmlFor={`body-${item.id}-${section.id}`}
                          >
                            Section body
                          </label>
                          <textarea
                            id={`body-${item.id}-${section.id}`}
                            name="body"
                            defaultValue={content.body ?? ''}
                            rows={5}
                            className="w-full rounded-lg border border-rule bg-paper px-3 py-2 text-body-sm leading-6 text-ink-2 outline-none transition focus:ring-2 focus:ring-amber focus:border-transparent"
                          />
                        </div>
                        <SaveButton label="Save section" />
                      </form>
                      <EvidenceChips refs={content.sourceRefs} variant={selectedTemplate.evidenceVariant} />
                    </section>
                  );
                }) : (
                  <div className="px-6 py-5">
                    <p className="text-body-sm text-ink-4">
                      This page does not have generated sections yet.
                    </p>
                  </div>
                )}
              </div>

              {/* Approve row */}
              <div className="flex flex-wrap items-center gap-3 border-t border-rule-dark bg-paper-2 px-4 py-4 sm:px-6">
                <form action={markPageReviewed.bind(null, params.id, item.id)}>
                  <MarkReviewedButton />
                </form>
                <form action={approvePage.bind(null, params.id, item.id)}>
                  <ApprovePageButton />
                </form>
                <p className="text-caption text-ink-4">
                  Every edit creates a fresh version while keeping source evidence attached to the block.
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
