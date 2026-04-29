import type { AgentProvider, ProviderName } from '../agents/providers';
import type { ResolvedModel } from '../agents/providers/selectModel';

/**
 * Convert a selectModel() result + a provider factory into the
 * `fallbacks` array that runAgent expects. Each fallback link gets a
 * provider instance constructed lazily via the factory.
 *
 * The factory accepts ProviderName (the full union including 'codex-cli');
 * stages that don't support codex-cli should throw inside their factory
 * when they receive it. Page-composition is the only stage that wires
 * codex-cli into a real provider — see codex_dev quality preset.
 *
 * Usage in a stage:
 *   const model = selectModel('video_analyst', process.env);
 *   const provider = makeProvider(model.provider);
 *   const fallbacks = buildFallbacks(model, makeProvider);
 *   await runAgent({ ..., modelId: model.modelId, provider, fallbacks });
 */
export function buildFallbacks(
  model: ResolvedModel,
  makeProvider: (name: ProviderName) => AgentProvider,
): Array<{ modelId: string; provider: AgentProvider }> {
  return model.fallbackChain
    .filter((c) => c.modelId !== model.modelId)
    .map((c) => ({ modelId: c.modelId, provider: makeProvider(c.provider) }));
}
