/**
 * One-off dispatcher: pick up the queued generation_run with the given id and
 * execute it inline. Used when the in-process webhook dispatch was lost
 * (server restart) and the run is sitting in 'queued' status.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/dispatch-queued-run.ts <runId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, getDb } from '@creatorcanon/db';
import { generationRun } from '@creatorcanon/db/schema';
import { runGenerationPipeline, type RunGenerationPipelinePayload } from './run-generation-pipeline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(p: string, override = false) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!override && process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '../../../.env'));
loadEnv(path.resolve(__dirname, '../../../.env.local'), true);

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: tsx ./src/dispatch-queued-run.ts <runId>');
  process.exit(1);
}

(async () => {
  const db = getDb();
  const rows = await db
    .select({
      id: generationRun.id,
      workspaceId: generationRun.workspaceId,
      projectId: generationRun.projectId,
      videoSetId: generationRun.videoSetId,
      pipelineVersion: generationRun.pipelineVersion,
      status: generationRun.status,
    })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  if (!rows[0]) {
    console.error(`No generation_run with id=${runId}`);
    process.exit(2);
  }
  const r = rows[0];
  console.info(`[dispatch] runId=${runId} status=${r.status} engine=${process.env.PIPELINE_CONTENT_ENGINE ?? 'findings_v1'}`);

  if (r.status !== 'queued' && r.status !== 'failed') {
    console.error(`[dispatch] refusing to dispatch — run status is '${r.status}'. Only 'queued' or 'failed' may be re-dispatched.`);
    process.exit(3);
  }

  const payload: RunGenerationPipelinePayload = {
    runId: r.id,
    workspaceId: r.workspaceId,
    projectId: r.projectId,
    videoSetId: r.videoSetId,
    pipelineVersion: r.pipelineVersion,
  };

  try {
    const result = await runGenerationPipeline(payload);
    console.info(`[dispatch] complete`, result);
  } catch (err) {
    console.error(`[dispatch] failed`, err);
    process.exit(4);
  }
  process.exit(0);
})();
