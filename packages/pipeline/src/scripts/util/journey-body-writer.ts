/**
 * Reader journey body writer (Phase 5 / Task 6.2).
 *
 * The reader journey is a single CanonNode_v2 of type 'playbook' with
 * kind='reader_journey'. Its body is structured as 3-5 sequenced PHASES,
 * each with its own title/hook/body. The journey is the spine of the hub —
 * it tells a new visitor where to start, what to tackle next, and when
 * they're ready to graduate to the next phase.
 *
 * Schema (from docs/superpowers/specs/2026-05-01-hub-source-document-schema.md):
 *   interface ReaderJourneyPhase_v2 {
 *     title: string;              // 2-6 words (rendered)
 *     hook: string;               // first-person line (rendered)
 *     body: string;               // 200-400 word phase intro (rendered)
 *     _internal_reader_state: string;
 *     _internal_next_step_when: string;
 *     _index_phase_number: number;
 *     _index_primary_canon_node_ids: string[];
 *   }
 *
 * Two-stage generation:
 *   1. Journey shell: Codex sequences the canon graph into 3-5 phases.
 *      Each phase gets title/hook/_internal_reader_state/_internal_next_step_when/
 *      _index_primary_canon_node_ids (1-3 canon IDs anchoring this phase).
 *      NO phase body yet.
 *   2. Phase body writer: per-phase Codex call producing the 200-400 word
 *      first-person intro. Pulls hooks from the phase's primary canon nodes.
 *
 * Quality gates (per phase, throw to trigger retry):
 *   - body ≥ 200 words
 *   - body ≤ 500 words (over-long phases dilute the journey)
 *   - body must reference the phase's primary canon nodes by title
 *   - first-person voice (no "the creator" leaks)
 *
 * Phases are written in parallel with bounded concurrency.
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

/** Reader journey shell (one per hub). The body field of the canon node is
 *  generated last from the phase bodies — see assembleJourneyBody below. */
export interface ReaderJourneyShell {
  schemaVersion: 'v2';
  type: 'playbook';
  origin: 'derived';
  kind: 'reader_journey';
  title: string;                              // hub-level journey title (e.g. "Your Path Through This Hub")
  lede: string;                               // 1-2 sentence first-person teaser
  _internal_summary: string;
  _internal_why_it_matters: string;
  _index_phases: ReaderJourneyPhaseShell[];
  _index_evidence_segments: string[];
  _index_supporting_examples: string[];
  _index_supporting_stories: string[];
  _index_supporting_mistakes: string[];
  _index_supporting_contrarian_takes: string[];
  _index_cross_link_canon: string[];          // union of all phase primary IDs
  _index_source_video_ids: string[];
  confidenceScore: number;
  pageWorthinessScore: number;
  specificityScore: number;
  creatorUniquenessScore: number;
  evidenceQuality: 'high' | 'medium' | 'low';
}

export interface ReaderJourneyPhaseShell {
  // RENDERED
  title: string;
  hook: string;
  body: string;                       // populated by phase body writer in stage 2
  // _INTERNAL
  _internal_reader_state: string;
  _internal_next_step_when: string;
  // _INDEX
  _index_phase_number: number;
  _index_primary_canon_node_ids: string[];
}

export interface CanonRefForJourney {
  id: string;
  title: string;
  type: string;
  internal_summary: string;
  body: string;                       // body excerpt for phase body context
  pageWorthinessScore: number;
}

export interface JourneyShellInput {
  canonNodes: CanonRefForJourney[];
  creatorName: string;
  archetype: ArchetypeSlug;
  niche: string;
  audience: string;
  recurringPromise: string;
  /** Number of phases to ask for. 3-5. */
  targetPhaseCount: number;
}

export interface PhaseBodyInput {
  phase: ReaderJourneyPhaseShell;
  /** Children referenced by _index_primary_canon_node_ids, fully hydrated. */
  primaryCanons: CanonRefForJourney[];
  creatorName: string;
  archetype: ArchetypeSlug;
  voiceFingerprint: VoiceFingerprint;
  channelDominantTone?: string;
  channelAudience?: string;
  /** Position in the sequence. Used to gloss "first phase" vs "later". */
  phaseNumber: number;
  totalPhases: number;
}

