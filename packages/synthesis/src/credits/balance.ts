/**
 * Phase N — Balance API.
 *
 * Reads the materialized `credit_balance` snapshot via the injected store.
 * Returns 0 for kinds that have no row yet (a brand-new user has all zeros).
 */

import { CREDIT_KINDS } from './types';
import type { CreditKind, CreditLedgerStore } from './types';

export type BalanceMap = Record<CreditKind, number>;

/**
 * Read balances for one user. If `kind` is omitted, returns all 3 kinds
 * (with `0` for any kind that has no row). If `kind` is supplied, returns
 * a single-key object.
 */
export async function getBalance(
  store: CreditLedgerStore,
  userId: string,
  kind?: CreditKind,
): Promise<BalanceMap> {
  if (kind) {
    const v = await store.getBalance(userId, kind);
    return { [kind]: v } as BalanceMap;
  }

  const raw = await store.getAllBalances(userId);
  const out = { hours: 0, builder_credits: 0, chat_credits: 0 } as BalanceMap;
  for (const k of CREDIT_KINDS) {
    if (k in raw) out[k] = raw[k] ?? 0;
  }
  return out;
}
