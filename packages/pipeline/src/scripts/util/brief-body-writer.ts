/**
 * Page brief body writer (Phase 5 / Task 6.3).
 *
 * A PageBrief_v2 is a hub page's framing layer. It declares which canon
 * nodes the page primarily features and supplies the rendered fields
 * (pageTitle, hook, lede, body, cta) plus the _internal/_index planning
 * and indexing fields.
 *
 * Two-stage generation:
 *   1. Brief SHELL generator — Codex picks N pages from the canon graph,
 *      assigns 1-2 primary canon IDs + 0-6 supporting IDs, and produces
 *      ALL rendered short copy (pageTitle, hook, lede, cta) plus _internal
 *      audience_question/persona/journey_phase/seo/page_worthiness and
 *      _index slug/page_type/outline/cluster_role/voice_fingerprint.
 *      The shell does NOT write the 200-400 word body yet.
 *
 *   2. Brief BODY writer — per-brief Codex call. Input = brief shell +
 *      primary canon body excerpt + voice fingerprint + archetype
 *      HUB_SOURCE_VOICE. Output = 200-400 word first-person page intro
 *      that frames what the reader will get from the canon body that
 *      follows. Cites [<segmentId>] tokens from the primary canon.
 *
 * Schema reference (docs/superpowers/specs/2026-05-01-hub-source-document-schema.md):
 *
 *   - body field: 200-400 word page intro, FIRST-PERSON, sets up the canon body
 *   - cta.primary / cta.secondary: first-person one-liners (e.g. "Read my X next")
 *   - _internal_audience_question: what the reader is asking — INFORMS body, never an H1
 *   - _index_cluster_role.tier: 'pillar' (top of cluster) | 'spoke' (under a pillar)
 *
 * Quality gates (per body, throw to trigger retry):
 *   - body ≥ 200 words
 *   - body ≤ 500 words (page intros stay tight)
 *   - body must reference primary canon by title (case-insensitive)
 *   - 2-5 inline [<segmentId>] citations
 */

import fs from 'node:fs';
import path from 'node:path';

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { type ArchetypeSlug } from '../../agents/skills/archetype-detector';
import { SKILL_ROOT_PATH } from '../../agents/skills/skill-loader';
import { type VoiceMode, voiceRulesPrompt } from './voice-mode';
import { detectRefusalPattern } from './canon-body-writer';
import {
  ensureBriefCompleteness,
  type BriefCompletenessPopulator,
  type CanonShellForCompleteness,
} from './brief-completeness';

const ARCHETYPE_DIR = path.join(SKILL_ROOT_PATH, 'creator-archetypes');
const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

// ── Types ───────────────────────────────────────────────────────────────────

export interface VoiceFingerprint {
  profanityAllowed: boolean;
  tonePreset: string;
  preserveTerms: string[];
}

export interface PageBriefShell {
  schemaVersion: 'v2';
  pageId: string;

  // RENDERED (short copy generated in shell stage)
  pageTitle: string;
  hook: string;
  lede: string;
  body: string;                        // empty in shell, filled in stage 2
  cta: { primary: string; secondary: string };

  // _INTERNAL
  _internal_audience_question: string;
  _internal_persona: {
    name: string;
    context: string;
    objection: string;
    proofThatHits: string;
  };
  _internal_journey_phase: 1 | 2 | 3 | 4 | 5;
  _internal_seo: {
    primaryKeyword: string;
    intent: 'informational' | 'transactional' | 'navigational' | 'commercial';
    titleTemplate: string;
    metaDescription: string;
  };
  _internal_page_worthiness_score: number;

  // _INDEX
  _index_slug: string;
  _index_page_type: 'topic' | 'framework' | 'lesson' | 'playbook' | 'example_collection' | 'definition' | 'principle';
  _index_primary_canon_node_ids: string[];
  _index_supporting_canon_node_ids: string[];
  _index_outline: Array<{ section_title: string; canon_node_ids: string[]; intent: string }>;
  _index_cluster_role: { tier: 'pillar' | 'spoke'; parent_topic: string | null; sibling_slugs: string[] };
  _index_voice_fingerprint: VoiceFingerprint;
  _index_position: number;
}

export interface CanonRefForBrief {
  id: string;
  title: string;
  type: string;
  body: string;
  internal_summary: string;
  pageWorthinessScore: number;
}