export interface PhaseBodyResult {
  body: string;
  cited_segment_ids: string[];
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

// ── Stage 1: Journey shell generator ───────────────────────────────────────

function buildShellPrompt(input: JourneyShellInput): string {
  const { canonNodes, creatorName, niche, audience, recurringPromise, targetPhaseCount } = input;

  const canonBlock = canonNodes
    .sort((a, b) => b.pageWorthinessScore - a.pageWorthinessScore)
    .slice(0, 24)
    .map((c) =>
      `- (${c.id}) [${c.type}, score=${c.pageWorthinessScore}] "${c.title}" — ${c.internal_summary.slice(0, 180)}`,
    )
    .join('\n');

  return [
    `You are journey_architect. You sequence the hub's canon nodes into a reader journey — the path a new visitor follows from "I just landed" to "I'm operating fluently."`,
    '',
    `# Channel context`,
    `- creator: ${creatorName}`,
    `- niche: ${niche}`,
    `- audience: ${audience}`,
    `- recurring promise: ${recurringPromise}`,
    '',
    `# Available canon nodes (top ${Math.min(canonNodes.length, 24)} by page-worthiness)`,
    canonBlock,
    '',
    `# Task`,
    `Define ${targetPhaseCount} sequenced phases. Each phase MUST:`,
    `- Have a 2-6 word title (rendered, first-person feel)`,
    `- Have a single-sentence first-person hook (rendered)`,
    `- Anchor to 1-3 canon nodes from the list above (by ID, in _index_primary_canon_node_ids)`,
    `- Describe the reader's mental state at this phase (_internal_reader_state) — what they're thinking, what they don't know yet`,
    `- Describe the signal the reader will see when they're ready for the next phase (_internal_next_step_when)`,
    '',
    `Sequencing rule: phases go from beginner to advanced. Phase 1 = "what is this and why should I care". Phase ${targetPhaseCount} = "I'm operating fluently and refining."`,
    '',
    `Anti-patterns:`,
    `- Phase titles like "Introduction" or "Conclusion" — boring, generic`,
    `- A phase whose canon nodes don't belong together`,
    `- Repeating a canon ID across phases (each canon belongs to ONE phase)`,
    `- Reader-state descriptions that are generic ("the reader is curious") — write the specific cognitive moment`,
    '',
    `# Output format`,
    `ONE JSON object. First char \`{\`, last char \`}\`.`,
    '',
    `{`,
    `  "schemaVersion": "v2",`,
    `  "type": "playbook",`,
    `  "origin": "derived",`,
    `  "kind": "reader_journey",`,
    `  "title": "<2-6 word hub-level journey title, first-person feel>",`,
    `  "lede": "<1-2 sentence first-person teaser>",`,
    `  "_internal_summary": "<1-2 sentences>",`,
    `  "_internal_why_it_matters": "<1-2 sentences>",`,
    `  "_index_phases": [`,
    `    {`,
    `      "title": "<2-6 words>",`,
    `      "hook": "<first-person single sentence>",`,
    `      "body": "",`,
    `      "_internal_reader_state": "<the specific cognitive moment — 1-2 sentences>",`,
    `      "_internal_next_step_when": "<observable signal of readiness — 1 sentence>",`,
    `      "_index_phase_number": 1,`,
    `      "_index_primary_canon_node_ids": ["<cn_id>", "<cn_id>"]`,
    `    }`,
    `  ],`,
    `  "_index_cross_link_canon": ["<union of all phase primary IDs>"],`,
    `  "confidenceScore": 0,`,
    `  "pageWorthinessScore": 0,`,
    `  "specificityScore": 0,`,
    `  "creatorUniquenessScore": 0,`,
    `  "evidenceQuality": "high"`,
    `}`,
    '',
    `Voice rule (HARD-FAIL): journey title, lede, phase titles and hooks must be FIRST-PERSON. NEVER "the creator", "${creatorName}", "she/he says".`,
    `Score 0-100 integers (NOT 0-1 fractions).`,
    `JSON only.`,
  ].join('\n');
}

export async function generateReaderJourneyShell(
  input: JourneyShellInput,
  options: { timeoutMs?: number } = {},
): Promise<ReaderJourneyShell | null> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildShellPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: 'journey_shell' });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as Partial<ReaderJourneyShell>;
  if (!parsed || typeof parsed.title !== 'string') return null;

  const validIds = new Set(input.canonNodes.map((c) => c.id));
  const phasesRaw = Array.isArray(parsed._index_phases) ? parsed._index_phases : [];
  const phases: ReaderJourneyPhaseShell[] = [];
  const usedCanonIds = new Set<string>();

  for (const p of phasesRaw) {
    if (!p || typeof p.title !== 'string') continue;
    const ids = Array.isArray(p._index_primary_canon_node_ids)
      ? p._index_primary_canon_node_ids.filter((id): id is string => typeof id === 'string' && validIds.has(id) && !usedCanonIds.has(id))
      : [];
    if (ids.length === 0) {
      console.warn(`[journey] dropping phase "${p.title?.slice(0, 50)}" — no valid canon IDs`);
      continue;
    }
    ids.forEach((id) => usedCanonIds.add(id));
    phases.push({
      title: p.title.trim(),
      hook: typeof p.hook === 'string' ? p.hook : '',
      body: '',
      _internal_reader_state: typeof p._internal_reader_state === 'string' ? p._internal_reader_state : '',
      _internal_next_step_when: typeof p._internal_next_step_when === 'string' ? p._internal_next_step_when : '',
      _index_phase_number: typeof p._index_phase_number === 'number' ? p._index_phase_number : phases.length + 1,
      _index_primary_canon_node_ids: ids.slice(0, 3),
    });
  }

  if (phases.length < 2) {
    console.warn(`[journey] only ${phases.length} valid phases — journey requires ≥2; returning null`);
    return null;
  }

  // Re-number phases sequentially in case Codex returned non-contiguous numbers.
  phases.sort((a, b) => a._index_phase_number - b._index_phase_number);
  phases.forEach((p, i) => {
    p._index_phase_number = i + 1;
  });

  const allChildIds = phases.flatMap((p) => p._index_primary_canon_node_ids);
  const sourceVideoIds = Array.from(
    new Set(
      allChildIds.flatMap((cid) => {
        const c = input.canonNodes.find((x) => x.id === cid);
        return c ? input.canonNodes.filter((x) => x.id === c.id).flatMap(() => []) : [];
      }),
    ),
  );

  return {
    schemaVersion: 'v2',
    type: 'playbook',
    origin: 'derived',
    kind: 'reader_journey',
    title: parsed.title.trim(),
    lede: typeof parsed.lede === 'string' ? parsed.lede : '',
    _internal_summary: typeof parsed._internal_summary === 'string' ? parsed._internal_summary : '',
    _internal_why_it_matters: typeof parsed._internal_why_it_matters === 'string' ? parsed._internal_why_it_matters : '',
    _index_phases: phases,
    _index_evidence_segments: [],
    _index_supporting_examples: [],
    _index_supporting_stories: [],
    _index_supporting_mistakes: [],
    _index_supporting_contrarian_takes: [],
    _index_cross_link_canon: allChildIds,
    _index_source_video_ids: sourceVideoIds,
    confidenceScore: 0,
    pageWorthinessScore: 0,
    specificityScore: 0,
    creatorUniquenessScore: 0,
    evidenceQuality: 'high',
  };
}

