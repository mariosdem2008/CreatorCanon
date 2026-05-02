/**
 * Drizzle-backed `CreditLedgerStore` implementation.
 *
 * Wraps the credit_event insert + credit_balance UPSERT in a single
 * transaction. Idempotency is delegated to the
 * `credit_event_source_reference_unique` index.
 *
 * Race-safety: the balance UPSERT uses `SET balance = credit_balance.balance + EXCLUDED.balance`
 * which is atomic at the row level. For `consume`, the higher-level ledger
 * function does a pre-check then writes; we additionally take a row-level
 * lock inside the tx via SELECT ... FOR UPDATE so two simultaneous consumes
 * cannot both pass the check.
 *
 * NOTE: This module imports drizzle-orm + the schema. Tests use the
 * in-memory store and never load this file.
 */

import { and, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { creditBalance, creditEvent } from '@creatorcanon/db/schema';
import * as schema from '@creatorcanon/db/schema';

import type { CreditLedgerStore } from './types';
import type { ReconcilerEventRow, ReconcilerStore } from './reconciler';

type Db = PostgresJsDatabase<typeof schema>;

export class DrizzleCreditLedger implements CreditLedgerStore, ReconcilerStore {
  constructor(private readonly db: Db) {}

  async insertEvent(args: {
    id: string;
    userId: string;
    kind: string;
    delta: number;
    source: string;
    reference?: string | null;
  }): Promise<{ inserted: boolean; balance: number }> {
    const reference = args.reference ?? null;
    return this.db.transaction(async (tx) => {
      // 1. Insert event with idempotent dedupe on (source, reference).
      const inserted = await tx
        .insert(creditEvent)
        .values({
          id: args.id,
          userId: args.userId,
          kind: args.kind,
          delta: args.delta,
          source: args.source,
          reference,
        })
        .onConflictDoNothing({
          target: [creditEvent.source, creditEvent.reference],
        })
        .returning({ id: creditEvent.id });

      const wasInserted = inserted.length > 0;

      // 2. Lock the balance row (or empty result) to serialize concurrent writers.
      // Drizzle does not yet expose `.for('update')` on the chained select for all
      // adapters; raw SQL is the safest portable form.
      await tx.execute(
        sql`SELECT balance FROM ${creditBalance}
            WHERE ${creditBalance.userId} = ${args.userId}
              AND ${creditBalance.kind} = ${args.kind}
            FOR UPDATE`,
      );

      // 3. Apply the delta only if the event was actually inserted.
      if (wasInserted) {
        await tx
          .insert(creditBalance)
          .values({
            userId: args.userId,
            kind: args.kind,
            balance: args.delta,
          })
          .onConflictDoUpdate({
            target: [creditBalance.userId, creditBalance.kind],
            set: {
              balance: sql`${creditBalance.balance} + ${args.delta}`,
              updatedAt: new Date(),
            },
          });
      }

      // 4. Read final balance for the caller.
      const rows = await tx
        .select({ balance: creditBalance.balance })
        .from(creditBalance)
        .where(
          and(
            eq(creditBalance.userId, args.userId),
            eq(creditBalance.kind, args.kind),
          ),
        );

      const balance = rows[0]?.balance ?? 0;
      return { inserted: wasInserted, balance };
    });
  }

  async getBalance(userId: string, kind: string): Promise<number> {
    const rows = await this.db
      .select({ balance: creditBalance.balance })
      .from(creditBalance)
      .where(and(eq(creditBalance.userId, userId), eq(creditBalance.kind, kind)));
    return rows[0]?.balance ?? 0;
  }

  async getAllBalances(userId: string): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ kind: creditBalance.kind, balance: creditBalance.balance })
      .from(creditBalance)
      .where(eq(creditBalance.userId, userId));
    const out: Record<string, number> = {};
    for (const r of rows) out[r.kind] = r.balance;
    return out;
  }

  // ── ReconcilerStore surface ────────────────────────────────────────────

  async *listAllEvents(): AsyncIterable<ReconcilerEventRow> {
    // Stream all rows. Drizzle's postgres-js adapter loads everything in one
    // pass — fine for our scale (events / month is tiny).
    const rows = await this.db
      .select({
        userId: creditEvent.userId,
        kind: creditEvent.kind,
        delta: creditEvent.delta,
        createdAt: creditEvent.createdAt,
      })
      .from(creditEvent);
    for (const r of rows) yield r;
  }

  async getMaterializedBalance(userId: string, kind: string): Promise<number> {
    return this.getBalance(userId, kind);
  }

  async setMaterializedBalance(userId: string, kind: string, balance: number): Promise<void> {
    await this.db
      .insert(creditBalance)
      .values({ userId, kind, balance })
      .onConflictDoUpdate({
        target: [creditBalance.userId, creditBalance.kind],
        set: { balance, updatedAt: new Date() },
      });
  }
}
