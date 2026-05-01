/**
 * Synthesis body writer (Phase 5 / Task 6.1).
 *
 * Synthesis nodes are CanonNode_v2 with `kind: 'synthesis'`. Each one connects
 * 3+ existing canon nodes under a unifying meta-claim and renders as a hub
 * pillar page. The body is a 400-1000 word first-person essay that NAMES each
 * child canon by title and weaves them into a single argument.
 *
 * Two-stage generation (mirrors canon-body-writer pattern):
 *   1. Shell generator — Codex picks 3-5 unifying meta-claims that tie 3+
 *      existing canon nodes together. Outputs shells with title/lede/_internal/
 *      _index_cross_link_canon (3+ child IDs). NO body yet.
 *   2. Body writer — for each shell, single Codex call. Input = shell + each
 *      child canon's title+body+_internal_summary + voice fingerprint +
 *      archetype HUB_SOURCE_VOICE. Output = first-person body that names each
 *      child by title and threads them together.
 *
 * Quality gates (throw to trigger retry):
 *   - Body must be ≥ 400 words.
 *   - Body must mention every child canon by title (case-insensitive substring).
 *   - Body must have ≥ 4 [<segmentId>] inline citations (synthesis density target).
 *
 * Independent per synthesis → parallelized with bounded concurrency.
 */

import fs from 'node:fs';
import path from 'node:path';

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { type ArchetypeSlug } from '../../agents/skills/archetype-detector';
import { SKILL_ROOT_PATH } from '../../agents/skills/skill-loader';

const ARCHETYPE_DIR = path.join(SKILL_ROOT_PATH, 'creator-archetypes');
const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

// ── Types ───────────────────────────────────────────────────────────────────

export interface VoiceFingerprint {
  profanityAllowed: boolean;
  tonePreset: string;
  preserveTerms: string[];
}

/** A synthesis SHELL — same fields as a canon shell but with kind='synthesis'.
 *  No body yet. */
export interface SynthesisShell {
  schemaVersion: 'v2';
  type: 'topic';                   // synthesis nodes use type='topic' + kind='synthesis'
  origin: 'derived';
  kind: 'synthesis';
  title: string;
  lede: string;
  _internal_summary: string;
  _internal_why_it_matters: string;
  _internal_unifying_thread: string;       // synthesis-specific: the meta-claim
  _index_cross_link_canon: string[];        // 3+ child canon IDs
  _index_evidence_segments: string[];       // synthesis pulls from children's evidence
  _index_supporting_examples: string[];
  _index_supporting_stories: string[];
  _index_supporting_mistakes: string[];
  _index_supporting_contrarian_takes: string[];
  _index_source_video_ids: string[];
  confidenceScore: number;
  pageWorthinessScore: number;
  specificityScore: number;
  creatorUniquenessScore: number;
  evidenceQuality: 'high' | 'medium' | 'low';
}

/** Reference to a child canon node — fed to the synthesis body writer. */
export interface ChildCanonRef {
  id: string;
  title: string;
  type: string;
  body: string;
  internal_summary: string;
}

export interface SynthesisShellInput {
  /** All available canon nodes. Synthesis picks 3+ that share a thread. */
  canonNodes: Array<{
    id: string;
    title: string;
    type: string;
    internal_summary: string;
    pageWorthinessScore: number;
    sourceVideoIds: string[];
  }>;
  creatorName: string;
  archetype: ArchetypeSlug;
  niche: string;
  recurringPromise: string;
  /** How many synthesis nodes to ask for. Cap at canonNodes.length / 3. */
  targetCount: number;
}

export interface SynthesisBodyInput {
  /** Synthesis shell identity (the cn_xxx ID, set after shell persistence). */
  id: string;
  shell: SynthesisShell;

  /** Children, fully hydrated with bodies. Body writer reads these. */
  children: ChildCanonRef[];

  /** Voice. */
  creatorName: string;
  archetype: ArchetypeSlug;
  voiceFingerprint: VoiceFingerprint;

  /** Channel context. */
  channelDominantTone?: string;
  channelAudience?: string;
}

export interface SynthesisBodyResult {
  body: string;
  cited_segment_ids: string[];
  /** IDs of children the body actually named (echo back from Codex). */
  named_child_ids: string[];
}

// ── Archetype voice loader (cached) ─────────────────────────────────────────

