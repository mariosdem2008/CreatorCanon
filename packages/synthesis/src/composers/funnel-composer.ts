/**
 * Funnel composer — Task A.6 placeholder.
 */

import type {
  CodexClient,
  ComposeInput,
  CreatorConfig,
  FunnelComponent,
  ProductGoal,
} from '../types';

export interface FunnelComposeInput extends ComposeInput {
  productGoal: ProductGoal;
  creatorConfig: CreatorConfig;
}

export async function composeFunnel(
  _input: FunnelComposeInput,
  _opts: { codex: CodexClient },
): Promise<FunnelComponent> {
  throw new Error('composeFunnel: not yet implemented (Task A.6)');
}
