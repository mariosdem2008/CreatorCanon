'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { and, desc, eq, getDb } from '@creatorcanon/db';
import {
  editAction,
  page,
  pageBlock,
  pageVersion,
  project,
  workspaceMember,
} from '@creatorcanon/db/schema';

type SupportLabel = 'strong' | 'review_recommended' | 'limited';

type DraftBlock = {
  type: string;
  id: string;
  content: unknown;
  citations?: string[];
  supportLabel?: SupportLabel;
};

type BlockTree = {
  blocks: DraftBlock[];
};

type SectionContent = {
  heading?: string;
  body?: string;
  sourceVideoIds?: string[];
  sourceRefs?: unknown[];
};

async function getWorkspaceIdForCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const db = getDb();
  const members = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, session.user.id))
    .limit(1);

  const workspaceId = members[0]?.workspaceId;
  if (!workspaceId) redirect('/app');

  return { userId: session.user.id, workspaceId };
}

function normalizeBlockTree(value: unknown): BlockTree {
  if (
    value &&
    typeof value === 'object' &&
    'blocks' in value &&
    Array.isArray((value as { blocks: unknown }).blocks)
  ) {
    return value as BlockTree;
  }

  return { blocks: [] };
}

function normalizeSupportLabel(value: unknown): SupportLabel {
  if (value === 'strong' || value === 'limited' || value === 'review_recommended') {
    return value;
  }
  return 'review_recommended';
}

async function loadEditablePage(input: {
  projectId: string;
  pageId: string;
  workspaceId: string;
}) {
  const db = getDb();
  const projects = await db
    .select({
      id: project.id,
      currentRunId: project.currentRunId,
      workspaceId: project.workspaceId,
    })
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.workspaceId, input.workspaceId)))
    .limit(1);

  const proj = projects[0];
  if (!proj?.currentRunId) redirect('/app');

  const pages = await db
    .select({
      id: page.id,
      runId: page.runId,
      workspaceId: page.workspaceId,
      currentVersionId: page.currentVersionId,
      status: page.status,
    })
    .from(page)
    .where(and(eq(page.id, input.pageId), eq(page.workspaceId, input.workspaceId)))
    .limit(1);

  const pageRow = pages[0];
  if (!pageRow || pageRow.runId !== proj.currentRunId || !pageRow.currentVersionId) {
    redirect(`/app/projects/${input.projectId}/pages`);
  }

  const currentVersions = await db
    .select()
    .from(pageVersion)
    .where(eq(pageVersion.id, pageRow.currentVersionId))
    .limit(1);

  const currentVersion = currentVersions[0];
  if (!currentVersion || currentVersion.pageId !== pageRow.id) {
    redirect(`/app/projects/${input.projectId}/pages`);
  }

  return { project: proj, page: pageRow, currentVersion };
}

async function createEditedVersion(input: {
  projectId: string;
  pageId: string;
  userId: string;
  workspaceId: string;
  blockId?: string;
  beforeJson: unknown;
  afterJson: unknown;
  mutate: (current: {
    title: string;
    subtitle: string | null;
    summary: string | null;
    blockTree: BlockTree;
  }) => {
    title: string;
    subtitle: string | null;
    summary: string | null;
    blockTree: BlockTree;
  };
}) {
  const db = getDb();
  const editable = await loadEditablePage(input);

  await db.transaction(async (tx) => {
    const latestVersions = await tx
      .select({ version: pageVersion.version })
      .from(pageVersion)
      .where(eq(pageVersion.pageId, editable.page.id))
      .orderBy(desc(pageVersion.version))
      .limit(1);

    const nextVersionNumber = (latestVersions[0]?.version ?? editable.currentVersion.version) + 1;
    const nextVersionId = crypto.randomUUID();
    const next = input.mutate({
      title: editable.currentVersion.title,
      subtitle: editable.currentVersion.subtitle,
      summary: editable.currentVersion.summary,
      blockTree: normalizeBlockTree(editable.currentVersion.blockTreeJson),
    });

    await tx
      .update(pageVersion)
      .set({ isCurrent: false })
      .where(eq(pageVersion.pageId, editable.page.id));

    await tx.insert(pageVersion).values({
      id: nextVersionId,
      workspaceId: input.workspaceId,
      pageId: editable.page.id,
      runId: editable.page.runId,
      version: nextVersionNumber,
      title: next.title,
      subtitle: next.subtitle,
      summary: next.summary,
      blockTreeJson: next.blockTree,
      authorKind: 'creator',
      isCurrent: true,
    });

    if (next.blockTree.blocks.length > 0) {
      await tx.insert(pageBlock).values(
        next.blockTree.blocks.map((block, index) => ({
          id: crypto.randomUUID(),
          pageVersionId: nextVersionId,
          blockId: block.id,
          blockType: block.type,
          position: index,
          content: block.content,
          citations: block.citations ?? [],
          supportLabel: normalizeSupportLabel(block.supportLabel),
        })),
      );
    }

    await tx
      .update(page)
      .set({
        currentVersionId: nextVersionId,
        status: 'needs_review',
        updatedAt: new Date(),
      })
      .where(eq(page.id, editable.page.id));

    await tx.insert(editAction).values({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      pageVersionId: nextVersionId,
      userId: input.userId,
      action: 'manual_edit',
      blockId: input.blockId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
    });
  });

  revalidatePath(`/app/projects/${input.projectId}/pages`);
  revalidatePath(`/app/projects/${input.projectId}/pages/${input.pageId}`);
}

