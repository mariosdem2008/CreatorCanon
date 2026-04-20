'use server';

import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { eq, getDb } from '@creatorcanon/db';
import { project, workspaceMember } from '@creatorcanon/db/schema';
import { publishRunAsHub } from '@creatorcanon/pipeline';

export async function publishCurrentRun(projectId: string) {
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

  const projects = await db
    .select()
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);

  const proj = projects[0];
  if (!proj || proj.workspaceId !== workspaceId || !proj.currentRunId) {
    redirect('/app');
  }

  await publishRunAsHub({
    workspaceId,
    projectId: proj.id,
    runId: proj.currentRunId,
    actorUserId: session.user.id,
  });

  redirect(`/app/projects/${proj.id}`);
}
