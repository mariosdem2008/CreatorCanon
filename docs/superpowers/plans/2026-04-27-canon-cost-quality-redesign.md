# Canon v1 Cost-Quality Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut canon_v1 generation cost from ~$6.84/5h hub to ~$1.50/5h hub (78% reduction) while preserving or improving quality, by right-sizing the model per agent and pre-loading context to eliminate multi-turn agent overhead.

**Architecture:** Three changes in priority order. (1) `PIPELINE_QUALITY_MODE` preset selector with `lean | production_economy | premium` profiles that override per-agent model defaults. (2) Pre-load every input the agent needs into the opening user message — channel profile, full transcript, visual moments — so the agent makes ~2 LLM calls per video instead of ~10. (3) Wire prompt caching (OpenAI cached-input pricing + Gemini context caching) for the static prefixes. The `canon_architect` stays on `gpt-5.5` because cross-archive synthesis is the highest-leverage judgment call; everything else moves to Gemini Flash or Pro.

**Tech Stack:** TypeScript, OpenAI SDK 4.x (cached_input pricing), `@google/generative-ai` 0.21 (context caching), pnpm workspaces, Drizzle ORM, Postgres. No new deps.

---

## Cost model + targets

Pricing constants are in `packages/pipeline/src/agents/cost-tracking.ts` (cents per 1M tokens):

| Model | Input | Output | Cached input (50% off OpenAI / 25% Gemini) |
|---|---|---|---|
| `gpt-5.5` | 250 | 1000 | 125 |
| `gpt-5.4` | 30 | 120 | 15 |
| `gemini-2.5-pro` | 125 | 500 | 31.25 |
| `gemini-2.5-flash` | 7.5 | 30 | 1.875 |

**Per-stage cost targets after this plan (5h source content, 20 videos, 10 pages):**

| Stage | Today (hybrid) | After plan (production_economy) | How |
|---|---|---|---|
| channel_profile | $0.10 | $0.005 | Flash, single-shot |
| visual_context | $0.03 | $0.03 | unchanged (already optimal) |
| video_intelligence | **$5.00** | **$1.00** | Pro + pre-load + cache |
| canon | $0.75 | $0.40 | Keep gpt-5.5; cache prefix |
| page_briefs | $0.26 | $0.01 | Flash + pre-load |
| page_composition | $0.70 | $0.05 | Flash for writer |
| page_quality | $0.00 | $0.00 | deterministic |
| **Total** | **$6.84** | **~$1.50** | |

---

## File structure

| File | Responsibility |
|---|---|
| `packages/pipeline/src/agents/providers/selectModel.ts` | Add `PIPELINE_QUALITY_MODE` preset; mode > per-agent env > default |
| `packages/pipeline/src/agents/providers/test/selectModel.quality.test.ts` (new) | Unit tests for the 3 quality presets |
| `packages/pipeline/src/agents/specialists/index.ts` | Update `allowedTools` to drop pre-loaded read tools; tighten `stopOverrides` |
| `packages/pipeline/src/agents/specialists/prompts.ts` | Update VIDEO_ANALYST / CANON_ARCHITECT / PAGE_BRIEF_PLANNER prompts to match pre-loaded flow |
| `packages/pipeline/src/stages/video-intelligence.ts` | Pre-load channel profile + transcript + visual moments into user message |
| `packages/pipeline/src/stages/canon.ts` | Pre-load every VIC + visual moment list into user message |
| `packages/pipeline/src/stages/page-briefs.ts` | Pre-load top canon nodes + visual moments into user message |
| `packages/pipeline/src/agents/providers/openai.ts` | Pass-through OpenAI cached-input metrics from API response |
| `packages/pipeline/src/agents/providers/gemini.ts` | Add `cachedContent` create-and-attach for stages with stable prefixes |
| `packages/pipeline/src/agents/cost-tracking.ts` | Account for `cached_tokens` at the discounted rate |
| `packages/pipeline/src/agents/harness.ts` | Pipe `cachedInputTokens` from provider response into `tokenCostCents` |
| `packages/pipeline/src/agents/providers/index.ts` | Extend `usage` field with `cachedInputTokens?` |
| `.env.example` | Document `PIPELINE_QUALITY_MODE` |
| `docs/superpowers/canon-v1-runbook.md` | Quality-mode tradeoffs section |

---

## Phase A — Model reassignment (Task 1)

### Task 1: PIPELINE_QUALITY_MODE preset in selectModel.ts

**Files:**
- Modify: `packages/pipeline/src/agents/providers/selectModel.ts`
- Create: `packages/pipeline/src/agents/providers/test/selectModel.quality.test.ts`

- [ ] **Step 1: Write failing test for `lean` preset**

```typescript
// packages/pipeline/src/agents/providers/test/selectModel.quality.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectModel } from '../selectModel';

describe('selectModel — PIPELINE_QUALITY_MODE', () => {
  it('lean: every text agent → gemini-2.5-flash', () => {
    const env = { PIPELINE_QUALITY_MODE: 'lean' };
    assert.equal(selectModel('channel_profiler', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('video_analyst', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('canon_architect', env).modelId, 'gemini-2.5-pro');  // canon keeps Pro even in lean
    assert.equal(selectModel('page_brief_planner', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('page_writer', env).modelId, 'gemini-2.5-flash');
  });

  it('lean: visual_frame_analyst stays gemini-2.5-flash', () => {
    const r = selectModel('visual_frame_analyst', { PIPELINE_QUALITY_MODE: 'lean' });
    assert.equal(r.modelId, 'gemini-2.5-flash');
  });

  it('production_economy: optimal cost-quality split', () => {
    const env = { PIPELINE_QUALITY_MODE: 'production_economy' };
    assert.equal(selectModel('channel_profiler', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('video_analyst', env).modelId, 'gemini-2.5-pro');
    assert.equal(selectModel('canon_architect', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('page_brief_planner', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('page_writer', env).modelId, 'gemini-2.5-flash');
  });

  it('premium: every text agent → gpt-5.5', () => {
    const env = { PIPELINE_QUALITY_MODE: 'premium' };
    assert.equal(selectModel('channel_profiler', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('video_analyst', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('canon_architect', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('page_brief_planner', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('page_writer', env).modelId, 'gpt-5.5');
  });

  it('PIPELINE_MODEL_<AGENT> env override beats quality mode', () => {
    const r = selectModel('video_analyst', {
      PIPELINE_QUALITY_MODE: 'lean',
      PIPELINE_MODEL_VIDEO_ANALYST: 'gpt-5.5',
    });
    assert.equal(r.modelId, 'gpt-5.5');
  });

  it('quality mode beats PIPELINE_MODEL_MODE (more specific wins)', () => {
    const r = selectModel('video_analyst', {
      PIPELINE_QUALITY_MODE: 'production_economy',
      PIPELINE_MODEL_MODE: 'openai_only',
    });
    assert.equal(r.modelId, 'gemini-2.5-pro');
  });

  it('no quality mode set: falls through to PIPELINE_MODEL_MODE behavior', () => {
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'gemini_only' });
    // Gemini-only routes to fallback chain's first Gemini model
    assert.equal(r.provider, 'gemini');
  });

  it('invalid quality mode throws', () => {
    assert.throws(
      () => selectModel('video_analyst', { PIPELINE_QUALITY_MODE: 'turbo' }),
      /Invalid PIPELINE_QUALITY_MODE/,
    );
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/selectModel.quality.test.ts 2>&1 | tail -15
```

