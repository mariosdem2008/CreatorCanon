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
}

const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

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
    case 'framework': return { min: 600, max: 1200 };
    case 'playbook': return { min: 800, max: 1500 };
    case 'principle': case 'topic': return { min: 400, max: 1000 };
    case 'lesson': case 'pattern': case 'tactic': return { min: 400, max: 900 };
    case 'definition': case 'aha_moment': case 'quote': return { min: 200, max: 500 };
    case 'example': return { min: 300, max: 700 };
    default: return { min: 400, max: 1000 };
  }
}

function buildBodyPrompt(input: CanonBodyInput): string {
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
  lines.push(`# Voice rules (HARD-FAIL otherwise)`);
  lines.push(`- First-person only. NEVER "the creator", "${input.creatorName}", "she/he says", "the speaker"`);
  lines.push(`- Verbatim preserveTerms — do not rephrase named concepts`);
  lines.push(`- profanityAllowed governs body language; respect it`);
  lines.push(`- Markdown allowed: ## subheadings, **bold**, lists, blockquotes`);
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
    case 'definition': case 'aha_moment': case 'quote': return 200;
    case 'example': return 250;
    case 'lesson': case 'pattern': case 'tactic': return 350;
    case 'principle': case 'topic': return 400;
    case 'framework': return 500;
    case 'playbook': return 600;
    default: return 350;
  }
}

export async function writeCanonBody(input: CanonBodyInput, options: { timeoutMs?: number } = {}): Promise<CanonBodyResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildBodyPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: `canon_body_${input.id}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as Partial<CanonBodyResult>;
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  const cited = (body.match(UUID_REGEX) ?? []).map((m) => m.replace(/[[\]]/g, ''));
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  // Quality gates — throw to trigger retry-on-failure in the orchestrator.
  const minWords = minWordCount(input.type);
  if (wordCount < minWords) {
    throw new Error(`body too short: ${wordCount} words < ${minWords} min for ${input.type}`);
  }
  if (input.segments.length >= 3 && cited.length === 0) {
    throw new Error(`body has 0 [<segmentId>] citations despite ${input.segments.length} source segments available`);
  }

  return {
    body,
    cited_segment_ids: [...new Set(cited)],
    used_example_ids: Array.isArray(parsed.used_example_ids) ? parsed.used_example_ids : [],
    used_story_ids: Array.isArray(parsed.used_story_ids) ? parsed.used_story_ids : [],
    used_mistake_ids: Array.isArray(parsed.used_mistake_ids) ? parsed.used_mistake_ids : [],
    used_contrarian_take_ids: Array.isArray(parsed.used_contrarian_take_ids) ? parsed.used_contrarian_take_ids : [],
  };
}

/** Parallel orchestrator with retry-on-failure (max 2 retries per canon). */
export async function writeCanonBodiesParallel(
  inputs: CanonBodyInput[],
  options: { concurrency?: number; timeoutMs?: number; maxRetries?: number } = {},
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
      for (let attempt = 1; attempt <= 1 + maxRetries; attempt += 1) {
        try {
          const start = Date.now();
          const res = await writeCanonBody(input, { timeoutMs });
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
          lastErr = err as Error;
          if (attempt <= maxRetries) {
            console.warn(`[body] ${input.id} attempt ${attempt} failed: ${lastErr.message.slice(0, 200)} — retrying`);
            await new Promise((r) => setTimeout(r, 5000 * attempt));
          }
        }
      }
      if (!out.has(input.id) && lastErr) {
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

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