// ── Stage 2: Phase body writer ─────────────────────────────────────────────

function buildPhaseBodyPrompt(input: PhaseBodyInput): string {
  const { phase, primaryCanons, creatorName, archetype, voiceFingerprint, phaseNumber, totalPhases } = input;
  const archetypeVoice = loadArchetypeVoice(archetype);

  const canonBlock = primaryCanons
    .map(
      (c) =>
        [
          `### "${c.title}" (id=${c.id}, type=${c.type})`,
          `Internal summary: ${c.internal_summary}`,
          ``,
          `Body excerpt (first ~400 words):`,
          c.body.split(/\s+/).slice(0, 400).join(' '),
        ].join('\n'),
    )
    .join('\n\n');

  return [
    `You are ${creatorName}, writing phase ${phaseNumber} of ${totalPhases} of your hub's reader journey.`,
    '',
    `This phase is "${phase.title}". You're writing the 200-400 word intro the reader sees when they land on this phase. After this intro, the reader clicks into the canon nodes anchored to this phase.`,
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
    `# This phase`,
    `- title: ${phase.title}`,
    `- hook: ${phase.hook}`,
    `- _internal_reader_state: ${phase._internal_reader_state}`,
    `- _internal_next_step_when: ${phase._internal_next_step_when}`,
    `- phase ${phaseNumber} of ${totalPhases}`,
    '',
    `# Anchor canon nodes (the reader clicks into these next)`,
    canonBlock,
    '',
    `# Task`,
    `Write a 200-400 word FIRST-PERSON phase intro that:`,
    `1. Opens addressing the reader's specific cognitive moment (use _internal_reader_state — but never quote it)`,
    `2. NAMES every anchor canon by its title (case-insensitive — must appear)`,
    `3. Explains what the reader will get out of this phase`,
    `4. Includes 2-5 inline [<segmentId>] citations pulled from the anchor canon bodies`,
    `5. Closes with a forward-looking line about what's next ${phaseNumber === totalPhases ? '(or "graduation" — they\'re fluent)' : `(phase ${phaseNumber + 1})`}`,
    '',
    `# Citation rules (CRITICAL)`,
    `- Pull [<segmentId>] tokens from the anchor canon bodies — they're already valid UUIDs`,
    `- 2-5 inline tokens across the phase body`,
    `- DO NOT cite in the opening sentence (let the hook breathe)`,
    `- DO NOT use [<startMs>ms-<endMs>ms] ranges`,
    '',
    `# Voice rules (HARD-FAIL otherwise)`,
    `- First-person only. NEVER "the creator", "${creatorName}", "she/he says", "in this phase"`,
    `- Reference anchor canons by their TITLES, not "the lesson on X"`,
    `- Verbatim preserveTerms`,
    `- Markdown allowed but keep it lean — this is intro copy, not a chapter`,
    '',
    `# Output format`,
    `ONE JSON object. First char \`{\`, last char \`}\`.`,
    '',
    `{`,
    `  "body": "<200-400 word first-person markdown body with [<segmentId>] citations and anchor canon titles>"`,
    `}`,
  ].filter((x) => x !== '').join('\n');
}

