/**
 * One-off publish helper: take an awaiting_review run and publish it as a hub.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/publish-now.ts <runId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq, getDb } from '@creatorcanon/db';
import { generationRun } from '@creatorcanon/db/schema';
import { publishRunAsHub } from './publish-run-as-hub';

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

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: tsx ./src/publish-now.ts <runId>');
  process.exit(1);
}

(async () => {
  const db = getDb();
  const rows = await db
    .select({ id: generationRun.id, projectId: generationRun.projectId, workspaceId: generationRun.workspaceId, status: generationRun.status })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  if (!rows[0]) {
    console.error('No generation_run with id', runId);
    process.exit(2);
  }
  const r = rows[0];
  console.info(`[publish] runId=${runId} status=${r.status}`);
  // CLI helper: no real user behind it. The publish path stamps this onto
  // hub_release.published_by, which is a free-text audit field.
  const result = await publishRunAsHub({
    runId: r.id,
    projectId: r.projectId,
    workspaceId: r.workspaceId,
    actorUserId: 'cli:publish-now',
  });
  console.info('[publish] complete:', JSON.stringify(result, null, 2));
  process.exit(0);
})();
