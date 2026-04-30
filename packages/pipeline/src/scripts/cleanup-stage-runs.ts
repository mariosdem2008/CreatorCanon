/**
 * Operator one-off: remove stage-run residue from earlier failed dispatches
 * and consolidate duplicate rows from the offline backfill pass.
 *
 * Removes:
 *   - Any row where status='failed_terminal' AND stage_name='video_intelligence'
 *     (Phase 1 dispatch failure — superseded by per-video success rows)
 *   - For each (runId, stageName) pair with multiple rows, keep the one with
 *     the largest durationMs (i.e., the original real-timing run); drop the
 *     0-duration backfill phantoms.
 *
 * Usage:
 *   tsx ./src/scripts/cleanup-stage-runs.ts <runId>
 */
import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import { generationStageRun } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/cleanup-stage-runs.ts <runId>');

  const db = getDb();
  const before = await db.select().from(generationStageRun).where(eq(generationStageRun.runId, runId));
  console.info(`[cleanup-stages] before: ${before.length} rows`);

  // (a) Drop stale failed_terminal video_intelligence rows.
  await db.execute(sql`
    DELETE FROM generation_stage_run
    WHERE run_id = ${runId}
    AND stage_name = 'video_intelligence'
    AND status = 'failed_terminal'
  `);

  // (b) For each (runId, stageName) with >1 succeeded rows, keep only the
  // one with the largest duration_ms.
  await db.execute(sql`
    DELETE FROM generation_stage_run
    WHERE run_id = ${runId}
    AND id NOT IN (
      SELECT DISTINCT ON (run_id, stage_name) id
      FROM generation_stage_run
      WHERE run_id = ${runId}
      ORDER BY run_id, stage_name, duration_ms DESC, started_at DESC
    )
  `);

  const after = await db.select().from(generationStageRun).where(eq(generationStageRun.runId, runId));
  console.info(`[cleanup-stages] removed: ${before.length - after.length} rows · after: ${after.length} rows`);
  for (const s of after) {
    console.info(`  ${s.stageName}: status=${s.status} ms=${s.durationMs}`);
  }
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error('[cleanup-stages] FAILED', e); process.exit(1); });
