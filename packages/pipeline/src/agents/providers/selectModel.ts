import type { ProviderName } from './index';

export type AgentName =
  | 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'
  | 'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
  | 'citation_grounder' | 'page_composer';

interface ModelChoice {
  modelId: string;
  provider: ProviderName;
}

interface AgentConfig {
  envVar: string;
  default: ModelChoice;
  fallbackChain: ModelChoice[];
}

const M = (modelId: string, provider: ProviderName): ModelChoice => ({ modelId, provider });

/** Per spec § 9.1. */
const REGISTRY: Record<AgentName, AgentConfig> = {
  topic_spotter:        { envVar: 'PIPELINE_MODEL_TOPIC_SPOTTER',        default: M('gemini-2.5-flash','gemini'), fallbackChain: [M('gpt-5.4','openai'), M('gpt-5.5','openai')] },
  framework_extractor:  { envVar: 'PIPELINE_MODEL_FRAMEWORK_EXTRACTOR',  default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  lesson_extractor:     { envVar: 'PIPELINE_MODEL_LESSON_EXTRACTOR',     default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  playbook_extractor:   { envVar: 'PIPELINE_MODEL_PLAYBOOK_EXTRACTOR',   default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  source_ranker:        { envVar: 'PIPELINE_MODEL_SOURCE_RANKER',        default: M('gpt-5.4','openai'),          fallbackChain: [M('gemini-2.5-flash','gemini')] },
  quote_finder:         { envVar: 'PIPELINE_MODEL_QUOTE_FINDER',         default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  aha_moment_detector:  { envVar: 'PIPELINE_MODEL_AHA_MOMENT_DETECTOR',  default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  citation_grounder:    { envVar: 'PIPELINE_MODEL_CITATION_GROUNDER',    default: M('gpt-5.4','openai'),          fallbackChain: [M('gemini-2.5-flash','gemini')] },
  page_composer:        { envVar: 'PIPELINE_MODEL_PAGE_COMPOSER',        default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
};

function inferProvider(modelId: string): ProviderName {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1')) return 'openai';
  if (modelId.startsWith('gemini-')) return 'gemini';
  throw new Error(`Cannot infer provider for model '${modelId}'. Use a recognized prefix (gpt-, o1, gemini-).`);
}

export interface ResolvedModel {
  modelId: string;
  provider: ProviderName;
  fallbackChain: ModelChoice[];
}

/**
 * Resolve which model to use for an agent. Env var `PIPELINE_MODEL_<AGENT>` overrides
 * the default; the provider is inferred from the model ID prefix.
 */
export function selectModel(agent: AgentName, env: Record<string, string | undefined>): ResolvedModel {
  const cfg = REGISTRY[agent];
  if (!cfg) throw new Error(`Unknown agent: ${agent}`);
  const override = env[cfg.envVar];
  const chosen = override ? M(override, inferProvider(override)) : cfg.default;
  return { ...chosen, fallbackChain: cfg.fallbackChain };
}
