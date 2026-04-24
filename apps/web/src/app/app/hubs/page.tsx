import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { and, desc, eq, getDb } from '@creatorcanon/db';
import {
  hub,
  project,
  release,
  workspaceMember,
} from '@creatorcanon/db/schema';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My hubs · CreatorCanon',
};

export default async function HubsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const userId = session.user.id;

  const db = getDb();

  const memberRow = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);
  const workspaceId = memberRow[0]?.workspaceId;
  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-16">
        <h1 className="font-serif text-heading-lg">My hubs</h1>
        <p className="mt-4 text-ink-2">You don&apos;t have a workspace yet.</p>
      </main>
    );
  }

  const rows = await db
    .select({
      projectId: project.id,
      projectTitle: project.title,
      hubId: hub.id,
      subdomain: hub.subdomain,
      theme: hub.theme,
      liveReleaseId: hub.liveReleaseId,
      releaseCreatedAt: release.createdAt,
    })
    .from(hub)
    .innerJoin(project, eq(project.id, hub.projectId))
    .leftJoin(release, and(eq(release.hubId, hub.id), eq(release.id, hub.liveReleaseId)))
    .where(eq(hub.workspaceId, workspaceId))
    .orderBy(desc(release.createdAt));

  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-16">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          <Link href="/app" className="underline-offset-2 hover:underline">
            ← Dashboard
          </Link>
        </p>
        <h1 className="mt-3 font-serif text-heading-lg">My hubs</h1>
        <div className="mt-8 rounded-xl border border-rule bg-paper-2 p-8 text-center">
          <p className="font-semibold">No hubs yet.</p>
          <p className="mt-2 text-sm text-ink-3">
            Pick videos from your library, configure, and publish your first hub.
          </p>
          <Link
            href="/app/library"
            className="mt-6 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-paper"
          >
            Browse library →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 py-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        <Link href="/app" className="underline-offset-2 hover:underline">
          ← Dashboard
        </Link>
      </p>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="font-serif text-heading-lg">My hubs</h1>
        <Link href="/app/library" className="text-sm underline underline-offset-2">
          New hub →
        </Link>
      </div>

      <ul className="mt-8 divide-y divide-rule" aria-label="Hub list">
        {rows.map((r) => {
          const publicPath = `/h/${r.subdomain}`;
          const published = Boolean(r.liveReleaseId);
          const dateLabel = r.releaseCreatedAt
            ? new Date(r.releaseCreatedAt).toISOString().slice(0, 10)
            : 'no date';
          return (
            <li key={r.hubId} className="flex items-center justify-between gap-4 py-5">
              <div>
                <p className="font-serif text-lg">{r.projectTitle}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {published
                    ? `Live · ${r.theme} · ${dateLabel}`
                    : 'Not yet published'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/app/projects/${r.projectId}`}
                  className="inline-flex h-9 items-center rounded-md border border-rule px-3 text-sm"
                >
                  Manage
                </Link>
                {published && (
                  <Link
                    href={publicPath}
                    className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-sm font-semibold text-paper"
                  >
                    Open hub →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
