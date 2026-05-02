#!/usr/bin/env node
/**
 * Phase N — Reconciler CLI / Vercel Cron entrypoint.
 *
 * Walks every credit_event, sums per (userId, kind), compares to the
 * materialized credit_balance row, self-heals drift, logs reports.
 *
 * Run from the repo root:
 *   pnpm --filter @creatorcanon/synthesis tsx src/credits/reconciler-cli.ts
 *
 * Vercel Cron (03:00 UTC daily) — see vercel.json:
 *
 *   {
 *     "crons": [
 *       { "path": "/api/credits/reconcile", "schedule": "0 3 * * *" }
 *     ]
 *   }
 *
 * The /api/credits/reconcile route handler imports `runReconciliation`
 * from this module and returns the ReconcileResult as JSON.
 */

import { getDb } from '@creatorcanon/db';

import { DrizzleCreditLedger } from './drizzle-store';
import { reconcile } from './reconciler';
import type { ReconcileResult } from './reconciler';

export interface RunReconciliationOptions {
  /** Sentry-compatible drift logger. Defaults to console.warn. */
  onDrift?: (msg: string, ctx: Record<string, unknown>) => void;
  /** Override `Date.now()` for tests. */
  now?: () => number;
}

/**
 * Run reconciliation against the production DB. Returns the summary.
 * Designed to be called from the Vercel Cron API route or a CLI invocation.
 */
export async function runReconciliation(
  opts: RunReconciliationOptions = {},
): Promise<ReconcileResult> {
  const db = getDb();
  const store = new DrizzleCreditLedger(db);

  const onDrift = opts.onDrift ?? defaultDriftLog;

  const result = await reconcile(store, {
    staleThresholdMs: 60_000,
    autoHeal: true,
    now: opts.now,
    onDrift: (report) => {
      onDrift('credit_balance drift detected', {
        userId: report.userId,
        kind: report.kind,
        expected: report.expected,
        actual: report.actual,
        drift: report.drift,
        lastEventAt: report.lastEventAt,
      });
    },
  });

  // eslint-disable-next-line no-console
  console.info(
    `[credit-reconciler] scanned=${result.scanned} drifted=${result.drifted} healed=${result.healed}`,
  );
  return result;
}

function defaultDriftLog(msg: string, ctx: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.warn(`[credit-reconciler] ${msg}`, ctx);
}

// Bare CLI invocation:  tsx ./reconciler-cli.ts
const isMain =
  // ESM dynamic-import or direct invoke; tsx sets process.argv[1] to the file.
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] &&
  process.argv[1].endsWith('reconciler-cli.ts');

if (isMain) {
  runReconciliation()
    .then((r) => {
      process.exit(r.drifted > 0 && r.healed === 0 ? 1 : 0);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[credit-reconciler] fatal', err);
      process.exit(2);
    });
}
