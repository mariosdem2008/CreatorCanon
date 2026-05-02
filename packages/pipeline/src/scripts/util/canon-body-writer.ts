/**
 * Canon body writer (Phase 5 / Task 5.9).
 *
 * Takes a canon shell + woven per-video intel + segment texts + voice
 * fingerprint and produces a 400-1500 word first-person body.
 *
 * The body writer is THE most important prompt in the v2 pipeline. It
 * decides whether the audit-as-hub-source goal succeeds. The prompt
 * encodes:
 *   1. Voice flip at extraction time (first-person; NEVER 'the creator says')
 *   2. Citation density (8-15 [<segmentId>] inline tokens per body)
 *   3. Per-video intel weaving (woven examples/stories/mistakes appear
 *      in body by reference, not just summary)
 *   4. Voice fingerprint (preserveTerms verbatim, tonePreset cadence,
 *      profanityAllowed respected)
 *   5. Archetype HUB_SOURCE_VOICE section spliced in
 *
 * Independent per canon → parallelized with bounded concurrency.
 */

import fs from 'node:fs';
import path from 'node:path';

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { type ArchetypeSlug } from '../../agents/skills/archetype-detector';
import { SKILL_ROOT_PATH } from '../../agents/skills/skill-loader';
import { type VoiceMode, voiceRulesPrompt } from './voice-mode';
import { countCitations, citationFloor } from './citation-density';
import { type VoiceFingerprintScore } from './voice-fingerprint-score';

const ARCHETYPE_DIR = path.join(SKILL_ROOT_PATH, 'creator-archetypes');

export interface VoiceFingerprint {
  profanityAllowed: boolean;
  tonePreset: string;        // canonical: blunt-tactical | analytical-detached | warm-coaching | reflective-thoughtful
  preserveTerms: string[];
}

export interface SegmentRef {
  /** UUID, used as the [<segmentId>] inline citation token. */
  segmentId: string;
  /** Display timestamp like "12:34". */
  timestamp: string;
  text: string;
}

export interface WovenItem {
  /** Per-video intel ID, e.g. ex_xxx, st_xxx, mst_xxx, take_xxx. */
  id: string;
  text: string;
  /** For mistakes specifically: the correction line. */
  correction?: string;
  /** For mistakes: the why. */
  why?: string;
}

export interface CanonBodyInput {
  /** Canon node identity. */
  id: string;
  title: string;
  type: string;
  internal_summary: string;

  /** Source material: transcript segments the body cites. */
  segments: SegmentRef[];

  /** Source material: woven per-video items (selected by Task 5.8 weaver). */
  woven: {
    examples: WovenItem[];
    stories: WovenItem[];
    mistakes: WovenItem[];
    contrarian_takes: WovenItem[];
  };

  /** Voice. */
  creatorName: string;
  voiceMode?: VoiceMode;
  archetype: ArchetypeSlug;
  voiceFingerprint: VoiceFingerprint;

  /** Channel context. */
  channelDominantTone?: string;
  channelAudience?: string;
}

export interface CanonBodyResult {
  body: string;
  /** IDs Codex actually cited in the body — extracted via UUID regex. */
  cited_segment_ids: string[];
  /** Woven IDs Codex confirmed as used (echo). Useful for audit trail. */
  used_example_ids: string[];
  used_story_ids: string[];
  used_mistake_ids: string[];
  used_contrarian_take_ids: string[];
  _degraded?: 'low_citation_density' | 'voice_drift';
  _voice_fingerprint?: Pick<VoiceFingerprintScore, 'similarity' | 'threshold' | 'status'>;
}

export type VoiceFingerprintEvaluator = (args: {
  input: CanonBodyInput;
  result: CanonBodyResult;
}) => Promise<VoiceFingerprintScore>;

export interface CanonBodyWriteOptions {
  timeoutMs?: number;
  voiceRetryGuidance?: string;
  voiceFingerprintEvaluator?: VoiceFingerprintEvaluator;
}

type CanonBodyWriteError = Error & {
  partialResult?: CanonBodyResult;
  voiceRetryGuidance?: string;
};

const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

/** Codex sometimes refuses to write a canon body when its source section is
 *  empty (e.g., Stage 4 weaver assembled woven items but no segment UUIDs).
 *  Its refusal text lands in `parsed.body` and gets persisted. We detect this
 *  via a combination of refusal-pattern matching and an under-length guard.
 *
 *  See: docs/superpowers/plans/2026-05-02-phase-8-results.md G1 finding. */