const archetypeCache = new Map<ArchetypeSlug, string>();
function loadArchetypeVoice(archetype: ArchetypeSlug): string {
  if (archetypeCache.has(archetype)) return archetypeCache.get(archetype)!;
  const filePath = path.join(ARCHETYPE_DIR, `${archetype}.md`);
  if (!fs.existsSync(filePath)) {
    archetypeCache.set(archetype, '');
    return '';
  }
  const raw = fs.readFileSync(filePath, 'utf8');
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

// ── Stage 1: Synthesis shell generator ─────────────────────────────────────

function buildShellPrompt(input: SynthesisShellInput): string {
  const { canonNodes, creatorName, niche, recurringPromise, targetCount } = input;

  const canonBlock = canonNodes
    .map((c) =>
      `- (${c.id}) [${c.type}] "${c.title}" — ${c.internal_summary.slice(0, 200)}`,
    )
    .join('\n');

  return [
    `You are synthesis_architect. You build pillar pages — single arguments that THREAD together 3+ existing canon nodes.`,
    '',
    `A synthesis node is a top-level pillar page. It is NOT a summary of children. It is a META-CLAIM about how the children connect: "All of these are really one principle." or "Here's the system that ties these together."`,
    '',
    `# Channel context`,
    `- creator: ${creatorName}`,
    `- niche: ${niche}`,
    `- recurring promise: ${recurringPromise}`,
    '',
    `# Available canon nodes (${canonNodes.length})`,
    canonBlock,
    '',
    `# Task`,
    `Pick ${targetCount} synthesis units. Each MUST:`,
    `- Connect 3+ canon nodes from the list above (by ID)`,
    `- Have a single unifying meta-claim (the _internal_unifying_thread)`,
    `- Be a teachable PILLAR — broad enough to anchor a hub section, specific enough to actually argue something`,
    `- Have a first-person title and lede the creator would write`,
    '',
    `Anti-patterns (DO NOT produce these):`,
    `- A synthesis whose meta-claim is just "these are all about X" (no argument)`,
    `- A synthesis with only 1-2 children (use a regular canon for that)`,
    `- A synthesis whose title duplicates an existing canon title`,
    `- A synthesis that's actually a journey phase (sequenced steps belong in reader_journey)`,
    '',
    `# Output format`,
    `ONE JSON ARRAY of ${targetCount} synthesis shells. First char \`[\`, last char \`]\`.`,
    '',
    `[`,
    `  {`,
    `    "schemaVersion": "v2",`,
    `    "type": "topic",`,
    `    "origin": "derived",`,
    `    "kind": "synthesis",`,
    `    "title": "<2-6 word pillar title>",`,
    `    "lede": "<1-2 sentence first-person teaser. NO third person.>",`,
    `    "_internal_summary": "<1-2 sentences for operator review>",`,
    `    "_internal_why_it_matters": "<1-2 sentences>",`,
    `    "_internal_unifying_thread": "<the meta-claim that ties the children together — 1-3 sentences>",`,
    `    "_index_cross_link_canon": ["<cn_id>", "<cn_id>", "<cn_id>"],`,
    `    "_index_evidence_segments": [],`,
    `    "_index_supporting_examples": [],`,
    `    "_index_supporting_stories": [],`,
    `    "_index_supporting_mistakes": [],`,
    `    "_index_supporting_contrarian_takes": [],`,
    `    "_index_source_video_ids": [],`,
    `    "confidenceScore": 0,`,
    `    "pageWorthinessScore": 0,`,
    `    "specificityScore": 0,`,
    `    "creatorUniquenessScore": 0,`,
    `    "evidenceQuality": "high"`,
    `  }`,
    `]`,
    '',
    `Voice rule (HARD-FAIL): title, lede must be FIRST-PERSON. NEVER "the creator", "${creatorName}", "she/he says".`,
    `Score 0-100 integers (NOT 0-1 fractions).`,
    `JSON only.`,
  ].join('\n');
}

export async function generateSynthesisShells(
  input: SynthesisShellInput,
  options: { timeoutMs?: number } = {},
): Promise<SynthesisShell[]> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildShellPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: 'synthesis_shells' });
  const json = extractJsonFromCodexOutput(raw);
  let parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) parsed = [parsed];

  const validIds = new Set(input.canonNodes.map((c) => c.id));
  const shells: SynthesisShell[] = [];
  for (const item of parsed as Partial<SynthesisShell>[]) {
    if (!item || typeof item.title !== 'string') continue;
    const childIds = Array.isArray(item._index_cross_link_canon)
      ? item._index_cross_link_canon.filter((id): id is string => typeof id === 'string' && validIds.has(id))
      : [];
    if (childIds.length < 3) {
      console.warn(`[synthesis] dropping shell "${item.title?.slice(0, 60)}" — only ${childIds.length} valid children (need 3+)`);
      continue;
    }
    const sourceVideoIds = Array.from(
      new Set(
        childIds.flatMap((cid) => input.canonNodes.find((c) => c.id === cid)?.sourceVideoIds ?? []),
      ),
    );
    shells.push({
      schemaVersion: 'v2',
      type: 'topic',
      origin: 'derived',
      kind: 'synthesis',
      title: item.title.trim(),
      lede: typeof item.lede === 'string' ? item.lede : '',
      _internal_summary: typeof item._internal_summary === 'string' ? item._internal_summary : '',
      _internal_why_it_matters: typeof item._internal_why_it_matters === 'string' ? item._internal_why_it_matters : '',
      _internal_unifying_thread: typeof item._internal_unifying_thread === 'string' ? item._internal_unifying_thread : '',
      _index_cross_link_canon: childIds,
      _index_evidence_segments: [],
      _index_supporting_examples: [],
      _index_supporting_stories: [],
      _index_supporting_mistakes: [],
      _index_supporting_contrarian_takes: [],
      _index_source_video_ids: sourceVideoIds,
      confidenceScore: 0,
      pageWorthinessScore: 0,
      specificityScore: 0,
      creatorUniquenessScore: 0,
      evidenceQuality: (item.evidenceQuality as 'high' | 'medium' | 'low') ?? 'medium',
    });
  }
  return shells;
}