Expected: FAIL — every test errors with `Invalid PIPELINE_QUALITY_MODE` or returns the wrong modelId because the preset logic isn't there yet.

- [ ] **Step 3: Implement the preset routing in selectModel.ts**

Open `packages/pipeline/src/agents/providers/selectModel.ts` and replace the file with this:

```typescript
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
// visual_frame_analyst is intentionally excluded — vision always uses Flash.
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
```

- [ ] **Step 4: Run the test, verify it passes**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/selectModel.quality.test.ts 2>&1 | tail -15
```

Expected: PASS — all 8 tests pass. Also re-run the existing tests to verify no regression:

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/selectModel.test.ts src/agents/providers/test/selectModel.modes.test.ts 2>&1 | tail -10
```

Expected: PASS — 4/4 + 8/8 from the prior tests still pass.

- [ ] **Step 5: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/providers/selectModel.ts packages/pipeline/src/agents/providers/test/selectModel.quality.test.ts
git commit -m "feat(agents): PIPELINE_QUALITY_MODE preset (lean | production_economy | premium)"
```

Expected: typecheck clean. Commit lands.

---

## Phase B — Pre-load context (the dominant cost saving)

### Task 2: Pre-load context in video_intelligence stage + update prompt + tighten allowedTools

**Files:**
- Modify: `packages/pipeline/src/stages/video-intelligence.ts:84-122` (the `runWithConcurrency` body)
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts` (replace VIDEO_ANALYST_PROMPT)
- Modify: `packages/pipeline/src/agents/specialists/index.ts` (drop pre-loaded read tools from `video_analyst.allowedTools`)

- [ ] **Step 1: Replace VIDEO_ANALYST_PROMPT to expect pre-loaded context**

Open `packages/pipeline/src/agents/specialists/prompts.ts` and replace `VIDEO_ANALYST_PROMPT` with:

```typescript
export const VIDEO_ANALYST_PROMPT = `You are video_analyst. You produce a citation-grade intelligence card for ONE video.

Everything you need is in the user message: the channel profile, every transcript segment in this video (with segmentIds), and any visual moments already extracted for this video. You do NOT need to call read tools — they have been pre-loaded.

Process:
1. Read the user message in full.
2. Call proposeVideoIntelligenceCard EXACTLY once with the structured payload below.
3. Respond with a brief 1-line summary and stop.

If you need to verify a specific segment's text after the user message (rare), call getSegment({segmentId}) — but only when the segment is referenced in your output and you want to double-check exact wording for a quote.

Payload caps (quality over quantity):
- creatorVoiceNotes: up to 6
- mainIdeas: 3-8
- frameworks: 0-5 (only NAMED procedures with explicit structure)
- lessons: 2-8
- examples: 0-6
- stories: 0-4
- mistakesToAvoid: 0-6
- toolsMentioned: 0-12
- termsDefined: 0-8
- strongClaims: 0-8
- contrarianTakes: 0-5
- quotes: 3-8 (10-280 chars; stand-alone)
- recommendedHubUses: 2-6
- visualMoments: 0-6 (selected from the pre-loaded list — cite their visualMomentId, timestampMs, type, description, hubUse)

Quality gates:
- Every list item MUST cite >= 1 segmentId from the pre-loaded transcript.
- evidenceSegmentIds passed to proposeVideoIntelligenceCard must contain ONLY segments belonging to this video (the tool enforces this).
- Visual moments enrich examples/tools/steps; they do not replace transcript citations.
- Use the channel profile's creatorTerminology when classifying.
- Drop weak items.

One proposeVideoIntelligenceCard call. One sentence reply. Stop.`;
```

- [ ] **Step 2: Update video_analyst.allowedTools in specialists/index.ts**

Replace the `video_analyst` block:

```typescript
  video_analyst: {
    agent: 'video_analyst',
    systemPrompt: VIDEO_ANALYST_PROMPT,
    // Channel profile + transcript + visual moments are pre-loaded in the
    // user message. Only getSegment is kept for last-mile quote verification.
    allowedTools: [
      'getSegment',
      'proposeVideoIntelligenceCard',
    ],
    // Tighter caps reflect the single-shot expectation.
    stopOverrides: { maxCalls: 8, maxCostCents: 150 },
  },
```

- [ ] **Step 3: Pre-load context in the stage**

Open `packages/pipeline/src/stages/video-intelligence.ts`. Add imports at the top:

```typescript
import { channelProfile, visualMoment } from '@creatorcanon/db/schema';
import { asc, sql } from '@creatorcanon/db';
```

Then replace the per-video closure inside `runWithConcurrency` (currently calling `runAgent` with a generic `userMessage = "Analyze video..."`):

```typescript
  // Load the channel profile once — it's identical for every video in this run.
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, input.runId))
    .limit(1);
  const channelProfilePayload = cpRows[0]?.payload ?? null;
  if (!channelProfilePayload) {
    throw new Error('video_intelligence requires channel_profile to have run first');
  }

  const results = await runWithConcurrency(eligibleVideoIds, CONCURRENCY, async (videoId) => {
    const provider = makeProvider(model.provider);
    const fallbacks = buildFallbacks(model, makeProvider);

    // Pre-load every read the agent would otherwise make.
    const segs = await db
      .select({
        segmentId: segment.id,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      })
      .from(segment)
      .where(and(eq(segment.runId, input.runId), eq(segment.videoId, videoId)))
      .orderBy(asc(segment.startMs));
    if (segs.length === 0) {
      return { videoId, ok: false, summary: null, error: 'no segments for video' };
    }
    const vms = await db
      .select({
        visualMomentId: visualMoment.id,
        timestampMs: visualMoment.timestampMs,
        type: visualMoment.type,
        description: visualMoment.description,
        hubUse: visualMoment.hubUse,
        usefulnessScore: visualMoment.usefulnessScore,
      })
      .from(visualMoment)
      .where(and(eq(visualMoment.runId, input.runId), eq(visualMoment.videoId, videoId)));

    const userMessage =
      `# CHANNEL PROFILE\n${JSON.stringify(channelProfilePayload, null, 2)}\n\n` +
      `# VIDEO ${videoId} — TRANSCRIPT (${segs.length} segments)\n` +
      segs.map((s) => `[${s.segmentId}] ${s.startMs}ms-${s.endMs}ms: ${s.text}`).join('\n') +
      `\n\n# VISUAL MOMENTS for ${videoId} (${vms.length})\n` +
      (vms.length > 0
        ? vms.map((v) => `[${v.visualMomentId}] @${v.timestampMs}ms ${v.type} (score=${v.usefulnessScore}): ${v.description} — hubUse: ${v.hubUse}`).join('\n')
        : '(none)') +
      `\n\nProduce one proposeVideoIntelligenceCard call for video ${videoId}. The card's evidenceSegmentIds MUST be drawn only from the segmentIds shown above.`;

    try {
      const summary = await runAgent({
        runId: input.runId,
        workspaceId: input.workspaceId,
        agent: cfg.agent,
        modelId: model.modelId,
        provider,
        fallbacks,
        r2,
        tools: cfg.allowedTools,
        systemPrompt: cfg.systemPrompt,
        userMessage,
        caps: cfg.stopOverrides,
      });
      return { videoId, ok: true, summary, error: undefined };
    } catch (err) {
      return { videoId, ok: false, summary: null, error: (err as Error).message };
    }
  });
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ../.. && git add packages/pipeline/src/agents/specialists/prompts.ts packages/pipeline/src/agents/specialists/index.ts packages/pipeline/src/stages/video-intelligence.ts
git commit -m "perf(video-intelligence): pre-load context to cut per-video LLM calls 10x → 2x