export async function updatePageTitle(
  projectId: string,
  pageId: string,
  formData: FormData,
) {
  const title = (formData.get('title') as string | null)?.trim();
  if (!title) redirect(`/app/projects/${projectId}/pages`);

  const { userId, workspaceId } = await getWorkspaceIdForCurrentUser();
  await createEditedVersion({
    projectId,
    pageId,
    userId,
    workspaceId,
    beforeJson: { field: 'title' },
    afterJson: { title },
    mutate: (current) => ({
      ...current,
      title,
    }),
  });
}

export async function updatePageSummary(
  projectId: string,
  pageId: string,
  formData: FormData,
) {
  const summary = (formData.get('summary') as string | null)?.trim();
  if (!summary) redirect(`/app/projects/${projectId}/pages`);

  const { userId, workspaceId } = await getWorkspaceIdForCurrentUser();
  await createEditedVersion({
    projectId,
    pageId,
    userId,
    workspaceId,
    beforeJson: { field: 'summary' },
    afterJson: { summary },
    mutate: (current) => ({
      ...current,
      summary,
      blockTree: {
        blocks: current.blockTree.blocks.map((block) => {
          if (block.type !== 'summary') return block;
          return {
            ...block,
            content: {
              ...(typeof block.content === 'object' && block.content ? block.content : {}),
              text: summary,
            },
          };
        }),
      },
    }),
  });
}

export async function updateSectionBlock(
  projectId: string,
  pageId: string,
  blockId: string,
  formData: FormData,
) {
  const heading = (formData.get('heading') as string | null)?.trim() ?? '';
  const body = (formData.get('body') as string | null)?.trim() ?? '';
  if (!heading && !body) redirect(`/app/projects/${projectId}/pages`);

  const { userId, workspaceId } = await getWorkspaceIdForCurrentUser();
  await createEditedVersion({
    projectId,
    pageId,
    userId,
    workspaceId,
    blockId,
    beforeJson: { blockId },
    afterJson: { heading, body },
    mutate: (current) => ({
      ...current,
      blockTree: {
        blocks: current.blockTree.blocks.map((block) => {
          if (block.id !== blockId || block.type !== 'section') return block;
          const content = (typeof block.content === 'object' && block.content
            ? block.content
            : {}) as SectionContent;
          return {
            ...block,
            content: {
              ...content,
              heading: heading || content.heading,
              body: body || content.body,
            },
          };
        }),
      },
    }),
  });
}

async function updatePageReviewStatus(input: {
  projectId: string;
  pageId: string;
  status: 'reviewed' | 'approved';
}) {
  const { userId, workspaceId } = await getWorkspaceIdForCurrentUser();
  const db = getDb();
  const editable = await loadEditablePage({
    projectId: input.projectId,
    pageId: input.pageId,
    workspaceId,
  });

  await db.transaction(async (tx) => {
    await tx
      .update(page)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(page.id, editable.page.id));

    await tx.insert(editAction).values({
      id: crypto.randomUUID(),
      workspaceId,
      pageVersionId: editable.currentVersion.id,
      userId,
      action: 'approve',
      beforeJson: { status: editable.page.status },
      afterJson: { status: input.status },
    });
  });

  revalidatePath(`/app/projects/${input.projectId}/pages`);
  revalidatePath(`/app/projects/${input.projectId}/pages/${input.pageId}`);
}

export async function markPageReviewed(projectId: string, pageId: string) {
  await updatePageReviewStatus({ projectId, pageId, status: 'reviewed' });
}

export async function approvePage(projectId: string, pageId: string) {
  await updatePageReviewStatus({ projectId, pageId, status: 'approved' });
}
