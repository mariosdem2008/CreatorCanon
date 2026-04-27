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
  channel_profiler:     { envVar: 'PIPELINE_MODEL_CHANNEL_PROFILER',     default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  video_analyst:        { envVar: 'PIPELINE_MODEL_VIDEO_ANALYST',        default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  canon_architect:      { envVar: 'PIPELINE_MODEL_CANON_ARCHITECT',      default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  page_brief_planner:   { envVar: 'PIPELINE_MODEL_PAGE_BRIEF_PLANNER',   default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  page_writer:          { envVar: 'PIPELINE_MODEL_PAGE_WRITER',          default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  visual_frame_analyst: { envVar: 'PIPELINE_MODEL_VISUAL_FRAME_ANALYST', default: M('gemini-2.5-flash','gemini'), fallbackChain: [M('gemini-2.5-pro','gemini')] },
};

type ModelMode = 'hybrid' | 'gemini_only' | 'openai_only';
type QualityMode = 'lean' | 'production_economy' | 'premium';

// Per-quality-mode model assignment for each canon_v1 agent.
//
// SCOPE: Quality presets ONLY apply to canon_v1 agents (channel_profiler,
// video_analyst, canon_architect, page_brief_planner, page_writer). Phase-1
// agents (framework_extractor, lesson_extractor, etc.) and visual_frame_analyst
// intentionally fall through to PIPELINE_MODEL_MODE / REGISTRY default — they
// have their own well-tuned defaults that don't need the cost-quality knob.
// The Partial<Record<...>> type makes this fall-through explicit without
// the compiler complaining about missing entries.
//
// visual_frame_analyst is also explicitly exempted at the call-site
// (selectModel() body, agent !== 'visual_frame_analyst' guard) for defense
// in depth — vision always uses Flash.
const QUALITY_PRESETS: Record<QualityMode, Partial<Record<AgentName, ModelChoice>>> = {
  // Cheapest viable. Canon synthesis stays on Pro because it's the
  // highest-leverage judgment call; everything else uses Flash.
  lean: {
    channel_profiler:   M('gemini-2.5-flash', 'gemini'),
    video_analyst:      M('gemini-2.5-flash', 'gemini'),
    canon_architect:    M('gemini-2.5-pro',   'gemini'),
    page_brief_planner: M('gemini-2.5-flash', 'gemini'),
    page_writer:        M('gemini-2.5-flash', 'gemini'),
  },
  // Recommended default. Right-sized: Flash for extraction/structural agents,
  // Pro for long-context reading (video_analyst), gpt-5.5 only for the
  // single agent where premium reasoning pays off (canon_architect).
  production_economy: {
    channel_profiler:   M('gemini-2.5-flash', 'gemini'),
    video_analyst:      M('gemini-2.5-pro',   'gemini'),
    canon_architect:    M('gpt-5.5',          'openai'),
    page_brief_planner: M('gemini-2.5-flash', 'gemini'),
    page_writer:        M('gemini-2.5-flash', 'gemini'),
  },
  // Maximum quality. Every text agent on gpt-5.5.
  premium: {
    channel_profiler:   M('gpt-5.5', 'openai'),
    video_analyst:      M('gpt-5.5', 'openai'),
    canon_architect:    M('gpt-5.5', 'openai'),
    page_brief_planner: M('gpt-5.5', 'openai'),
    page_writer:        M('gpt-5.5', 'openai'),
  },
};

function modeRouted(agent: AgentName, mode: ModelMode): ModelChoice {
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

function parseQualityMode(raw: string | undefined): QualityMode | null {
  if (!raw) return null;
  if (raw === 'lean' || raw === 'production_economy' || raw === 'premium') return raw;
  throw new Error(`Invalid PIPELINE_QUALITY_MODE: ${raw}. Supported: lean | production_economy | premium.`);
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
 * Resolution priority (most specific first):
 *   1. PIPELINE_MODEL_<AGENT>      — per-agent explicit override
 *   2. PIPELINE_QUALITY_MODE       — preset that picks a model per agent
 *   3. PIPELINE_MODEL_MODE         — provider preference (hybrid|gemini_only|openai_only)
 *   4. REGISTRY[agent].default     — plan-default
 *
 * visual_frame_analyst always uses its REGISTRY default regardless of mode/preset.
 */
export function selectModel(agent: AgentName, env: Record<string, string | undefined>): ResolvedModel {
  const cfg = REGISTRY[agent];
  if (!cfg) throw new Error(`Unknown agent: ${agent}`);

  // 1. per-agent env override
  const explicit = env[cfg.envVar];
  if (explicit) {
    return { modelId: explicit, provider: inferProvider(explicit), fallbackChain: cfg.fallbackChain };
  }

  // 2. quality-mode preset (visual_frame_analyst exempt)
  const quality = parseQualityMode(env.PIPELINE_QUALITY_MODE);
  if (quality && agent !== 'visual_frame_analyst') {
    const preset = QUALITY_PRESETS[quality][agent];
    if (preset) {
      return { ...preset, fallbackChain: cfg.fallbackChain };
    }
  }

  // 3. provider-mode routing
  const mode = parseMode(env.PIPELINE_MODEL_MODE);
  const chosen = modeRouted(agent, mode);
  return { ...chosen, fallbackChain: cfg.fallbackChain };
}