export async function writePhaseBody(
  input: PhaseBodyInput,
  options: { timeoutMs?: number } = {},
): Promise<PhaseBodyResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildPhaseBodyPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: `phase_body_${input.phaseNumber}_${input.phase.title.slice(0, 20).replace(/\W+/g, '_')}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as { body?: string };
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  const cited = (body.match(UUID_REGEX) ?? []).map((m) => m.replace(/[[\]]/g, ''));
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  // Quality gates — throw to trigger retry-on-failure.
  if (wordCount < 200) {
    throw new Error(`phase ${input.phaseNumber} body too short: ${wordCount} words < 200`);
  }
  if (wordCount > 600) {
    throw new Error(`phase ${input.phaseNumber} body too long: ${wordCount} words > 600 (phase intros stay tight)`);
  }
  // Naming check: every anchor canon title must appear (case-insensitive).
  const lowered = body.toLowerCase();
  const missingTitles = input.primaryCanons.map((c) => c.title).filter((t) => !lowered.includes(t.toLowerCase()));
  if (missingTitles.length > 0) {
    throw new Error(`phase ${input.phaseNumber} body missing canon titles: ${missingTitles.map((t) => `"${t}"`).join(', ')}`);
  }
  return { body, cited_segment_ids: [...new Set(cited)] };
}

/** Parallel orchestrator: writes all phase bodies for one journey shell. */
export async function writePhaseBodiesParallel(
  inputs: PhaseBodyInput[],
  options: { concurrency?: number; timeoutMs?: number; maxRetries?: number } = {},
): Promise<Map<number, PhaseBodyResult>> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 2;

  const out = new Map<number, PhaseBodyResult>();
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
          const res = await writePhaseBody(input, { timeoutMs });
          const wordCount = res.body.split(/\s+/).filter(Boolean).length;
          console.info(
            `[phase] ${input.phaseNumber}/${input.totalPhases} (${input.phase.title.slice(0, 30)}): ` +
              `${wordCount}w · ${res.cited_segment_ids.length} citations · ` +
              `${(Date.now() - start) / 1000 | 0}s` +
              (attempt > 1 ? ` · attempt ${attempt}` : ''),
          );
          out.set(input.phaseNumber, res);
          break;
        } catch (err) {
          lastErr = err as Error;
          if (attempt <= maxRetries) {
            console.warn(`[phase] ${input.phaseNumber} attempt ${attempt} failed: ${lastErr.message.slice(0, 200)} — retrying`);
            await new Promise((r) => setTimeout(r, 5000 * attempt));
          }
        }
      }
      if (!out.has(input.phaseNumber) && lastErr) {
        console.error(`[phase] ${input.phaseNumber} permanently failed: ${lastErr.message.slice(0, 200)}`);
        out.set(input.phaseNumber, { body: '', cited_segment_ids: [] });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

/** Combine the journey shell + per-phase body results into the final journey
 *  canon node payload. Mutates shell in place: each phase gets its body filled in,
 *  and the canon node's top-level body field becomes the assembled markdown
 *  (used by the renderer if the page treats journey as a single body) plus
 *  evidence_segments collected from all phase citations. */
export function applyPhaseBodiesToShell(
  shell: ReaderJourneyShell,
  phaseBodies: Map<number, PhaseBodyResult>,
): { canonBody: string; allCitedIds: string[] } {
  const sections: string[] = [];
  const allCitedIds = new Set<string>();
  for (const phase of shell._index_phases) {
    const res = phaseBodies.get(phase._index_phase_number);
    if (!res) continue;
    phase.body = res.body;
    res.cited_segment_ids.forEach((id) => allCitedIds.add(id));
    sections.push(`## Phase ${phase._index_phase_number}: ${phase.title}\n\n*${phase.hook}*\n\n${res.body}`);
  }
  const canonBody = sections.join('\n\n---\n\n');
  shell._index_evidence_segments = [...allCitedIds];
  return { canonBody, allCitedIds: [...allCitedIds] };
}
