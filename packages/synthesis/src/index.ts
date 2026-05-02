/**
 * @creatorcanon/synthesis — public surface.
 *
 * Composer agents convert the audit substrate (ChannelProfile_v2 + CanonNode +
 * EvidenceRegistry + WorkshopClip + PageBrief) into a typed ProductBundle.
 * The runner orchestrates them in parallel.
 */

export type {
  ActionPlanComponent,
  ActionPlanPhase,
  ActionPlanPhaseId,
  ActionPlanStep,
  ArchetypeSlug,
  CalculatorComponent,
  CalculatorVariable,
  CalculatorVariableType,
  CanonRef,
  ChannelProfileRef,
  CodexClient,
  ComposeInput,
  CreatorConfig,
  DiagnosticComponent,
  DiagnosticOption,
  DiagnosticOutcome,
  DiagnosticQuestion,
  FunnelComponent,
  FunnelEmailCapture,
  FunnelInlineCta,
  FunnelLogin,
  FunnelPaywall,
  FunnelShareCard,
  ProductBundle,
  ProductBundleComponentKey,
  ProductGoal,
  VoiceMode,
  WorksheetComponent,
  WorksheetField,
  WorksheetFieldType,
} from './types';

export { runSynthesis } from './runner';
export { routeComposers, COMPOSER_MATRIX } from './composers/router';
export { composeActionPlan, classifyCanonByPhase } from './composers/action-plan-composer';
export { composeWorksheets } from './composers/worksheet-forge';
export { composeCalculators } from './composers/calculator-forge';
export { composeDiagnostic } from './composers/diagnostic-composer';
export { composeFunnel } from './composers/funnel-composer';

// Phase N — credit ledger (usage metering: hours / builder_credits / chat_credits).
export {
  grant,
  consume,
  getBalance,
  MemoryCreditLedger,
  DrizzleCreditLedger,
  InsufficientCreditsError,
  CREDIT_KINDS,
  isCreditKind,
} from './credits';
export type {
  CreditKind,
  CreditEvent,
  CreditBalanceRow,
  CreditLedgerStore,
  GrantArgs,
  ConsumeArgs,
  GrantResult,
  BalanceMap,
} from './credits';
