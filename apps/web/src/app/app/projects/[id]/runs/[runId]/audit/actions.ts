'use server';

import { spawn } from 'node:child_process';
import path from 'node:path';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { eq, getDb } from '@creatorcanon/db';
import { generationRun } from '@creatorcanon/db/schema';

/**
 * User clicked "Generate Hub" on the audit page. Flip status from
 * 'audit_ready' to 'queued', then dispatch the hub-build phase as a
 * detached subprocess. The dispatch script's routing logic (Task 3)
 * sees 'queued' + existing page_brief rows and runs runHubBuildPipeline.
 */
export async function approveAuditAndStartHubBuild(formData: FormData) {
  const runId = formData.get('runId') as string;
  const projectId = formData.get('projectId') as string;
  if (!runId || !projectId) throw new Error('Missing runId/projectId');

  const db = getDb();
  const rows = await db
    .select({ id: generationRun.id, status: generationRun.status })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = rows[0];
  if (!run) throw new Error('Run not found');
  if (run.status !== 'audit_ready') {
    throw new Error(`Run is in status '${run.status}'; expected 'audit_ready'`);
  }

  // Flip to queued so the dispatch script's status check accepts it.
  await db.update(generationRun).set({ status: 'queued' }).where(eq(generationRun.id, runId));

  // Spawn the dispatcher as a detached subprocess. The subprocess survives
  // this server action returning. The dispatch script reads
  // PIPELINE_CONTENT_ENGINE=canon_v1 + sees existing page_brief rows and
  // routes to runHubBuildPipeline.
  spawnHubBuildDispatch(runId);

  revalidatePath(`/app/projects/${projectId}`);
  redirect(`/app/projects/${projectId}`);
}

/**
 * User clicked "Discard". Mark the run canceled. (No refund logic in V1.)
 */
export async function discardRun(formData: FormData) {
  const runId = formData.get('runId') as string;
  const projectId = formData.get('projectId') as string;
  if (!runId || !projectId) throw new Error('Missing runId/projectId');

  const db = getDb();
  await db.update(generationRun).set({ status: 'canceled' }).where(eq(generationRun.id, runId));
  revalidatePath(`/app/projects/${projectId}`);
  redirect(`/app/projects/${projectId}`);
}

function spawnHubBuildDispatch(runId: string): void {
  // Resolve the pipeline package's dispatch script. apps/web's process.cwd()
  // is the apps/web dir; the pipeline lives at ../../packages/pipeline.
  const pipelineDir = path.resolve(process.cwd(), '../../packages/pipeline');
  const tsxBin = path.join(
    pipelineDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'tsx.cmd' : 'tsx',
  );
  const child = spawn(tsxBin, ['./src/dispatch-queued-run.ts', runId], {
    cwd: pipelineDir,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PIPELINE_CONTENT_ENGINE: 'canon_v1' },
    shell: process.platform === 'win32',
  });
  child.unref();
}
