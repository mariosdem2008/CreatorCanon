/**
 * Synthesis body writer (Phase 5 / Task 6.1).
 *
 * Synthesis nodes are CanonNode_v2 with `kind: 'synthesis'`. Each one connects
 * 3+ existing canon nodes under a unifying meta-claim and renders as a hub
 * pillar page. The body is a 700-1200 word first-person essay that NAMES each
 * child canon by title under its own ## subheading and weaves them into a
 * single argument thread.
 *
 * Two-stage generation (mirrors canon-body-writer pattern):
 *   1. Shell generator — Codex picks 3-5 unifying meta-claims that tie 3+
 *      existing canon nodes together. Outputs shells with title/lede/_internal/
 *      _index_cross_link_canon (3+ child IDs). NO body yet.
 *   2. Body writer — for each shell, single Codex call. Input = shell + each
 *      child canon's title+body+_internal_summary + voice fingerprint +
 *      archetype HUB_SOURCE_VOICE. Output = first-person body that names each
 *      child by title under ## subheadings and threads them together.
 *
 * Quality gates (throw to trigger retry):
 *   - detectRefusalPattern: catches Codex refusal text before it ships as a body
 *     (Phase 9 G1 parity with canon-body-writer).
 *   - Body must be ≥ 400 words.
 *   - Body must mention every child canon by title (case-insensitive substring).
 *   - Body must have ≥ 5 [<canonId> or segmentId>] cross-link/citation tokens.
 *     Synthesis density floor = 5 (any UUID or cn_xxx bracketed token counts).
 *
 * Fallback prompt (Task 10.4):
 *   If the primary prompt exhausts retries, a looser fallback is tried:
 *   - Drops per-child ## subheading requirement
 *   - 400-600 word "argument thread" target
 *   - Drops UUID citation requirement (cross-link canon IDs [cn_xxx] only)
 *
 * Independent per synthesis → parallelized with bounded concurrency.
 */

import fs from 'node:fs';
import path from 'node:path';

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { type ArchetypeSlug } from '../../agents/skills/archetype-detector';
import { SKILL_ROOT_PATH } from '../../agents/skills/skill-loader';
import { type VoiceMode, voiceRulesPrompt } from './voice-mode';
import { detectRefusalPattern } from './canon-body-writer';
import { citationFloor, countCitations } from './citation-density';

const ARCHETYPE_DIR = path.join(SKILL_ROOT_PATH, 'creator-archetypes');
const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;
/** Also capture canon-node cross-link tokens like [cn_abc123456789] and
 *  real persisted IDs like [cn_c29bb69e-577]. */
const CROSS_LINK_REGEX = /\[cn_[a-z0-9_-]+\]/gi;

/** Synthesis citation floor: 5 unique cross-link/citation tokens.
 *  Includes both [<UUID>] segment citations AND [cn_xxx] cross-links. */
export const SYNTHESIS_CROSS_LINK_FLOOR = 5;

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
  voiceMode?: VoiceMode;

  /** Channel context. */
  channelDominantTone?: string;
  channelAudience?: string;
}