// ── Stage 2: Synthesis body writer ─────────────────────────────────────────

function buildBodyPrompt(input: SynthesisBodyInput): string {
  const { shell, children, creatorName, archetype, voiceFingerprint } = input;
  const archetypeVoice = loadArchetypeVoice(archetype);

  const childBlock = children
    .map((c, idx) =>
      [
        `### Child ${idx + 1}: "${c.title}" (id=${c.id}, type=${c.type})`,
        `Internal summary: ${c.internal_summary}`,
        '',
        `Body excerpt (first ~600 words — name this child by title in your synthesis body):`,
        c.body.split(/\s+/).slice(0, 600).join(' '),
      ].join('\n'),
    )
    .join('\n\n');

  return [
    `You are ${creatorName}, writing the pillar essay "${shell.title}" for your knowledge hub.`,
    '',
    `This is a SYNTHESIS body — a single argument that names ${children.length} child topics from your hub and weaves them into one thread. The children's bodies are below — your job is the meta-essay that frames them.`,
    '',
    archetypeVoice ? `# Your voice (archetype: ${archetype})\n\n${archetypeVoice}\n` : '',
    `# Voice fingerprint`,
    `- profanityAllowed: ${voiceFingerprint.profanityAllowed}`,
    `- tonePreset: ${voiceFingerprint.tonePreset}`,
    voiceFingerprint.preserveTerms.length > 0
      ? `- preserveTerms (use VERBATIM, NEVER paraphrased): ${voiceFingerprint.preserveTerms.join(', ')}`
      : '',
    input.channelDominantTone ? `- channel dominant tone: ${input.channelDominantTone}` : '',
    input.channelAudience ? `- channel audience: ${input.channelAudience}` : '',
    '',
    `# The pillar`,
    `Title: ${shell.title}`,
    `Lede: ${shell.lede}`,
    `Unifying thread (your meta-claim): ${shell._internal_unifying_thread}`,
    `Why it matters: ${shell._internal_why_it_matters}`,
    '',
    `# Children to weave (${children.length})`,
    childBlock,
    '',
    `# Task`,
    `Write a 400-1000 word FIRST-PERSON pillar body that:`,
    `1. Opens with a punchy hook stating the meta-claim (1-2 sentences)`,
    `2. NAMES each child by its exact title and explains how it fits the thread`,
    `3. Threads the children in a natural order — not a list, an argument`,
    `4. Cites concrete evidence using [<segmentId>] tokens pulled from the child bodies above`,
    `5. Closes with the practical "what this means for you" — first-person`,
    '',
    `Recommended structure:`,
    `- Hook (1-2 sentences): the unifying claim, no citation`,
    `- Argument body (mid 60%): walk the thread; each child gets 1-2 paragraphs that name it explicitly`,
    `- Tie-back (final 15%): why the whole thread matters; first-person CTA`,
    '',
    `# Citation rules (CRITICAL)`,
    `- Pull [<segmentId>] tokens from the child bodies above — they're already valid UUIDs`,
    `- Aim for 4-10 inline [<segmentId>] tokens across the synthesis body`,
    `- Place after concrete claims, numbers, named entities`,
    `- DO NOT cite in the opening hook (that's a teaser)`,
    `- DO NOT use [<startMs>ms-<endMs>ms] ranges`,
    `- DO NOT spam (3+ in one sentence)`,
    '',
    `# Voice rules (HARD-FAIL otherwise)`,
    `- First-person only. NEVER "the creator", "${creatorName}", "she/he says", "in this episode"`,
    `- Reference children by their TITLES, not by phrases like "the lesson on X"`,
    `- Verbatim preserveTerms`,
    `- Markdown allowed: ## subheadings, **bold**, lists, blockquotes`,
    '',
    `# Naming requirement`,
    `Every child title above MUST appear in your body, case-insensitive. Echo the IDs back in named_child_ids.`,
    '',
    `# Output format`,
    `ONE JSON object. No code fences. First char \`{\`, last char \`}\`.`,
    '',
    `{`,
    `  "body": "<400-1000 word first-person markdown body with [<segmentId>] citations and child titles>",`,
    `  "named_child_ids": ["<cn_id>", "<cn_id>", "<cn_id>"]`,
    `}`,
  ].filter((x) => x !== '').join('\n');
}

