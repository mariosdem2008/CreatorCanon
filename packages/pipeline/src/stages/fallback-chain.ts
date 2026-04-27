import type { AgentProvider } from '../agents/providers';
import type { ResolvedModel } from '../agents/providers/selectModel';

/**
 * Convert a selectModel() result + a provider factory into the
 * `fallbacks` array that runAgent expects. Each fallback link gets a
 * provider instance constructed lazily via the factory.
 *
 * Usage in a stage:
 *   const model = selectModel('video_analyst', process.env);
 *   const provider = makeProvider(model.provider);
 *   const fallbacks = buildFallbacks(model, makeProvider);
 *   await runAgent({ ..., modelId: model.modelId, provider, fallbacks });
 */
export function buildFallbacks(
  model: ResolvedModel,
  makeProvider: (name: 'openai' | 'gemini') => AgentProvider,
): Array<{ modelId: string; provider: AgentProvider }> {
  return model.fallbackChain
    .filter((c) => c.modelId !== model.modelId)
    .map((c) => ({ modelId: c.modelId, provider: makeProvider(c.provider) }));
}