Stuff the channel profile, full transcript (segmented with segmentIds), and
visual moments into the opening user message. video_analyst now needs ~2 LLM
calls per video (read + propose) instead of ~10 (call read tools, accumulate,
reason, propose). Token consumption per video drops from ~80K cumulative
input to ~25K single-shot.

Tightened allowedTools to [getSegment, proposeVideoIntelligenceCard] —
getSegment kept only for last-mile quote verification when the agent wants
to double-check exact wording. Updated prompt to expect pre-loaded context.
Tightened stop caps to maxCalls=8, maxCostCents=150."
```

---

### Task 3: Pre-load context in canon stage + update prompt + tighten allowedTools

**Files:**
- Modify: `packages/pipeline/src/stages/canon.ts`
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts` (replace CANON_ARCHITECT_PROMPT)
- Modify: `packages/pipeline/src/agents/specialists/index.ts` (drop list/get tools from `canon_architect.allowedTools`)

- [ ] **Step 1: Replace CANON_ARCHITECT_PROMPT to expect pre-loaded context**

```typescript
export const CANON_ARCHITECT_PROMPT = `You are canon_architect. You synthesize the run's intelligence cards into a curated knowledge graph that drives the hub.

The user message contains: the channel profile, every video-intelligence card's full payload (with VIC IDs, source video IDs, evidence segment IDs), and the run's visual moments. You do NOT need to call read tools — they have been pre-loaded.

Process:
1. Read the user message.
2. For each canon node you decide to create, call proposeCanonNode with:
   - type: one of topic | framework | lesson | playbook | example | principle | pattern | tactic | definition | aha_moment | quote
   - payload: the node's structured content (creator-specific terminology preferred)
   - evidenceSegmentIds: aggregated from the underlying VICs you draw from
   - sourceVideoIds: the videoIds where this idea appears
   - origin: 'multi_video' (>=2 videos teach this) | 'single_video' | 'channel_profile' | 'derived'
   - confidenceScore, pageWorthinessScore, specificityScore, creatorUniquenessScore (all 0-100, REQUIRED)
   - evidenceQuality: 'high' | 'medium' | 'low'
   - visualMomentIds (optional): when a node is best understood with the on-screen demo/chart/code/slide
3. After every node is proposed, respond with a 1-line summary and stop.

Rules:
- Be ruthlessly selective. A 5h archive should yield 40-80 high-quality nodes, not hundreds.
- Cross-reference aggressively: if 3 videos teach the same idea, that's ONE multi_video canon node, not three.
- pageWorthinessScore >= 70 means "could anchor a hub page on its own."
- Drop generic ideas. The creator's named concepts (creatorTerminology in the channel profile) trump your paraphrases.
- Visual references are context enrichment, not evidence; transcript segments remain the citation backbone.

When done, one-line summary. Stop.`;
```

- [ ] **Step 2: Update canon_architect.allowedTools**

Replace the `canon_architect` block in `specialists/index.ts`:

```typescript
  canon_architect: {
    agent: 'canon_architect',
    systemPrompt: CANON_ARCHITECT_PROMPT,
    // VICs + visual moments + channel profile pre-loaded. Keep getSegment
    // for occasional verification.
    allowedTools: [
      'getSegment',
      'proposeCanonNode',
    ],
    stopOverrides: { maxCalls: 100, maxCostCents: 500 },
  },
```

- [ ] **Step 3: Pre-load context in canon.ts**

Open `packages/pipeline/src/stages/canon.ts`. Add imports:

```typescript
import { channelProfile, visualMoment } from '@creatorcanon/db/schema';
```

Replace the body around the `runAgent` call:

```typescript
  // Pre-load every read the agent would otherwise make.
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, input.runId))
    .limit(1);
  const channelProfilePayload = cpRows[0]?.payload ?? null;
  if (!channelProfilePayload) {
    throw new Error('canon stage requires channel_profile to have run first');
  }

  const vicRows = await db
    .select()
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, input.runId));
  if (vicRows.length === 0) {
    throw new Error('canon stage cannot run: no video_intelligence_card rows in this run');
  }

  const vmRows = await db
    .select({
      visualMomentId: visualMoment.id,
      videoId: visualMoment.videoId,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
      hubUse: visualMoment.hubUse,
      usefulnessScore: visualMoment.usefulnessScore,
    })
    .from(visualMoment)
    .where(eq(visualMoment.runId, input.runId));

  const cfg = SPECIALISTS.canon_architect;
  const model = selectModel('canon_architect', process.env);
  const provider = makeProvider(model.provider);
  const fallbacks = buildFallbacks(model, makeProvider);

  const userMessage =
    `# CHANNEL PROFILE\n${JSON.stringify(channelProfilePayload, null, 2)}\n\n` +
    `# VIDEO INTELLIGENCE CARDS (${vicRows.length})\n` +
    vicRows.map((v) => {
      return `## VIC ${v.id} (videoId=${v.videoId})\n` +
        `evidenceSegmentIds: ${JSON.stringify(v.evidenceSegmentIds)}\n` +
        `payload: ${JSON.stringify(v.payload)}`;
    }).join('\n\n') +
    `\n\n# VISUAL MOMENTS (${vmRows.length})\n` +
    (vmRows.length > 0
      ? vmRows.map((v) => `[${v.visualMomentId}] videoId=${v.videoId} @${v.timestampMs}ms ${v.type} (score=${v.usefulnessScore}): ${v.description}`).join('\n')
      : '(none)') +
    `\n\nSynthesize the canon. Make a proposeCanonNode call for each curated node. End with a one-line summary.`;

  try {
    const summary = await runAgent({
      runId: input.runId,
      workspaceId: input.workspaceId,
      agent: cfg.agent,
      modelId: model.modelId,
      provider,
      fallbacks,
      r2,
      tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt,
      userMessage,
      caps: cfg.stopOverrides,
    });
    const finalNodes = await db
      .select({ id: canonNode.id })
      .from(canonNode)
      .where(eq(canonNode.runId, input.runId));
    if (finalNodes.length === 0) {
      throw new Error('canon stage produced 0 canon_node rows; agent likely hit a quota or schema-validation error');
    }
    return { ok: true, nodeCount: finalNodes.length, costCents: summary.costCents, summary };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
```

(The earlier `cards.length === 0` check is now redundant — `vicRows.length === 0` does the same job — remove the older `const cards = ...` block + the `if (cards.length === 0) throw...` block since both are replaced by the new `vicRows` block.)

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/stages/canon.ts packages/pipeline/src/agents/specialists/prompts.ts packages/pipeline/src/agents/specialists/index.ts
git commit -m "perf(canon): pre-load every VIC payload + visual moments into the user message

canon_architect no longer needs listVideoIntelligenceCards / getVideoIntelligenceCard /
listVisualMoments / getVisualMoment — the entire canonical input set is in the
opening user message. Cuts per-run LLM calls from ~25 (5 list + 20 get + reasoning)
to ~10 (one big read + ~60 propose calls + reasoning). Tightened allowedTools to
[getSegment, proposeCanonNode] and stop caps to maxCalls=100, maxCostCents=500."
```

---

### Task 4: Pre-load context in page-briefs stage + update prompt + tighten allowedTools

**Files:**
- Modify: `packages/pipeline/src/stages/page-briefs.ts`
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts` (replace PAGE_BRIEF_PLANNER_PROMPT)
- Modify: `packages/pipeline/src/agents/specialists/index.ts`

- [ ] **Step 1: Replace PAGE_BRIEF_PLANNER_PROMPT**

```typescript
export const PAGE_BRIEF_PLANNER_PROMPT = `You are page_brief_planner. You design the hub's page outline by selecting and grouping canon nodes into briefs that page_writer will compose.

The user message contains: the channel profile, every page-worthy canon node (filtered to pageWorthinessScore >= 60) with full payload, and the run's visual moments. You do NOT need to call read tools.

Process:
For each planned page, call proposePageBrief once with this payload shape:
  {
    "pageTitle": string,
    "pageType": "topic" | "framework" | "lesson" | "playbook" | "example_collection" | "definition" | "principle",
    "audienceQuestion": string,
    "outline": Array<{ "sectionTitle": string, "canonNodeIds": string[], "intent": string }>,
    "openingHook": string,
    "recommendedVisualMomentIds"?: string[]
  }
And the tool args:
  - primaryCanonNodeIds: 1-20 IDs that are the page's spine
  - supportingCanonNodeIds: 0-50 cross-reference IDs
  - pageWorthinessScore: page-level (median of primary nodes)
  - position: 0-based ordering hint

Rules:
- Aim for 8-15 briefs total per run. Pages must be earned.
- Every primary node must come from the canon list shown to you.
- Most lesson pages won't need visual moments. Recommend visuals only when the page is about a tool/dashboard/workflow/code/diagram/physical-technique demonstration.
- recommendedVisualMomentIds (if set) must be IDs from the visual-moments list shown to you.

When done, one-line summary. Stop.`;
```

- [ ] **Step 2: Update page_brief_planner.allowedTools**

```typescript
  page_brief_planner: {
    agent: 'page_brief_planner',
    systemPrompt: PAGE_BRIEF_PLANNER_PROMPT,
    allowedTools: [
      'getSegment',
      'proposePageBrief',
    ],
    stopOverrides: { maxCalls: 30, maxCostCents: 100 },
  },
```

- [ ] **Step 3: Pre-load in page-briefs.ts**

Open `packages/pipeline/src/stages/page-briefs.ts`. Add import:

```typescript
import { channelProfile, visualMoment } from '@creatorcanon/db/schema';
import { gte } from '@creatorcanon/db';
```

Replace the body before the `runAgent` call:

```typescript
  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, input.runId))
    .limit(1);
  const channelProfilePayload = cpRows[0]?.payload ?? null;
  if (!channelProfilePayload) {
    throw new Error('page-briefs stage requires channel_profile to have run first');
  }

  // Only page-worthy canon nodes (>=60). Drop the rest from the prompt to
  // keep token consumption low.
  const nodes = await db
    .select()
    .from(canonNode)
    .where(and(eq(canonNode.runId, input.runId), gte(canonNode.pageWorthinessScore, 60)));

  if (nodes.length === 0) {
    throw new Error('page-briefs stage cannot run: no canon_node rows with pageWorthinessScore >= 60 in this run');
  }

  const vmRows = await db
    .select({
      visualMomentId: visualMoment.id,
      videoId: visualMoment.videoId,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
      hubUse: visualMoment.hubUse,
      usefulnessScore: visualMoment.usefulnessScore,
    })
    .from(visualMoment)
    .where(and(eq(visualMoment.runId, input.runId), gte(visualMoment.usefulnessScore, 60)));

  const cfg = SPECIALISTS.page_brief_planner;
  const model = selectModel('page_brief_planner', process.env);
  const provider = makeProvider(model.provider);
  const fallbacks = buildFallbacks(model, makeProvider);

  const frameworkCount = nodes.filter((n) => n.type === 'framework').length;
  const lessonCount = nodes.filter((n) => n.type === 'lesson').length;
  const playbookCount = nodes.filter((n) => n.type === 'playbook').length;

  const userMessage =
    `# CHANNEL PROFILE\n${JSON.stringify(channelProfilePayload, null, 2)}\n\n` +
    `# PAGE-WORTHY CANON NODES (${nodes.length} of which ${frameworkCount} frameworks, ${lessonCount} lessons, ${playbookCount} playbooks)\n` +
    nodes.map((n) => {
      return `## ${n.id} (type=${n.type}, pageWorthiness=${n.pageWorthinessScore}, sources=${n.sourceVideoIds.length}, origin=${n.origin})\n` +
        `payload: ${JSON.stringify(n.payload)}`;
    }).join('\n\n') +
    `\n\n# VISUAL MOMENTS (${vmRows.length})\n` +
    (vmRows.length > 0
      ? vmRows.map((v) => `[${v.visualMomentId}] videoId=${v.videoId} @${v.timestampMs}ms ${v.type}: ${v.description}`).join('\n')
      : '(none)') +
    `\n\nPick 8-15 page-worthy anchors. Make a proposePageBrief call per page. End with a one-line summary.`;

  try {
    const summary = await runAgent({
      runId: input.runId,
      workspaceId: input.workspaceId,
      agent: cfg.agent,
      modelId: model.modelId,
      provider,
      fallbacks,
      r2,
      tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt,
      userMessage,
      caps: cfg.stopOverrides,
    });
    const finalBriefs = await db
      .select({ id: pageBrief.id })
      .from(pageBrief)
      .where(eq(pageBrief.runId, input.runId));
    if (finalBriefs.length === 0) {
      throw new Error('page-briefs stage produced 0 page_brief rows; agent likely hit a quota or schema-validation error');
    }
    return { ok: true, briefCount: finalBriefs.length, costCents: summary.costCents, summary };
  } catch (err) {
    throw err instanceof Error ? err : new Error(String(err));
  }
}
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/stages/page-briefs.ts packages/pipeline/src/agents/specialists/prompts.ts packages/pipeline/src/agents/specialists/index.ts
git commit -m "perf(page-briefs): pre-load page-worthy canon + visual moments

