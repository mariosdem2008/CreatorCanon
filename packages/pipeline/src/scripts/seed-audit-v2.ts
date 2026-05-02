/**
 * v2 audit pipeline (Phase 5 / Task 5.11).
 *
 * Produces a Hub Source Document (per docs/superpowers/specs/2026-05-01-hub-source-document-schema.md).
 * The audit is the hub source — first-person bodies, three-category field
 * labeling (rendered / _internal_* / _index_*), per-video intelligence woven
 * into canon bodies.
 *
 * Pipeline order:
 *   1.  Channel profile (v2: _internal_* + _index_* + hero_candidates)
 *   2.  VICs (each per-video item gets a stable ID for the weaver)
 *   3.  Canon SHELLS (title/lede/_internal/_index/scores — NO body yet)
 *   4.  Per-video weaver: maps intel items to canon shells
 *   5.  Canon body writer: parallel body generation, uses weaving output
 *   6.  Synthesis shells then bodies
 *   7.  Reader journey shells then phase bodies
 *   8.  Brief shells then bodies
 *   9.  Hero candidates / hub_title / hub_tagline (final, given full canon graph)
 *   10. Evidence registry tagger (per-entity inline citation tagging)
 *   11. Workshop stages (one per reader-journey phase, uses evidence registries)
 *
 * Differences from v1 (seed-audit-via-codex.ts):
 *   - schemaVersion: 'v2' on every payload
 *   - body field replaces summary + whyItMatters + unifyingThread
 *   - first-person voice flip at extraction (not as a downstream transform)
 *   - per-video weaving step inserted between canon shells and bodies
 *   - hero_candidates generated separately, NOT pulled from quotes
 *
 * Idempotency:
 *   - Existing v2 rows (by schemaVersion === 'v2') are reused unless --regen-* is set
 *   - Legacy v1 rows are ignored (won't be reused) — v2 generates fresh
 *
 * Usage:
 *   tsx ./src/scripts/seed-audit-v2.ts <runId> [--regen-channel] [--regen-vic]
 *                                              [--regen-canon] [--regen-bodies]
 *                                              [--regen-synthesis] [--regen-journey]
 *                                              [--regen-briefs] [--regen-hero]
 *                                              [--regen-evidence] [--regen-workshops]
 *                                              [--per-video-canon]
 *
 * Flags:
 *   --regen-channel     Regenerate the channel profile (rebuilds creator-level voice)
 *   --regen-vic         Regenerate per-video intelligence cards
 *   --regen-canon       Regenerate canon shells (drops bodies, weaving, etc.)
 *   --regen-bodies      Regenerate canon bodies only (keep shells)
 *   --regen-synthesis   Regenerate synthesis pillar nodes
 *   --regen-journey     Regenerate the reader journey
 *   --regen-briefs      Regenerate page briefs
 *   --regen-hero        Regenerate hub_title / hub_tagline / hero_candidates
 *                       (with title-case + hero re-pass)
 *   --regen-evidence    Re-tag evidence registries on all entities (Stage 10)
 *   --regen-workshops   Regenerate workshop stages (Stage 11)
 *                       Using --regen-evidence and/or --regen-workshops alone
 *                       activates the late-stages-only fast path (Stages 1-9 load
 *                       existing v2 entities without regenerating; Stage 4 weaving
 *                       is skipped).
 *   --per-video-canon   Per-video canon-shell sweep (more granular but slower)
 *   --voice-mode <mode>  Override voice register: first_person | third_person_editorial | hybrid
 *                        (defaults from archetype if omitted)
 */

import crypto from 'node:crypto';

import { and, asc, closeDb, eq, getDb, inArray, sql } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  pageBrief,
  project,
  segment,
  video,
  videoIntelligenceCard,
  videoSetItem,
  visualMoment,
  workshopStage,
} from '@creatorcanon/db/schema';
import {
  filterCandidates,
  buildAllWorkshopStages,
  type WorkshopStageInput,
} from './util/workshop-builder';

import { detectArchetype, type ArchetypeSlug } from '../agents/skills/archetype-detector';
import { extractJsonFromCodexOutput } from '../agents/providers/codex-extract-json';
import { loadDefaultEnvFiles } from '../env-files';
import { runCodex } from './util/codex-runner';
import {
  weavePerVideoIntel,
  validateSelections,
  type CanonShell as WeaverCanonShell,
  type PerVideoIntelBundle,
  type WovenSelection,
} from './util/per-video-weaving';
import {
  writeCanonBodiesParallel,
  type CanonBodyInput,
  type SegmentRef,
  type WovenItem,
} from './util/canon-body-writer';
import { generateHeroCandidates } from './util/hero-candidates';
import {
  generateSynthesisShells,
  writeSynthesisBodiesParallel,
  type SynthesisShell,
  type SynthesisBodyInput,
  type ChildCanonRef,
} from './util/synthesis-body-writer';
import {
  generateReaderJourneyShell,
  writePhaseBodiesParallel,
  applyPhaseBodiesToShell,
  type ReaderJourneyShell,
  type PhaseBodyInput,
  type CanonRefForJourney,
} from './util/journey-body-writer';
import {
  generateBriefShells,
  writeBriefBodiesParallel,
  type PageBriefShell,
  type BriefBodyInput,
  type CanonRefForBrief,
} from './util/brief-body-writer';
import { enforceTitleCase } from './util/title-casing';
import { refineHeroBlock } from './util/hero-rewrite';
import { tagAllEntities, type EvidenceTaggerInput } from './util/evidence-tagger';
import { type VoiceMode, defaultVoiceMode, isVoiceMode } from './util/voice-mode';

loadDefaultEnvFiles();

// ── Codex JSON helper (same retry pattern as v1) ───────────────────────────

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const CANON_TIMEOUT_MS = 30 * 60 * 1000;

async function codexJson<T>(prompt: string, label: string, timeoutMs: number = DEFAULT_TIMEOUT_MS, expect: 'object' | 'array' = 'object'): Promise<T> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = await runCodex(prompt, { timeoutMs, label });
      const json = extractJsonFromCodexOutput(raw);
      const parsed = JSON.parse(json);
      const actualKind = Array.isArray(parsed) ? 'array' : (parsed != null && typeof parsed === 'object' ? 'object' : 'other');
      if (actualKind === expect) return parsed as T;
      if (expect === 'array' && actualKind === 'object') {
        console.warn(`[v2] ${label}: wrapped single object as array`);
        return [parsed] as unknown as T;
      }
      throw new Error(`expected JSON ${expect}, got ${actualKind}`);
    } catch (err) {
      lastErr = err;
      console.warn(`[v2] ${label} attempt ${attempt}/${maxAttempts} failed: ${(err as Error).message.slice(0, 200)}`);
      if (attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

// ── Loaders ─────────────────────────────────────────────────────────────────

async function loadRun(runId: string) {
  const db = getDb();
  const r = await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1);
  if (!r[0]) throw new Error(`Run ${runId} not found`);
  return r[0];
}

async function loadProjectTitle(projectId: string): Promise<string | null> {
  const db = getDb();
  const r = await db.select({ title: project.title }).from(project).where(eq(project.id, projectId)).limit(1);
  return r[0]?.title ?? null;
}

async function loadVideos(videoSetId: string) {
  const db = getDb();
  const items = await db
    .select({ videoId: videoSetItem.videoId, position: videoSetItem.position })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, videoSetId))
    .orderBy(asc(videoSetItem.position));
  const ids = items.map((i) => i.videoId);
  if (ids.length === 0) return [];
  const meta = await db
    .select({ id: video.id, title: video.title, durationSec: video.durationSeconds })
    .from(video)
    .where(inArray(video.id, ids));
  const byId = new Map(meta.map((m) => [m.id, m]));
  return items.map((it) => {
    const m = byId.get(it.videoId);
    return {
      videoId: it.videoId,
      title: m?.title ?? '(Untitled)',
      durationSec: m?.durationSec ?? 0,
      position: it.position,
    };
  });
}

interface LoadedSegment { segmentId: string; videoId: string; startMs: number; endMs: number; text: string; }

async function loadSegments(runId: string, videoId: string): Promise<LoadedSegment[]> {
  const db = getDb();
  return db
    .select({
      segmentId: segment.id,
      videoId: segment.videoId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    })
    .from(segment)
    .where(and(eq(segment.runId, runId), eq(segment.videoId, videoId)))
    .orderBy(asc(segment.startMs));
}

interface LoadedVisualMoment { visualMomentId: string; videoId: string; timestampMs: number; type: string; description: string; hubUse: string; usefulnessScore: number; }

async function loadVisualMoments(runId: string, videoId: string): Promise<LoadedVisualMoment[]> {
  const db = getDb();
  return db
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
    .where(and(eq(visualMoment.runId, runId), eq(visualMoment.videoId, videoId)));
}

function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Codex sometimes returns scores as 0-1 fractions instead of 0-100 integers.
 *  Normalize to integer 0-100. */
function normalizeScore(x: unknown): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return 0;
  const scaled = x > 0 && x <= 1 ? Math.round(x * 100) : Math.round(x);
  return Math.max(0, Math.min(100, scaled));
}

// ── v2 schema types ────────────────────────────────────────────────────────

