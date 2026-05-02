'use server';

import { redirect } from 'next/navigation';
import { tasks } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

import { auth } from '@creatorcanon/auth';
import { and, eq, getDb } from '@creatorcanon/db';
import { generationRun, workspaceMember } from '@creatorcanon/db/schema';
import { runGenerationPipeline } from '@creatorcanon/pipeline';
import {
  completeAuditGeneratedRun,
  startAuditHubGeneration,
} from '@creatorcanon/pipeline/audit-handoff';
import type { RunGenerationPipelinePayload } from '@creatorcanon/pipeline';

import { buildAuditGeneratedProjectUrl } from './audit-view-model';
import { shouldDispatchAuditRun } from './generate-hub-dispatch';

type DispatchMode = 'inprocess' | 'trigger' | 'worker';

const auditIdSchema = z.string().trim().min(1);

export type GenerateHubActionState = { error: string };

export async function generateHubFromAuditAction(
  formData: FormData,
): Promise<GenerateHubActionState> {
  const session = await auth();
  const actorUserId = session?.user?.id;
  if (!actorUserId) redirect('/sign-in?callbackUrl=/archive-audit');

  const parsed = auditIdSchema.safeParse(formData.get('audit_id'));
  if (!parsed.success) {
    return { error: 'The audit report is missing. Run the archive audit again.' };
  }

  const workspaceId = await resolveUserWorkspaceId(actorUserId);
  if (!workspaceId) {
    return { error: 'Your account is not connected to a CreatorCanon workspace yet.' };
  }

  const result = await startAuditHubGeneration({
    auditId: parsed.data,
    workspaceId,
    actorUserId,
    autoPublish: true,
  });

  if (shouldDispatchAuditRun(result)) {
    await dispatchAuditRun(result.payload);
  }
  redirect(buildAuditGeneratedProjectUrl(result.projectId));
}

async function resolveUserWorkspaceId(userId: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);

  return rows[0]?.workspaceId ?? null;
}

async function dispatchAuditRun(payload: RunGenerationPipelinePayload): Promise<void> {
  const mode = parseDispatchMode(process.env.PIPELINE_DISPATCH_MODE);
  if (mode === 'worker') return;

  if (mode === 'trigger') {
    try {
      await tasks.trigger('run-pipeline', payload);
      return;
    } catch (error) {
      console.warn('[archive-audit] trigger.run-pipeline failed, falling back in-process:', error);
    }
  }

  runAuditGenerationInProcess(payload);
}

function runAuditGenerationInProcess(payload: RunGenerationPipelinePayload): void {
  void runGenerationPipeline(payload)
    .then(async () => {
      await completeAuditGeneratedRun({ runId: payload.runId });
    })
    .catch(async (error) => {
      console.error('[archive-audit] In-process audit hub generation failed:', error);
      try {
        const db = getDb();
        await db
          .update(generationRun)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(
            and(
              eq(generationRun.id, payload.runId),
              eq(generationRun.status, 'queued'),
            ),
          );
      } catch (transitionError) {
        console.error(
          '[archive-audit] Failed to transition audit hub run to failed:',
          transitionError,
        );
      }
    });
}

function parseDispatchMode(raw: string | undefined): DispatchMode {
  if (raw === 'trigger' || raw === 'worker') return raw;
  return 'inprocess';
}