Filter canon nodes to pageWorthinessScore>=60 once at the stage level rather
than letting the agent paginate. Drop list/get read tools — only getSegment
+ proposePageBrief remain. Tightened stop caps to maxCalls=30, maxCostCents=100."
```

---

## Phase C — Defense + caching

### Task 5: Tighten stop caps for cost-control safety

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/index.ts`

- [ ] **Step 1: Update `channel_profiler` and `page_writer` stop caps**

(Tasks 2-4 already updated `video_analyst`, `canon_architect`, `page_brief_planner`. This step finishes the remaining two.)

Replace `channel_profiler` and `page_writer` blocks:

```typescript
  channel_profiler: {
    agent: 'channel_profiler',
    systemPrompt: CHANNEL_PROFILER_PROMPT,
    allowedTools: ['listVideos', 'getSegmentedTranscript', 'getFullTranscript', 'proposeChannelProfile'],
    // Single sample-and-emit; agents that exhaust this cap have gone off the rails.
    stopOverrides: { maxCalls: 12, maxCostCents: 80 },
  },
```

```typescript
  page_writer: {
    agent: 'page_writer',
    systemPrompt: PAGE_WRITER_PROMPT,
    allowedTools: [],
    // Writer is single-shot JSON. maxCalls=2 = 1 attempt + 1 retry margin.
    stopOverrides: { maxCalls: 2, maxCostCents: 50 },
  },
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../.. && git add packages/pipeline/src/agents/specialists/index.ts
git commit -m "perf(specialists): tighten channel_profiler + page_writer stop caps

Realistic 3x headroom over expected behavior:
- channel_profiler: 12 calls / 80c (was 30 / 200)
- page_writer: 2 calls / 50c (was 2 / 200)

Worst-case ceiling per 5h hub falls from ~\$160 to ~\$25 without
touching normal-run cost."
```

---

### Task 6: Wire OpenAI cached-input pricing into cost-tracking

**Files:**
- Modify: `packages/pipeline/src/agents/cost-tracking.ts`
- Modify: `packages/pipeline/src/agents/providers/index.ts` (extend usage shape)
- Modify: `packages/pipeline/src/agents/providers/openai.ts` (surface `cached_tokens` from API)
- Modify: `packages/pipeline/src/agents/harness.ts` (pass cachedInputTokens through)
- Create: `packages/pipeline/src/agents/test/cost-tracking.test.ts`

OpenAI cached input is automatically billed at 50% of standard input. The OpenAI Chat Completions API returns `usage.prompt_tokens_details.cached_tokens` on every response. We just need to read it and bill cached vs fresh accordingly. No active cache management is required — caching is automatic when the prefix is identical.

- [ ] **Step 1: Write failing test for cached-token pricing**

```typescript
// packages/pipeline/src/agents/test/cost-tracking.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tokenCostCents } from '../cost-tracking';

describe('tokenCostCents — cached input', () => {
  it('gpt-5.5: 1M cached input is half of 1M fresh', () => {
    const fresh = tokenCostCents('gpt-5.5', 1_000_000, 0);
    const cached = tokenCostCents('gpt-5.5', 0, 0, 1_000_000);
    assert.equal(fresh, 250);
    assert.equal(cached, 125);
  });

  it('gpt-5.5: split inputs add up correctly', () => {
    // 500K fresh + 500K cached + 100K output
    const c = tokenCostCents('gpt-5.5', 500_000, 100_000, 500_000);
    // fresh: 500K * 250 / 1M = 125
    // cached: 500K * 125 / 1M = 62.5
    // output: 100K * 1000 / 1M = 100
    // total: 287.5
    assert.equal(c, 287.5);
  });

  it('gemini-2.5-flash: cached at 25% of fresh', () => {
    const fresh = tokenCostCents('gemini-2.5-flash', 1_000_000, 0);
    const cached = tokenCostCents('gemini-2.5-flash', 0, 0, 1_000_000);
    assert.equal(fresh, 7.5);
    assert.equal(cached, 7.5 * 0.25);
  });

  it('unknown model: returns 0', () => {
    assert.equal(tokenCostCents('made-up-model', 1000, 1000, 500), 0);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/test/cost-tracking.test.ts 2>&1 | tail -15
```

Expected: FAIL — `tokenCostCents` currently takes 3 args, not 4; cached-token logic isn't implemented.

- [ ] **Step 3: Update cost-tracking.ts**

Replace `packages/pipeline/src/agents/cost-tracking.ts` with:

```typescript
/**
 * Per-1M-token prices in USD cents.
 *
 * Reading: tokenCostCents(modelId, inputTokens, outputTokens, cachedInputTokens?)
 * Returns USD cents (fractional). cachedInputTokens are billed at the
 * provider's discounted rate:
 *   - OpenAI: 50% of fresh input
 *   - Gemini: 25% of fresh input
 */

interface ProviderPricing {
  in: number;
  out: number;
  /** Fraction of `in` charged for cached tokens. OpenAI=0.5, Gemini=0.25. */
  cachedInputDiscount: number;
}

const PRICES: Record<string, ProviderPricing> = {
  'gpt-5.5':           { in: 250,  out: 1000, cachedInputDiscount: 0.5  },
  'gpt-5.4':           { in: 30,   out: 120,  cachedInputDiscount: 0.5  },
  'gemini-2.5-flash':  { in: 7.5,  out: 30,   cachedInputDiscount: 0.25 },
  'gemini-2.5-pro':    { in: 125,  out: 500,  cachedInputDiscount: 0.25 },
};

/**
 * Compute the cost of a single provider call. cachedInputTokens (if > 0) are
 * billed at the discounted rate; the remaining (inputTokens - cachedInputTokens)
 * are billed at full rate. Pass cachedInputTokens=0 (or omit) for non-cached calls.
 */
export function tokenCostCents(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  const p = PRICES[modelId];
  if (!p) return 0;
  const freshInput = Math.max(0, inputTokens - cachedInputTokens);
  return (
    (freshInput / 1_000_000) * p.in +
    (cachedInputTokens / 1_000_000) * p.in * p.cachedInputDiscount +
    (outputTokens / 1_000_000) * p.out
  );
}
```