interface ChannelProfile_v2 {
  schemaVersion: 'v2';
  creatorName: string;
  hub_title: string;
  hub_tagline: string;
  hero_candidates: string[];
  _internal_niche: string;
  _internal_audience: string;
  _internal_dominant_tone: string;
  _internal_recurring_themes: string[];
  _internal_recurring_promise: string;
  _internal_monetization_angle: string;
  _internal_positioning_summary: string;
  _internal_why_people_follow: string;
  _index_creator_terminology: string[];
  _index_content_formats: string[];
  _index_archetype: ArchetypeSlug;
  _index_expertise_category: string;
}

interface VIC_v2 {
  schemaVersion: 'v2';
  videoId: string;
  video_summary: string;
  _internal_creator_voice_notes: string[];
  _index_main_ideas: Array<{ id: string; text: string; segments: string[] }>;
  _index_lessons: Array<{ id: string; text: string; segments: string[] }>;
  _index_examples: Array<{ id: string; text: string; segments: string[] }>;
  _index_stories: Array<{ id: string; text: string; segments: string[] }>;
  _index_mistakes_to_avoid: Array<{ id: string; mistake: string; why: string; correction: string; segments: string[] }>;
  _index_failure_modes: Array<{ id: string; text: string; segments: string[] }>;
  _index_counter_cases: Array<{ id: string; text: string; segments: string[] }>;
  _index_quotes_verbatim: Array<{ id: string; text: string; segment: string }>;
  _index_quotes_cleaned: Array<{ id: string; text: string; verbatim_id: string }>;
  _index_strong_claims: Array<{ id: string; text: string; segments: string[] }>;
  _index_contrarian_takes: Array<{ id: string; text: string; segments: string[] }>;
  _index_terms_defined: Array<{ id: string; term: string; definition: string; segment: string }>;
  _index_tools_mentioned: string[];
  _index_recommended_hub_uses: string[];
}

interface CanonShell_v2 {
  schemaVersion: 'v2';
  type: string;
  origin: string;
  kind?: string;
  title: string;
  lede: string;
  // body filled in by Task 5.9 body writer
  _internal_summary: string;
  _internal_why_it_matters: string;
  _internal_when_to_use?: string;
  _internal_when_not_to_use?: string;
  _internal_common_mistake?: string;
  _internal_success_signal?: string;
  _internal_sequencing_rationale?: string;
  _index_evidence_segments: string[];
  _index_supporting_examples: string[];
  _index_supporting_stories: string[];
  _index_supporting_mistakes: string[];
  _index_supporting_contrarian_takes: string[];
  _index_cross_link_canon: string[];
  _index_source_video_ids: string[];
  confidenceScore: number;
  pageWorthinessScore: number;
  specificityScore: number;
  creatorUniquenessScore: number;
  evidenceQuality: 'high' | 'medium' | 'low';
}

// ── Stage 1: Channel profile ───────────────────────────────────────────────

async function generateChannelProfileV2(
  runId: string,
  videos: Array<{ videoId: string; title: string; durationSec: number }>,
  creatorHint: string | null,
): Promise<ChannelProfile_v2> {
  // Scatter-sample segments per video (kept from Phase 1.7 fix).
  const SEGMENTS_PER_VIDEO = 16;
  const samples: string[] = [];
  for (const v of videos) {
    const segs = await loadSegments(runId, v.videoId);
    if (segs.length <= SEGMENTS_PER_VIDEO) {
      samples.push(`### ${v.title} (${Math.round(v.durationSec / 60)} min)\n${segs.map((s) => `[${s.segmentId}] ${s.text}`).join('\n')}`);
      continue;
    }
    const buckets = 4;
    const perBucket = Math.floor(SEGMENTS_PER_VIDEO / buckets);
    const stride = Math.floor(segs.length / buckets);
    const picked: typeof segs = [];
    for (let b = 0; b < buckets; b += 1) {
      const start = b * stride;
      const slice = segs.slice(start, b === buckets - 1 ? segs.length : start + stride);
      const innerStride = Math.max(1, Math.floor(slice.length / perBucket));
      for (let i = 0; i < slice.length && picked.length < (b + 1) * perBucket; i += innerStride) {
        picked.push(slice[i]!);
      }
    }
    samples.push(`### ${v.title} (${Math.round(v.durationSec / 60)} min)\n${picked.map((s) => `[${s.segmentId}] ${s.text}`).join('\n')}`);
  }

  const creatorHintBlock = creatorHint
    ? `\n# CREATOR NAME HINT\nThe operator identified the creator as "${creatorHint}". If the segments don't state the name, USE THIS HINT for creatorName.\n`
    : '';

  const prompt = [
    'You are channel_profiler. Build a v2 ChannelProfile that other agents in the pipeline will use as context.',
    '',
    'The output is a Hub Source Document — three field categories:',
    '  - plain field name = rendered (appears in published hub: hub_title, hub_tagline, hero_candidates)',
    '  - _internal_* = planning (operator-debug only)',
    '  - _index_* = indexing (cross-references, search aids)',
    '',
    'The hero_candidates and hub_title/tagline will be REPLACED later by the dedicated hero generator. For now, output placeholder lines — the hero generator will overwrite them with billboard-quality copy.',
    '',
    `# Videos (${videos.length})`,
    videos.map((v) => `- ${v.videoId}: ${v.title} (${Math.round(v.durationSec / 60)} min)`).join('\n'),
    creatorHintBlock,
    '# Segment samples',
    samples.join('\n\n'),
    '',
    '# OUTPUT FORMAT (v2 schema)',
    'ONE JSON object. No code fences. First char `{`, last char `}`.',
    '',
    '{',
    '  "schemaVersion": "v2",',
    '  "creatorName": "string",',
    '  "hub_title": "<placeholder — will be regenerated>",',
    '  "hub_tagline": "<placeholder>",',
    '  "hero_candidates": ["placeholder"],',
    '  "_internal_niche": "string",',
    '  "_internal_audience": "string",',
    '  "_internal_dominant_tone": "ONE of: blunt-tactical | analytical-detached | warm-coaching | reflective-thoughtful (NO comma-separated descriptors)",',
    '  "_internal_recurring_themes": ["3-8 strings"],',
    '  "_internal_recurring_promise": "string",',
    '  "_internal_monetization_angle": "string",',
    '  "_internal_positioning_summary": "string",',
    '  "_internal_why_people_follow": "string",',
    '  "_index_creator_terminology": ["verbatim creator phrases for inline glossing"],',
    '  "_index_content_formats": ["string"],',
    '  "_index_archetype": "operator-coach | science-explainer | instructional-craft | contemplative-thinker | _DEFAULT",',
    '  "_index_expertise_category": "string"',
    '}',
    '',
    'Rules: be specific. _internal_dominant_tone must be ONE canonical value. JSON only.',
  ].join('\n');

  console.info('[v2] Generating channel profile…');
  return codexJson<ChannelProfile_v2>(prompt, 'channel_profile_v2');
}

// ── Stage 2: VIC ────────────────────────────────────────────────────────────

