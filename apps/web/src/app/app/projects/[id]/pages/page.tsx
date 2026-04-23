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

function statusLabel(status: string) {
  return status.replace('_', ' ');
}

function statusClass(status: string) {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'reviewed') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-rule bg-paper-2 text-ink-4';
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

  // Compare the current page-version set against the live release's metadata.
  // If they differ (creator edited since last publish), offer a republish.
  // If they match, the live hub is already faithful to the current draft.
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
      <div className="border-b border-rule-dark bg-paper px-8 py-5">
        <div className="mx-auto flex max-w-[920px] items-center justify-between gap-4">
          <div>
            <div className="mb-1 text-eyebrow uppercase tracking-widest text-ink-4">
              Draft Pages
            </div>
            <h1 className="font-serif text-heading-lg text-ink">{proj.title}</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/app/projects/${params.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
            >
              Back to run status
            </Link>
            <Link
              href={`/app/projects/${params.id}/review`}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
            >
              Review draft
            </Link>
            {publishedSubdomain && (
              <Link
                href={`/h/${publishedSubdomain}`}
                className="inline-flex h-8 items-center gap-1.5 rounded border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
              >
                Public hub
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[920px] space-y-6 px-8 py-10">
        <section className="rounded-lg border border-rule bg-paper p-6">
          <h2 className="text-body-md font-medium text-ink">Current run</h2>
          <p className="mt-2 text-body-sm text-ink-4">
            {run
              ? `Status: ${run.status}. Edit and approve generated draft pages before publishing.`
              : 'No generation run was found for this project yet.'}
          </p>
          <p className="mt-2 text-body-sm text-ink-4">
            Selected template: <span className="font-medium text-ink">{selectedTemplate.name}</span> - {selectedTemplate.tagline}
          </p>
          {pages.length > 0 && (
            <p className="mt-2 text-body-sm text-ink-4">
              Review progress: <span className="font-medium text-ink">{approvedCount}</span> of{' '}
              <span className="font-medium text-ink">{pages.length}</span> pages approved.
            </p>
          )}
          {publishedSubdomain && (
            <p className="mt-2 text-body-sm text-ink-4">
              Published with <span className="font-medium text-ink">{publishedTemplate.name}</span> at{' '}
              <Link href={`/h/${publishedSubdomain}`} className="font-mono text-ink underline">
                /h/{publishedSubdomain}
              </Link>
              .{' '}
              {isHubPublished && !hasEditsSinceLiveRelease
                ? 'Published hub is current.'
                : hasEditsSinceLiveRelease
                  ? 'You have edits that are not in the live hub yet.'
                  : ''}
            </p>
          )}
          {canPublish && (
            <form action={publishCurrentRun.bind(null, params.id)} className="mt-4 space-y-3">
              {canPublishAwaitingReview && !allPagesApproved && (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-body-sm text-amber-900">
                  You can publish now, but at least one page still needs approval. Approving pages first makes this a cleaner creator-reviewed preview.
                </p>
              )}
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
              >
                {publishButtonLabel}
              </button>
            </form>
          )}
        </section>

        {!run && (
          <section className="rounded-lg border border-rule bg-paper p-6 text-body-sm text-ink-3">
            Create and queue a project run before opening draft pages.
          </section>
        )}

        {run && pages.length === 0 && (
          <section className="rounded-lg border border-rule bg-paper p-6 text-body-sm text-ink-3">
            Draft pages are not ready yet. Keep watching the run status page while the pipeline is still queued or running.
          </section>
        )}

        {pages.map((item) => {
          const version = item.currentVersionId ? versionMap.get(item.currentVersionId) : undefined;
          const blockTree = (version?.blockTreeJson ?? { blocks: [] }) as BlockTree;
          const sections = blockTree.blocks.filter((block) => block.type === 'section');

          return (
            <article key={item.id} className="rounded-lg border border-rule bg-paper p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-caption uppercase tracking-widest text-ink-4">
                    Page {item.position + 1}
                  </p>
                  <h2 className="mt-2 text-heading-sm font-serif text-ink">
                    {version?.title ?? item.slug}
                  </h2>
                  {version?.subtitle && (
                    <p className="mt-1 text-body-sm text-ink-4">{version.subtitle}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 text-right text-caption">
                  <span className={`rounded-full border px-2.5 py-1 uppercase tracking-widest ${statusClass(item.status)}`}>
                    {statusLabel(item.status)}
                  </span>
                  <span className="text-ink-4">{item.supportLabel.replace('_', ' ')}</span>
                </div>
              </div>

              {version?.summary && (
                <p className="mt-4 text-body-md leading-7 text-ink-2">{version.summary}</p>
              )}

              {version && (
                <div className="mt-5 grid gap-4 border-t border-rule pt-5 md:grid-cols-2">
                  <form action={updatePageTitle.bind(null, params.id, item.id)} className="space-y-2">
                    <label className="block text-caption uppercase tracking-widest text-ink-4" htmlFor={`title-${item.id}`}>
                      Page title
                    </label>
                    <input
                      id={`title-${item.id}`}
                      name="title"
                      defaultValue={version.title}
                      className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 text-body-sm text-ink outline-none transition focus:border-ink"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center rounded-md border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
                    >
                      Save title
                    </button>
                  </form>

                  <form action={updatePageSummary.bind(null, params.id, item.id)} className="space-y-2">
                    <label className="block text-caption uppercase tracking-widest text-ink-4" htmlFor={`summary-${item.id}`}>
                      Page summary
                    </label>
                    <textarea
                      id={`summary-${item.id}`}
                      name="summary"
                      defaultValue={version.summary ?? ''}
                      rows={4}
                      className="w-full rounded-md border border-rule bg-paper-2 px-3 py-2 text-body-sm leading-6 text-ink outline-none transition focus:border-ink"
                    />
                    <button
                      type="submit"
                      className="inline-flex h-8 items-center rounded-md border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
                    >
                      Save summary
                    </button>
                  </form>
                </div>
              )}

              <div className="mt-6 space-y-4">
                {sections.length > 0 ? sections.map((section) => {
                  const content = section.content as SectionContent;
                  return (
                    <section key={section.id} className="rounded-md border border-rule bg-paper-2 p-4">
                      <form
                        action={updateSectionBlock.bind(null, params.id, item.id, section.id)}
                        className="space-y-3"
                      >
                        <div>
                          <label className="block text-caption uppercase tracking-widest text-ink-4" htmlFor={`heading-${item.id}-${section.id}`}>
                            Section heading
                          </label>
                          <input
                            id={`heading-${item.id}-${section.id}`}
                            name="heading"
                            defaultValue={content.heading ?? ''}
                            className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2 text-body-sm font-medium text-ink outline-none transition focus:border-ink"
                          />
                        </div>
                        <div>
                          <label className="block text-caption uppercase tracking-widest text-ink-4" htmlFor={`body-${item.id}-${section.id}`}>
                            Section body
                          </label>
                          <textarea
                            id={`body-${item.id}-${section.id}`}
                            name="body"
                            defaultValue={content.body ?? ''}
                            rows={5}
                            className="mt-1 w-full rounded-md border border-rule bg-paper px-3 py-2 text-body-sm leading-6 text-ink-2 outline-none transition focus:border-ink"
                          />
                        </div>
                        <button
                          type="submit"
                          className="inline-flex h-8 items-center rounded-md border border-rule bg-paper px-3 text-body-sm text-ink-3 transition hover:text-ink"
                        >
                          Save section
                        </button>
                      </form>
                      <EvidenceChips refs={content.sourceRefs} variant={selectedTemplate.evidenceVariant} />
                    </section>
                  );
                }) : (
                  <p className="text-body-sm text-ink-4">
                    This page does not have generated sections yet.
                  </p>
                )}
              </div>

              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-5">
                <form action={markPageReviewed.bind(null, params.id, item.id)}>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-md border border-rule bg-paper px-4 text-body-sm text-ink-3 transition hover:text-ink"
                  >
                    Mark reviewed
                  </button>
                </form>
                <form action={approvePage.bind(null, params.id, item.id)}>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
                  >
                    Approve page
                  </button>
                </form>
                <p className="text-body-sm text-ink-4">
                  Text edits create a new version and keep source evidence attached.
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