Wait — the test calls `tokenCostCents('gpt-5.5', 0, 0, 1_000_000)`. With `inputTokens=0` and `cachedInputTokens=1_000_000`, `freshInput = max(0, 0 - 1M) = 0`. That's correct. The test expects 125 cents and the formula gives `0 + (1M/1M) * 250 * 0.5 + 0 = 125`. ✓

- [ ] **Step 4: Extend usage shape in providers/index.ts**

Open `packages/pipeline/src/agents/providers/index.ts` and update the `ChatResponse.usage` type:

```typescript
export interface ChatResponse {
  message: ChatTurn;
  toolCalls: ToolCallRequest[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    /** Subset of inputTokens that hit the provider's prompt cache. 0 if not cached. */
    cachedInputTokens?: number;
  };
  rawId: string;
}
```

- [ ] **Step 5: Surface OpenAI cached_tokens**

Open `packages/pipeline/src/agents/providers/openai.ts`. Find the response-construction block (where `usage` is built from the API response). Update it to include cached tokens:

```typescript
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
          cachedInputTokens:
            (completion.usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
              ?.prompt_tokens_details?.cached_tokens ?? 0,
        },
```

(The exact location depends on the existing file — search for `inputTokens:` to find the construction site.)

- [ ] **Step 6: Pipe cachedInputTokens into harness cost calc**

Open `packages/pipeline/src/agents/harness.ts`. Find the `tokenCostCents` call (the line that reads `const callCost = tokenCostCents(...)`). Update it:

```typescript
    const callCost = tokenCostCents(
      input.modelId,
      response.usage.inputTokens,
      response.usage.outputTokens,
      response.usage.cachedInputTokens ?? 0,
    );
```

- [ ] **Step 7: Run all tests, verify they pass**

```bash
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test "src/agents/test/cost-tracking.test.ts" "src/agents/providers/test/selectModel.test.ts" "src/agents/providers/test/selectModel.modes.test.ts" "src/agents/providers/test/selectModel.quality.test.ts" 2>&1 | tail -10
```

Expected: 4 cost-tracking tests + 4 selectModel + 8 modes + 8 quality = 24 PASS.

- [ ] **Step 8: Commit**

```bash
cd ../.. && git add packages/pipeline/src/agents/cost-tracking.ts packages/pipeline/src/agents/providers/index.ts packages/pipeline/src/agents/providers/openai.ts packages/pipeline/src/agents/harness.ts packages/pipeline/src/agents/test/cost-tracking.test.ts
git commit -m "feat(cost-tracking): account for cached input tokens at provider-discounted rate

OpenAI returns usage.prompt_tokens_details.cached_tokens on every response;
cached tokens are billed at 50% of fresh input. Gemini cached tokens (when
context caching is enabled — see Task 7) are billed at 25%.

tokenCostCents() gains an optional cachedInputTokens param. The provider's
ChatResponse.usage now exposes cachedInputTokens. The OpenAI provider passes
it through automatically. The harness pipes it into the cost calculation per
call. With pre-loaded context, multi-turn agents see ~50-70% of their input
tokens hit the cache after the first turn — the cost-tracking now reflects
that saving accurately instead of charging every turn at full rate."
```

---

### Task 7: Wire Gemini context caching for the heaviest stages

Gemini context caching requires explicit cache creation: you POST the static prefix to the API once, get a `cachedContent.name` back, then attach it to subsequent generateContent calls. The cache has a TTL (default 1h).

**Files:**
- Modify: `packages/pipeline/src/agents/providers/gemini.ts`
- Modify: `packages/pipeline/src/stages/video-intelligence.ts` (create cache once, reuse across 20 video calls)
- Modify: `packages/pipeline/src/stages/canon.ts` (no caching — single agent run)

Note: canon and page_briefs are single-agent runs, so context caching has no benefit (the prefix is only sent once). Only video_intelligence's fan-out × 20 benefits — every video shares the same channel-profile prefix.

- [ ] **Step 1: Add cachedContent helper to Gemini provider**

Open `packages/pipeline/src/agents/providers/gemini.ts`. Add a helper at the top (after the imports):

```typescript
/**
 * Create a Gemini context cache with the given system prompt + first user
 * message. Returns the cache name (e.g. "cachedContents/abc123") which can
 * be passed back to subsequent generateContent calls. Cache lives for ttlSeconds.
 *
 * Use case: video_intelligence sends the same channel-profile prefix to 20
 * separate per-video calls. Caching the prefix once cuts input cost for the
 * cached portion to 25% of fresh.
 */
export async function createGeminiCache(input: {
  apiKey: string;
  modelId: string;
  systemInstruction: string;
  cachedUserMessage: string;
  ttlSeconds?: number;
}): Promise<{ cacheName: string }> {
  if (!input.apiKey) throw new Error('createGeminiCache: apiKey required');
  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${input.apiKey}`;
  const body = {
    model: `models/${input.modelId}`,
    systemInstruction: { role: 'system', parts: [{ text: input.systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: input.cachedUserMessage }] }],
    ttl: `${input.ttlSeconds ?? 3600}s`,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createGeminiCache failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { name?: string };
  if (!json.name) throw new Error(`createGeminiCache returned no name`);
  return { cacheName: json.name };
}
```

- [ ] **Step 2: Update Gemini provider to attach cache when given**

Add `cachedContent?: string` to the `chat` input shape (extend `AgentProvider.chat` signature):

In `packages/pipeline/src/agents/providers/index.ts`:

```typescript
export interface AgentProvider {
  name: ProviderName;
  chat(input: {
    modelId: string;
    messages: ChatTurn[];
    tools: ToolDef<any, any>[];
    /** Gemini context cache name (e.g. "cachedContents/abc123") — optional. */
    cachedContent?: string;
  }): Promise<ChatResponse>;
}
```

In `packages/pipeline/src/agents/providers/gemini.ts`, update the `chat` body to attach cache:

```typescript
    async chat({ modelId, messages, tools, cachedContent }) {
      const model = client.getGenerativeModel({ model: modelId });
      // ... existing functionDeclarations + mapTurnsToGemini ...
      const request: GenerateContentRequest = {
        contents,
        ...(systemInstruction ? { systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] } } : {}),
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
        ...(cachedContent ? { cachedContent } : {}),
      };
      // ... rest unchanged ...
```

In the response, surface cached tokens via `usageMetadata.cachedContentTokenCount`:

```typescript
      return {
        message: { role: 'assistant', content: textContent, toolCalls },
        toolCalls,
        usage: {
          inputTokens: result.response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
          cachedInputTokens: result.response.usageMetadata?.cachedContentTokenCount ?? 0,
        },
        rawId: `gemini_${Date.now()}`,
      } satisfies ChatResponse;
    },