async function generateVicV2(
  runId: string,
  v: { videoId: string; title: string; durationSec: number },
  profile: ChannelProfile_v2,
): Promise<VIC_v2> {
  const segs = await loadSegments(runId, v.videoId);
  const vis = await loadVisualMoments(runId, v.videoId);

  const segBlock = segs.map((s) => `[${s.segmentId}] (${formatTs(s.startMs)}) "${s.text.slice(0, 600)}"`).join('\n');
  const visBlock = vis.length > 0
    ? vis.map((m) => `[${m.visualMomentId}] ${m.timestampMs}ms ${m.type}: ${m.description}`).join('\n')
    : '(no visual moments)';

  const prompt = [
    'You are video_analyst. Produce a v2 VIC (Video Intelligence Card) for ONE video.',
    '',
    'In v2, VIC is mostly indexing — every per-video item carries a stable ID so the per-video weaver (next stage) can map items to canon nodes by reference.',
    '',
    '# Channel context',
    `- creator: ${profile.creatorName}`,
    `- niche: ${profile._internal_niche}`,
    `- archetype: ${profile._index_archetype}`,
    `- dominant tone: ${profile._internal_dominant_tone}`,
    '',
    `# Video: ${v.title} (${Math.round(v.durationSec / 60)} min)`,
    '',
    `# Transcript (${segs.length} segments)`,
    segBlock,
    '',
    `# Visual moments (${vis.length})`,
    visBlock,
    '',
    '# Citation rules',
    'When citing transcript evidence, use [<segmentId>] tokens (UUIDs from above). NEVER use [<startMs>ms-<endMs>ms] ranges.',
    '',
    '# v2 ID rules',
    'Every item in _index_main_ideas, _index_lessons, _index_examples, _index_stories, _index_mistakes_to_avoid, _index_failure_modes, _index_counter_cases, _index_strong_claims, _index_contrarian_takes, _index_terms_defined, _index_quotes_verbatim, _index_quotes_cleaned MUST carry a stable id field. Use prefixes:',
    '  - mi_<short> for main_ideas',
    '  - les_<short> for lessons',
    '  - ex_<short> for examples',
    '  - st_<short> for stories',
    '  - mst_<short> for mistakes',
    '  - fm_<short> for failure_modes',
    '  - cc_<short> for counter_cases',
    '  - sc_<short> for strong_claims',
    '  - take_<short> for contrarian_takes',
    '  - tm_<short> for terms_defined',
    '  - qv_<short> for quotes_verbatim',
    '  - qc_<short> for quotes_cleaned',
    'Where <short> is a 6-char alphanumeric you choose, unique within this VIC.',
    '',
    '# Quote handling',
    '- _index_quotes_verbatim: preserves spoken stutters (e.g. "AI is, it\'s a service-based business")',
    '- _index_quotes_cleaned: same content, fixed grammar (e.g. "AI is a service-based business"). The cleaned version is what the hero generator and body writer reference. The verbatim_id field links cleaned back to verbatim.',
    '',
    '# OUTPUT FORMAT',
    'ONE JSON object. No code fences. First char `{`, last char `}`.',
    '',
    '{',
    `  "schemaVersion": "v2",`,
    `  "videoId": "${v.videoId}",`,
    '  "video_summary": "<100-200 word first-person summary, as if the creator wrote a chapter intro. NEVER \\"in this video\\", \\"the speaker\\", or third-person attribution — write \\"I cover X\\" or \\"this is where I explain Y\\" instead>",',
    '  "_internal_creator_voice_notes": ["string"],',
    '  "_index_main_ideas": [{"id":"mi_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_lessons": [{"id":"les_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_examples": [{"id":"ex_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_stories": [{"id":"st_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_mistakes_to_avoid": [{"id":"mst_xxx","mistake":"...","why":"...","correction":"...","segments":["<segId>"]}],',
    '  "_index_failure_modes": [{"id":"fm_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_counter_cases": [{"id":"cc_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_quotes_verbatim": [{"id":"qv_xxx","text":"<as spoken, including stutters>","segment":"<segId>"}],',
    '  "_index_quotes_cleaned": [{"id":"qc_xxx","text":"<cleaned grammar>","verbatim_id":"qv_xxx"}],',
    '  "_index_strong_claims": [{"id":"sc_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_contrarian_takes": [{"id":"take_xxx","text":"...","segments":["<segId>"]}],',
    '  "_index_terms_defined": [{"id":"tm_xxx","term":"...","definition":"...","segment":"<segId>"}],',
    '  "_index_tools_mentioned": ["string"],',
    '  "_index_recommended_hub_uses": ["string"]',
    '}',
    '',
    'Drop weak items. Use the creator\'s words. JSON only.',
  ].join('\n');

  console.info(`[v2] Generating VIC for ${v.title}…`);
  return codexJson<VIC_v2>(prompt, `vic_${v.videoId}`);
}

// ── Stage 3: Canon shells ──────────────────────────────────────────────────

interface PerVideoCanonContext {
  vic: VIC_v2;
  video: { videoId: string; title: string };
}

function buildCanonShellPrompt(
  profile: ChannelProfile_v2,
  context: PerVideoCanonContext[],
  alreadyHave: string[],
  remaining: number,
): string {
  const vicBlock = context.map((c) => {
    const v = c.vic;
    const items: string[] = [];
    items.push(`### ${c.video.title} (${c.video.videoId})`);
    items.push(`Main ideas (${v._index_main_ideas.length}): ${v._index_main_ideas.map((i) => `(${i.id}) ${i.text}`).slice(0, 8).join(' | ')}`);
    items.push(`Frameworks/lessons (${v._index_lessons.length}): ${v._index_lessons.map((i) => `(${i.id}) ${i.text}`).slice(0, 6).join(' | ')}`);
    items.push(`Strong claims (${v._index_strong_claims.length}): ${v._index_strong_claims.map((i) => `(${i.id}) ${i.text}`).slice(0, 5).join(' | ')}`);
    items.push(`Terms defined (${v._index_terms_defined.length}): ${v._index_terms_defined.map((t) => `${t.term}`).join(', ')}`);
    return items.join('\n');
  }).join('\n\n');

  const alreadyBlock = alreadyHave.length > 0
    ? `\n# Already-generated canon titles (DO NOT repeat — produce DIFFERENT)\n${alreadyHave.map((t) => `- ${t}`).join('\n')}`
    : '';

  return [
    'You are canon_architect (v2). Extract canon SHELLS — title, lede, _internal, _index, scores. NO body yet (the body writer runs after this stage).',
    '',
    'Three field categories:',
    '  - plain = rendered (title, lede)',
    '  - _internal_* = planning',
    '  - _index_* = indexing (cross-references, IDs, scores feed validators)',
    '',
    `# Channel profile`,
    `- creator: ${profile.creatorName}`,
    `- archetype: ${profile._index_archetype}`,
    `- dominant tone: ${profile._internal_dominant_tone}`,
    `- creator terminology (preserve VERBATIM): ${profile._index_creator_terminology.slice(0, 12).join(', ')}`,
    '',
    `# Per-video intelligence (${context.length} videos)`,
    vicBlock,
    alreadyBlock,
    '',
    '# Voice rules',
    '- title (rendered): 2-6 words, concept label, FIRST-PERSON feel where natural',
    '- lede (rendered): 1-2 sentences, FIRST-PERSON, hook quality',
    '- _internal_summary: 1-2 sentences, third-person OK (operator-facing)',
    '- _index_evidence_segments: segment IDs the body will eventually cite (pre-populate from VIC items you reference)',
    '- _index_supporting_examples / stories / mistakes / contrarian_takes: empty here — the per-video weaver fills these in next stage',
    '',
    '# Task',
    `Produce up to ${remaining} DISTINCT canon SHELLS. For each, pick a named, teachable unit (framework / lesson / playbook / principle / pattern / tactic / definition / aha_moment / quote / topic / example).`,
    '',
    'Pick from the per-video items above. The CANON SHELL records WHAT the canon node is and WHICH source items will be woven later — but does not yet write the body.',
    '',
    '# Output format',
    `ONE JSON ARRAY of ${Math.min(remaining, 6)}-${remaining} canon shell objects. First char \`[\`, last char \`]\`.`,
    '',
    '[',
    '  {',
    '    "schemaVersion": "v2",',
    '    "type": "framework | lesson | playbook | principle | pattern | tactic | definition | aha_moment | quote | topic | example",',
    '    "origin": "multi_video | single_video | channel_profile | derived",',
    '    "title": "...",',
    '    "lede": "<1-2 sentence first-person teaser>",',
    '    "_internal_summary": "...",',
    '    "_internal_why_it_matters": "...",',
    '    "_internal_when_to_use": null,',
    '    "_internal_when_not_to_use": null,',
    '    "_internal_common_mistake": null,',
    '    "_internal_success_signal": null,',
    '    "_internal_sequencing_rationale": null,',
    '    "_index_evidence_segments": ["<segId>"],',
    '    "_index_supporting_examples": [],',
    '    "_index_supporting_stories": [],',
    '    "_index_supporting_mistakes": [],',
    '    "_index_supporting_contrarian_takes": [],',
    '    "_index_cross_link_canon": [],',
    '    "_index_source_video_ids": ["<videoId>"],',
    '    "confidenceScore": 0,',
    '    "pageWorthinessScore": 0,',
    '    "specificityScore": 0,',
    '    "creatorUniquenessScore": 0,',
    '    "evidenceQuality": "high"',
    '  }',
    ']',
  ].join('\n');
}

async function generateCanonShellsV2(
  profile: ChannelProfile_v2,
  vics: VIC_v2[],
  videos: Array<{ videoId: string; title: string; durationSec: number }>,
  perVideo: boolean,
): Promise<CanonShell_v2[]> {
  const TARGET = perVideo ? Math.max(8, 6 * videos.length) : 18;
  // Codex CLI's "single best" tendency means each iter often returns 1.
  // Allow 2x iterations so we still hit TARGET when output is degenerate.
  const MAX_ITERATIONS = perVideo ? Math.max(12, 8 * videos.length) : 18;
  const accumulated: CanonShell_v2[] = [];
  const seenTitles = new Set<string>();

  const allContext: PerVideoCanonContext[] = vics.map((v) => ({
    vic: v,
    video: videos.find((x) => x.videoId === v.videoId)!,
  }));

  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const remaining = TARGET - accumulated.length;
    if (remaining <= 0) break;

    // For per-video mode, rotate through videos.
    const ctx = perVideo ? [allContext[i % allContext.length]!] : allContext;
    const prompt = buildCanonShellPrompt(profile, ctx, [...seenTitles], remaining);

    let batch: CanonShell_v2[];
    try {
      batch = await codexJson<CanonShell_v2[]>(prompt, `canon_shell_iter_${i + 1}`, CANON_TIMEOUT_MS, 'array');
    } catch (err) {
      console.warn(`[v2] canon shell iter ${i + 1} failed: ${(err as Error).message}`);
      continue;
    }
    let added = 0;
    for (const shell of batch) {
      const title = shell.title?.trim();
      if (!title) continue;
      const key = title.toLowerCase();
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      accumulated.push(shell);
      added += 1;
    }
    console.info(`[v2] canon shell iter ${i + 1}: +${added} (total ${accumulated.length})`);
    if (added === 0) break;
  }

  return accumulated;
}