export interface BriefShellInput {
  canonNodes: CanonRefForBrief[];
  /** Pillar canon IDs (synthesis nodes get briefs flagged as pillar). */
  pillarCanonIds: string[];
  creatorName: string;
  archetype: ArchetypeSlug;
  niche: string;
  audience: string;
  recurringPromise: string;
  preserveTerms: string[];
  /** Voice fingerprint to attach as _index_voice_fingerprint default. */
  defaultVoiceFingerprint: VoiceFingerprint;
  /** Number of briefs to ask for. */
  targetCount: number;
}

export interface BriefBodyInput {
  brief: PageBriefShell;
  primaryCanons: CanonRefForBrief[];
  creatorName: string;
  archetype: ArchetypeSlug;
  voiceFingerprint: VoiceFingerprint;
  voiceMode?: VoiceMode;
  channelDominantTone?: string;
  channelAudience?: string;
}

export interface BriefBodyResult {
  body: string;
  cited_segment_ids: string[];
  brief?: PageBriefShell;
  /** Set when the writer fell back or gave up. Value describes why. */
  _degraded?: 'no_primary_canon_for_fallback' | 'brief_writer_refused';
}

export interface BriefBodyWriteOptions {
  timeoutMs?: number;
  briefCompletenessPopulator?: BriefCompletenessPopulator;
  canonShells?: CanonShellForCompleteness[];
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

// ── Stage 1: Brief shell generator ─────────────────────────────────────────

function buildShellPrompt(input: BriefShellInput): string {
  const { canonNodes, pillarCanonIds, creatorName, niche, audience, recurringPromise, preserveTerms, targetCount } = input;

  const pillarSet = new Set(pillarCanonIds);
  const canonBlock = canonNodes
    .sort((a, b) => b.pageWorthinessScore - a.pageWorthinessScore)
    .map((c) =>
      `- (${c.id}) [${c.type}, score=${c.pageWorthinessScore}${pillarSet.has(c.id) ? ', PILLAR' : ''}] "${c.title}" — ${c.internal_summary.slice(0, 160)}`,
    )
    .join('\n');

  return [
    `You are page_brief_architect. You design the framing layer for ${targetCount} hub pages.`,
    '',
    `Each PageBrief sets up ONE page in the hub. The page's bulk content comes from the primary canon body (1-2 canon IDs you assign). Your job is the FRAMING — title, hook, lede, CTA, and the 200-400 word page intro that the reader sees before the canon body. The body itself you'll write in a separate pass; for now, leave \`body\` empty.`,
    '',
    `# Channel context`,
    `- creator: ${creatorName}`,
    `- niche: ${niche}`,
    `- audience: ${audience}`,
    `- recurring promise: ${recurringPromise}`,
    preserveTerms.length > 0 ? `- preserveTerms (use VERBATIM): ${preserveTerms.slice(0, 12).join(', ')}` : '',
    '',
    `# Canon nodes (${canonNodes.length}, score-sorted)`,
    canonBlock,
    '',
    `# Cluster topology`,
    `Pillar canon IDs (synthesis nodes — these get briefs flagged tier=pillar):`,
    pillarCanonIds.length > 0 ? pillarCanonIds.map((id) => `- ${id}`).join('\n') : '- (none — all spokes)',
    '',
    `# Task`,
    `Produce ${targetCount} page briefs. Rules:`,
    `- Each PILLAR canon ID above MUST get its own brief with _index_cluster_role.tier='pillar'`,
    `- Spoke briefs get tier='spoke' and parent_topic = slug of a pillar brief`,
    `- Each brief assigns 1-2 primary canon IDs (the page's bulk content)`,
    `- 0-6 supporting canon IDs for sidebar cross-links`,
    `- pageTitle is a STATEMENT, not a question. Question form belongs in _internal_audience_question.`,
    `- hook is a 1-sentence first-person sticky line`,
    `- lede is 1-2 sentences, first-person, sets up the body`,
    `- cta.primary and cta.secondary are first-person calls ("Read my X next", "Try the Y playbook")`,
    `- _internal_audience_question: what the reader is asking when they land here. Used only as a writing prompt — never rendered as an H1.`,
    `- _internal_persona.context: behavioral state ("just lost a client", "month-3 of building"), NOT demographic`,
    `- _internal_journey_phase: 1-5, where 1 = "what is this" and 5 = "operating fluently"`,
    `- _internal_seo: realistic primaryKeyword, 60-70 char titleTemplate, 150-160 char metaDescription`,
    `- _index_slug: kebab-case, no /pages/ prefix`,
    `- _index_outline: 2-5 sections with section_title + canon_node_ids + intent`,
    `- _index_position: 0-based ordinal in the hub navigation`,
    '',
    `Anti-patterns (DO NOT produce):`,
    `- pageTitle as a question`,
    `- _internal_audience_question identical to the body's opening line (that's a leak)`,
    `- A pillar brief with tier='spoke' or vice versa`,
    `- Using the SAME primary canon ID across two briefs`,
    `- CTAs in third-person ("Watch his next video")`,
    '',
    `# Output format`,
    `ONE JSON ARRAY of ${targetCount} brief shells. First char \`[\`, last char \`]\`.`,
    '',
    `[`,
    `  {`,
    `    "schemaVersion": "v2",`,
    `    "pageId": "<auto — leave as 'pb_TBD'>",`,
    `    "pageTitle": "<statement, not a question>",`,
    `    "hook": "<1-sentence first-person>",`,
    `    "lede": "<1-2 sentence first-person>",`,
    `    "body": "",`,
    `    "cta": { "primary": "<first-person>", "secondary": "<first-person>" },`,
    `    "_internal_audience_question": "<what reader is asking — informs body, never rendered>",`,
    `    "_internal_persona": {`,
    `      "name": "<archetype label>",`,
    `      "context": "<behavioral state, 1 sentence>",`,
    `      "objection": "<the doubt blocking action>",`,
    `      "proofThatHits": "<the kind of evidence that lands for this persona>"`,
    `    },`,
    `    "_internal_journey_phase": 1,`,
    `    "_internal_seo": {`,
    `      "primaryKeyword": "<keyword>",`,
    `      "intent": "informational",`,
    `      "titleTemplate": "<60-70 chars>",`,
    `      "metaDescription": "<150-160 chars>"`,
    `    },`,
    `    "_internal_page_worthiness_score": 70,`,
    `    "_index_slug": "<kebab-case>",`,
    `    "_index_page_type": "topic",`,
    `    "_index_primary_canon_node_ids": ["<cn_id>"],`,
    `    "_index_supporting_canon_node_ids": ["<cn_id>"],`,
    `    "_index_outline": [`,
    `      { "section_title": "<title>", "canon_node_ids": ["<cn_id>"], "intent": "<editorial intent>" }`,
    `    ],`,
    `    "_index_cluster_role": { "tier": "pillar", "parent_topic": null, "sibling_slugs": [] },`,
    `    "_index_voice_fingerprint": {`,
    `      "profanityAllowed": ${input.defaultVoiceFingerprint.profanityAllowed},`,
    `      "tonePreset": "${input.defaultVoiceFingerprint.tonePreset}",`,
    `      "preserveTerms": ${JSON.stringify(input.defaultVoiceFingerprint.preserveTerms.slice(0, 8))}`,
    `    },`,
    `    "_index_position": 0`,
    `  }`,
    `]`,
    '',
    `Voice rule (HARD-FAIL): pageTitle, hook, lede, cta.primary, cta.secondary must be FIRST-PERSON. NEVER "the creator", "${creatorName}", "she/he says".`,
    `JSON only.`,
  ].filter((x) => x !== '').join('\n');
}

export async function generateBriefShells(
  input: BriefShellInput,
  options: { timeoutMs?: number } = {},
): Promise<PageBriefShell[]> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildShellPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: 'brief_shells' });
  const json = extractJsonFromCodexOutput(raw);
  let parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) parsed = [parsed];

  const validIds = new Set(input.canonNodes.map((c) => c.id));
  const usedSlugs = new Set<string>();
  const usedPrimaryIds = new Set<string>();
  const briefs: PageBriefShell[] = [];

  for (const item of parsed as Partial<PageBriefShell>[]) {
    if (!item || typeof item.pageTitle !== 'string') continue;
    const primaryIds = Array.isArray(item._index_primary_canon_node_ids)
      ? item._index_primary_canon_node_ids.filter(
          (id): id is string =>
            typeof id === 'string' && validIds.has(id) && !usedPrimaryIds.has(id),
        )
      : [];
    if (primaryIds.length === 0) {
      console.warn(`[brief] dropping "${item.pageTitle.slice(0, 60)}" — no valid primary canon IDs`);
      continue;
    }
    primaryIds.forEach((id) => usedPrimaryIds.add(id));

    const supportingIds = Array.isArray(item._index_supporting_canon_node_ids)
      ? item._index_supporting_canon_node_ids
          .filter((id): id is string => typeof id === 'string' && validIds.has(id))
          .slice(0, 6)
      : [];

    let slug = typeof item._index_slug === 'string' && item._index_slug.length > 0
      ? item._index_slug.replace(/^\/+|\/+$/g, '')
      : item.pageTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const baseSlug = slug;
    let n = 2;
    while (usedSlugs.has(slug)) {
      slug = `${baseSlug}-${n}`;
      n += 1;
    }
    usedSlugs.add(slug);

    briefs.push({
      schemaVersion: 'v2',
      pageId: `pb_${slug}`,
      pageTitle: item.pageTitle.trim(),
      hook: typeof item.hook === 'string' ? item.hook : '',
      lede: typeof item.lede === 'string' ? item.lede : '',
      body: '',
      cta: {
        primary: typeof item.cta?.primary === 'string' ? item.cta.primary : '',
        secondary: typeof item.cta?.secondary === 'string' ? item.cta.secondary : '',
      },
      _internal_audience_question: typeof item._internal_audience_question === 'string' ? item._internal_audience_question : '',
      _internal_persona: {
        name: item._internal_persona?.name ?? '',
        context: item._internal_persona?.context ?? '',
        objection: item._internal_persona?.objection ?? '',
        proofThatHits: item._internal_persona?.proofThatHits ?? '',
      },
      _internal_journey_phase: ([1, 2, 3, 4, 5].includes(item._internal_journey_phase as number)
        ? item._internal_journey_phase
        : 1) as 1 | 2 | 3 | 4 | 5,
      _internal_seo: {
        primaryKeyword: item._internal_seo?.primaryKeyword ?? '',
        intent: (item._internal_seo?.intent as 'informational' | 'transactional' | 'navigational' | 'commercial') ?? 'informational',
        titleTemplate: item._internal_seo?.titleTemplate ?? '',
        metaDescription: item._internal_seo?.metaDescription ?? '',
      },
      _internal_page_worthiness_score: typeof item._internal_page_worthiness_score === 'number' ? item._internal_page_worthiness_score : 70,
      _index_slug: slug,
      _index_page_type: (item._index_page_type as PageBriefShell['_index_page_type']) ?? 'topic',
      _index_primary_canon_node_ids: primaryIds.slice(0, 2),
      _index_supporting_canon_node_ids: supportingIds,
      _index_outline: Array.isArray(item._index_outline)
        ? item._index_outline
            .filter((o) => o && typeof o.section_title === 'string')
            .map((o) => ({
              section_title: o.section_title,
              canon_node_ids: Array.isArray(o.canon_node_ids) ? o.canon_node_ids.filter((x) => typeof x === 'string' && validIds.has(x)) : [],
              intent: typeof o.intent === 'string' ? o.intent : '',
            }))
        : [],
      _index_cluster_role: {
        tier: item._index_cluster_role?.tier === 'pillar' ? 'pillar' : 'spoke',
        parent_topic: item._index_cluster_role?.parent_topic ?? null,
        sibling_slugs: Array.isArray(item._index_cluster_role?.sibling_slugs) ? item._index_cluster_role.sibling_slugs : [],
      },
      _index_voice_fingerprint: {
        profanityAllowed: item._index_voice_fingerprint?.profanityAllowed ?? input.defaultVoiceFingerprint.profanityAllowed,
        tonePreset: item._index_voice_fingerprint?.tonePreset ?? input.defaultVoiceFingerprint.tonePreset,
        preserveTerms: Array.isArray(item._index_voice_fingerprint?.preserveTerms)
          ? item._index_voice_fingerprint.preserveTerms.filter((x): x is string => typeof x === 'string')
          : input.defaultVoiceFingerprint.preserveTerms,
      },
      _index_position: typeof item._index_position === 'number' ? item._index_position : briefs.length,
    });
  }
  return briefs;
}

