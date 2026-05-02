/**
 * In-memory CreditLedgerStore for tests + dev. Provides the same
 * (source, reference) idempotency + atomic balance update semantics as the
 * Drizzle backend, without touching a real DB.
 */

import type { CreditLedgerStore } from './types';
import type { ReconcilerEventRow, ReconcilerStore } from './reconciler';

interface InMemoryEvent {
  id: string;
  userId: string;
  kind: string;
  delta: number;
  source: string;
  reference: string | null;
  createdAt: Date;
}

export class MemoryCreditLedger implements CreditLedgerStore, ReconcilerStore {
  /** keyed by `${source}::${reference ?? ''}` for O(1) idempotency check. */
  private readonly bySourceRef = new Map<string, InMemoryEvent>();
  /** keyed by `${userId}::${kind}` */
  private readonly balances = new Map<string, number>();
  readonly events: InMemoryEvent[] = [];

  private bKey(userId: string, kind: string): string {
    return `${userId}::${kind}`;
  }

  private srKey(source: string, reference: string | null): string {
    return `${source}::${reference ?? ''}`;
  }

  async insertEvent(args: {
    id: string;
    userId: string;
    kind: string;
    delta: number;
    source: string;
    reference?: string | null;
  }): Promise<{ inserted: boolean; balance: number }> {
    const reference = args.reference ?? null;
    const srKey = this.srKey(args.source, reference);
    const bKey = this.bKey(args.userId, args.kind);

    if (this.bySourceRef.has(srKey)) {
      // Idempotent dedupe — return current balance unchanged.
      return { inserted: false, balance: this.balances.get(bKey) ?? 0 };
    }

    const evt: InMemoryEvent = {
      id: args.id,
      userId: args.userId,
      kind: args.kind,
      delta: args.delta,
      source: args.source,
      reference,
      createdAt: new Date(),
    };
    this.bySourceRef.set(srKey, evt);
    this.events.push(evt);

    const next = (this.balances.get(bKey) ?? 0) + args.delta;
    this.balances.set(bKey, next);
    return { inserted: true, balance: next };
  }

  async getBalance(userId: string, kind: string): Promise<number> {
    return this.balances.get(this.bKey(userId, kind)) ?? 0;
  }

  async getAllBalances(userId: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.balances.entries()) {
      const [u, kind] = k.split('::');
      if (u === userId && typeof kind === 'string') out[kind] = v;
    }
    return out;
  }

  /** Test-helper: replace the materialized balance to simulate drift. */
  forceSetBalance(userId: string, kind: string, value: number): void {
    this.balances.set(this.bKey(userId, kind), value);
  }

  /** Test-helper: list every event (already chronologically ordered). */
  listEvents(userId?: string): InMemoryEvent[] {
    return userId ? this.events.filter((e) => e.userId === userId) : [...this.events];
  }

  // ── ReconcilerStore surface ────────────────────────────────────────────

  *listAllEvents(): Iterable<ReconcilerEventRow> {
    for (const e of this.events) {
      yield { userId: e.userId, kind: e.kind, delta: e.delta, createdAt: e.createdAt };
    }
  }

  async getMaterializedBalance(userId: string, kind: string): Promise<number> {
    return this.balances.get(this.bKey(userId, kind)) ?? 0;
  }

  async setMaterializedBalance(userId: string, kind: string, balance: number): Promise<void> {
    this.balances.set(this.bKey(userId, kind), balance);
  }
}