export interface SynthesisBodyResult {
  body: string;
  cited_segment_ids: string[];
  /** IDs of children the body actually named (echo back from Codex). */
  named_child_ids: string[];
  /** Marker for degraded fallback bodies. */
  _degraded?: 'synthesis_writer_refused' | 'synthesis_writer_fallback';
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

/** Count unique cross-link tokens in a synthesis body.
 *  Includes both [<UUID>] segment citations AND [cn_xxx] canon cross-links. */
export function countSynthesisLinks(body: string | undefined | null): number {
  if (!body) return 0;
  const uuidCount = countCitations(body);
  const seenCanonLinks = new Set<string>();
  for (const m of body.matchAll(new RegExp(CROSS_LINK_REGEX.source, CROSS_LINK_REGEX.flags))) {
    seenCanonLinks.add(m[0].toLowerCase());
  }
  return uuidCount + seenCanonLinks.size;
}

export function synthesisLinkFloor(type: string): number {
  return citationFloor(type);
}

export type PersistedSynthesisPayload = SynthesisShell & {
  body: string;
  _degraded?: SynthesisBodyResult['_degraded'];
};

export function mergeSynthesisBodyResultIntoShell(
  shell: SynthesisShell,
  result: SynthesisBodyResult,
): PersistedSynthesisPayload {
  const merged: PersistedSynthesisPayload = {
    ...shell,
    body: result.body,
    _index_evidence_segments: result.cited_segment_ids,
  };
  if (result._degraded) {
    merged._degraded = result._degraded;
  }
  return merged;
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

/** Primary prompt: demands per-child ## subheadings + cross-link [cn_xxx] tokens
 *  + 700-1200 word target. This is the full-quality prompt. */
export function buildSynthesisBodyPrompt(input: SynthesisBodyInput): string {
  const { shell, children, creatorName, archetype, voiceFingerprint } = input;
  const archetypeVoice = loadArchetypeVoice(archetype);
  const linkFloor = synthesisLinkFloor(shell.type);

  // Build the child reference block — each child gets its own ## header.
  const childBlock = children
    .map((c, idx) =>
      [
        `### Child ${idx + 1}: "${c.title}" (id=${c.id}, type=${c.type})`,
        `Internal summary: ${c.internal_summary}`,
        '',
        `Body excerpt (first ~600 words — your synthesis MUST name this child and cite its id):`,
        c.body.split(/\s+/).slice(0, 600).join(' '),
      ].join('\n'),
    )
    .join('\n\n');

  // Build the cross-link token list so Codex knows what to use.
  const childIdList = children.map((c) => `[${c.id}]`).join(', ');

  const lines: string[] = [];
  lines.push(`You are ${creatorName}, writing the pillar essay "${shell.title}" for your knowledge hub.`);
  lines.push('');
  lines.push(`This is a SYNTHESIS pillar — a single argument that ties ${children.length} child canons into one thread.`);
  lines.push(`Each child gets its own ## subheading. You are NOT summarising the children — you are making the META-CLAIM`);
  lines.push(`that connects them all: "${shell._internal_unifying_thread}"`);
  lines.push('');

  if (archetypeVoice) {
    lines.push(`# Your voice (archetype: ${archetype})`);
    lines.push('');
    lines.push(archetypeVoice);
    lines.push('');
  }

  lines.push(`# Voice fingerprint`);
  lines.push(`- profanityAllowed: ${voiceFingerprint.profanityAllowed}`);
  lines.push(`- tonePreset: ${voiceFingerprint.tonePreset}`);
  if (voiceFingerprint.preserveTerms.length > 0) {
    lines.push(`- preserveTerms (use VERBATIM, NEVER paraphrased): ${voiceFingerprint.preserveTerms.join(', ')}`);
  }
  if (input.channelDominantTone) lines.push(`- channel dominant tone: ${input.channelDominantTone}`);
  if (input.channelAudience) lines.push(`- channel audience: ${input.channelAudience}`);
  lines.push('');

  lines.push(`# The pillar`);
  lines.push(`Title: ${shell.title}`);
  lines.push(`Lede: ${shell.lede}`);
  lines.push(`Unifying thread (meta-claim): ${shell._internal_unifying_thread}`);
  lines.push(`Why it matters: ${shell._internal_why_it_matters}`);
  lines.push('');

  lines.push(`# Children to weave (${children.length})`);
  lines.push(childBlock);
  lines.push('');

  lines.push(`# Synthesis pillar structure (REQUIRED)`);
  lines.push(`You are writing a synthesis pillar that ties ${children.length} child canons into a single argument thread.`);
  lines.push(`Required structure:`);
  lines.push(`  - Open with a 100-150 word framing of the cross-cutting theme (no subheading)`);
  lines.push(`  - One ## subheading per child canon, named EXACTLY after the canon's title:`);
  for (const c of children) {
    lines.push(`      ## ${c.title}`);
  }
  lines.push(`  - Under each subheading: 80-150 words explaining how that canon fits the unifying thread`);
  lines.push(`  - Close with a 80-150 word "what this means for you" section (first-person CTA)`);
  lines.push(`  - Total target: 700-1200 words`);
  lines.push('');
  lines.push(`Cite child canons as cross-links: ${childIdList}`);
  lines.push(`Use [<canonId>] cross-link tokens when referencing a child canon. Example: "...the system I call [${children[0]?.id ?? 'cn_xxx'}]."`);
  lines.push(`Also cite source segment UUIDs inline as [<segmentUUID>] when grounding specific claims from the child bodies above.`);
  lines.push('');

  lines.push(`# Citation rules (CRITICAL)`);
  lines.push(`- Use ≥ ${linkFloor} total cross-link/citation tokens across the synthesis body`);
  lines.push(`- Cross-link tokens: [<cn_id>] — place after naming a child canon`);
  lines.push(`- Segment UUID tokens: [<UUID>] — pull from the child body excerpts above`);
  lines.push(`- Place tokens after concrete claims, not in the opening framing`);
  lines.push(`- DO NOT spam (3+ tokens in one sentence)`);
  lines.push(`- DO NOT use [<startMs>ms-<endMs>ms] ranges`);
  lines.push('');

  lines.push(voiceRulesPrompt(input.voiceMode ?? 'first_person', input.creatorName));
  lines.push('');

  lines.push(`# Naming requirement`);
  lines.push(`Every child title above MUST appear in your body (as ## subheadings or inline), case-insensitive.`);
  lines.push(`Echo the child IDs back in named_child_ids.`);
  lines.push('');

  lines.push(`# Output format`);
  lines.push(`ONE JSON object. No code fences. No preamble. First char \`{\`, last char \`}\`.`);
  lines.push('');
  lines.push(`{`);
  lines.push(`  "body": "<700-1200 word first-person markdown body with ## per-child subheadings, [cn_xxx] cross-links, and [<segmentId>] citations>",`);
  lines.push(`  "named_child_ids": ["<cn_id>", "<cn_id>", "<cn_id>"]`);
  lines.push(`}`);

  return lines.filter((x) => x !== undefined).join('\n');
}

/** Fallback prompt (Task 10.4): used after primary retries are exhausted.
 *  Drops per-child subheading requirement and UUID citation requirement.
 *  Asks for a simple 400-600 word argument thread using child canon bodies
 *  as context. Cross-link [cn_xxx] tokens only (no segment UUIDs required). */
export function buildSynthesisFallbackPrompt(input: SynthesisBodyInput): string {
  const childBodies = input.children.map(
    (c, i) => `--- Child canon ${i + 1}: "${c.title}" (${c.id}) ---\n${c.body.slice(0, 1500)}`,
  );

  const voiceLabel =
    input.voiceMode === 'first_person'
      ? 'First-person voice (I/you/we)'
      : input.voiceMode === 'third_person_editorial'
        ? 'Third-person editorial (no "I")'
        : 'Hybrid (editorial + 1 blockquoted aphorism)';

  const childIdCrossLinks = input.children.map((c) => `[${c.id}]`).join(', ');

  return [
    `Write a 400-600 word synthesis pillar tying together these ${input.children.length} child canons:`,
    '',
    childBodies.join('\n\n'),
    '',
    `Synthesis title: ${input.shell.title}`,
    `Unifying meta-claim: ${input.shell._internal_unifying_thread}`,
    '',
    `Output rules:`,
    `- 400-600 words`,
    `- ${voiceLabel}`,
    `- Open with a hook + a clear cross-cutting claim`,
    `- Reference each child canon at least once with a cross-link token: ${childIdCrossLinks}`,
    `- Place [cn_xxx] cross-link immediately after mentioning that child's idea`,
    `- NO inline UUID segment citations required`,
    `- End with a 1-2 sentence "what this means" close`,
    '',
    `Format: ONE JSON object { "body": "<400-600 word synthesis>" }`,
    `First char \`{\`, last char \`}\`. No code fences.`,
  ].join('\n');
}

export async function writeSynthesisBody(
  input: SynthesisBodyInput,
  options: { timeoutMs?: number } = {},
): Promise<SynthesisBodyResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildSynthesisBodyPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: `synthesis_body_${input.id}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as Partial<SynthesisBodyResult>;
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  const cited = (body.match(UUID_REGEX) ?? []).map((m) => m.replace(/[[\]]/g, ''));
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  // ── Quality gates (throw to trigger retry) ──────────────────────────────

  // Phase 9 G1: catch Codex refusal output before it ships as a real body.
  if (detectRefusalPattern(body)) {
    const refusalWordCount = body.split(/\s+/).filter(Boolean).length;
    const preview = body.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(
      `synthesis codex refusal detected (${refusalWordCount} words): "${preview}..."`,
    );
  }

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

  // Cross-link / citation density gate: count [UUID] + [cn_xxx] tokens.
  const linkCount = countSynthesisLinks(body);
  const linkFloor = synthesisLinkFloor(input.shell.type);
  if (linkCount < linkFloor) {
    throw new Error(
      `synthesis body has ${linkCount} cross-link/citation tokens, need >=${linkFloor}`,
    );
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

/** Parallel orchestrator with retry-on-failure (max 2 retries per synthesis).
 *
 * Task 10.4: After primary retries are exhausted, tries the fallback prompt.
 * If the fallback also fails, persists an empty body with a _degraded marker
 * rather than silently writing empty content. */
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

      // ── Primary prompt attempts ────────────────────────────────────────────
      for (let attempt = 1; attempt <= 1 + maxRetries; attempt += 1) {
        try {
          const start = Date.now();
          const res = await writeSynthesisBody(input, { timeoutMs });
          const wordCount = res.body.split(/\s+/).filter(Boolean).length;
          console.info(
            `[synth] ${input.id} (${input.shell.title.slice(0, 35)}): ` +
              `${wordCount}w · ${res.cited_segment_ids.length} citations · ` +
              `${countSynthesisLinks(res.body)} links · ` +
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

      if (out.has(input.id)) continue;

      // ── Fallback prompt (Task 10.4) ────────────────────────────────────────
      // Primary attempts exhausted. Try the looser fallback that uses child
      // canon bodies as context (no UUID citations or per-child subheadings required).
      console.warn(`[synth] ${input.id} primary attempts exhausted; trying fallback prompt`);

      const hasChildBodies = input.children.some((c) => c.body.trim().split(/\s+/).filter(Boolean).length >= 50);
      if (!hasChildBodies) {
        console.error(
          `[synth] ${input.id} fallback unavailable: all child canon bodies missing or too short`,
        );
        out.set(input.id, {
          body: '',
          cited_segment_ids: [],
          named_child_ids: [],
          _degraded: 'synthesis_writer_refused',
        });
        continue;
      }

      try {
        const fallbackPrompt = buildSynthesisFallbackPrompt(input);
        const raw = await runCodex(fallbackPrompt, { timeoutMs, label: `synthesis_body_fallback_${input.id}` });
        const json = extractJsonFromCodexOutput(raw);
        const parsed = JSON.parse(json) as { body?: string };
        const fallbackBody = typeof parsed.body === 'string' ? parsed.body : '';

        if (detectRefusalPattern(fallbackBody)) {
          console.error(`[synth] ${input.id} fallback also refused/too-short; persisting _degraded`);
          out.set(input.id, {
            body: '',
            cited_segment_ids: [],
            named_child_ids: [],
            _degraded: 'synthesis_writer_refused',
          });
        } else {
          const wordCount = fallbackBody.split(/\s+/).filter(Boolean).length;
          console.info(`[synth] ${input.id} fallback succeeded (${wordCount} words)`);
          // Fallback bodies use cross-link tokens only — extract any present.
          const fallbackLinks = (fallbackBody.match(UUID_REGEX) ?? []).map((m) => m.replace(/[[\]]/g, ''));
          out.set(input.id, {
            body: fallbackBody,
            cited_segment_ids: [...new Set(fallbackLinks)],
            named_child_ids: input.children.map((c) => c.id),
            _degraded: 'synthesis_writer_fallback',
          });
        }
      } catch (fallbackErr) {
        console.error(
          `[synth] ${input.id} fallback error: ${(fallbackErr as Error).message.slice(0, 200)}; persisting _degraded`,
        );
        out.set(input.id, {
          body: '',
          cited_segment_ids: [],
          named_child_ids: [],
          _degraded: 'synthesis_writer_refused',
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
