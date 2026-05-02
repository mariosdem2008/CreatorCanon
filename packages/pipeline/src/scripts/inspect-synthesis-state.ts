/**
 * Operator diagnostic: list synthesis_run rows + product_bundle presence
 * for a runId or for all recent runs.
 *
 * Usage:
 *   tsx ./src/scripts/inspect-synthesis-state.ts            # last 20 rows global
 *   tsx ./src/scripts/inspect-synthesis-state.ts <runId>    # all rows for a run
 */

import { closeDb, desc, eq, getDb } from '@creatorcanon/db';
import { productBundle, synthesisRun } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main(): Promise<void> {
  const runId = process.argv[2];
  const db = getDb();

  const rows = runId
    ? await db
        .select({
          id: synthesisRun.id,
          runId: synthesisRun.runId,
          productGoal: synthesisRun.productGoal,
          status: synthesisRun.status,
          startedAt: synthesisRun.startedAt,
          completedAt: synthesisRun.completedAt,
          errorMessage: synthesisRun.errorMessage,
          createdAt: synthesisRun.createdAt,
        })
        .from(synthesisRun)
        .where(eq(synthesisRun.runId, runId))
        .orderBy(desc(synthesisRun.createdAt))
    : await db
        .select({
          id: synthesisRun.id,
          runId: synthesisRun.runId,
          productGoal: synthesisRun.productGoal,
          status: synthesisRun.status,
          startedAt: synthesisRun.startedAt,
          completedAt: synthesisRun.completedAt,
          errorMessage: synthesisRun.errorMessage,
          createdAt: synthesisRun.createdAt,
        })
        .from(synthesisRun)
        .orderBy(desc(synthesisRun.createdAt))
        .limit(20);

  console.info(`[inspect-synth] ${rows.length} synthesis_run rows`);
  console.info('');

  for (const row of rows) {
    const bundleRows = await db
      .select({ id: productBundle.id, schemaVersion: productBundle.schemaVersion })
      .from(productBundle)
      .where(eq(productBundle.synthesisRunId, row.id))
      .limit(1);
    const bundle = bundleRows[0];
    const bundleStr = bundle ? `bundle=${bundle.id} schema=${bundle.schemaVersion}` : 'bundle=NONE';
    console.info(
      `  ${row.id} run=${row.runId} goal=${row.productGoal} status=${row.status} ${bundleStr}`,
    );
    if (row.errorMessage) {
      console.info(`    error: ${row.errorMessage}`);
    }
  }

  await closeDb();
}

main().catch((err) => {
  console.error('[inspect-synth]', err);
  process.exit(1);
});
