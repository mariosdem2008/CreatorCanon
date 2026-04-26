import { eq, getDb } from '@creatorcanon/db';
import { hub, release } from '@creatorcanon/db/schema';
import { artifactKey, createR2Client, type R2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { getAdapter } from '../adapters';

export interface AdaptStageInput {
  runId: string;
  workspaceId: string;
  hubId: string;
  releaseId: string;
  /** Test override. */
  r2Override?: R2Client;
}

export interface AdaptStageOutput {
  manifestR2Key: string;
  templateKey: string;
}

export async function runAdaptStage(input: AdaptStageInput): Promise<AdaptStageOutput> {
  const db = getDb();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);

  const hubRow = (await db.select().from(hub).where(eq(hub.id, input.hubId)).limit(1))[0];
  if (!hubRow) throw new Error(`Adapt: hub '${input.hubId}' not found`);

  const adapter = getAdapter(hubRow.templateKey);
  const manifest = await adapter({
    runId: input.runId,
    hubId: input.hubId,
    releaseId: input.releaseId,
  });

  const key = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'adapt',
    name: 'manifest.json',
  });

  await r2.putObject({
    key,
    body: new TextEncoder().encode(JSON.stringify(manifest)),
    contentType: 'application/json',
  });

  await db
    .update(release)
    .set({ manifestR2Key: key })
    .where(eq(release.id, input.releaseId));

  return { manifestR2Key: key, templateKey: hubRow.templateKey };
}
