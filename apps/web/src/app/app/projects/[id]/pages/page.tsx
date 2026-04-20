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
  workspaceMember,
} from '@creatorcanon/db/schema';
import { EvidenceChips, type SourceReferenceView } from '@/components/hub/EvidenceChips';
import { publishCurrentRun } from '../publish';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Draft Pages' };

type BlockTree = {
  blocks: Array<{
    type: string;
    id: string;
    content: unknown;
  }>;
};

type SectionContent = {
  heading?: string;
  body?: string;
  sourceVideoIds?: string[];
  sourceRefs?: SourceReferenceView[];
};

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
        .select({ subdomain: hub.subdomain })
        .from(hub)
        .where(eq(hub.id, proj.publishedHubId))
        .limit(1)
    : [];
  const publishedSubdomain = publishedHubs[0]?.subdomain;
  const canPublish = run?.status === 'awaiting_review' && pages.length > 0;

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
              ← Run status
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
              ? `Status: ${run.status}. Draft pages appear here after the pipeline persists them.`
              : 'No generation run was found for this project yet.'}
          </p>
          {canPublish && (
            <form action={publishCurrentRun.bind(null, params.id)} className="mt-4">
              <button
                type="submit"
                className="inline-flex h-9 items-center rounded-md bg-ink px-4 text-body-sm font-medium text-paper transition hover:opacity-90"
              >
                Publish local preview hub
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
                <div className="text-right text-caption text-ink-4">
                  <div>{item.status.replace('_', ' ')}</div>
                  <div>{item.supportLabel.replace('_', ' ')}</div>
                </div>
              </div>

              {version?.summary && (
                <p className="mt-4 text-body-md leading-7 text-ink-2">{version.summary}</p>
              )}

              <div className="mt-6 space-y-4">
                {sections.length > 0 ? sections.map((section) => {
                  const content = section.content as SectionContent;
                  return (
                    <section key={section.id} className="rounded-md border border-rule bg-paper-2 p-4">
                      <h3 className="text-body-sm font-medium text-ink">
                        {content.heading ?? 'Untitled section'}
                      </h3>
                      <p className="mt-2 text-body-sm leading-6 text-ink-2">
                        {content.body ?? 'No section body was generated.'}
                      </p>
                      <EvidenceChips refs={content.sourceRefs} />
                    </section>
                  );
                }) : (
                  <p className="text-body-sm text-ink-4">
                    This page does not have generated sections yet.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