const REFUSAL_PATTERNS: RegExp[] = [
  /\bi can'?t (produce|write|generate|provide)\b/i,
  /\bi cannot (produce|write|generate|provide)\b/i,
  /the source section is empty/i,
  /no transcript segment uuids?/i,
  /no transcript segment ids? were provided/i,
];

/** Bodies under this word count are treated as suspect (likely Codex refusal
 *  output, not real prose). Combined with refusal-pattern detection. */
export const MIN_BODY_WORDS_FALLBACK = 100;

export function detectRefusalPattern(body: string | undefined | null): boolean {
  if (!body) return true;
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_BODY_WORDS_FALLBACK) return true;
  return REFUSAL_PATTERNS.some((re) => re.test(body));
}

/** Read the archetype's HUB_SOURCE_VOICE section from disk. Cached on first read. */
const archetypeCache = new Map<ArchetypeSlug, string>();
function loadArchetypeVoice(archetype: ArchetypeSlug): string {
  if (archetypeCache.has(archetype)) return archetypeCache.get(archetype)!;
  const filePath = path.join(ARCHETYPE_DIR, `${archetype}.md`);
  if (!fs.existsSync(filePath)) {
    archetypeCache.set(archetype, '');
    return '';
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  // Extract everything from `## HUB_SOURCE_VOICE` to the next `## ` heading.
  const start = raw.indexOf('## HUB_SOURCE_VOICE');
  if (start === -1) {
    archetypeCache.set(archetype, '');
    return '';
  }
  const after = raw.slice(start + '## HUB_SOURCE_VOICE'.length);
  const nextHeading = after.search(/\n## [A-Z_]+/);
  const section = nextHeading === -1 ? after : after.slice(0, nextHeading);
  archetypeCache.set(archetype, section.trim());
  return section.trim();
}

/** Format a segment ref for the prompt. The full UUID is the citation token. */
function formatSegment(s: SegmentRef): string {
  return `[${s.segmentId}] (${s.timestamp}) "${s.text.replace(/"/g, '\\"').slice(0, 600)}"`;
}

/** Format a woven item — content for body, ID hidden from inline citation duty.
 *  Internal label («ex_xxx») uses non-bracket delimiters so Codex won't be tempted
 *  to use it as a citation token. */
function formatWoven(item: WovenItem): string {
  const extra = item.correction ? `; correction: ${item.correction}` : '';
  return `- «${item.id}» "${item.text.replace(/"/g, '\\"').slice(0, 400)}"${extra}`;
}

/** Length budget in words by canon type. Longer for procedural, shorter for definitions. */
function targetWordCount(type: string): { min: number; max: number } {
  switch (type) {
    case 'framework': return { min: 700, max: 1500 };
    case 'playbook': return { min: 1000, max: 1800 };
    case 'principle': case 'topic': return { min: 500, max: 1200 };
    case 'lesson': case 'pattern': case 'tactic': return { min: 450, max: 1000 };
    case 'definition': case 'aha_moment': case 'quote': return { min: 250, max: 600 };
    case 'example': return { min: 350, max: 800 };
    default: return { min: 500, max: 1200 };
  }
}

export function buildBodyPrompt(
  input: CanonBodyInput,
  options: { voiceRetryGuidance?: string } = {},
): string {
  const { min, max } = targetWordCount(input.type);
  const archetypeVoice = loadArchetypeVoice(input.archetype);

  const lines: string[] = [];
  lines.push(`You are ${input.creatorName}, writing a chapter of your knowledge hub on "${input.title}".`);
  lines.push('');
  lines.push(`You teach in FIRST PERSON — "I", "you", "we" — as if you were writing your own`);
  lines.push(`book or your own site. You are NOT an analyst describing what you say.`);
  lines.push('');
  if (archetypeVoice) {
    lines.push(`# Your voice (archetype: ${input.archetype})`);
    lines.push('');
    lines.push(archetypeVoice);
    lines.push('');
  }
  lines.push(`# Voice fingerprint (apply to this body)`);
  lines.push(`- profanityAllowed: ${input.voiceFingerprint.profanityAllowed}`);
  lines.push(`- tonePreset: ${input.voiceFingerprint.tonePreset}`);
  if (input.voiceFingerprint.preserveTerms.length > 0) {
    lines.push(`- preserveTerms (use VERBATIM, NEVER paraphrased): ${input.voiceFingerprint.preserveTerms.join(', ')}`);
  }
  if (input.channelDominantTone) {
    lines.push(`- channel dominant tone: ${input.channelDominantTone}`);
  }
  if (input.channelAudience) {
    lines.push(`- channel audience: ${input.channelAudience}`);
  }
  if (options.voiceRetryGuidance) {
    lines.push('');
    lines.push(`# Voice-fingerprint retry guidance`);
    lines.push(options.voiceRetryGuidance);
  }
  lines.push('');
  lines.push(`# Source material (yours — from your own transcripts)`);
  lines.push('');
  lines.push(`## Transcript segments cited (use [<segmentId>] inline in body):`);
  for (const s of input.segments) {
    lines.push(formatSegment(s));
  }
  lines.push('');
  if (input.woven.examples.length > 0) {
    lines.push(`## Examples from your videos (the weaver picked these for THIS canon):`);
    for (const i of input.woven.examples) lines.push(formatWoven(i));
    lines.push('');
  }
  if (input.woven.stories.length > 0) {
    lines.push(`## Stories from your videos:`);
    for (const i of input.woven.stories) lines.push(formatWoven(i));
    lines.push('');
  }
  if (input.woven.mistakes.length > 0) {
    lines.push(`## Mistakes you've called out (use as the "common mistake" section):`);
    for (const i of input.woven.mistakes) lines.push(formatWoven(i));
    lines.push('');
  }
  if (input.woven.contrarian_takes.length > 0) {
    lines.push(`## Contrarian takes:`);
    for (const i of input.woven.contrarian_takes) lines.push(formatWoven(i));
    lines.push('');
  }
  lines.push(`## Internal context (NOT for body — informs your writing only)`);
  lines.push(`- internal_summary: ${input.internal_summary}`);
  lines.push('');
  lines.push(`# Task`);
  lines.push(`Write the BODY field for the canon node "${input.title}".`);
  lines.push('');
  lines.push(`Target length: ${min}-${max} words.`);
  lines.push('');
  lines.push(`Recommended structure (not enforced — adapt to your voice):`);
  lines.push(`1. Punchy 1-2 sentence opening hook in first person`);
  lines.push(`2. Define what this concept means in your terms`);
  lines.push(`3. Walk through the mechanism / steps / how it works`);
  lines.push(`4. Cite 1-2 of the woven examples above with [<segmentId>] tokens`);
  lines.push(`5. Cover the common mistake (use the woven mistake item)`);
  lines.push(`6. Close with the practical "what to do now"`);
  lines.push('');
  lines.push(`# Citation rules (CRITICAL)`);
  lines.push(`- ONLY transcript segment UUIDs go in [...] citation brackets in body.`);
  lines.push(`  Format: [<full-uuid>] like [a1a6709f-a2a7-48f4-839b-82687165fbdd]`);
  lines.push(`- Weave 8-15 inline [<segmentId>] tokens through the body`);
  lines.push(`- Place after concrete claims, numbers, named entities, examples`);
  lines.push(`- DO NOT cite in opening hook (that's a teaser); cite once you start teaching`);
  lines.push(`- DO NOT use [<startMs>ms-<endMs>ms] ranges — those can't linkify`);
  lines.push(`- DO NOT spam (3+ citations in one sentence)`);
  lines.push(`- DO NOT put woven-item internal labels (ex_xxx, st_xxx, mst_xxx, take_xxx,`);
  lines.push(`  shown as «label» in the source material above) in [...] brackets.`);
  lines.push(`  Those are NOT citation tokens. They are tracking labels only — reference`);
  lines.push(`  woven items by their CONTENT in your prose (e.g., "the dentist example"),`);
  lines.push(`  then echo back which «labels» you used in the used_*_ids output fields.`);
  lines.push('');
  lines.push('# Citation density rule');
  lines.push(`Use 5+ inline [<UUID>] citations from the source segments. Each citation should anchor a specific claim, not just decorate. Group related claims into the same citation when natural.`);
  lines.push(`Specifically for ${input.type}: aim for at least ${citationFloor(input.type)} unique segment citations.`);
  lines.push('');
  const voiceMode = input.voiceMode ?? 'first_person';
  lines.push(voiceRulesPrompt(voiceMode, input.creatorName));
  lines.push('');

  lines.push(`# Weaving requirement`);
  lines.push(`The woven items above MUST appear in your body — paraphrased or directly. Reference`);
  lines.push(`them BY CONTENT in your prose (e.g., "the dentist value-ladder example", "the £5,000`);
  lines.push(`debt cold-call story"). DO NOT put their internal «labels» in citation brackets.`);
  lines.push(`Echo back which «labels» you used in used_*_ids output fields (without the « »).`);
  lines.push('');
  lines.push(`# Output format`);
  lines.push(`ONE JSON object. No code fences. No preamble. First char \`{\`, last char \`}\`.`);
  lines.push('');
  lines.push(`{`);
  lines.push(`  "body": "<${min}-${max} word first-person markdown body with inline [<segmentId>] citations>",`);
  lines.push(`  "used_example_ids": ["<id>", ...],   // echo back which woven examples you used`);
  lines.push(`  "used_story_ids": [],`);
  lines.push(`  "used_mistake_ids": ["<id>"],`);
  lines.push(`  "used_contrarian_take_ids": []`);
  lines.push(`}`);

  return lines.join('\n');
}

/** Minimum word count by canon type. Body writer retries on under-length output. */
function minWordCount(type: string): number {
  switch (type) {
    case 'definition': case 'aha_moment': case 'quote': return 250;
    case 'example': return 350;
    case 'lesson': case 'pattern': case 'tactic': return 450;
    case 'principle': case 'topic': return 500;
    case 'framework': return 700;
    case 'playbook': return 800;
    default: return 450;
  }
}

export async function writeCanonBody(input: CanonBodyInput, options: CanonBodyWriteOptions = {}): Promise<CanonBodyResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildBodyPrompt(input, { voiceRetryGuidance: options.voiceRetryGuidance });
  const raw = await runCodex(prompt, { timeoutMs, label: `canon_body_${input.id}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as Partial<CanonBodyResult>;
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  const cited = (body.match(UUID_REGEX) ?? []).map((m) => m.replace(/[[\]]/g, ''));
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  // Build the result object BEFORE quality-gate checks so the orchestrator can
  // capture it via BodyTooShortError even when validation throws.
  const result: CanonBodyResult = {
    body,
    cited_segment_ids: [...new Set(cited)],
    used_example_ids: Array.isArray(parsed.used_example_ids) ? parsed.used_example_ids : [],
    used_story_ids: Array.isArray(parsed.used_story_ids) ? parsed.used_story_ids : [],
    used_mistake_ids: Array.isArray(parsed.used_mistake_ids) ? parsed.used_mistake_ids : [],
    used_contrarian_take_ids: Array.isArray(parsed.used_contrarian_take_ids) ? parsed.used_contrarian_take_ids : [],
  };

  // Quality gates — throw to trigger retry-on-failure in the orchestrator.

  // Phase 9 G1: catch Codex refusal output before it ships as a real body.
  if (detectRefusalPattern(body)) {
    const refusalWordCount = body.split(/\s+/).filter(Boolean).length;
    const preview = body.slice(0, 80).replace(/\s+/g, ' ');
    const err = new Error(
      `codex refusal detected (${refusalWordCount} words): "${preview}..."`
    ) as Error & { partialResult?: CanonBodyResult };
    err.partialResult = result;  // preserve for orchestrator's catch
    throw err;
  }

  // Phase 10 Task 10.2: citation density floor.
  const cited_count = countCitations(body);
  const floor = citationFloor(input.type);
  if (cited_count < floor) {
    const err = new Error(
      `citation density too low: ${cited_count}/${floor} unique segment citations for ${input.type}`
    ) as Error & { partialResult?: CanonBodyResult };
    err.partialResult = result;
    throw err;
  }

  const minWords = minWordCount(input.type);
  if (wordCount < minWords) {
    const err = new Error(`body too short: ${wordCount} words < ${minWords} min for ${input.type}`) as Error & { partialResult?: CanonBodyResult };
    err.partialResult = result;
    throw err;
  }
  if (input.segments.length >= 3 && cited.length === 0) {
    throw new Error(`body has 0 [<segmentId>] citations despite ${input.segments.length} source segments available`);
  }

  if (options.voiceFingerprintEvaluator) {
    const voiceScore = await options.voiceFingerprintEvaluator({ input, result });
    result._voice_fingerprint = {
      similarity: voiceScore.similarity,
      threshold: voiceScore.threshold,
      status: voiceScore.status,
    };
    if (voiceScore.shouldRetry) {
      const err = new Error(
        `voice fingerprint drift: ${voiceScore.similarity.toFixed(3)} < ${voiceScore.threshold.toFixed(3)}`
      ) as CanonBodyWriteError;
      err.partialResult = {
        ...result,
        _degraded: 'voice_drift',
      };
      err.voiceRetryGuidance = voiceScore.retryGuidance;
      throw err;
    }
  }

  return result;
}

/** Parallel orchestrator with retry-on-failure (max 2 retries per canon). */
export async function writeCanonBodiesParallel(
  inputs: CanonBodyInput[],
  options: { concurrency?: number; timeoutMs?: number; maxRetries?: number; voiceFingerprintEvaluator?: VoiceFingerprintEvaluator } = {},
): Promise<Map<string, CanonBodyResult>> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 2;

  const out = new Map<string, CanonBodyResult>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < inputs.length) {
      const i = cursor;
      cursor += 1;
      const input = inputs[i]!;
      let lastErr: Error | null = null;
      let lastResult: CanonBodyResult | null = null;
      let voiceRetryGuidance: string | undefined;
      for (let attempt = 1; attempt <= 1 + maxRetries; attempt += 1) {
        try {
          const start = Date.now();
          const res = await writeCanonBody(input, {
            timeoutMs,
            voiceRetryGuidance,
            voiceFingerprintEvaluator: options.voiceFingerprintEvaluator,
          });
          const wordCount = res.body.split(/\s+/).filter(Boolean).length;
          console.info(
            `[body] ${input.id} (${input.title.slice(0, 35)}): ` +
            `${wordCount}w · ${res.cited_segment_ids.length} citations · ` +
            `${(Date.now() - start) / 1000 | 0}s` +
            (attempt > 1 ? ` · attempt ${attempt}` : ''),
          );
          out.set(input.id, res);
          break;
        } catch (err) {
          lastErr = err as CanonBodyWriteError;
          // Capture the partial result attached by writeCanonBody on word-count failure.
          if ((lastErr as CanonBodyWriteError).partialResult) {
            lastResult = (lastErr as CanonBodyWriteError).partialResult!;
          }
          if ((lastErr as CanonBodyWriteError).voiceRetryGuidance) {
            voiceRetryGuidance = (lastErr as CanonBodyWriteError).voiceRetryGuidance;
          }
          if (attempt <= maxRetries) {
            console.warn(`[body] ${input.id} attempt ${attempt} failed: ${lastErr.message.slice(0, 200)} — retrying`);
            await new Promise((r) => setTimeout(r, 5000 * attempt));
          }
        }
      }
      if (!out.has(input.id) && lastErr) {
        const refusalErr = lastErr.message.includes('codex refusal detected');
        if (refusalErr) {
          // Don't accept refusal output — fall back to all-degraded so caller can
          // decide whether to skip this canon entirely or retry with different inputs.
          console.error(`[body] ${input.id} permanently refused: ${lastErr.message.slice(0, 200)}`);
          out.set(input.id, {
            body: '',
            cited_segment_ids: [],
            used_example_ids: [],
            used_story_ids: [],
            used_mistake_ids: [],
            used_contrarian_take_ids: [],
          });
          continue;  // skip to next worker iteration
        }
        const wordCountErr = lastErr.message.includes('body too short');
        if (wordCountErr && lastResult) {
          // Accept the under-length body; log + continue rather than degraded-fallback
          console.warn(
            `[body] ${input.id} permanently under length after ${1 + maxRetries} attempts ` +
            `(got ${lastResult.body.split(/\s+/).filter(Boolean).length} words, target ${minWordCount(input.type)}); ` +
            `accepting at lower length to avoid blocking pipeline.`
          );
          out.set(input.id, lastResult);
        } else if (lastErr.message.includes('citation density too low') && lastResult) {
          // Phase 10 Task 10.2: prose may be fine, just under-cited — persist with
          // _degraded marker rather than all-degrade (empty body is worse than sparse cites).
          console.warn(
            `[body] ${input.id} permanently under-cited after ${1 + maxRetries} attempts ` +
            `(${countCitations(lastResult.body)}/${citationFloor(input.type)} cites); ` +
            `accepting body with _degraded='low_citation_density' marker`
          );
          out.set(input.id, { ...lastResult, _degraded: 'low_citation_density' });
        } else if (lastErr.message.includes('voice fingerprint drift') && lastResult) {
          const score = lastResult._voice_fingerprint;
          console.warn(
            `[body] ${input.id} still voice-drifted after ${1 + maxRetries} attempts ` +
            (score ? `(${score.similarity.toFixed(3)}/${score.threshold.toFixed(3)}); ` : '') +
            `accepting body with _degraded='voice_drift' marker`
          );
          out.set(input.id, { ...lastResult, _degraded: 'voice_drift' });
        } else {
          // Other failure modes (parse error, third-person leak, etc.) still hard-fail.
          console.error(`[body] ${input.id} permanently failed: ${lastErr.message.slice(0, 200)}`);
          out.set(input.id, {
            body: '',
            cited_segment_ids: [],
            used_example_ids: [],
            used_story_ids: [],
            used_mistake_ids: [],
            used_contrarian_take_ids: [],
          });
        }
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
