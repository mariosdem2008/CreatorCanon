/**
 * Synthesis runner — orchestrates composer agents to produce a ProductBundle
 * for a given run + product goal. Real implementation lives in Task A.7.
 *
 * Until then, this module exposes the stable signature so the API endpoints
 * (Task A.9) and CLI runner (Task A.10) can be wired against the final type.
 */

import type {
  ChannelProfileRef,
  CanonRef,
  CodexClient,
  CreatorConfig,
  ProductBundle,
  ProductGoal,
} from './types';

export interface RunSynthesisInput {
  runId: string;
  productGoal: ProductGoal;
  creatorConfig: CreatorConfig;
  channelProfile: ChannelProfileRef;
  canons: CanonRef[];
  codex: CodexClient;
}

/**
 * Stub. Filled in Task A.7. Throws so callers know wiring is incomplete.
 */
export async function runSynthesis(_input: RunSynthesisInput): Promise<ProductBundle> {
  throw new Error('runSynthesis: not yet implemented (Task A.7)');
}
