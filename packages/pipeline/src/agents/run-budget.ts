import { eq, getDb, sql } from '@creatorcanon/db';
import { archiveFinding } from '@creatorcanon/db/schema';

/** Default per-run hard cap from spec § 16.3: $25 = 2500 cents. */
export const DEFAULT_RUN_COST_CAP_CENTS = 2500;

/**
 * Sum costCents across all archive_finding rows for this run. If total >= cap,
 * throw with a structured error so the orchestrator can mark the run as failed.
 */
export async function assertWithinRunBudget(
  runId: string,
  capCents = DEFAULT_RUN_COST_CAP_CENTS,
): Promise<{ ok: true; spentCents: number }> {
  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${archiveFinding.costCents}), 0)::numeric`.mapWith(Number),
    })
    .from(archiveFinding)
    .where(eq(archiveFinding.runId, runId));
  const spent = Number(rows[0]?.total ?? 0);
  if (spent >= capCents) {
    const err = new Error(
      `Per-run budget exceeded: spent ${spent} cents >= cap ${capCents} cents`,
    );
    (err as { code?: string }).code = 'RUN_BUDGET_EXCEEDED';
    throw err;
  }
  return { ok: true, spentCents: spent };
}
