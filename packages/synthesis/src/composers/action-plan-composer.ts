/**
 * ActionPlan composer — Task A.2 placeholder.
 * Full implementation (classifier, topo sort, Codex authoring) lands next.
 */

import type {
  ActionPlanComponent,
  CanonRef,
  CodexClient,
  ComposeInput,
} from '../types';

export type ActionPlanPhaseKey = 'pre_revenue' | 'sub_10k_month' | 'sub_100k_month' | 'scale';

export function classifyCanonByPhase(_canon: CanonRef): ActionPlanPhaseKey {
  return 'sub_100k_month';
}

export async function composeActionPlan(
  _input: ComposeInput,
  _opts: { codex: CodexClient },
): Promise<ActionPlanComponent> {
  throw new Error('composeActionPlan: not yet implemented (Task A.2)');
}
