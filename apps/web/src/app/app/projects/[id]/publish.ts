'use server';

import { redirect } from 'next/navigation';

import { auth } from '@creatorcanon/auth';
import { createResendClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { eq, getDb } from '@creatorcanon/db';
import { project, workspaceMember } from '@creatorcanon/db/schema';
import { publishRunAsHub } from '@creatorcanon/pipeline';

import HubPublishedEmail from '@/emails/HubPublishedEmail';
import { createVercelClientFromEnv } from '@/lib/vercel/client';
import {
  createDeployTriggerRepository,
  readDeploymentTriggerEnv,
} from '@/lib/vercel/deploy-trigger';
import { triggerRedeployAfterPublish } from '@/lib/vercel/redeploy';

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

  const publishResult = await publishRunAsHub({
    workspaceId,
    projectId: proj.id,
    runId: proj.currentRunId,
    actorUserId: session.user.id,
  });

  try {
    const redeploy = await triggerRedeployAfterPublish({
      hubId: publishResult.hubId,
      repository: createDeployTriggerRepository(db),
      vercel: createVercelClientFromEnv(),
      env: readDeploymentTriggerEnv(process.env),
    });
    if (!redeploy.triggered && redeploy.reason) {
      console.warn('[publish] redeploy skipped:', redeploy.reason);
    }
  } catch (err) {
    console.error('[publish] redeploy trigger failed (non-blocking):', err);
  }

  // Fire the confirmation email. Wrapped in try/catch so email failures
  // never block a successful publish — the hub is live regardless.
  try {
    const env = parseServerEnv(process.env);
    const recipient = session.user.email;
    if (env.RESEND_API_KEY && recipient) {
      const resend = createResendClient(env);
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ?? 'https://creatorcanon-saas.vercel.app';
      const publicUrl = `${baseUrl}${publishResult.publicPath}`;
      const themeLabel =
        (proj.config as { presentation_preset?: string } | null)
          ?.presentation_preset ?? 'default';
      await resend.send({
        to: recipient,
        subject: `${proj.title} is live on CreatorCanon`,
        react: HubPublishedEmail({
          hubTitle: proj.title,
          publicUrl,
          theme: themeLabel,
        }) as Parameters<typeof resend.send>[0]['react'],
      });
    }
  } catch (err) {
    console.error('[publish] email send failed (non-blocking):', err);
  }

  redirect(`/app/projects/${proj.id}`);
}