// ── Stage 2: Brief body writer ─────────────────────────────────────────────

/**
 * Fallback prompt (Task 10.1): used when the primary prompt fails/is refused.
 *
 * Key differences from primary:
 *  - No inline [UUID] citation requirement (no segment IDs available when canon
 *    body is thin; citations live on the canon page, not the brief)
 *  - Uses the primary canon's existing body text as context, not raw segments
 *  - Asks for 200-300 words only (shorter target is easier to satisfy)
 *  - Voice-mode-aware but simplified
 */
function buildBodyPromptFallback(input: BriefBodyInput, primaryCanonBody: string): string {
  const { brief, primaryCanons, voiceFingerprint } = input;
  const primaryTitle = primaryCanons[0]?.title ?? brief.pageTitle;

  const voiceInstruction =
    input.voiceMode === 'third_person_editorial'
      ? 'Third-person editorial voice. Subject is the topic, not the creator.'
      : input.voiceMode === 'hybrid'
      ? 'Hybrid: editorial framing + 1 blockquoted first-person aphorism.'
      : 'First-person voice (I/you).';

  return [
    `Write a 200-300 word page-brief intro. This brief introduces a hub page that links to the primary canon "${primaryTitle}".`,
    '',
    `Use the canon body below as context — extract the most striking idea and frame it as the page's opening hook.`,
    '',
    `# Source canon (for context — do NOT copy verbatim or cite with [UUID] brackets)`,
    `"""`,
    primaryCanonBody.slice(0, 3000),
    `"""`,
    '',
    `# Output rules`,
    `- 200-300 words`,
    `- ${voiceInstruction}`,
    voiceFingerprint.preserveTerms.length > 0
      ? `- Use these terms VERBATIM: ${voiceFingerprint.preserveTerms.slice(0, 8).join(', ')}`
      : '',
    voiceFingerprint.profanityAllowed ? '' : '- No profanity.',
    `- Open with a hook (a question, a statistic, or a surprising claim)`,
    `- Name the primary canon by title ("${primaryTitle}") naturally in the body`,
    `- End with a soft call-to-action pointing toward the primary canon page`,
    `- NO inline [UUID] citations — those live on the canon, not the brief`,
    '',
    `# Page context`,
    `- pageTitle: ${brief.pageTitle}`,
    `- hook (sticky line already written): ${brief.hook}`,
    `- lede: ${brief.lede}`,
    '',
    `# Output format`,
    `ONE JSON object. First char \`{\`, last char \`}\`.`,
    '',
    `{ "body": "<200-300 word brief body>" }`,
  ].filter((x) => x !== '').join('\n');
}

