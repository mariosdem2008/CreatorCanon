/**
 * Operator one-off: remove duplicate visual_moment rows that resulted from
 * earlier failed Groq-vision runs writing rows before being killed. Keeps
 * the lowest UUID id per (runId, videoId, timestampMs) tuple, deletes
 * the rest. Logs how many rows were removed.
 *
 * Usage:
 *   tsx ./src/scripts/dedup-visual-moments.ts <runId>
 */
import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import { visualMoment } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/dedup-visual-moments.ts <runId>');

  const db = getDb();
  const before = await db.select({ c: sql<number>`count(*)::int` }).from(visualMoment).where(eq(visualMoment.runId, runId));
  console.info(`[dedup-vm] before: ${before[0]?.c ?? 0} rows`);

  // Delete rows whose id is NOT the minimum id within their (runId, videoId, timestampMs) group.
  await db.execute(sql`
    DELETE FROM visual_moment
    WHERE run_id = ${runId}
    AND id NOT IN (
      SELECT MIN(id)
      FROM visual_moment
      WHERE run_id = ${runId}
      GROUP BY video_id, timestamp_ms
    )
  `);

  const after = await db.select({ c: sql<number>`count(*)::int` }).from(visualMoment).where(eq(visualMoment.runId, runId));
  const removedCount = (before[0]?.c ?? 0) - (after[0]?.c ?? 0);
  console.info(`[dedup-vm] removed: ${removedCount} rows · after: ${after[0]?.c ?? 0} rows`);
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[dedup-vm] FAILED', e); process.exit(1); });
