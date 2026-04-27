import type { ProviderName } from './index';

export type AgentName =
  | 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'
  | 'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
  | 'citation_grounder' | 'page_composer'
  | 'channel_profiler' | 'video_analyst' | 'canon_architect' | 'page_brief_planner' | 'page_writer'
  | 'visual_frame_analyst';

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

/** Per spec § 9.1 + Stage 1 v4 hybrid routing. */
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
  // canon_v1 text agents — GPT-heavy (Gemini available as fallback)
  channel_profiler:     { envVar: 'PIPELINE_MODEL_CHANNEL_PROFILER',     default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  video_analyst:        { envVar: 'PIPELINE_MODEL_VIDEO_ANALYST',        default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  canon_architect:      { envVar: 'PIPELINE_MODEL_CANON_ARCHITECT',      default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  page_brief_planner:   { envVar: 'PIPELINE_MODEL_PAGE_BRIEF_PLANNER',   default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  page_writer:          { envVar: 'PIPELINE_MODEL_PAGE_WRITER',          default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  // visual — always Gemini regardless of mode
  visual_frame_analyst: { envVar: 'PIPELINE_MODEL_VISUAL_FRAME_ANALYST', default: M('gemini-2.5-flash','gemini'), fallbackChain: [M('gemini-2.5-pro','gemini')] },
};

type ModelMode = 'hybrid' | 'gemini_only' | 'openai_only';

function modeRouted(agent: AgentName, mode: ModelMode): ModelChoice {
  // visual_frame_analyst always Gemini regardless of mode.
  if (agent === 'visual_frame_analyst') return REGISTRY[agent].default;
  if (mode === 'hybrid') return REGISTRY[agent].default;
  if (mode === 'gemini_only') {
    const fallback = REGISTRY[agent].fallbackChain.find((c) => c.provider === 'gemini');
    if (fallback) return fallback;
    if (REGISTRY[agent].default.provider === 'gemini') return REGISTRY[agent].default;
    throw new Error(`PIPELINE_MODEL_MODE=gemini_only but agent '${agent}' has no Gemini-compatible model in its fallback chain. Set PIPELINE_MODEL_${agent.toUpperCase()} explicitly.`);
  }
  if (mode === 'openai_only') {
    const fallback = REGISTRY[agent].fallbackChain.find((c) => c.provider === 'openai');
    if (fallback) return fallback;
    if (REGISTRY[agent].default.provider === 'openai') return REGISTRY[agent].default;
    throw new Error(`PIPELINE_MODEL_MODE=openai_only but agent '${agent}' has no OpenAI-compatible model in its fallback chain. Set PIPELINE_MODEL_${agent.toUpperCase()} explicitly.`);
  }
  throw new Error(`Unknown PIPELINE_MODEL_MODE: ${mode}. Supported: hybrid | gemini_only | openai_only.`);
}

function parseMode(raw: string | undefined): ModelMode {
  if (!raw) return 'hybrid';
  if (raw === 'hybrid' || raw === 'gemini_only' || raw === 'openai_only') return raw;
  throw new Error(`Invalid PIPELINE_MODEL_MODE: ${raw}. Supported: hybrid | gemini_only | openai_only.`);
}

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
 * Resolve which model to use for an agent. Override priority:
 * per-agent env (PIPELINE_MODEL_<AGENT>) > PIPELINE_MODEL_MODE routing > REGISTRY default.
 */
export function selectModel(agent: AgentName, env: Record<string, string | undefined>): ResolvedModel {
  const cfg = REGISTRY[agent];
  if (!cfg) throw new Error(`Unknown agent: ${agent}`);
  const explicit = env[cfg.envVar];
  if (explicit) {
    return { modelId: explicit, provider: inferProvider(explicit), fallbackChain: cfg.fallbackChain };
  }
  const mode = parseMode(env.PIPELINE_MODEL_MODE);
  const chosen = modeRouted(agent, mode);
  return { ...chosen, fallbackChain: cfg.fallbackChain };
}