function buildBodyPrompt(input: BriefBodyInput): string {
  const { brief, primaryCanons, creatorName, archetype, voiceFingerprint } = input;
  const archetypeVoice = loadArchetypeVoice(archetype);

  const canonBlock = primaryCanons
    .map((c) =>
      [
        `### Primary canon: "${c.title}" (id=${c.id})`,
        `Internal summary: ${c.internal_summary}`,
        ``,
        `Body excerpt (first ~500 words — your page intro should set up this body):`,
        c.body.split(/\s+/).slice(0, 500).join(' '),
      ].join('\n'),
    )
    .join('\n\n');

  return [
    `You are ${creatorName}, writing the page intro for "${brief.pageTitle}".`,
    '',
    `This is the 200-400 word block the reader sees BEFORE the primary canon body. Your job is to FRAME the canon body — tell the reader who this page is for, what they'll get, and why they should keep reading. The canon body provides the depth; you provide the entry point.`,
    '',
    archetypeVoice ? `# Your voice (archetype: ${archetype})\n\n${archetypeVoice}\n` : '',
    `# Voice fingerprint`,
    `- profanityAllowed: ${voiceFingerprint.profanityAllowed}`,
    `- tonePreset: ${voiceFingerprint.tonePreset}`,
    voiceFingerprint.preserveTerms.length > 0
      ? `- preserveTerms (use VERBATIM): ${voiceFingerprint.preserveTerms.join(', ')}`
      : '',
    input.channelDominantTone ? `- channel dominant tone: ${input.channelDominantTone}` : '',
    input.channelAudience ? `- channel audience: ${input.channelAudience}` : '',
    '',
    `# The page`,
    `- pageTitle: ${brief.pageTitle}`,
    `- hook (sticky line): ${brief.hook}`,
    `- lede: ${brief.lede}`,
    `- _internal_audience_question (informs your body but DO NOT render verbatim): ${brief._internal_audience_question}`,
    `- _internal_persona.context: ${brief._internal_persona.context}`,
    `- _internal_persona.objection: ${brief._internal_persona.objection}`,
    `- _internal_journey_phase: ${brief._internal_journey_phase} of 5`,
    '',
    `# Primary canon body that follows`,
    canonBlock,
    '',
    `# Task`,
    `Write a 200-400 word FIRST-PERSON page intro that:`,
    `1. Opens by addressing the persona's specific behavioral state (use _internal_persona.context — paraphrased, never verbatim)`,
    `2. Names the primary canon by title, telling the reader what they're about to learn`,
    `3. Surfaces the persona's objection and signals you address it in the canon body`,
    `4. Includes 2-5 inline [<segmentId>] citations from the canon body excerpt above`,
    `5. Closes with a forward-pointing line that hands off to the canon body`,
    '',
    `# Citation rules (CRITICAL)`,
    `- Pull [<segmentId>] tokens from the canon body — they're already valid UUIDs`,
    `- 2-5 inline tokens across the page body`,
    `- DO NOT cite in the opening sentence`,
    `- DO NOT use [<startMs>ms-<endMs>ms] ranges`,
    '',
    voiceRulesPrompt(input.voiceMode ?? 'first_person', input.creatorName),
    '',
    `# Output format`,
    `ONE JSON object. First char \`{\`, last char \`}\`.`,
    '',
    `{`,
    `  "body": "<200-400 word first-person markdown body with [<segmentId>] citations and primary canon title>"`,
    `}`,
  ].filter((x) => x !== '').join('\n');
}

