/**
 * Phase N — Reconciler.
 *
 * For each (userId, kind), recomputes the balance from raw `credit_event`
 * deltas and compares to the materialized `credit_balance.balance`.
 *
 *   - drift > 0  ⇒  balance row is wrong; we self-heal by overwriting it.
 *   - logs every drift via a Sentry-compatible callback (caller injects).
 *
 * Run via Vercel Cron 03:00 UTC daily — see `vercel.json` (added in this
 * task; if absent on main, ops will create it on first deploy).
 *
 * Risk-callout from the plan: events written between the snapshot read
 * and the balance read look like drift. Mitigation: we only flag drift
 * when the most-recent event is older than `staleThresholdMs` (default
 * 60 000). Newer-than-threshold events are treated as in-flight and
 * skipped — they'll be picked up on the next run.
 */

import type { CreditLedgerStore, CreditKind } from './types';

export interface ReconcilerEventRow {
  userId: string;
  kind: string;
  delta: number;
  createdAt: Date;
}

export interface ReconcilerStore {
  /**
   * Iterate every event in the ledger. Implementations should stream-friendly
   * (paged or async-iterator); the in-memory store returns an array; the
   * Drizzle store returns rows in chunks.
   */
  listAllEvents(): AsyncIterable<ReconcilerEventRow> | Iterable<ReconcilerEventRow>;
  /** Read materialized balance for one user+kind. */
  getMaterializedBalance(userId: string, kind: string): Promise<number>;
  /** Overwrite the materialized balance. */
  setMaterializedBalance(userId: string, kind: string, balance: number): Promise<void>;
}

export interface DriftReport {
  userId: string;
  kind: string;
  expected: number;
  actual: number;
  /** signed: actual - expected (positive = balance is too high). */
  drift: number;
  /** ISO of the most recent event for this (userId,kind), if any. */
  lastEventAt: string | null;
}

export interface ReconcileOptions {
  /** Skip flagging drift if the most-recent event is newer than this many ms ago. */
  staleThresholdMs?: number;
  /** Called once per drifted (userId, kind). Use for Sentry / log shipping. */
  onDrift?: (report: DriftReport) => void | Promise<void>;
  /** When true (default), self-heal by overwriting the materialized row. */
  autoHeal?: boolean;
  /** Override `Date.now()` for deterministic tests. */
  now?: () => number;
}

export interface ReconcileResult {
  scanned: number; // distinct (userId, kind) combos checked
  drifted: number;
  healed: number;
}

/**
 * Walk every event, group by (userId, kind), sum the deltas, compare to the
 * materialized balance. Self-heals + reports drift unless disabled.
 *
 * Pure-ish — the only side effect is the optional balance write through the
 * store, plus the optional `onDrift` callback.
 */
export async function reconcile(
  store: CreditLedgerStore & ReconcilerStore,
  opts: ReconcileOptions = {},
): Promise<ReconcileResult> {
  const stale = opts.staleThresholdMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const autoHeal = opts.autoHeal !== false;

  // Aggregate sum + most-recent-event-time per (userId, kind).
  const sums = new Map<string, number>();
  const lastAt = new Map<string, number>();

  for await (const e of toAsyncIterable(store.listAllEvents())) {
    const key = `${e.userId}::${e.kind}`;
    sums.set(key, (sums.get(key) ?? 0) + e.delta);
    const ts = e.createdAt.getTime();
    if (ts > (lastAt.get(key) ?? 0)) lastAt.set(key, ts);
  }

  let drifted = 0;
  let healed = 0;

  for (const [key, expected] of sums) {
    const [userId, kind] = key.split('::');
    if (!userId || !kind) continue;

    const lastTs = lastAt.get(key);
    if (lastTs && now() - lastTs < stale) {
      // In-flight write window — skip.
      continue;
    }

    const actual = await store.getMaterializedBalance(userId, kind);
    if (actual === expected) continue;

    drifted += 1;
    const report: DriftReport = {
      userId,
      kind,
      expected,
      actual,
      drift: actual - expected,
      lastEventAt: lastTs ? new Date(lastTs).toISOString() : null,
    };
    if (opts.onDrift) await opts.onDrift(report);
    if (autoHeal) {
      await store.setMaterializedBalance(userId, kind, expected);
      healed += 1;
    }
  }

  return { scanned: sums.size, drifted, healed };
}

async function* toAsyncIterable<T>(
  src: AsyncIterable<T> | Iterable<T>,
): AsyncIterable<T> {
  if ((src as AsyncIterable<T>)[Symbol.asyncIterator]) {
    for await (const v of src as AsyncIterable<T>) yield v;
    return;
  }
  for (const v of src as Iterable<T>) yield v;
}

/** Re-export the canonical kind set so the reconciler script is self-contained. */
export type { CreditKind };
