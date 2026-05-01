/**
 * Snapshot a runId's JSONB payloads to a JSON file for rollback safety.
 *
 * Usage: tsx ./src/scripts/snapshot-run-payloads.ts <runId> [out-dir]
 *   default out-dir: /tmp/phase7-backup
 *
 * Dumps payloads from: channelProfile, canonNode, pageBrief, evidenceEntry,
 * workshopClip (whichever exist in the schema). Output is one JSON file per
 * runId at <out-dir>/<runId>.json.
 *
 * Restore is intentionally NOT automated — if you need to restore, read the
 * JSON and write a one-off SQL UPDATE per row. Backup is just rollback
 * insurance, not a self-serve restore path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { canonNode, channelProfile, pageBrief } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  const outDir = process.argv[3] || '/tmp/phase7-backup';
  if (!runId) {
    throw new Error('Usage: tsx ./src/scripts/snapshot-run-payloads.ts <runId> [out-dir]');
  }

  const db = getDb();

  const cp = await db.select().from(channelProfile).where(eq(channelProfile.runId, runId));
  const canon = await db.select().from(canonNode).where(eq(canonNode.runId, runId));
  const briefs = await db.select().from(pageBrief).where(eq(pageBrief.runId, runId));

  const snapshot = {
    runId,
    capturedAt: new Date().toISOString(),
    counts: {
      channelProfile: cp.length,
      canonNode: canon.length,
      pageBrief: briefs.length,
    },
    rows: {
      channelProfile: cp,
      canonNode: canon,
      pageBrief: briefs,
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${runId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

  console.info(`[snapshot] runId=${runId}`);
  console.info(`[snapshot]   channelProfile: ${cp.length}`);
  console.info(`[snapshot]   canonNode: ${canon.length}`);
  console.info(`[snapshot]   pageBrief: ${briefs.length}`);
  console.info(`[snapshot]   wrote: ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[snapshot] FAILED', err);
  process.exit(1);
});