// ── Main pipeline ──────────────────────────────────────────────────────────

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/seed-audit-v2.ts <runId>');

  const regenChannel = process.argv.includes('--regen-channel');
  const regenVic = process.argv.includes('--regen-vic');
  const regenCanon = process.argv.includes('--regen-canon');
  const regenBodies = process.argv.includes('--regen-bodies');
  const regenSynthesis = process.argv.includes('--regen-synthesis');
  const regenJourney = process.argv.includes('--regen-journey');
  const regenBriefs = process.argv.includes('--regen-briefs');
  const regenHero = process.argv.includes('--regen-hero');
  const regenEvidence = process.argv.includes('--regen-evidence');
  const regenWorkshops = process.argv.includes('--regen-workshops');
  const perVideo = process.argv.includes('--per-video-canon');

  const voiceModeFlag = (() => {
    const idx = process.argv.indexOf('--voice-mode');
    if (idx < 0) return null;
    const val = process.argv[idx + 1];
    if (val === 'first_person' || val === 'third_person_editorial' || val === 'hybrid') {
      return val as VoiceMode;
    }
    console.warn(`[v2] --voice-mode: invalid value "${val}", ignoring`);
    return null;
  })();

  // Late-stages-only fast path: if the operator runs ONLY --regen-evidence
  // and/or --regen-workshops (no other regen flags), the existing v2 entities
  // from Stages 1-9 are reused as-is. The flag below short-circuits the
  // stage-1-through-9 work without disturbing it.
  const onlyLateStages =
    (regenEvidence || regenWorkshops) &&
    !regenChannel && !regenVic && !regenCanon && !regenBodies &&
    !regenSynthesis && !regenJourney && !regenBriefs && !regenHero;
  if (onlyLateStages) {
    console.info('[v2] late-stages-only mode: Stages 1-9 will load existing v2 entities without regenerating.');
  }

  const run = await loadRun(runId);
  if (!run.videoSetId) throw new Error('Run has no video_set_id');
  console.info(`[v2] Run ${runId} status=${run.status}`);

  const projectTitle = run.projectId ? await loadProjectTitle(run.projectId) : null;
  const creatorHint = projectTitle ? (projectTitle.match(/^([^—–-]+?)(?:\s*[—–-]\s+|$)/)?.[1]?.trim() ?? null) : null;

  const videos = await loadVideos(run.videoSetId);
  if (videos.length === 0) throw new Error('Run has no videos');
  console.info(`[v2] ${videos.length} videos · creator hint: ${creatorHint ?? '(none)'}`);

  const db = getDb();
  await db.update(generationRun).set({ status: 'running' }).where(eq(generationRun.id, runId));

  // ── Stage 1: Channel profile ──────────────────────────────
  let profile: ChannelProfile_v2;
  const existingCp = await db.select({ payload: channelProfile.payload }).from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (existingCp[0] && (existingCp[0].payload as { schemaVersion?: string }).schemaVersion === 'v2' && !regenChannel) {
    profile = existingCp[0].payload as unknown as ChannelProfile_v2;
    console.info(`[v2] channel profile resumed: ${profile.creatorName} / ${profile._internal_niche.slice(0, 60)}`);
  } else {
    if (regenChannel) await db.delete(channelProfile).where(eq(channelProfile.runId, runId));
    profile = await generateChannelProfileV2(runId, videos, creatorHint);
    // Pin archetype using detector if Codex didn't pick one cleanly.
    if (!['operator-coach', 'science-explainer', 'instructional-craft', 'contemplative-thinker', '_DEFAULT'].includes(profile._index_archetype)) {
      profile._index_archetype = detectArchetype({
        niche: profile._internal_niche,
        dominantTone: profile._internal_dominant_tone,
        expertiseCategory: profile._index_expertise_category,
        recurringThemes: profile._internal_recurring_themes,
        creatorTerminology: profile._index_creator_terminology,
      });
      console.info(`[v2] archetype refined to ${profile._index_archetype}`);
    }
    await db.insert(channelProfile).values({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      runId,
      payload: profile as unknown as Record<string, unknown>,
    });
    console.info(`[v2] channel profile written: ${profile.creatorName} / ${profile._index_archetype}`);
  }

  const storedRaw = (profile as unknown as Record<string, unknown>)._index_voice_mode;
  const storedVoiceMode = isVoiceMode(storedRaw) ? storedRaw : undefined;
  if (storedRaw !== undefined && storedRaw !== null && storedVoiceMode === undefined) {
    console.warn(`[v2] _index_voice_mode has invalid value "${String(storedRaw)}"; falling back to archetype default`);
  }
  const resolvedVoiceMode: VoiceMode =
    voiceModeFlag ?? storedVoiceMode ?? defaultVoiceMode(profile._index_archetype);

  // Persist if missing on profile (additive; doesn't overwrite existing)
  if (!(profile as unknown as Record<string, unknown>)._index_voice_mode) {
    (profile as unknown as Record<string, unknown>)._index_voice_mode = resolvedVoiceMode;
    await db.update(channelProfile)
      .set({ payload: profile as unknown as Record<string, unknown> })
      .where(eq(channelProfile.runId, runId));
  }

  console.info(`[v2] voiceMode: ${resolvedVoiceMode} (archetype=${profile._index_archetype})`);

  // ── Stage 2: VICs ─────────────────────────────────────────
  const existingVics = await db
    .select({ videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));
  const vicByVideoId = new Map(existingVics.map((r) => [r.videoId, r]));

  const vics: VIC_v2[] = [];
  for (const v of videos) {
    const existing = vicByVideoId.get(v.videoId);
    if (existing && (existing.payload as { schemaVersion?: string }).schemaVersion === 'v2' && !regenVic) {
      vics.push(existing.payload as unknown as VIC_v2);
      console.info(`[v2] VIC resumed for ${v.videoId}`);
      continue;
    }
    if (regenVic && existing) {
      await db.delete(videoIntelligenceCard).where(and(eq(videoIntelligenceCard.runId, runId), eq(videoIntelligenceCard.videoId, v.videoId)));
    }
    const vic = await generateVicV2(runId, v, profile);
    await db.insert(videoIntelligenceCard).values({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      runId,
      videoId: v.videoId,
      payload: vic as unknown as Record<string, unknown>,
      evidenceSegmentIds: vic._index_main_ideas.flatMap((i) => i.segments).slice(0, 50),
    });
    vics.push(vic);
  }

  // ── Stage 3: Canon shells ─────────────────────────────────
  let canonShells: CanonShell_v2[];
  const existingCanon = await db.select({ id: canonNode.id, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, runId));
  const v2Canon = existingCanon.filter((c) => (c.payload as { schemaVersion?: string }).schemaVersion === 'v2');

  if (v2Canon.length > 0 && !regenCanon) {
    canonShells = v2Canon.map((c) => c.payload as unknown as CanonShell_v2);
    console.info(`[v2] canon shells resumed: ${canonShells.length}`);
  } else {
    if (regenCanon) {
      // Delete only v2 canon nodes; legacy v1 stays.
      const v2Ids = v2Canon.map((c) => c.id);
      if (v2Ids.length > 0) await db.delete(canonNode).where(inArray(canonNode.id, v2Ids));
    }
    canonShells = await generateCanonShellsV2(profile, vics, videos, perVideo);
    // Title-case enforcement on canon titles (Task 6.4): Codex generators
    // sometimes produce "pre-10k a month revenue" instead of proper case.
    for (const shell of canonShells) {
      const before = shell.title;
      shell.title = enforceTitleCase(shell.title);
      if (shell.title !== before) {
        console.info(`[v2] title-case: "${before}" → "${shell.title}"`);
      }
    }
    console.info(`[v2] ${canonShells.length} canon shells generated`);
  }

  // Persist canon shells WITHOUT bodies. Each gets a stable cn_xxx ID.
  const canonShellIds = new Map<string, string>(); // title → cn_id
  if (v2Canon.length === 0 || regenCanon) {
    for (const shell of canonShells) {
      const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
      canonShellIds.set(shell.title, id);
      // Normalize scores in case Codex returned fractions.
      shell.confidenceScore = normalizeScore(shell.confidenceScore);
      shell.pageWorthinessScore = normalizeScore(shell.pageWorthinessScore);
      shell.specificityScore = normalizeScore(shell.specificityScore);
      shell.creatorUniquenessScore = normalizeScore(shell.creatorUniquenessScore);
      await db.insert(canonNode).values({
        id,
        workspaceId: run.workspaceId,
        runId,
        type: shell.type as any,
        payload: shell as unknown as Record<string, unknown>,
        evidenceSegmentIds: shell._index_evidence_segments.slice(0, 50),
        sourceVideoIds: shell._index_source_video_ids,
        evidenceQuality: shell.evidenceQuality,
        origin: shell.origin as any,
        confidenceScore: shell.confidenceScore,
        pageWorthinessScore: shell.pageWorthinessScore,
        specificityScore: shell.specificityScore,
        creatorUniquenessScore: shell.creatorUniquenessScore,
        citationCount: shell._index_evidence_segments.length,
        sourceCoverage: shell._index_source_video_ids.length,
      });
    }
    console.info(`[v2] ${canonShells.length} canon shells persisted`);
  } else {
    // Resumed — populate canonShellIds map from DB.
    for (const c of v2Canon) {
      const shell = c.payload as unknown as CanonShell_v2;
      canonShellIds.set(shell.title, c.id);
    }
  }

  // ── Stage 4: Per-video weaving ─────────────────────────────
  console.info(`[v2] Stage 4: per-video weaving (${canonShells.length} canon × ${vics.length} VICs)`);

  const intelBundle: PerVideoIntelBundle = {
    examples: vics.flatMap((v) => v._index_examples.map((i) => ({ id: i.id, text: i.text, videoId: v.videoId }))),
    stories: vics.flatMap((v) => v._index_stories.map((i) => ({ id: i.id, text: i.text, videoId: v.videoId }))),
    mistakes: vics.flatMap((v) => v._index_mistakes_to_avoid.map((i) => ({
      id: i.id, text: `${i.mistake} — ${i.why}`, mistake: i.mistake, why: i.why, correction: i.correction, videoId: v.videoId,
    }))),
    contrarianTakes: vics.flatMap((v) => v._index_contrarian_takes.map((i) => ({ id: i.id, text: i.text, videoId: v.videoId }))),
  };

  const weaverInputs: WeaverCanonShell[] = canonShells.map((s, i) => ({
    id: canonShellIds.get(s.title) ?? `cn_temp_${i}`,
    title: s.title,
    type: s.type,
    internal_summary: s._internal_summary,
    sourceVideoIds: s._index_source_video_ids,
  }));

  let selections: Map<string, WovenSelection>;
  if (!onlyLateStages) {
    const rawSelections = await weavePerVideoIntel(weaverInputs, intelBundle, { concurrency: 3 });
    selections = validateSelections(rawSelections, intelBundle);
  } else {
    console.info(`[v2] Stage 4: skipped (late-stages-only mode)`);
    selections = new Map();
  }

  // ── Stage 5: Canon body writing ────────────────────────────
  console.info(`[v2] Stage 5: canon body writing (${canonShells.length} bodies, parallel concurrency 3)`);

  // Build segment lookup for body writer.
  const segByVideo = new Map<string, LoadedSegment[]>();
  for (const v of videos) {
    segByVideo.set(v.videoId, await loadSegments(runId, v.videoId));
  }
  const segById = new Map<string, LoadedSegment>();
  for (const arr of segByVideo.values()) for (const s of arr) segById.set(s.segmentId, s);

  // Build per-canon body inputs.
  const degradedNoSegmentsCanonIds = new Set<string>();

  const bodyInputs: CanonBodyInput[] = canonShells.map((shell, i) => {
    const id = canonShellIds.get(shell.title) ?? `cn_temp_${i}`;
    const sel = selections.get(id) ?? { example_ids: [], story_ids: [], mistake_ids: [], contrarian_take_ids: [] };

    // Build segment refs. Source = shell's _index_evidence_segments PLUS
    // segments from the woven items' source segments. Wider pool means
    // the body has more concrete evidence to cite.
    const segIdsForBody = new Set<string>(shell._index_evidence_segments);
    for (const eid of sel.example_ids) {
      const vicItem = vics
        .flatMap((v) => v._index_examples)
        .find((i) => i.id === eid);
      vicItem?.segments.forEach((sid) => segIdsForBody.add(sid));
    }
    for (const sid of sel.story_ids) {
      const vicItem = vics.flatMap((v) => v._index_stories).find((i) => i.id === sid);
      vicItem?.segments.forEach((s) => segIdsForBody.add(s));
    }
    for (const mid of sel.mistake_ids) {
      const vicItem = vics.flatMap((v) => v._index_mistakes_to_avoid).find((i) => i.id === mid);
      vicItem?.segments.forEach((s) => segIdsForBody.add(s));
    }
    for (const tid of sel.contrarian_take_ids) {
      const vicItem = vics.flatMap((v) => v._index_contrarian_takes).find((i) => i.id === tid);
      vicItem?.segments.forEach((s) => segIdsForBody.add(s));
    }
    const segments: SegmentRef[] = [];
    for (const segId of [...segIdsForBody].slice(0, 18)) {
      const s = segById.get(segId);
      if (s) segments.push({ segmentId: s.segmentId, timestamp: formatTs(s.startMs), text: s.text });
    }

    // Phase 9 G1: skip body write entirely for canons with zero source segments.
    // Codex would refuse — better to mark _degraded upfront than to burn a Codex call.
    if (segments.length === 0) {
      console.warn(`[v2] Stage 4 weaver: canon ${id} (${shell.title}) has 0 source segments — marking _degraded='no_source_segments', skipping body write`);
      degradedNoSegmentsCanonIds.add(id);
      return null;
    }

    // Build woven items by ID lookup.
    const wovenExamples: WovenItem[] = sel.example_ids.map((eid) => {
      const item = intelBundle.examples.find((i) => i.id === eid);
      return item ? { id: item.id, text: item.text } : null;
    }).filter((x): x is WovenItem => x !== null);
    const wovenStories: WovenItem[] = sel.story_ids.map((sid) => {
      const item = intelBundle.stories.find((i) => i.id === sid);
      return item ? { id: item.id, text: item.text } : null;
    }).filter((x): x is WovenItem => x !== null);
    const wovenMistakes: WovenItem[] = sel.mistake_ids.flatMap((mid) => {
      const item = intelBundle.mistakes.find((i) => i.id === mid);
      if (!item) return [];
      const w: WovenItem = { id: item.id, text: item.text };
      if (item.correction) w.correction = item.correction;
      if (item.why) w.why = item.why;
      return [w];
    });
    const wovenTakes: WovenItem[] = sel.contrarian_take_ids.map((tid) => {
      const item = intelBundle.contrarianTakes.find((i) => i.id === tid);
      return item ? { id: item.id, text: item.text } : null;
    }).filter((x): x is WovenItem => x !== null);

    // Voice fingerprint: blend channel + brief-level (briefs not yet generated).
    const voiceFingerprint = {
      profanityAllowed: profile._index_archetype === 'operator-coach',
      tonePreset: profile._internal_dominant_tone,
      preserveTerms: profile._index_creator_terminology.slice(0, 12),
    };

    return {
      id,
      title: shell.title,
      type: shell.type,
      internal_summary: shell._internal_summary,
      segments,
      woven: {
        examples: wovenExamples,
        stories: wovenStories,
        mistakes: wovenMistakes,
        contrarian_takes: wovenTakes,
      },
      creatorName: profile.creatorName,
      archetype: profile._index_archetype,
      voiceFingerprint,
      channelDominantTone: profile._internal_dominant_tone,
      channelAudience: profile._internal_audience,
      voiceMode: resolvedVoiceMode,
    };
  }).filter((x): x is CanonBodyInput => x !== null);

  // Skip canon already with body unless regenBodies.
  const bodiesToWrite = regenBodies
    ? bodyInputs
    : bodyInputs.filter((bi) => {
        const shellWithBody = canonShells.find((s) => canonShellIds.get(s.title) === bi.id) as CanonShell_v2 & { body?: string };
        return !(shellWithBody && typeof shellWithBody.body === 'string' && shellWithBody.body.length > 100);
      });

  console.info(`[v2] writing ${bodiesToWrite.length} bodies (${bodyInputs.length - bodiesToWrite.length} resumed with existing bodies)`);
  const bodyResults = await writeCanonBodiesParallel(bodiesToWrite, { concurrency: 3, timeoutMs: 10 * 60 * 1000 });

  // Phase 9 G1: persist _degraded='no_source_segments' for skipped canons.
  if (degradedNoSegmentsCanonIds.size > 0) {
    console.info(`[v2] Stage 5: persisting _degraded='no_source_segments' for ${degradedNoSegmentsCanonIds.size} skipped canons`);
    for (const canonId of degradedNoSegmentsCanonIds) {
      await db.update(canonNode)
        .set({ payload: sql`payload || '{"body":"","_degraded":"no_source_segments"}'::jsonb` })
        .where(eq(canonNode.id, canonId));
    }
  }

  // Merge bodies into shells + persist.
  for (const shell of canonShells) {
    const id = canonShellIds.get(shell.title);
    if (!id) continue;
    const result = bodyResults.get(id);
    if (!result) continue;

    const updatedShell = {
      ...shell,
      body: result.body,
      _index_evidence_segments: result.cited_segment_ids.length > 0 ? result.cited_segment_ids : shell._index_evidence_segments,
      _index_supporting_examples: result.used_example_ids,
      _index_supporting_stories: result.used_story_ids,
      _index_supporting_mistakes: result.used_mistake_ids,
      _index_supporting_contrarian_takes: result.used_contrarian_take_ids,
    };

    await db.update(canonNode)
      .set({
        payload: updatedShell as unknown as Record<string, unknown>,
        evidenceSegmentIds: updatedShell._index_evidence_segments.slice(0, 50),
        citationCount: result.cited_segment_ids.length,
      })
      .where(eq(canonNode.id, id));
  }
  console.info(`[v2] ${bodyResults.size} canon bodies persisted`);

  // Reload canon nodes from DB to get the merged-in bodies for stages 6-8.
  const allCanonRows = await db.select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));
  const v2CanonRows = allCanonRows.filter(
    (c) => (c.payload as { schemaVersion?: string }).schemaVersion === 'v2',
  );
  /** Canon refs available to synthesis / journey / briefs. */
  const canonRefs = v2CanonRows.map((c) => {
    const p = c.payload as CanonShell_v2 & { body?: string };
    return {
      id: c.id,
      title: p.title,
      type: p.type,
      internal_summary: p._internal_summary ?? '',
      body: typeof p.body === 'string' ? p.body : '',
      pageWorthinessScore: p.pageWorthinessScore ?? 0,
      sourceVideoIds: p._index_source_video_ids ?? [],
    };
  }).filter((r) => r.body.length > 100); // Only canon with bodies are eligible.

  // ── Stage 6: Synthesis nodes (pillar pages) ────────────────
  let synthesisIds: string[] = [];
  const existingSynthesis = v2CanonRows.filter((c) => (c.payload as { kind?: string }).kind === 'synthesis');
  if (regenSynthesis && existingSynthesis.length > 0) {
    await db.delete(canonNode).where(inArray(canonNode.id, existingSynthesis.map((c) => c.id)));
    existingSynthesis.length = 0;
  }
  if (existingSynthesis.length === 0 && canonRefs.length >= 6) {
    console.info(`[v2] Stage 6: synthesis nodes (target 3 over ${canonRefs.length} canon refs)`);
    const synthShells = await generateSynthesisShells({
      canonNodes: canonRefs.map((r) => ({
        id: r.id, title: r.title, type: r.type,
        internal_summary: r.internal_summary,
        pageWorthinessScore: r.pageWorthinessScore,
        sourceVideoIds: r.sourceVideoIds,
      })),
      creatorName: profile.creatorName,
      archetype: profile._index_archetype,
      niche: profile._internal_niche,
      recurringPromise: profile._internal_recurring_promise,
      targetCount: Math.min(3, Math.max(2, Math.floor(canonRefs.length / 4))),
    });
    // Title-case enforce on synthesis titles.
    for (const s of synthShells) s.title = enforceTitleCase(s.title);

    // Persist shells + assign cn_xxx ids; collect inputs for body writer.
    const synthInputs: SynthesisBodyInput[] = [];
    for (const shell of synthShells) {
      const id = `cn_${crypto.randomUUID().slice(0, 12)}`;
      synthesisIds.push(id);
      shell.confidenceScore = normalizeScore(shell.confidenceScore);
      shell.pageWorthinessScore = normalizeScore(shell.pageWorthinessScore);
      shell.specificityScore = normalizeScore(shell.specificityScore);
      shell.creatorUniquenessScore = normalizeScore(shell.creatorUniquenessScore);
      await db.insert(canonNode).values({
        id,
        workspaceId: run.workspaceId,
        runId,
        type: shell.type as any,
        payload: shell as unknown as Record<string, unknown>,
        evidenceSegmentIds: [],
        sourceVideoIds: shell._index_source_video_ids,
        evidenceQuality: shell.evidenceQuality,
        origin: shell.origin as any,
        confidenceScore: shell.confidenceScore,
        pageWorthinessScore: shell.pageWorthinessScore,
        specificityScore: shell.specificityScore,
        creatorUniquenessScore: shell.creatorUniquenessScore,
        citationCount: 0,
        sourceCoverage: shell._index_source_video_ids.length,
      });
      const children: ChildCanonRef[] = shell._index_cross_link_canon
        .map((cid) => canonRefs.find((r) => r.id === cid))
        .filter((r): r is typeof canonRefs[number] => r !== undefined)
        .map((r) => ({
          id: r.id, title: r.title, type: r.type,
          body: r.body, internal_summary: r.internal_summary,
        }));
      synthInputs.push({
        id, shell, children,
        creatorName: profile.creatorName,
        archetype: profile._index_archetype,
        voiceFingerprint: {
          profanityAllowed: profile._index_archetype === 'operator-coach',
          tonePreset: profile._internal_dominant_tone,
          preserveTerms: profile._index_creator_terminology.slice(0, 12),
        },
        channelDominantTone: profile._internal_dominant_tone,
        channelAudience: profile._internal_audience,
        voiceMode: resolvedVoiceMode,
      });
    }

    if (synthInputs.length > 0) {
      const synthBodies = await writeSynthesisBodiesParallel(synthInputs, { concurrency: 2 });
      // Persist bodies onto the synthesis canon nodes.
      for (const input of synthInputs) {
        const res = synthBodies.get(input.id);
        if (!res || res.body.length === 0) continue;
        const updated = {
          ...input.shell,
          body: res.body,
          _index_evidence_segments: res.cited_segment_ids,
        };
        await db.update(canonNode)
          .set({
            payload: updated as unknown as Record<string, unknown>,
            evidenceSegmentIds: res.cited_segment_ids.slice(0, 50),
            citationCount: res.cited_segment_ids.length,
          })
          .where(eq(canonNode.id, input.id));
      }
      console.info(`[v2] ${synthInputs.length} synthesis nodes persisted (${[...synthBodies.values()].filter((r) => r.body.length > 0).length} with bodies)`);
    }
  } else if (existingSynthesis.length > 0) {
    synthesisIds = existingSynthesis.map((c) => c.id);
    console.info(`[v2] Stage 6: synthesis resumed (${synthesisIds.length})`);
  } else {
    console.info(`[v2] Stage 6: skipped — only ${canonRefs.length} canon refs (need ≥6 for synthesis)`);
  }

  // ── Stage 7: Reader journey ────────────────────────────────
  let journeyId: string | null = null;
  const existingJourney = v2CanonRows.find((c) => (c.payload as { kind?: string }).kind === 'reader_journey');
  if (regenJourney && existingJourney) {
    await db.delete(canonNode).where(eq(canonNode.id, existingJourney.id));
  }
  if ((!existingJourney || regenJourney) && canonRefs.length >= 4) {
    console.info(`[v2] Stage 7: reader journey (over ${canonRefs.length} canon refs)`);
    const journeyShell = await generateReaderJourneyShell({
      canonNodes: canonRefs.map((r) => ({
        id: r.id, title: r.title, type: r.type,
        internal_summary: r.internal_summary,
        body: r.body,
        pageWorthinessScore: r.pageWorthinessScore,
      } satisfies CanonRefForJourney)),
      creatorName: profile.creatorName,
      archetype: profile._index_archetype,
      niche: profile._internal_niche,
      audience: profile._internal_audience,
      recurringPromise: profile._internal_recurring_promise,
      targetPhaseCount: Math.min(5, Math.max(3, Math.ceil(canonRefs.length / 3))),
    });
    if (journeyShell && journeyShell._index_phases.length >= 2) {
      // Title-case enforcement on journey + phase titles.
      journeyShell.title = enforceTitleCase(journeyShell.title);
      for (const p of journeyShell._index_phases) p.title = enforceTitleCase(p.title);

      // Build phase body inputs.
      const phaseInputs: PhaseBodyInput[] = journeyShell._index_phases.map((phase) => {
        const primaryCanons: CanonRefForJourney[] = phase._index_primary_canon_node_ids
          .map((cid) => canonRefs.find((r) => r.id === cid))
          .filter((r): r is typeof canonRefs[number] => r !== undefined)
          .map((r) => ({
            id: r.id, title: r.title, type: r.type,
            internal_summary: r.internal_summary,
            body: r.body,
            pageWorthinessScore: r.pageWorthinessScore,
          }));
        return {
          phase,
          primaryCanons,
          creatorName: profile.creatorName,
          archetype: profile._index_archetype,
          voiceFingerprint: {
            profanityAllowed: profile._index_archetype === 'operator-coach',
            tonePreset: profile._internal_dominant_tone,
            preserveTerms: profile._index_creator_terminology.slice(0, 12),
          },
          channelDominantTone: profile._internal_dominant_tone,
          channelAudience: profile._internal_audience,
          phaseNumber: phase._index_phase_number,
          totalPhases: journeyShell._index_phases.length,
          voiceMode: resolvedVoiceMode,
        };
      });

      const phaseBodies = await writePhaseBodiesParallel(phaseInputs, { concurrency: 2 });
      const { canonBody, allCitedIds } = applyPhaseBodiesToShell(journeyShell, phaseBodies);

      journeyId = `cn_${crypto.randomUUID().slice(0, 12)}`;
      const fullJourney = { ...journeyShell, body: canonBody };
      await db.insert(canonNode).values({
        id: journeyId,
        workspaceId: run.workspaceId,
        runId,
        type: journeyShell.type as any,
        payload: fullJourney as unknown as Record<string, unknown>,
        evidenceSegmentIds: allCitedIds.slice(0, 50),
        sourceVideoIds: journeyShell._index_source_video_ids,
        evidenceQuality: journeyShell.evidenceQuality,
        origin: journeyShell.origin as any,
        confidenceScore: 0,
        pageWorthinessScore: 0,
        specificityScore: 0,
        creatorUniquenessScore: 0,
        citationCount: allCitedIds.length,
        sourceCoverage: journeyShell._index_source_video_ids.length,
      });
      const phasesPersisted = journeyShell._index_phases.filter((p) => p.body.length > 0).length;
      console.info(`[v2] reader journey persisted: ${journeyShell._index_phases.length} phases, ${phasesPersisted} with bodies`);
    } else {
      console.info(`[v2] Stage 7: skipped — Codex couldn't produce a usable journey`);
    }
  } else if (existingJourney) {
    journeyId = existingJourney.id;
    console.info(`[v2] Stage 7: reader journey resumed`);
  } else {
    console.info(`[v2] Stage 7: skipped — only ${canonRefs.length} canon refs (need ≥4 for journey)`);
  }

  // ── Stage 8: Page briefs ───────────────────────────────────
  // Reload to include synthesis nodes (they're pillar candidates).
  const refreshedCanonRows = await db.select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));
  const v2RefreshedRows = refreshedCanonRows.filter(
    (c) => (c.payload as { schemaVersion?: string }).schemaVersion === 'v2',
  );
  const briefCanonRefs: CanonRefForBrief[] = v2RefreshedRows.map((c) => {
    const p = c.payload as CanonShell_v2 & { body?: string };
    return {
      id: c.id,
      title: p.title,
      type: p.type,
      body: typeof p.body === 'string' ? p.body : '',
      internal_summary: p._internal_summary ?? '',
      pageWorthinessScore: p.pageWorthinessScore ?? 0,
    };
  }).filter((r) => r.body.length > 100);

  const pillarCanonIds = v2RefreshedRows
    .filter((c) => (c.payload as { kind?: string }).kind === 'synthesis')
    .map((c) => c.id);

  const existingBriefs = await db.select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId));
  const v2Briefs = existingBriefs.filter(
    (b) => (b.payload as { schemaVersion?: string }).schemaVersion === 'v2',
  );
  if (regenBriefs && v2Briefs.length > 0) {
    await db.delete(pageBrief).where(inArray(pageBrief.id, v2Briefs.map((b) => b.id)));
    v2Briefs.length = 0;
  }
  if (v2Briefs.length === 0 && briefCanonRefs.length >= 3) {
    console.info(`[v2] Stage 8: page briefs (over ${briefCanonRefs.length} canon refs, ${pillarCanonIds.length} pillars)`);
    // Target one brief per canon (pillars + spokes), capped at 12.
    const targetCount = Math.min(12, briefCanonRefs.length);
    const briefShells = await generateBriefShells({
      canonNodes: briefCanonRefs,
      pillarCanonIds,
      creatorName: profile.creatorName,
      archetype: profile._index_archetype,
      niche: profile._internal_niche,
      audience: profile._internal_audience,
      recurringPromise: profile._internal_recurring_promise,
      preserveTerms: profile._index_creator_terminology,
      defaultVoiceFingerprint: {
        profanityAllowed: profile._index_archetype === 'operator-coach',
        tonePreset: profile._internal_dominant_tone,
        preserveTerms: profile._index_creator_terminology.slice(0, 12),
      },
      targetCount,
    });
    // Title-case enforcement on brief titles.
    for (const b of briefShells) b.pageTitle = enforceTitleCase(b.pageTitle);

    // Build body inputs.
    const briefBodyInputs: BriefBodyInput[] = briefShells.map((b) => {
      const primaryCanons = b._index_primary_canon_node_ids
        .map((cid) => briefCanonRefs.find((r) => r.id === cid))
        .filter((r): r is CanonRefForBrief => r !== undefined);
      return {
        brief: b,
        primaryCanons,
        creatorName: profile.creatorName,
        archetype: profile._index_archetype,
        voiceFingerprint: b._index_voice_fingerprint,
        channelDominantTone: profile._internal_dominant_tone,
        channelAudience: profile._internal_audience,
        voiceMode: resolvedVoiceMode,
      };
    });

    const briefBodies = await writeBriefBodiesParallel(briefBodyInputs, { concurrency: 3 });

    // Persist briefs (with bodies merged in).
    for (const shell of briefShells) {
      const result = briefBodies.get(shell.pageId);
      const finalShell = {
        ...shell,
        body: result?.body ?? '',
      };
      await db.insert(pageBrief).values({
        id: `pb_${crypto.randomUUID().slice(0, 12)}`,
        workspaceId: run.workspaceId,
        runId,
        payload: finalShell as unknown as Record<string, unknown>,
        pageWorthinessScore: finalShell._internal_page_worthiness_score,
        position: finalShell._index_position,
      });
    }
    const withBodies = [...briefBodies.values()].filter((r) => r.body.length > 0).length;
    console.info(`[v2] ${briefShells.length} briefs persisted (${withBodies} with bodies, ${pillarCanonIds.length} pillar tier)`);
  } else if (v2Briefs.length > 0) {
    console.info(`[v2] Stage 8: page briefs resumed (${v2Briefs.length})`);
  } else {
    console.info(`[v2] Stage 8: skipped — only ${briefCanonRefs.length} canon refs (need ≥3 for briefs)`);
  }

  // ── Stage 9: Hero candidates ───────────────────────────────
  if (regenHero || profile.hero_candidates.length === 0 || profile.hero_candidates[0] === 'placeholder') {
    console.info(`[v2] Stage 9: hero candidates + hub_title + hub_tagline`);
    const topCanonTitles = canonShells
      .filter((s) => s.pageWorthinessScore >= 60)
      .sort((a, b) => b.pageWorthinessScore - a.pageWorthinessScore)
      .slice(0, 10)
      .map((s) => s.title);

    const heroResult = await generateHeroCandidates({
      creatorName: profile.creatorName,
      archetype: profile._index_archetype,
      niche: profile._internal_niche,
      audience: profile._internal_audience,
      dominantTone: profile._internal_dominant_tone,
      recurringPromise: profile._internal_recurring_promise,
      monetizationAngle: profile._internal_monetization_angle,
      topCanonTitles,
      preserveTerms: profile._index_creator_terminology,
      voiceFingerprint: {
        profanityAllowed: profile._index_archetype === 'operator-coach',
        tonePreset: profile._internal_dominant_tone,
      },
    });

    // Title-case + hero re-pass on the raw output (Task 6.4).
    const refined = await refineHeroBlock(heroResult, {
      creatorName: profile.creatorName,
      niche: profile._internal_niche,
      audience: profile._internal_audience,
      recurringPromise: profile._internal_recurring_promise,
      preserveTerms: profile._index_creator_terminology,
      voiceFingerprint: {
        profanityAllowed: profile._index_archetype === 'operator-coach',
        tonePreset: profile._internal_dominant_tone,
      },
    });

    profile.hub_title = refined.hub_title;
    profile.hub_tagline = refined.hub_tagline;
    profile.hero_candidates = refined.hero_candidates;

    await db.update(channelProfile)
      .set({ payload: profile as unknown as Record<string, unknown> })
      .where(eq(channelProfile.runId, runId));
    console.info(`[v2] hero candidates persisted: "${profile.hub_title}" / ${profile.hero_candidates.length} candidates (${refined.rewriteCount} rewritten)`);
  }

  // ── Stage 10: Evidence registry tagger ─────────────────────
  console.info(`[v2] Stage 10: evidence registry tagger`);

  // Reload all v2 body-bearing entities + segments table for tagger input.
  const stage10CanonRows = await db.select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode).where(eq(canonNode.runId, runId));
  const stage10BriefRows = await db.select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief).where(eq(pageBrief.runId, runId));

  // Build a segmentId → text lookup for ALL segments referenced in this run.
  const stage10SegRows = await db.select({ id: segment.id, text: segment.text })
    .from(segment).where(eq(segment.runId, runId));
  const segmentTextById: Record<string, string> = {};
  for (const s of stage10SegRows) segmentTextById[s.id] = s.text;

  // Build the list of entities to tag.
  type EvidenceJob = {
    kind: 'canon' | 'brief' | 'journey_phase';
    entityId: string;
    body: string;
    // For canon/brief: rowId for db.update. For journey_phase: rowId of journey canon + phase number.
    rowId: string;
    phaseNumber?: number;
  };
  const evidenceJobs: EvidenceJob[] = [];

  const UUID_RE = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

  function extractCitedUuids(body: string): string[] {
    const ids = new Set<string>();
    for (const m of body.matchAll(UUID_RE)) ids.add(m[1]!);
    return [...ids];
  }

  function alreadyTagged(payload: any, body: string): boolean {
    const reg = payload?._index_evidence_registry;
    if (!reg || typeof reg !== 'object') return false;
    const cited = extractCitedUuids(body);
    if (cited.length === 0) return true; // no citations = trivially "tagged"
    return cited.every((id) => id in reg);
  }

  // Canon nodes (includes synthesis — kind === 'synthesis')
  // EXCLUDES reader_journey nodes — those are handled per-phase below.
  for (const c of stage10CanonRows) {
    const p = c.payload as { schemaVersion?: string; kind?: string; body?: string };
    if (p.schemaVersion !== 'v2') continue;
    if (p.kind === 'reader_journey') continue;
    const body = p.body ?? '';
    if (body.length < 50) continue;
    if (!regenEvidence && alreadyTagged(p, body)) continue;
    evidenceJobs.push({ kind: 'canon', entityId: c.id, body, rowId: c.id });
  }

  // Journey phases — each gets its own registry on the phase object inside _index_phases[]
  for (const c of stage10CanonRows) {
    const p = c.payload as { schemaVersion?: string; kind?: string; _index_phases?: any[] };
    if (p.schemaVersion !== 'v2' || p.kind !== 'reader_journey') continue;
    for (const phase of (p._index_phases ?? [])) {
      const body = phase.body ?? '';
      if (body.length < 50) continue;
      if (!regenEvidence && alreadyTagged(phase, body)) continue;
      evidenceJobs.push({
        kind: 'journey_phase',
        entityId: `${c.id}#phase${phase._index_phase_number}`,
        body,
        rowId: c.id,
        phaseNumber: phase._index_phase_number,
      });
    }
  }

  // Page briefs
  for (const b of stage10BriefRows) {
    const p = b.payload as { schemaVersion?: string; body?: string };
    if (p.schemaVersion !== 'v2') continue;
    const body = p.body ?? '';
    if (body.length < 50) continue;
    if (!regenEvidence && alreadyTagged(p, body)) continue;
    evidenceJobs.push({ kind: 'brief', entityId: b.id, body, rowId: b.id });
  }

  let evidenceJobsCount = 0;
  if (evidenceJobs.length === 0) {
    console.info(`[v2] Stage 10: all entities already tagged (use --regen-evidence to force)`);
  } else {
    console.info(`[v2] Stage 10: tagging ${evidenceJobs.length} entities (canon=${evidenceJobs.filter(j=>j.kind==='canon').length}, journey_phases=${evidenceJobs.filter(j=>j.kind==='journey_phase').length}, briefs=${evidenceJobs.filter(j=>j.kind==='brief').length})`);

    // Build EvidenceTaggerInput per job. Each input scopes segmentTextById to ONLY the UUIDs cited in this entity's body.
    const taggerInputs: EvidenceTaggerInput[] = evidenceJobs.map((j) => {
      const cited = extractCitedUuids(j.body);
      const scopedSegText: Record<string, string> = {};
      for (const id of cited) {
        if (segmentTextById[id]) scopedSegText[id] = segmentTextById[id];
      }
      return {
        entityId: j.entityId,
        body: j.body,
        segmentTextById: scopedSegText,
        voiceFingerprint: {
          tonePreset: profile._internal_dominant_tone,
          preserveTerms: profile._index_creator_terminology.slice(0, 12),
        },
      };
    });

    const taggerResults = await tagAllEntities(taggerInputs, { concurrency: 3 });
    evidenceJobsCount = taggerResults.size;

    // Merge registry back into each entity's payload, persist.
    for (const job of evidenceJobs) {
      const result = taggerResults.get(job.entityId);
      if (!result) continue;

      if (job.kind === 'canon') {
        const row = stage10CanonRows.find((r) => r.id === job.rowId)!;
        const updatedPayload = {
          ...(row.payload as Record<string, unknown>),
          _index_evidence_registry: result.registry,
        };
        await db.update(canonNode)
          .set({ payload: updatedPayload as Record<string, unknown> })
          .where(eq(canonNode.id, job.rowId));
      } else if (job.kind === 'journey_phase') {
        const row = stage10CanonRows.find((r) => r.id === job.rowId)!;
        const p = row.payload as { _index_phases?: any[] };
        const updatedPhases = (p._index_phases ?? []).map((ph) => {
          if (ph._index_phase_number !== job.phaseNumber) return ph;
          return { ...ph, _index_evidence_registry: result.registry };
        });
        const updatedPayload = { ...(row.payload as Record<string, unknown>), _index_phases: updatedPhases };
        // Update the in-memory cache too, so subsequent jobs touching the same journey row see the merged phases.
        row.payload = updatedPayload;
        await db.update(canonNode)
          .set({ payload: updatedPayload as Record<string, unknown> })
          .where(eq(canonNode.id, job.rowId));
      } else if (job.kind === 'brief') {
        const row = stage10BriefRows.find((r) => r.id === job.rowId)!;
        const updatedPayload = {
          ...(row.payload as Record<string, unknown>),
          _index_evidence_registry: result.registry,
        };
        await db.update(pageBrief)
          .set({ payload: updatedPayload as Record<string, unknown> })
          .where(eq(pageBrief.id, job.rowId));
      }
    }
    console.info(`[v2] Stage 10: ${evidenceJobs.length} entities tagged`);
  }

  // ── Stage 11: Workshop stages ─────────────────────────────────────────────
  let workshopsCount = 0;

  // Re-fetch canon rows so Stage 11 sees the latest payloads (Stage 10 updated them with registries).
  const stage11CanonRows = await db.select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode).where(eq(canonNode.runId, runId));

  const journeyForWorkshop = stage11CanonRows.find((c) => {
    const p = c.payload as { schemaVersion?: string; kind?: string };
    return p.schemaVersion === 'v2' && p.kind === 'reader_journey';
  });

  if (!journeyForWorkshop) {
    console.info(`[v2] Stage 11: skipped — no reader journey exists`);
  } else {
    // Fetch existing workshop_stage rows
    const existingWorkshops = await db.select({ id: workshopStage.id, payload: workshopStage.payload })
      .from(workshopStage).where(eq(workshopStage.runId, runId));

    if (regenWorkshops && existingWorkshops.length > 0) {
      await db.delete(workshopStage).where(eq(workshopStage.runId, runId));
      existingWorkshops.length = 0;
    }

    if (existingWorkshops.length === 0) {
      console.info(`[v2] Stage 11: workshop stages`);

      // Build canon-by-id map (from re-fetched stage11CanonRows, with v2 filter).
      // The journey-phase entries inside reader_journey canon were updated in Stage 10
      // with _index_evidence_registry per phase. We need canon nodes' registries too.
      const canonByCanonId = new Map<string, any>();
      for (const c of stage11CanonRows) {
        const p = c.payload as { schemaVersion?: string; kind?: string };
        if (p.schemaVersion !== 'v2') continue;
        if (p.kind === 'reader_journey') continue;
        canonByCanonId.set(c.id, { ...(c.payload as Record<string, unknown>), _row_id: c.id });
      }

      // Build segment map (full row data with videoId/startMs/endMs).
      const fullSegRows = await db.select({
        id: segment.id,
        videoId: segment.videoId,
        startMs: segment.startMs,
        endMs: segment.endMs,
        text: segment.text,
      }).from(segment).where(eq(segment.runId, runId));
      const segmentById = new Map<string, { id: string; videoId: string; startMs: number; endMs: number; text: string }>();
      for (const s of fullSegRows) segmentById.set(s.id, s);

      // Build WorkshopStageInputs from journey phases.
      const journeyPayload = journeyForWorkshop.payload as { _index_phases?: any[] };
      const phases = journeyPayload._index_phases ?? [];
      const totalPhases = phases.length;

      const workshopInputs: WorkshopStageInput[] = [];
      for (const phase of phases) {
        const candidates = filterCandidates(phase, canonByCanonId, segmentById);
        if (candidates.length < 2) {
          console.info(`[v2] Stage 11: phase ${phase._index_phase_number} (${phase.title}) — only ${candidates.length} candidates, skipping`);
          continue;
        }
        workshopInputs.push({
          phaseNumber: phase._index_phase_number,
          phaseTitle: phase.title ?? `Phase ${phase._index_phase_number}`,
          phaseHook: phase.hook ?? '',
          phaseReaderState: phase._internal_reader_state ?? '',
          phaseNextStepWhen: phase._internal_next_step_when ?? '',
          primaryCanonNodeIds: phase._index_primary_canon_node_ids ?? [],
          candidates,
          creatorName: profile.creatorName,
          archetype: profile._index_archetype,
          voiceFingerprint: {
            profanityAllowed: profile._index_archetype === 'operator-coach',
            tonePreset: profile._internal_dominant_tone,
            preserveTerms: profile._index_creator_terminology.slice(0, 12),
          },
          totalPhases,
        });
      }

      if (workshopInputs.length === 0) {
        console.info(`[v2] Stage 11: skipped — no phases yielded enough verified candidates`);
      } else {
        const workshopResults = await buildAllWorkshopStages(workshopInputs, { concurrency: 2 });

        // Persist results.
        for (const [phaseNumber, stage] of workshopResults) {
          // Compute slug + route at persist time (for cleanliness).
          const slug = (stage.title || `phase-${phaseNumber}`)
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            || `phase-${phaseNumber}`;
          const finalStage = {
            ...stage,
            slug,
            route: `/workshop/${slug}`,
            order: phaseNumber,
          };
          await db.insert(workshopStage).values({
            id: finalStage.id,
            workspaceId: run.workspaceId,
            runId,
            payload: finalStage as unknown as Record<string, unknown>,
            position: phaseNumber,
          });
        }
        workshopsCount = workshopResults.size;
        console.info(`[v2] Stage 11: ${workshopsCount} workshop stages persisted (${workshopInputs.length - workshopsCount} skipped)`);
      }
    } else {
      workshopsCount = existingWorkshops.length;
      console.info(`[v2] Stage 11: workshops resumed (${existingWorkshops.length})`);
    }
  }

  await db.update(generationRun).set({ status: 'audit_ready' }).where(eq(generationRun.id, runId));
  console.info(`[v2] DONE — schemaVersion=v2, canon=${canonShells.length}, bodies=${bodyResults.size}, synthesis=${synthesisIds.length}, journey=${journeyId ? 1 : 0}, evidence=${evidenceJobsCount}, workshops=${workshopsCount}`);
  console.info(`[v2] Audit URL: http://localhost:3001/app/projects/${run.projectId}/runs/${runId}/audit`);

  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[v2] FAILED', err);
  process.exit(1);
});