export async function writeSynthesisBody(
  input: SynthesisBodyInput,
  options: { timeoutMs?: number } = {},
): Promise<SynthesisBodyResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildBodyPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: `synthesis_body_${input.id}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as Partial<SynthesisBodyResult>;
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  const cited = (body.match(UUID_REGEX) ?? []).map((m) => m.replace(/[[\]]/g, ''));
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  // Quality gates — throw to trigger retry-on-failure.
  if (wordCount < 400) {
    throw new Error(`synthesis body too short: ${wordCount} words < 400`);
  }
  // Naming check: every child title must appear (case-insensitive).
  const lowered = body.toLowerCase();
  const missingTitles = input.children
    .map((c) => c.title)
    .filter((t) => !lowered.includes(t.toLowerCase()));
  if (missingTitles.length > 0) {
    throw new Error(`synthesis body missing child titles: ${missingTitles.map((t) => `"${t}"`).join(', ')}`);
  }
  if (cited.length < 4) {
    throw new Error(`synthesis body has ${cited.length} citations, need ≥4`);
  }

  const namedChildIds = Array.isArray(parsed.named_child_ids)
    ? parsed.named_child_ids.filter((x): x is string => typeof x === 'string')
    : input.children.map((c) => c.id);

  return {
    body,
    cited_segment_ids: [...new Set(cited)],
    named_child_ids: namedChildIds,
  };
}

/** Parallel orchestrator with retry-on-failure (max 2 retries per synthesis). */
export async function writeSynthesisBodiesParallel(
  inputs: SynthesisBodyInput[],
  options: { concurrency?: number; timeoutMs?: number; maxRetries?: number } = {},
): Promise<Map<string, SynthesisBodyResult>> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 2;

  const out = new Map<string, SynthesisBodyResult>();
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
          const res = await writeSynthesisBody(input, { timeoutMs });
          const wordCount = res.body.split(/\s+/).filter(Boolean).length;
          console.info(
            `[synth] ${input.id} (${input.shell.title.slice(0, 35)}): ` +
              `${wordCount}w · ${res.cited_segment_ids.length} citations · ` +
              `${res.named_child_ids.length}/${input.children.length} children · ` +
              `${(Date.now() - start) / 1000 | 0}s` +
              (attempt > 1 ? ` · attempt ${attempt}` : ''),
          );
          out.set(input.id, res);
          break;
        } catch (err) {
          lastErr = err as Error;
          if (attempt <= maxRetries) {
            console.warn(`[synth] ${input.id} attempt ${attempt} failed: ${lastErr.message.slice(0, 200)} — retrying`);
            await new Promise((r) => setTimeout(r, 5000 * attempt));
          }
        }
      }
      if (!out.has(input.id) && lastErr) {
        console.error(`[synth] ${input.id} permanently failed: ${lastErr.message.slice(0, 200)}`);
        out.set(input.id, {
          body: '',
          cited_segment_ids: [],
          named_child_ids: [],
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
