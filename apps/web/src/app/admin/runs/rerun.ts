'use server';

import { tasks } from '@trigger.dev/sdk/v3';
import { revalidatePath } from 'next/cache';

import { runGenerationPipeline, type RunGenerationPipelinePayload } from '@creatorcanon/pipeline';
import { publishRunAsHub } from '@creatorcanon/pipeline';
import { PIPELINE_VERSION } from '@creatorcanon/core';
import { and, eq, getDb, inArray } from '@creatorcanon/db';
import {
  auditLog,
  generationRun,
  generationStageRun,
  page,
  pageBlock,
  pageVersion,
} from '@creatorcanon/db/schema';

import { requireAdminUser } from '../lib';
import { ADMIN_RERUN_STAGES, type AdminRerunStage } from './stages';

function downstreamStages(stage: AdminRerunStage): AdminRerunStage[] {
  const index = ADMIN_RERUN_STAGES.indexOf(stage);
  return ADMIN_RERUN_STAGES.slice(index);
}

async function dispatchPipeline(payload: RunGenerationPipelinePayload): Promise<void> {
  try {
    await tasks.trigger('run-pipeline', payload);
  } catch (error) {
    console.warn('[admin-rerun] Failed to trigger pipeline task:', error);
    void runGenerationPipeline(payload).catch((err) => {
      console.error('[admin-rerun] Local pipeline fallback failed:', err);
    });
  }
}

export async function rerunStage(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();

  const runId = (formData.get('runId') as string | null)?.trim();
  const stage = (formData.get('stage') as string | null)?.trim() as AdminRerunStage | undefined;

  if (!runId || !stage || !ADMIN_RERUN_STAGES.includes(stage)) {
    throw new Error('Invalid admin rerun request.');
  }

  const db = getDb();
  const runs = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      status: generationRun.status,
      pipelineVersion: generationRun.pipelineVersion,
    })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);

  const run = runs[0];
  if (!run) {
    throw new Error(`Run ${runId} was not found.`);
  }

  if (run.status === 'awaiting_payment') {
    throw new Error('Unpaid runs cannot be rerun from admin.');
  }

  const stagesToClear = downstreamStages(stage);
  const existingStageRows = await db
    .select({
      id: generationStageRun.id,
      stageName: generationStageRun.stageName,
      status: generationStageRun.status,
      outputJson: generationStageRun.outputJson,
      errorJson: generationStageRun.errorJson,
    })
    .from(generationStageRun)
    .where(and(eq(generationStageRun.runId, runId), inArray(generationStageRun.stageName, stagesToClear as unknown as string[])));

  const existingPages = await db
    .select({ id: page.id, currentVersionId: page.currentVersionId })
    .from(page)
    .where(eq(page.runId, runId));

  const pageVersionIds = existingPages
    .map((entry) => entry.currentVersionId)
    .filter((value): value is string => Boolean(value));

  if (pageVersionIds.length > 0) {
    await db.delete(pageBlock).where(inArray(pageBlock.pageVersionId, pageVersionIds));
    await db.delete(pageVersion).where(inArray(pageVersion.id, pageVersionIds));
  }

  await db.delete(page).where(eq(page.runId, runId));
  await db
    .delete(generationStageRun)
    .where(and(eq(generationStageRun.runId, runId), inArray(generationStageRun.stageName, stagesToClear as unknown as string[])));

  await db
    .update(generationRun)
    .set({
      status: 'queued',
      startedAt: null,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(generationRun.id, runId));

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    workspaceId: run.workspaceId,
    actorUserId: adminUser.id,
    action: 'admin.rerun_stage',
    targetType: 'generation_run',
    targetId: runId,
    beforeJson: {
      clearedStages: existingStageRows.map((row) => ({
        id: row.id,
        stageName: row.stageName,
        status: row.status,
      })),
      clearedPageCount: existingPages.length,
    },
    afterJson: {
      rerunFromStage: stage,
      pipelineVersion: run.pipelineVersion || PIPELINE_VERSION,
    },
  });

  await dispatchPipeline({
    runId: run.id,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
    videoSetId: run.videoSetId,
    pipelineVersion: run.pipelineVersion || PIPELINE_VERSION,
  });

  revalidatePath('/admin/runs');
  revalidatePath(`/admin/runs/${runId}`);
  revalidatePath(`/app/projects/${run.projectId}`);
}

export async function redispatchRun(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();

  const runId = (formData.get('runId') as string | null)?.trim();
  if (!runId) throw new Error('Missing run id.');

  const db = getDb();
  const runs = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      status: generationRun.status,
      pipelineVersion: generationRun.pipelineVersion,
      stripePaymentIntentId: generationRun.stripePaymentIntentId,
    })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);

  const run = runs[0];
  if (!run) throw new Error(`Run ${runId} was not found.`);
  if (run.status === 'awaiting_payment') {
    throw new Error('Unpaid runs cannot be dispatched from admin.');
  }
  if (run.status === 'published' || run.status === 'awaiting_review') {
    throw new Error(`Run ${run.status} does not need pipeline dispatch.`);
  }

  await db
    .update(generationRun)
    .set({
      status: 'queued',
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(generationRun.id, runId));

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    workspaceId: run.workspaceId,
    actorUserId: adminUser.id,
    action: 'admin.redispatch_run',
    targetType: 'generation_run',
    targetId: runId,
    beforeJson: {
      status: run.status,
      stripePaymentIntentId: run.stripePaymentIntentId,
    },
    afterJson: {
      status: 'queued',
      pipelineVersion: run.pipelineVersion || PIPELINE_VERSION,
    },
  });

  await dispatchPipeline({
    runId: run.id,
    projectId: run.projectId,
    workspaceId: run.workspaceId,
    videoSetId: run.videoSetId,
    pipelineVersion: run.pipelineVersion || PIPELINE_VERSION,
  });

  revalidatePath('/admin/runs');
  revalidatePath(`/admin/runs/${runId}`);
  revalidatePath(`/app/projects/${run.projectId}`);
}

export async function publishRunFromAdmin(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();

  const runId = (formData.get('runId') as string | null)?.trim();
  if (!runId) throw new Error('Missing run id.');

  const db = getDb();
  const runs = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      status: generationRun.status,
    })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);

  const run = runs[0];
  if (!run) throw new Error(`Run ${runId} was not found.`);
  if (run.status !== 'awaiting_review' && run.status !== 'published') {
    throw new Error(`Cannot publish a run with status ${run.status}.`);
  }

  const draftPages = await db
    .select({ id: page.id })
    .from(page)
    .where(eq(page.runId, runId))
    .limit(1);
  if (!draftPages[0]) throw new Error('Cannot publish before draft pages exist.');

  const result = await publishRunAsHub({
    workspaceId: run.workspaceId,
    projectId: run.projectId,
    runId: run.id,
    actorUserId: adminUser.id,
  });

  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    workspaceId: run.workspaceId,
    actorUserId: adminUser.id,
    action: 'admin.publish_run',
    targetType: 'generation_run',
    targetId: runId,
    beforeJson: {
      status: run.status,
    },
    afterJson: {
      releaseId: result.releaseId,
      publicPath: result.publicPath,
      pageCount: result.pageCount,
    },
  });

  revalidatePath('/admin/runs');
  revalidatePath(`/admin/runs/${runId}`);
  revalidatePath(`/app/projects/${run.projectId}`);
}
