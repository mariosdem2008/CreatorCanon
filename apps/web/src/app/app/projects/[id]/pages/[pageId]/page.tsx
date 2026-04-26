import Link from 'next/link';
import { redirect } from 'next/navigation';

import { and, desc, eq } from '@creatorcanon/db';
import { editAction, page, pageVersion, project } from '@creatorcanon/db/schema';

import {
  MetricCard,
  PageHeader,
  Panel,
  PanelHeader,
  StatusPill,
} from '@/components/cc';
import { EvidenceChips, type SourceReferenceView } from '@/components/hub/EvidenceChips';
import { getHubTemplate } from '@/components/hub/templates';
import { requireWorkspace } from '@/lib/workspace';

import {
  approvePage,
  markPageReviewed,
  updatePageSummary,
  updatePageTitle,
  updateSectionBlock,
} from '../actions';
import { ApprovePageButton, MarkReviewedButton, SaveButton } from '../PageActionButtons';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Page Editor' };

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

export default async function PageEditorPage({
  params,
}: {
  params: { id: string; pageId: string };
}) {
  const { db, workspaceId } = await requireWorkspace();

  const projects = await db
    .select()
    .from(project)
    .where(and(eq(project.id, params.id), eq(project.workspaceId, workspaceId)))
    .limit(1);
  const proj = projects[0];
  if (!proj?.currentRunId) redirect(`/app/projects/${params.id}/pages`);

  const pageRows = await db
    .select()
    .from(page)
    .where(
      and(
        eq(page.id, params.pageId),
        eq(page.workspaceId, workspaceId),
        eq(page.runId, proj.currentRunId),
      ),
    )
    .limit(1);
  const pageRow = pageRows[0];
  if (!pageRow?.currentVersionId) redirect(`/app/projects/${params.id}/pages`);

  const versions = await db
    .select()
    .from(pageVersion)
    .where(eq(pageVersion.pageId, pageRow.id))
    .orderBy(desc(pageVersion.version))
    .limit(12);
  const currentVersion =
    versions.find((item) => item.id === pageRow.currentVersionId) ?? versions[0];
  if (!currentVersion) redirect(`/app/projects/${params.id}/pages`);

  const edits = await db
    .select()
    .from(editAction)
    .where(eq(editAction.pageVersionId, currentVersion.id))
    .orderBy(desc(editAction.createdAt))
    .limit(8);

  const selectedTemplate = getHubTemplate(proj.config?.presentation_preset);
  const blockTree = (currentVersion.blockTreeJson ?? { blocks: [] }) as BlockTree;
  const sections = blockTree.blocks.filter((block) => block.type === 'section');
  const sourceRefCount = sections.reduce((sum, section) => {
    const content = section.content as SectionContent;
    return sum + (content.sourceRefs?.length ?? 0);
  }, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <Link
              href={`/app/projects/${params.id}/pages`}
              className="hover:text-[var(--cc-ink)]"
            >
              Pages
            </Link>
            <span aria-hidden>·</span>
            <PageStatusBadge status={pageRow.status} />
            <SupportBadge label={pageRow.supportLabel} />
          </span>
        }
        title={currentVersion.title}
        body="Focused editing with page metadata, editable sections, source evidence, and version history in one place."
        actions={
          <>
            <Link
              href={`/app/projects/${params.id}/pages`}
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
            >
              Back to pages
            </Link>
            <Link
              href={`/app/projects/${params.id}`}
              className="inline-flex h-9 items-center rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:border-[var(--cc-ink-4)]"
            >
              Run status
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Version"
          value={currentVersion.version}
          sub={currentVersion.authorKind}
        />
        <MetricCard label="Sections" value={sections.length} sub="Editable blocks" />
        <MetricCard
          label="Source moments"
          value={sourceRefCount}
          sub="Attached evidence"
        />
        <MetricCard
          label="Status"
          value={statusLabel(pageRow.status)}
          sub={pageRow.supportLabel.replaceAll('_', ' ')}
          tone={pageRow.status === 'approved' ? 'success' : 'default'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Page metadata" />
            <div className="grid gap-4 p-5 lg:grid-cols-2">
              <form
                action={updatePageTitle.bind(null, params.id, pageRow.id)}
                className="space-y-2"
              >
                <label
                  className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                  htmlFor="page-title"
                >
                  Page title
                </label>
                <input
                  id="page-title"
                  name="title"
                  defaultValue={currentVersion.title}
                  className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[14px] text-[var(--cc-ink)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
                />
                <SaveButton label="Save title" />
              </form>
              <form
                action={updatePageSummary.bind(null, params.id, pageRow.id)}
                className="space-y-2"
              >
                <label
                  className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                  htmlFor="page-summary"
                >
                  Page summary
                </label>
                <textarea
                  id="page-summary"
                  name="summary"
                  defaultValue={currentVersion.summary ?? ''}
                  rows={4}
                  className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[13px] leading-[1.6] text-[var(--cc-ink-2)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
                />
                <SaveButton label="Save summary" />
              </form>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Sections" meta={`${sections.length} blocks`} />
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
                          pageRow.id,
                          section.id,
                        )}
                        className="space-y-3"
                      >
                        <div className="space-y-2">
                          <label
                            className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                            htmlFor={`heading-${section.id}`}
                          >
                            Section heading
                          </label>
                          <input
                            id={`heading-${section.id}`}
                            name="heading"
                            defaultValue={content.heading ?? ''}
                            className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[14px] font-medium text-[var(--cc-ink)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
                          />
                        </div>
                        <div className="space-y-2">
                          <label
                            className="block text-[12px] font-semibold text-[var(--cc-ink)]"
                            htmlFor={`body-${section.id}`}
                          >
                            Section body
                          </label>
                          <textarea
                            id={`body-${section.id}`}
                            name="body"
                            defaultValue={content.body ?? ''}
                            rows={7}
                            className="w-full rounded-[8px] border border-[var(--cc-rule)] bg-white px-3 py-2 text-[13px] leading-[1.6] text-[var(--cc-ink-2)] outline-none focus:border-[var(--cc-accent)] focus:ring-2 focus:ring-[var(--cc-accent-wash)]"
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
                <p className="px-5 py-4 text-[12px] text-[var(--cc-ink-4)]">
                  This page has no generated sections yet.
                </p>
              )}
            </div>
          </Panel>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[66px] xl:self-start">
          <Panel>
            <PanelHeader title="Approval" />
            <div className="space-y-3 p-5">
              <p className="text-[12px] leading-[1.55] text-[var(--cc-ink-3)]">
                Mark reviewed when the page reads cleanly. Approve when it is ready to publish.
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={markPageReviewed.bind(null, params.id, pageRow.id)}>
                  <MarkReviewedButton />
                </form>
                <form action={approvePage.bind(null, params.id, pageRow.id)}>
                  <ApprovePageButton />
                </form>
              </div>
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Version history" meta={`${versions.length}`} />
            <div className="divide-y divide-[var(--cc-rule)]">
              {versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-[var(--cc-ink)]">
                      v{version.version}
                      {version.id === currentVersion.id ? ' · current' : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--cc-ink-4)]">
                      {version.authorKind} · {dateLabel(version.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Recent edits" />
            <div className="divide-y divide-[var(--cc-rule)]">
              {edits.length > 0 ? (
                edits.map((edit) => (
                  <div key={edit.id} className="px-4 py-2.5">
                    <p className="text-[12px] font-semibold text-[var(--cc-ink)]">
                      {edit.action.replaceAll('_', ' ')}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--cc-ink-4)]">
                      {dateLabel(edit.createdAt)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="px-4 py-3 text-[12px] text-[var(--cc-ink-4)]">
                  No edits recorded for the current version.
                </p>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </div>
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
      {statusLabel(status)}
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

function statusLabel(status: string): string {
  if (status === 'needs_review') return 'Draft';
  return status.replaceAll('_', ' ');
}

function dateLabel(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(value);
}