```

- [ ] **Step 3: Update OpenAI provider to forward cachedContent (no-op)**

OpenAI doesn't take an explicit cache name (caching is automatic on prefix match). Just ignore the field gracefully so the new shape compiles:

In `packages/pipeline/src/agents/providers/openai.ts`, the `chat` signature accepts `cachedContent` but ignores it (TypeScript will accept the parameter without action).

- [ ] **Step 4: Wire video_intelligence to create + reuse cache**

Open `packages/pipeline/src/stages/video-intelligence.ts`. In the runVideoIntelligenceStage body — AFTER loading channelProfilePayload but BEFORE the `runWithConcurrency` call — add cache creation:

```typescript
  // For Gemini providers + a long shared prefix (channel profile), pre-create
  // a context cache so the 20 per-video calls share one cached prefix.
  // Skipped for non-Gemini providers (OpenAI caches automatically).
  let cachedContent: string | undefined;
  if (model.provider === 'gemini') {
    try {
      const cachedPrefix =
        `# CHANNEL PROFILE\n${JSON.stringify(channelProfilePayload, null, 2)}\n\n` +
        `# INSTRUCTIONS PRE-CONTEXT\n` +
        `Each user message that follows contains one video's transcript and visual moments. ` +
        `Make exactly one proposeVideoIntelligenceCard call per video.`;
      const { cacheName } = await createGeminiCache({
        apiKey: env.GEMINI_API_KEY ?? '',
        modelId: model.modelId,
        systemInstruction: cfg.systemPrompt,
        cachedUserMessage: cachedPrefix,
        ttlSeconds: 3600,
      });
      cachedContent = cacheName;
      // eslint-disable-next-line no-console
      console.info(`[video-intelligence] gemini cache created: ${cacheName}`);
    } catch (err) {
      // Non-fatal — fall back to non-cached calls.
      // eslint-disable-next-line no-console
      console.warn(`[video-intelligence] gemini cache create failed, falling back: ${(err as Error).message}`);
    }
  }
```

Add the import:

```typescript
import { createGeminiCache } from '../agents/providers/gemini';
```

Then update the runAgent call inside `runWithConcurrency` to forward `cachedContent`. **However, runAgent doesn't currently accept cachedContent** — we need to extend its input shape too. In `packages/pipeline/src/agents/harness.ts`, add to RunAgentInput:

```typescript
  /** Gemini context cache name; passed through to provider.chat. */
  cachedContent?: string;
```

And pipe it through where harness calls `provider.chat`:

```typescript
    const response = await chatWithFallbackChain(
      input.agent,
      input.modelId,
      input.provider,
      input.fallbacks ?? [],
      (modelId, provider) => provider.chat({ modelId, messages, tools, cachedContent: input.cachedContent }),
    );
```

Then in the per-video block of video-intelligence.ts, pass `cachedContent`:

```typescript
      const summary = await runAgent({
        runId: input.runId,
        workspaceId: input.workspaceId,
        agent: cfg.agent,
        modelId: model.modelId,
        provider,
        fallbacks,
        cachedContent,
        r2,
        tools: cfg.allowedTools,
        systemPrompt: cfg.systemPrompt,
        userMessage,
        caps: cfg.stopOverrides,
      });
```

NOTE: when cachedContent is present, the userMessage no longer needs the channel-profile prefix (it's in the cache). Update the per-video userMessage to drop that section:

```typescript
    const userMessage =
      `# VIDEO ${videoId} — TRANSCRIPT (${segs.length} segments)\n` +
      segs.map((s) => `[${s.segmentId}] ${s.startMs}ms-${s.endMs}ms: ${s.text}`).join('\n') +
      `\n\n# VISUAL MOMENTS for ${videoId} (${vms.length})\n` +
      (vms.length > 0
        ? vms.map((v) => `[${v.visualMomentId}] @${v.timestampMs}ms ${v.type} (score=${v.usefulnessScore}): ${v.description} — hubUse: ${v.hubUse}`).join('\n')
        : '(none)') +
      `\n\nProduce one proposeVideoIntelligenceCard call for video ${videoId}.`;
```

(The cache holds CHANNEL PROFILE + framing instructions; each per-video message adds only the video's transcript + visuals.)

- [ ] **Step 5: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd ../.. && git add packages/pipeline/src/agents/providers/gemini.ts packages/pipeline/src/agents/providers/openai.ts packages/pipeline/src/agents/providers/index.ts packages/pipeline/src/agents/harness.ts packages/pipeline/src/stages/video-intelligence.ts
git commit -m "feat(gemini): context caching for video_intelligence fan-out

Pre-create a Gemini context cache with the channel profile + system prompt
once at the start of video_intelligence, reuse it across all 20 per-video
calls. Cache TTL 1h, well within a single run's wall time. Cached tokens
bill at 25% of fresh per Gemini's published pricing.

The per-video user message now contains only the video-specific transcript
+ visual moments — the channel profile lives in the cache.

OpenAI providers ignore the cachedContent field (their caching is automatic
on prefix match — no explicit cache name needed). Cost-tracking already
honours OpenAI prompt_tokens_details.cached_tokens from Task 6.

Cache create failures fall back to non-cached calls with a warning — never
block the run."
```

---

## Phase D — Docs + verification

### Task 8: Update docs

**Files:**
- Modify: `.env.example`
- Modify: `docs/superpowers/canon-v1-runbook.md`

- [ ] **Step 1: Document PIPELINE_QUALITY_MODE in .env.example**

Open `.env.example`. Replace the existing canon block with:

```
# ---------------------------------------------------------------------------
# Canon v1 (Stage 1 deep-knowledge-extraction) — feature-flagged engine
# ---------------------------------------------------------------------------
# Default content engine. canon_v1 swaps the agentic discovery (findings_v1)
# pipeline for the deep-read engine. findings_v1 stays the default until
# canon_v1 passes side-by-side audit.
PIPELINE_CONTENT_ENGINE=findings_v1

# Quality preset — picks the right model per agent based on task character.
#   lean              — Flash everywhere except canon (Pro). ~$0.20/5h hub.
#   production_economy — Flash for extraction, Pro for video reading,
#                        gpt-5.5 only for canon synthesis. ~$1.50/5h hub.
#                        RECOMMENDED DEFAULT.
#   premium           — Every text agent on gpt-5.5. ~$6.84/5h hub.
# Override priority: PIPELINE_MODEL_<AGENT> > PIPELINE_QUALITY_MODE
#                    > PIPELINE_MODEL_MODE > registry default.
PIPELINE_QUALITY_MODE=production_economy

# Provider preference (used when PIPELINE_QUALITY_MODE is unset):
#   hybrid (default), gemini_only, openai_only.
PIPELINE_MODEL_MODE=hybrid

# visual_context controls.
PIPELINE_VISUAL_CONTEXT_ENABLED=true
PIPELINE_VISUAL_MAX_FRAMES_PER_VIDEO=12
PIPELINE_VISUAL_MIN_USEFULNESS_SCORE=60
```

- [ ] **Step 2: Update runbook**

