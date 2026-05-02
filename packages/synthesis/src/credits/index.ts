/**
 * Phase N — Credit ledger public surface.
 */

export { grant, consume } from './ledger';
export type { GrantArgs, ConsumeArgs, GrantResult } from './ledger';

export { getBalance } from './balance';
export type { BalanceMap } from './balance';

export {
  allocateTierCredits,
  addAddonCredit,
  tierAmount,
  tierSource,
  tierResetSource,
} from './allocator';
export type {
  Tier,
  AllocateTierCreditsArgs,
  AddAddonCreditArgs,
} from './allocator';

export { requireCredits, runWithCredits } from './enforcer';
export type { RunWithCreditsArgs } from './enforcer';

export { onSubscriptionPeriodStart, onAddonPurchased } from './stripe-hooks';
export type {
  OnSubscriptionPeriodStartArgs,
  OnAddonPurchasedArgs,
} from './stripe-hooks';

export { reconcile } from './reconciler';
export type {
  ReconcilerEventRow,
  ReconcilerStore,
  ReconcileOptions,
  ReconcileResult,
  DriftReport,
} from './reconciler';
export { runReconciliation } from './reconciler-cli';
export type { RunReconciliationOptions } from './reconciler-cli';

export { MemoryCreditLedger } from './memory-store';
export { DrizzleCreditLedger } from './drizzle-store';

export {
  InsufficientCreditsError,
  CREDIT_KINDS,
  isCreditKind,
} from './types';
export type {
  CreditKind,
  CreditEvent,
  CreditBalanceRow,
  CreditLedgerStore,
} from './types';
