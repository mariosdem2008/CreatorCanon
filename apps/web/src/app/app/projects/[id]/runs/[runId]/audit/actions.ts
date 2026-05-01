'use server';

import { spawn } from 'node:child_process';
import path from 'node:path';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { eq, getDb } from '@creatorcanon/db';
import { generationRun } from '@creatorcanon/db/schema';

import { buildAuditMarkdown } from '@/lib/audit/build-audit-markdown';
import { buildHubSourceDocument } from '@/lib/audit/build-hub-source-doc';
import { getRunAudit } from '@/lib/audit/get-run-audit';

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

/**
 * Build a complete markdown export of the audit so the client can copy it
 * to the clipboard. We compose this on the server because (a) the data is
 * already DB-resident and (b) we don't want to ship raw payloads to the
 * client just so the markdown can be assembled.
 */
export async function getAuditMarkdown(runId: string): Promise<string> {
  if (!runId) throw new Error('Missing runId');
  const view = await getRunAudit(runId);
  if (!view) throw new Error('Run not found');
  return buildAuditMarkdown(view);
}

/**
 * Build the v2 Hub Source Document — a single JSON object containing
 * everything the builder needs to render the hub. This is the production
 * handoff format (when this becomes a SaaS, the builder consumes this
 * directly via API).
 *
 * Spec: docs/superpowers/specs/2026-05-01-hub-source-document-schema.md
 *
 * Format: pretty-printed JSON. The Copy Audit button calls this for v2
 * runs and the markdown action for v1 runs (selected client-side via
 * channel profile schemaVersion).
 */
export async function getHubSourceDocument(runId: string): Promise<string> {
  if (!runId) throw new Error('Missing runId');
  const view = await getRunAudit(runId);
  if (!view) throw new Error('Run not found');
  const doc = buildHubSourceDocument(view);
  return JSON.stringify(doc, null, 2);
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
