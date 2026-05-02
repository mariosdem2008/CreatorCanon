/**
 * Workshop builder (Phase 7 / Task 7.4).
 *
 * Generates one workshop stage per reader-journey phase. Each stage's clips
 * are drawn from the phase's primary canon nodes' evidence registries, filtered
 * to high-relevance high-confidence entries with workshop-shaped roles.
 *
 * Stage IDs:  wks_<12-char hex>
 * Clip IDs:   wkc_<12-char hex>
 *
 * Independent per phase → parallelized at concurrency 2 (large context).
 * Max 2 retries with exponential backoff (5000ms × attempt).
 * On exhaustion, log WARN and skip the stage (no placeholder inserted).
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { type ArchetypeSlug } from '../../agents/skills/archetype-detector';
import { SKILL_ROOT_PATH } from '../../agents/skills/skill-loader';

const ARCHETYPE_DIR = path.join(SKILL_ROOT_PATH, 'creator-archetypes');

// ---------------------------------------------------------------------------
// Step 1: Type definitions
// ---------------------------------------------------------------------------

export type ClipRole = 'framework_step' | 'tool' | 'example' | 'mistake';

export interface WorkshopClip {
  id: string;
  segmentId: string;
  title: string;
  instruction: string;
  brief: string;
  action: string;
  startSeconds?: number;
  endSeconds?: number;
  _index_relevance_score: number;
  _index_confidence: 'high' | 'medium' | 'needs_review';
  _index_why_this_clip_teaches_this_step: string;
  _index_related_canon_node_ids: string[];
}

export interface WorkshopStage {
  id: string;
  slug: string;
  route: string;
  order: number;
  eyebrow: string;
  title: string;
  promise: string;
  brief: string;
  outcome: string;
  clips: WorkshopClip[];
  _index_related_node_ids: string[];
  _index_source_phase_number: number;
}

export interface ClipCandidate {
  segmentId: string;
  segmentText: string;
  segmentStartSec: number;
  segmentEndSec: number;
  videoId: string;
  evidenceType: ClipRole;
  supportingPhrase: string;
  whyThisSegmentFits: string;
  relevanceScore: number;
  confidence: 'high' | 'medium' | 'low' | 'needs_review' | 'unsupported';
  sourceCanonNodeId: string;
  sourceCanonTitle: string;
}

export interface WorkshopStageInput {
  phaseNumber: number;
  phaseTitle: string;
  phaseHook: string;
  phaseReaderState: string;
  phaseNextStepWhen: string;
  primaryCanonNodeIds: string[];
  candidates: ClipCandidate[];
  creatorName: string;
  archetype: ArchetypeSlug;
  voiceFingerprint: { profanityAllowed: boolean; tonePreset: string; preserveTerms: string[] };
  totalPhases: number;
}

// ---------------------------------------------------------------------------
// Step 2: filterCandidates pure function
// ---------------------------------------------------------------------------

// Phase 10 Task 10.3: accept needs_review confidence + needs_review verification status
// for thin-content creators. Phase 8 cohort had 4/7 creators (Sivers/Clouse/Huber/Norton)
// at workshops=0 because the prior filter required confidence==='high' AND
// verificationStatus==='verified' — too strict for short-clip / podcast-interview content.
const USABLE_CONFIDENCE = new Set<string>(['high', 'medium', 'needs_review']);
const USABLE_VERIFICATION = new Set<string>(['verified', 'needs_review']);

export function filterCandidates(
  phase: { _index_primary_canon_node_ids: string[] },
  canonByCanonId: Map<string, any>,    // Map<canonId, canon payload with _index_evidence_registry>
  segmentById: Map<string, { id: string; videoId: string; startMs: number; endMs: number; text: string }>,
): ClipCandidate[] {
  const out: ClipCandidate[] = [];
  for (const cid of phase._index_primary_canon_node_ids) {
    const canon = canonByCanonId.get(cid);
    if (!canon || !canon._index_evidence_registry) continue;
    for (const [segId, entry] of Object.entries(canon._index_evidence_registry)) {
      const e = entry as any;
      if (!['framework_step', 'tool', 'example', 'mistake'].includes(e.evidenceType)) continue;
      if (!USABLE_CONFIDENCE.has(e.confidence)) continue;
      if (e.relevanceScore < 80) continue;
      if (!USABLE_VERIFICATION.has(e.verificationStatus)) continue;
      const seg = segmentById.get(segId);
      if (!seg) continue;
      out.push({
        segmentId: segId,
        segmentText: seg.text,
        segmentStartSec: seg.startMs / 1000,
        segmentEndSec: seg.endMs / 1000,
        videoId: seg.videoId,
        evidenceType: e.evidenceType as ClipRole,
        supportingPhrase: e.supportingPhrase,
        whyThisSegmentFits: e.whyThisSegmentFits,
        relevanceScore: e.relevanceScore,
        confidence: e.confidence as ClipCandidate['confidence'],
        sourceCanonNodeId: cid,
        sourceCanonTitle: canon.title,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step 2b: filterAndOrderCandidates — pure helper for Stage 11 pre-selection
// ---------------------------------------------------------------------------

// Phase 10 Task 10.3: extracted as a pure helper so it's independently testable.
// Orders: high > medium > needs_review. Drops low + unsupported entirely.
// Returns [] if below min (caller must handle the skip).
export function filterAndOrderCandidates(
  candidates: Pick<ClipCandidate, 'confidence'>[],
  opts: { min: number; max: number },
): typeof candidates {
  const usable = candidates.filter((c) => USABLE_CONFIDENCE.has(c.confidence));
  if (usable.length < opts.min) return [];
  return [
    ...usable.filter((c) => c.confidence === 'high'),
    ...usable.filter((c) => c.confidence === 'medium'),
    ...usable.filter((c) => c.confidence === 'needs_review'),
  ].slice(0, opts.max);
}

// ---------------------------------------------------------------------------
// Archetype voice loader (cached, identical pattern to canon-body-writer)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// ID generators
// ---------------------------------------------------------------------------

function mkStageId(): string {
  return `wks_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function mkClipId(): string {
  return `wkc_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// ---------------------------------------------------------------------------
// Step 3: Per-stage prompt builder
// ---------------------------------------------------------------------------

function buildStagePrompt(input: WorkshopStageInput): string {
  const archetypeVoice = loadArchetypeVoice(input.archetype);
  const lines: string[] = [];

  lines.push(`You are ${input.creatorName}, designing workshop stage ${input.phaseNumber} of ${input.totalPhases}.`);
  lines.push('');
  lines.push(`This workshop stage corresponds to phase "${input.phaseTitle}" of your reader journey.`);
  lines.push(`After completing this stage, the learner moves to the next phase.`);
  lines.push('');

  if (archetypeVoice) {
    lines.push(`# Your voice (archetype: ${input.archetype})`);
    lines.push('');
    lines.push(archetypeVoice);
    lines.push('');
  }

  lines.push(`# Voice fingerprint (apply to ALL rendered fields)`);
  lines.push(`- profanityAllowed: ${input.voiceFingerprint.profanityAllowed}`);
  lines.push(`- tonePreset: ${input.voiceFingerprint.tonePreset}`);
  if (input.voiceFingerprint.preserveTerms.length > 0) {
    lines.push(`- preserveTerms (use VERBATIM, NEVER paraphrased): ${input.voiceFingerprint.preserveTerms.join(', ')}`);
  }
  lines.push('');

  lines.push(`# Phase context`);
  lines.push(`- phaseNumber: ${input.phaseNumber} of ${input.totalPhases}`);
  lines.push(`- phaseTitle: ${input.phaseTitle}`);
  lines.push(`- phaseHook: ${input.phaseHook}`);
  lines.push(`- readerState: ${input.phaseReaderState}`);
  lines.push(`- nextStepWhen: ${input.phaseNextStepWhen}`);
  lines.push('');

  lines.push(`# Available clip candidates`);
  lines.push(`Each candidate is a verified, high-relevance evidence segment from your own content.`);
  lines.push(`Pick 2-4 of them as workshop clips for this stage.`);
  lines.push('');

  for (const c of input.candidates) {
    lines.push(`---`);
    lines.push(`segmentId: ${c.segmentId}`);
    lines.push(`evidenceType: ${c.evidenceType}`);
    lines.push(`sourceCanonTitle: ${c.sourceCanonTitle}`);
    lines.push(`supportingPhrase: "${c.supportingPhrase}"`);
    lines.push(`segmentWindow: ${c.segmentStartSec}s – ${c.segmentEndSec}s`);
    lines.push(`segmentText (first 400 chars): "${c.segmentText.slice(0, 400).replace(/"/g, '\\"')}"`);
  }
  lines.push(`---`);
  lines.push('');

  lines.push(`# Task`);
  lines.push('');
  lines.push(`## Stage shell`);
  lines.push(`Write the stage's rendered metadata:`);
  lines.push(`- eyebrow: "Phase ${input.phaseNumber} · <2-4 word theme>" (rendered, e.g. "Phase 1 · First Clients")`);
  lines.push(`- title: 2-6 words, action-oriented, first-person feel`);
  lines.push(`- promise: 1 sentence, first-person, what the learner will be able to do`);
  lines.push(`- brief: 50-100 words, first-person, what this stage covers and why it matters`);
  lines.push(`- outcome: 1 sentence, behavioral — what the learner does differently after`);
  lines.push('');
  lines.push(`## Per-clip output`);
  lines.push(`For each of the 2-4 clips you select, produce:`);
  lines.push(`- segmentId: copy exactly from the candidate list (MUST match a candidate above)`);
  lines.push(`- title: 2-6 words naming the instructional moment`);
  lines.push(`- instruction: 1-sentence first-person directive ("Watch how I...", "Notice how...")`);
  lines.push(`- brief: 30-60 words, first-person, what the clip teaches`);
  lines.push(`- action: imperative bullet — the learner's concrete next action after watching`);
  lines.push(`- startSeconds: number within the candidate's segmentWindow (tighter cut OK)`);
  lines.push(`- endSeconds: number ≤ startSeconds + 180; must also be within the candidate's segmentWindow`);
  lines.push(`- whyThisClipTeachesThisStep: 1 sentence explaining the pedagogical fit`);
  lines.push('');

  lines.push(`# Voice rules (HARD-FAIL — any violation triggers a retry)`);
  lines.push(`- Write in FIRST PERSON. You ARE ${input.creatorName}.`);
  lines.push(`- NEVER write "the creator", "${input.creatorName}", "she says", "he says", "they say", "the speaker"`);
  lines.push(`- NEVER write "in this video", "in this episode", "in this talk"`);
  lines.push(`- These rules apply to ALL rendered fields: eyebrow, title, promise, brief, outcome, and every clip field`);
  lines.push(`- preserveTerms must appear VERBATIM`);
  lines.push('');

  lines.push(`# GOOD first-person examples (stage shell)`);
  lines.push(`  eyebrow: "Phase 1 · Booking First Clients"`);
  lines.push(`  title: "Land Your First Retainer"`);
  lines.push(`  promise: "I'll show you the exact sequence I use to turn cold outreach into a paid retainer."`);
  lines.push(`  brief: "Before you can worry about scale, you need proof. In this stage I break down the three-step booking sequence I ran to hit £5K MRR in 90 days — from building a prospect list, to sending the opener, to closing on a call. Every step is replicable from day one."`);
  lines.push(`  outcome: "You'll send your first outreach message and have a discovery call booked by the end of the week."`);
  lines.push('');
  lines.push(`# GOOD first-person examples (clip)`);
  lines.push(`  title: "The Cold Call Inversion"`);
  lines.push(`  instruction: "Watch how I flip the objection instead of fighting it."`);
  lines.push(`  brief: "Most cold callers crumble the moment the prospect says 'I'm not interested.' I don't. I invert the frame and let the prospect sell themselves. This 90-second clip shows the exact language pattern."`);
  lines.push(`  action: "Write out the inversion phrase in your own words, then rehearse it three times before your next call."`);
  lines.push('');

  lines.push(`# Output format`);
  lines.push(`ONE JSON object. No code fences. No preamble. First char \`{\`, last char \`}\`.`);
  lines.push('');
  lines.push(`{`);
  lines.push(`  "eyebrow": "<Phase ${input.phaseNumber} · <2-4 word theme>>",`);
  lines.push(`  "title": "<2-6 word stage title>",`);
  lines.push(`  "promise": "<1-sentence first-person promise>",`);
  lines.push(`  "brief": "<50-100 word first-person stage brief>",`);
  lines.push(`  "outcome": "<1-sentence behavioral outcome>",`);
  lines.push(`  "clips": [`);
  lines.push(`    {`);
  lines.push(`      "segmentId": "<must match a candidate segmentId above>",`);
  lines.push(`      "title": "<2-6 words>",`);
  lines.push(`      "instruction": "<1-sentence first-person directive>",`);
  lines.push(`      "brief": "<30-60 word first-person clip brief>",`);
  lines.push(`      "action": "<imperative bullet>",`);
  lines.push(`      "startSeconds": <number within segment window>,`);
  lines.push(`      "endSeconds": <number ≤ startSeconds + 180 and within segment window>,`);
  lines.push(`      "whyThisClipTeachesThisStep": "<1 sentence>"`);
  lines.push(`    }`);
  lines.push(`  ]`);
  lines.push(`}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Third-person leak detector (inline, for quality gates)
// ---------------------------------------------------------------------------

function buildThirdPersonPatterns(creatorName: string): RegExp[] {
  const escaped = creatorName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns: RegExp[] = [
    /\bthe creator\b/i,
    /\bthe speaker\b/i,
    /\bthe host\b/i,
    /\bthe author\b/i,
    /\bthe narrator\b/i,
    /\b(she|he|they)\s+(says|argues|explains|notes|claims|believes)\b/i,
    /\bin this (episode|video|talk|interview)\b/i,
    new RegExp(`\\b${escaped}\\s+(says|argues|explains|notes|claims|believes)`, 'i'),
  ];
  return patterns;
}

function checkThirdPersonLeak(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step 4: Per-stage builder function
// ---------------------------------------------------------------------------

export async function buildWorkshopStage(
  input: WorkshopStageInput,
  options: { timeoutMs?: number } = {},
): Promise<WorkshopStage> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildStagePrompt(input);

  const raw = await runCodex(prompt, { timeoutMs, label: `workshop_stage_${input.phaseNumber}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as {
    eyebrow?: string;
    title?: string;
    promise?: string;
    brief?: string;
    outcome?: string;
    clips?: Array<{
      segmentId?: string;
      title?: string;
      instruction?: string;
      brief?: string;
      action?: string;
      startSeconds?: number;
      endSeconds?: number;
      whyThisClipTeachesThisStep?: string;
    }>;
  };

  const thirdPersonPatterns = buildThirdPersonPatterns(input.creatorName);

  // ── Stage shell quality gates ────────────────────────────────────────────

  const stageEyebrow = typeof parsed.eyebrow === 'string' ? parsed.eyebrow.trim() : '';
  const stageTitle = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const stagePromise = typeof parsed.promise === 'string' ? parsed.promise.trim() : '';
  const stageBrief = typeof parsed.brief === 'string' ? parsed.brief.trim() : '';
  const stageOutcome = typeof parsed.outcome === 'string' ? parsed.outcome.trim() : '';

  for (const [fieldName, fieldValue] of [
    ['eyebrow', stageEyebrow],
    ['title', stageTitle],
    ['promise', stagePromise],
    ['brief', stageBrief],
    ['outcome', stageOutcome],
  ] as const) {
    const leak = checkThirdPersonLeak(fieldValue, thirdPersonPatterns);
    if (leak) {
      throw new Error(
        `[workshop_stage_${input.phaseNumber}] third-person leak in stage.${fieldName}: "${leak}"`,
      );
    }
  }

  // ── Clip quality gates ───────────────────────────────────────────────────

  const rawClips = Array.isArray(parsed.clips) ? parsed.clips : [];

  if (rawClips.length < 2) {
    throw new Error(
      `[workshop_stage_${input.phaseNumber}] Codex returned ${rawClips.length} clips — need ≥ 2`,
    );
  }

  const candidateSegmentIds = new Set(input.candidates.map((c) => c.segmentId));
  const candidateBySegId = new Map(input.candidates.map((c) => [c.segmentId, c]));

  const clips: WorkshopClip[] = [];

  for (const rc of rawClips) {
    const segId = typeof rc.segmentId === 'string' ? rc.segmentId.trim() : '';

    // Gate: segmentId must be from candidates (not hallucinated)
    if (!candidateSegmentIds.has(segId)) {
      throw new Error(
        `[workshop_stage_${input.phaseNumber}] Codex hallucinated segmentId "${segId}" — not in candidates list`,
      );
    }

    const candidate = candidateBySegId.get(segId)!;
    const segStart = candidate.segmentStartSec;
    const segEnd = candidate.segmentEndSec;
    const BUFFER = 5;

    const startSeconds = typeof rc.startSeconds === 'number' ? rc.startSeconds : segStart;
    const endSeconds = typeof rc.endSeconds === 'number' ? rc.endSeconds : segEnd;

    // Gate: startSeconds within segment bounds (with 5s buffer)
    if (startSeconds < segStart - BUFFER || startSeconds > segEnd + BUFFER) {
      throw new Error(
        `[workshop_stage_${input.phaseNumber}] clip segmentId=${segId} startSeconds=${startSeconds} ` +
        `outside segment window [${segStart}, ${segEnd}] (5s buffer)`,
      );
    }

    // Gate: endSeconds within segment bounds (with 5s buffer)
    if (endSeconds < segStart - BUFFER || endSeconds > segEnd + BUFFER) {
      throw new Error(
        `[workshop_stage_${input.phaseNumber}] clip segmentId=${segId} endSeconds=${endSeconds} ` +
        `outside segment window [${segStart}, ${segEnd}] (5s buffer)`,
      );
    }

    const duration = endSeconds - startSeconds;

    // Gate: duration ≤ 180s
    if (duration > 180) {
      throw new Error(
        `[workshop_stage_${input.phaseNumber}] clip segmentId=${segId} duration=${duration}s > 180s max`,
      );
    }

    // Gate: duration ≥ 15s (sanity floor)
    if (duration < 15) {
      throw new Error(
        `[workshop_stage_${input.phaseNumber}] clip segmentId=${segId} duration=${duration}s < 15s floor`,
      );
    }

    // Gate: no third-person leaks in clip rendered fields
    const clipTitle = typeof rc.title === 'string' ? rc.title.trim() : '';
    const clipInstruction = typeof rc.instruction === 'string' ? rc.instruction.trim() : '';
    const clipBrief = typeof rc.brief === 'string' ? rc.brief.trim() : '';
    const clipAction = typeof rc.action === 'string' ? rc.action.trim() : '';

    for (const [fieldName, fieldValue] of [
      ['title', clipTitle],
      ['instruction', clipInstruction],
      ['brief', clipBrief],
      ['action', clipAction],
    ] as const) {
      const leak = checkThirdPersonLeak(fieldValue, thirdPersonPatterns);
      if (leak) {
        throw new Error(
          `[workshop_stage_${input.phaseNumber}] third-person leak in clip[${segId}].${fieldName}: "${leak}"`,
        );
      }
    }

    clips.push({
      id: mkClipId(),
      segmentId: segId,
      title: clipTitle,
      instruction: clipInstruction,
      brief: clipBrief,
      action: clipAction,
      startSeconds,
      endSeconds,
      _index_relevance_score: candidate.relevanceScore,
      _index_confidence: (['high', 'medium', 'needs_review'] as const).includes(candidate.confidence as 'high' | 'medium' | 'needs_review')
        ? candidate.confidence as 'high' | 'medium' | 'needs_review'
        : 'medium',
      _index_why_this_clip_teaches_this_step:
        typeof rc.whyThisClipTeachesThisStep === 'string' ? rc.whyThisClipTeachesThisStep : '',
      _index_related_canon_node_ids: [candidate.sourceCanonNodeId],
    });
  }

  // Collect all related node IDs from selected clips
  const relatedNodeIds = [...new Set(clips.flatMap((c) => c._index_related_canon_node_ids))];

  const stageId = mkStageId();
  const titleSlug = slugify(stageTitle || `phase-${input.phaseNumber}`);

  return {
    id: stageId,
    slug: `phase-${input.phaseNumber}-${titleSlug}`,
    route: `/workshop/phase-${input.phaseNumber}-${titleSlug}`,
    order: input.phaseNumber,
    eyebrow: stageEyebrow,
    title: stageTitle,
    promise: stagePromise,
    brief: stageBrief,
    outcome: stageOutcome,
    clips,
    _index_related_node_ids: relatedNodeIds,
    _index_source_phase_number: input.phaseNumber,
  };
}

// ---------------------------------------------------------------------------
// Step 5: Parallel orchestrator
// ---------------------------------------------------------------------------

export async function buildAllWorkshopStages(
  inputs: WorkshopStageInput[],
  options: { concurrency?: number; timeoutMs?: number; maxRetries?: number } = {},
): Promise<Map<number, WorkshopStage>> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 2;

  const out = new Map<number, WorkshopStage>();
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
          const stage = await buildWorkshopStage(input, { timeoutMs });
          console.info(
            `[workshop] phase ${input.phaseNumber}/${input.totalPhases} ` +
            `("${input.phaseTitle.slice(0, 35)}"): ` +
            `${stage.clips.length} clips · ${(Date.now() - start) / 1000 | 0}s` +
            (attempt > 1 ? ` · attempt ${attempt}` : ''),
          );
          out.set(input.phaseNumber, stage);
          break;
        } catch (err) {
          lastErr = err as Error;
          if (attempt <= maxRetries) {
            console.warn(
              `[workshop] phase ${input.phaseNumber} attempt ${attempt} failed: ` +
              `${lastErr.message.slice(0, 200)} — retrying`,
            );
            await new Promise((r) => setTimeout(r, 5000 * attempt));
          }
        }
      }

      // On exhaustion: log WARN and skip (no placeholder inserted)
      if (!out.has(input.phaseNumber) && lastErr) {
        console.warn(
          `[workshop] phase ${input.phaseNumber} permanently failed after ${1 + maxRetries} attempts: ` +
          `${lastErr.message.slice(0, 200)} — skipping stage (operator action required)`,
        );
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, inputs.length || 1) },
    () => worker(),
  );
  await Promise.all(workers);
  return out;
}
