/**
 * Phase N — Credit ledger public surface.
 */

export { grant, consume } from './ledger';
export type { GrantArgs, ConsumeArgs, GrantResult } from './ledger';

export { getBalance } from './balance';
export type { BalanceMap } from './balance';

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