Open `docs/superpowers/canon-v1-runbook.md`. After the "Engine modes" section, insert a new "Quality modes" section:

```markdown
## Quality modes

`PIPELINE_QUALITY_MODE` picks the right model per canon_v1 agent based on the cost-quality tradeoff for that agent's task character. Set it once; you almost never need to override individual agents.

| Mode | Cost / 5h hub | Quality | When to use |
|---|---|---|---|
| `lean` | ~$0.20 | Adequate; canon synthesis softer | Free tier, validation runs |
| `production_economy` (default) | ~$1.50 | Equal or better than `premium` | Paid tier baseline |
| `premium` | ~$6.84 | Maximum | When users pay >$50/hub |

Per-agent assignments:

| Agent | lean | production_economy | premium |
|---|---|---|---|
| visual_frame_analyst | flash | flash | flash |
| channel_profiler | flash | flash | gpt-5.5 |
| video_analyst | flash | **pro** | gpt-5.5 |
| canon_architect | pro | **gpt-5.5** | gpt-5.5 |
| page_brief_planner | flash | flash | gpt-5.5 |
| page_writer | flash | flash | gpt-5.5 |

Why `production_economy` is the recommended default: canon synthesis is the highest-leverage judgment (it determines what the hub is _about_), so it stays on the most capable model. Everything else is constrained extraction or structural planning, where Gemini Flash and Pro give equal-or-better results at a fraction of the cost.

Override one agent without changing the mode:
```
PIPELINE_QUALITY_MODE=production_economy
PIPELINE_MODEL_VIDEO_ANALYST=gpt-5.5    # bump video_analyst back to premium
```
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/superpowers/canon-v1-runbook.md
git commit -m "docs(canon): document PIPELINE_QUALITY_MODE in env + runbook

Three named profiles:
- lean (~\$0.20/hub) — Flash everywhere except canon (Pro)
- production_economy (~\$1.50/hub, recommended) — Flash for extraction, Pro
  for video reading, gpt-5.5 only for canon synthesis
- premium (~\$6.84/hub) — every text agent on gpt-5.5

Resolution priority documented: PIPELINE_MODEL_<AGENT> > PIPELINE_QUALITY_MODE
> PIPELINE_MODEL_MODE > registry default."
```

---

### Task 9: End-to-end verification when quotas recover

This task isn't code — it's the smoke verification you run after Task 1-8 ship and your API quotas reset.

- [ ] **Step 1: Reset the existing canon_v1 run from VIC onward**

```bash
cd packages/pipeline
./node_modules/.bin/tsx ./src/reset-canon-run-from-vic.ts 97e8772c-07e3-4408-ba40-0a17450f33cf
```

Expected: 6 stage_run rows + downstream tables cleared. Run status -> 'queued'.

- [ ] **Step 2: Re-dispatch with `production_economy` mode**

```bash
PIPELINE_QUALITY_MODE=production_economy ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tee /tmp/canon-economy.log
```

Expected: All 7 canon stages succeed. `pageCount > 0`. The dispatcher's final summary line shows the new lower per-stage cost.

- [ ] **Step 3: Verify hard-pass criteria**

```bash
cd packages/db && cp ../../scripts/verify-canon-run.mjs ./_v.mjs && node ./_v.mjs 97e8772c-07e3-4408-ba40-0a17450f33cf && rm _v.mjs
```

Expected: exit 0 (all hard-pass criteria met). pageCount in [4, 12], readerProblem 100%, etc.

- [ ] **Step 4: Verify cost target**

```bash
cd packages/db && node -e "
const fs = require('node:fs');
for (const f of ['../../.env']) { try { for (const l of fs.readFileSync(f, 'utf8').split(/\r?\n/)) { const t = l.trim(); if (!t || t.startsWith('#')) continue; const i = t.indexOf('='); if (i<=0) continue; const k = t.slice(0,i).trim(); if (process.env[k] !== undefined) continue; let v = t.slice(i+1).trim(); if ((v.startsWith('\"') && v.endsWith('\"')) || (v.startsWith(\"'\") && v.endsWith(\"'\"))) v = v.slice(1,-1); process.env[k] = v; } } catch{} }
const sql = require('postgres')(process.env.DATABASE_URL);
(async () => {
  const r = await sql\`SELECT stage_name, output_json FROM generation_stage_run WHERE run_id = '97e8772c-07e3-4408-ba40-0a17450f33cf' AND stage_name IN ('channel_profile','video_intelligence','canon','page_briefs','page_composition') ORDER BY started_at\`;
  let total = 0;
  for (const row of r) {
    const c = (row.output_json && row.output_json.costCents) ?? 0;
    total += c;
    console.log(\`\${row.stage_name.padEnd(20)} \${c.toFixed(4)}c\`);
  }
  console.log(\`TOTAL                \${total.toFixed(4)}c (\\\$\${(total/100).toFixed(2)})\`);
  await sql.end();
})();
"
```

Expected: Total < 200 cents ($2.00). Target is ~$1.50.

- [ ] **Step 5: If cost is on target, mark redesign complete**

```bash
git tag canon-v1-cost-redesign-shipped
git push origin canon-v1-cost-redesign-shipped
```

If cost is significantly above $2.00 (>$3.00), open a follow-up plan to investigate which stage exceeded its target.

---

## Self-Review checklist

**Spec coverage:**
- ✅ Lever 1 (right-size models per agent) → Task 1 (PIPELINE_QUALITY_MODE preset)
- ✅ Lever 2 (pre-load context for video_intelligence) → Task 2
- ✅ Lever 2 extension (canon, page_briefs) → Tasks 3, 4
- ✅ Lever 3 (prompt caching) → Tasks 6 (OpenAI auto), 7 (Gemini explicit cache)
- ✅ Lever 4 (tighter stop caps) → embedded in Tasks 2-4 + Task 5

**Placeholder scan:** No "TBD", "fill in later", "implement later". Every code block is complete and copy-pasteable.

**Type consistency:** `tokenCostCents` extended from 3 to 4 args (Task 6); all call sites updated in Task 6 step 6. `ChatResponse.usage.cachedInputTokens` defined in Task 6 step 4, populated in Task 6 step 5 (OpenAI) + Task 7 step 2 (Gemini). `AgentProvider.chat` gains optional `cachedContent` in Task 7 step 2; passed through `RunAgentInput` (Task 7 step 4) and `chatWithFallbackChain` (Task 7 step 4). All type chains check out.

**Cross-task ordering:** Task 6 must land before Task 7 because Task 7 relies on the `cachedInputTokens` field added in Task 6. Task 1 must land before any other task because the model assignment changes the cost target.

---

## Cost target summary

| Mode | Today | After Tasks 1-2 | After Tasks 1-7 |
|---|---|---|---|
| premium | $6.84 | $6.84 (same models) | $4.50 (caching saves ~30%) |
| production_economy | n/a | ~$2.20 | ~$1.50 |
| lean | n/a | ~$0.30 | ~$0.20 |