function defaultCompletenessCanonShells(input: BriefBodyInput): CanonShellForCompleteness[] {
  return input.primaryCanons.map((canon) => ({
    id: canon.id,
    title: canon.title,
    type: canon.type,
    internal_summary: canon.internal_summary,
  }));
}

async function completeBriefShell(
  input: BriefBodyInput,
  options: BriefBodyWriteOptions,
): Promise<PageBriefShell> {
  return ensureBriefCompleteness(input.brief, {
    canonShells: options.canonShells ?? defaultCompletenessCanonShells(input),
    populator: options.briefCompletenessPopulator,
    timeoutMs: options.timeoutMs,
  });
}

export async function writeBriefBody(
  input: BriefBodyInput,
  options: BriefBodyWriteOptions = {},
): Promise<BriefBodyResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const prompt = buildBodyPrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: `brief_body_${input.brief.pageId}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsed = JSON.parse(json) as { body?: string };
  const body = typeof parsed.body === 'string' ? parsed.body : '';
  const cited = (body.match(UUID_REGEX) ?? []).map((m) => m.replace(/[[\]]/g, ''));
  const wordCount = body.split(/\s+/).filter(Boolean).length;

  // Quality gates — throw to trigger retry-on-failure.
  if (wordCount < 200) {
    throw new Error(`brief body too short: ${wordCount} words < 200`);
  }
  if (wordCount > 600) {
    throw new Error(`brief body too long: ${wordCount} words > 600 (page intros stay tight)`);
  }
  // Naming check: every primary canon title must appear (case-insensitive).
  const lowered = body.toLowerCase();
  const missingTitles = input.primaryCanons.map((c) => c.title).filter((t) => !lowered.includes(t.toLowerCase()));
  if (missingTitles.length > 0) {
    throw new Error(`brief body missing primary canon titles: ${missingTitles.map((t) => `"${t}"`).join(', ')}`);
  }
  // Audience-question leak check: the planning question must NEVER appear
  // verbatim in the rendered body.
  const aq = input.brief._internal_audience_question.trim();
  if (aq.length > 30 && body.includes(aq)) {
    throw new Error(`brief body leaks _internal_audience_question verbatim: "${aq.slice(0, 80)}…"`);
  }
  const completedBrief = await completeBriefShell(input, options);
  return { body, cited_segment_ids: [...new Set(cited)], brief: completedBrief };
}

/** Parallel orchestrator with retry-on-failure (max 2 retries per brief).
 *
 * Task 10.1: After primary retries are exhausted, tries a fallback prompt that
 * uses the primary canon's existing body as context and drops UUID-citation
 * requirements. If the fallback also fails, persists an empty body with a
 * _degraded marker rather than silently writing empty content. */
export async function writeBriefBodiesParallel(
  inputs: BriefBodyInput[],
  options: BriefBodyWriteOptions & { concurrency?: number; maxRetries?: number } = {},
): Promise<Map<string, BriefBodyResult>> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 2;

  const out = new Map<string, BriefBodyResult>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < inputs.length) {
      const i = cursor;
      cursor += 1;
      const input = inputs[i]!;
      let lastErr: Error | null = null;

      // ── Primary prompt attempts ──────────────────────────────────────────
      for (let attempt = 1; attempt <= 1 + maxRetries; attempt += 1) {
        try {
          const start = Date.now();
          const res = await writeBriefBody(input, {
            timeoutMs,
            briefCompletenessPopulator: options.briefCompletenessPopulator,
            canonShells: options.canonShells,
          });
          const wordCount = res.body.split(/\s+/).filter(Boolean).length;
          console.info(
            `[brief] ${input.brief.pageId} (${input.brief.pageTitle.slice(0, 35)}): ` +
              `${wordCount}w · ${res.cited_segment_ids.length} citations · ` +
              `${(Date.now() - start) / 1000 | 0}s` +
              (attempt > 1 ? ` · attempt ${attempt}` : ''),
          );
          out.set(input.brief.pageId, res);
          break;
        } catch (err) {
          lastErr = err as Error;
          if (attempt <= maxRetries) {
            console.warn(`[brief] ${input.brief.pageId} attempt ${attempt} failed: ${lastErr.message.slice(0, 200)} — retrying`);
            await new Promise((r) => setTimeout(r, 5000 * attempt));
          }
        }
      }

      if (out.has(input.brief.pageId)) continue;

      // ── Fallback prompt (Task 10.1) ──────────────────────────────────────
      // Primary attempts exhausted. Try the looser fallback prompt that uses
      // the primary canon's existing body as context (no UUID citations needed).
      console.warn(`[brief] ${input.brief.pageId} primary attempts exhausted; trying fallback prompt`);

      const primaryCanonBody = input.primaryCanons[0]?.body ?? '';
      if (!primaryCanonBody || primaryCanonBody.trim().split(/\s+/).filter(Boolean).length < 50) {
        console.error(
          `[brief] ${input.brief.pageId} fallback unavailable: primary canon body missing or too short ` +
            `(${primaryCanonBody.trim().split(/\s+/).filter(Boolean).length} words)`,
        );
        out.set(input.brief.pageId, {
          body: '',
          cited_segment_ids: [],
          brief: await completeBriefShell(input, { ...options, timeoutMs }),
          _degraded: 'no_primary_canon_for_fallback',
        });
        continue;
      }

      try {
        const fallbackPrompt = buildBodyPromptFallback(input, primaryCanonBody);
        const raw = await runCodex(fallbackPrompt, { timeoutMs, label: `brief_body_fallback_${input.brief.pageId}` });
        const json = extractJsonFromCodexOutput(raw);
        const parsed = JSON.parse(json) as { body?: string };
        const fallbackBody = typeof parsed.body === 'string' ? parsed.body : '';

        if (detectRefusalPattern(fallbackBody)) {
          console.error(`[brief] ${input.brief.pageId} fallback also refused/too-short; persisting _degraded`);
          out.set(input.brief.pageId, {
            body: '',
            cited_segment_ids: [],
            brief: await completeBriefShell(input, { ...options, timeoutMs }),
            _degraded: 'brief_writer_refused',
          });
        } else {
          const wordCount = fallbackBody.split(/\s+/).filter(Boolean).length;
          console.info(`[brief] ${input.brief.pageId} fallback succeeded (${wordCount} words)`);
          // Fallback bodies have no UUID citations — that's intentional.
          out.set(input.brief.pageId, {
            body: fallbackBody,
            cited_segment_ids: [],
            brief: await completeBriefShell(input, { ...options, timeoutMs }),
          });
        }
      } catch (fallbackErr) {
        console.error(
          `[brief] ${input.brief.pageId} fallback error: ${(fallbackErr as Error).message.slice(0, 200)}; persisting _degraded`,
        );
        out.set(input.brief.pageId, {
          body: '',
          cited_segment_ids: [],
          brief: await completeBriefShell(input, { ...options, timeoutMs }),
          _degraded: 'brief_writer_refused',
        });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, inputs.length) }, () => worker());
  await Promise.all(workers);
  return out;
}
