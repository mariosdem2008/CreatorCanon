/**
 * Card Forge — turns a contemplative-thinker creator's canon into a deck of
 * aphorism cards.
 *
 * Pipeline:
 *   1. Extract candidate aphorism strings from three sources:
 *      a. Canons of type `aphorism` or `quote` (the verbatim core).
 *      b. Markdown blockquoted lines inside any canon body — these are the
 *         intentional aphoristic inserts the hybrid-mode voice prompt asks
 *         for in pipeline Phase 8.
 *      c. Sentence-level extraction from `principle` canons whose voice
 *         fingerprint matches the contemplative-thinker archetype, where
 *         each sentence is short (<30 words) and looks self-contained.
 *   2. De-duplicate by normalised text.
 *   3. One Codex call per surviving candidate to author `whyThisMatters`,
 *      `themeTags`, and `journalingPrompt`. The card's `text` field stays
 *      verbatim from source — Codex is forbidden from rewriting it.
 *   4. Return AphorismCard[]. Caller (the runner) wraps as CardComponent.
 *
 * Total Codex calls: 1 per card (typically 50-80 cards for a contemplative
 * creator).
 */

import type { AphorismCard, CanonRef, CodexClient, ComposeInput } from '../types';

// ---------- Types ----------

export interface AphorismCandidate {
  /** Verbatim text of the aphorism. */
  text: string;
  canonId: string;
  /** Where it came from — used by the dedup pass to prefer richer sources. */
  sourceKind: 'aphorism_canon' | 'blockquote' | 'short_principle';
}

// ---------- Extraction ----------

function nonEmpty(s: string | undefined | null): string {
  return typeof s === 'string' ? s.trim() : '';
}

export function extractAphorismCandidates(canons: CanonRef[]): AphorismCandidate[] {
  const out: AphorismCandidate[] = [];
  for (const c of canons) {
    if (c.payload.type !== 'aphorism' && c.payload.type !== 'quote') continue;
    const body = nonEmpty(c.payload.body);
    const title = nonEmpty(c.payload.title);
    const text = body.length > 0 ? body : title;
    if (text.length === 0) continue;
    out.push({ text, canonId: c.id, sourceKind: 'aphorism_canon' });
  }
  return out;
}

const BLOCKQUOTE_RE = /^>\s?(.+)$/gm;

export function extractBlockquotedAphorisms(canons: CanonRef[]): AphorismCandidate[] {
  const out: AphorismCandidate[] = [];
  for (const c of canons) {
    const body = nonEmpty(c.payload.body);
    if (body.length === 0) continue;
    BLOCKQUOTE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BLOCKQUOTE_RE.exec(body)) !== null) {
      const line = match[1]?.trim();
      if (!line || line.length === 0) continue;
      out.push({ text: line, canonId: c.id, sourceKind: 'blockquote' });
    }
  }
  return out;
}

// Match end-of-sentence punctuation followed by whitespace.
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/;

export function extractShortPrincipleSentences(
  canons: CanonRef[],
  options: { maxWords?: number; archetype?: string } = {},
): AphorismCandidate[] {
  const maxWords = options.maxWords ?? 30;
  const targetArchetype = options.archetype ?? 'contemplative-thinker';
  const out: AphorismCandidate[] = [];
  for (const c of canons) {
    if (c.payload.type !== 'principle') continue;
    const fp = c.payload._index_voice_fingerprint;
    const fpArchetype =
      fp && typeof fp === 'object' && 'archetype' in fp
        ? String((fp as { archetype?: unknown }).archetype ?? '')
        : '';
    if (fpArchetype !== targetArchetype) continue;
    const body = nonEmpty(c.payload.body);
    if (body.length === 0) continue;
    const sentences = body.split(SENTENCE_SPLIT_RE);
    for (const raw of sentences) {
      const s = raw.trim();
      if (s.length === 0) continue;
      const wordCount = s.split(/\s+/).length;
      if (wordCount >= maxWords) continue;
      out.push({ text: s, canonId: c.id, sourceKind: 'short_principle' });
    }
  }
  return out;
}

function normaliseText(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}]+/gu, ' ').trim();
}

/** Dedup. When two candidates have the same normalised text, prefer the
 *  richer source (aphorism_canon > blockquote > short_principle). */
export function dedupCandidates(candidates: AphorismCandidate[]): AphorismCandidate[] {
  const rank: Record<AphorismCandidate['sourceKind'], number> = {
    aphorism_canon: 3,
    blockquote: 2,
    short_principle: 1,
  };
  const byKey = new Map<string, AphorismCandidate>();
  for (const cand of candidates) {
    const key = normaliseText(cand.text);
    if (key.length === 0) continue;
    const existing = byKey.get(key);
    if (!existing || rank[cand.sourceKind] > rank[existing.sourceKind]) {
      byKey.set(key, cand);
    }
  }
  return Array.from(byKey.values());
}

// ---------- Codex authoring ----------

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

interface CardCodexResponse {
  whyThisMatters?: string;
  themeTags?: string[];
  journalingPrompt?: string;
}

async function authorCardMetadata(
  candidate: AphorismCandidate,
  creatorName: string,
  codex: CodexClient,
): Promise<{ whyThisMatters: string; themeTags: string[]; journalingPrompt?: string }> {
  const prompt = [
    `You are annotating one verbatim aphorism from ${creatorName}'s body of work.`,
    `The text MUST stay verbatim — do NOT rewrite it. You are only authoring metadata.`,
    '',
    `Aphorism: "${candidate.text}"`,
    '',
    'Output a single JSON object with three fields:',
    '- "whyThisMatters": ONE line (<= 25 words) explaining why this aphorism matters. Plain, direct, no hype.',
    '- "themeTags": 1-3 short lowercase tags from this set: ["work","money","creativity","relationships","decision-making","time","identity","craft","success","failure"]. Only return tags that genuinely apply.',
    '- "journalingPrompt": OPTIONAL — 1-2 sentence reflection prompt that helps the reader sit with the aphorism. Omit the field entirely if no good prompt exists.',
    '',
    'Format: ONE JSON object, first char {, last char }. No code fences, no prose around it.',
  ].join('\n');
  const raw = await codex.run(prompt, {
    stage: 'card_metadata',
    timeoutMs: 60_000,
    label: `card-metadata:${candidate.canonId}`,
  });
  const parsed = safeJsonParse<CardCodexResponse>(raw);
  const whyThisMatters =
    parsed?.whyThisMatters?.trim() ||
    'A line worth carrying with you for the week.';
  const themeTags = Array.isArray(parsed?.themeTags)
    ? parsed!.themeTags.filter((t): t is string => typeof t === 'string')
    : [];
  const journalingPrompt = parsed?.journalingPrompt?.trim() || undefined;
  return { whyThisMatters, themeTags, journalingPrompt };
}

// ---------- Public API ----------

export interface CardForgeOptions {
  /** Max number of cards to forge. Defaults to 200 — way above the typical 50-80. */
  maxCards?: number;
}

export async function composeCards(
  input: ComposeInput,
  opts: { codex: CodexClient; cardOptions?: CardForgeOptions },
): Promise<AphorismCard[]> {
  const archetypeRaw = input.channelProfile.archetype;
  const archetype =
    typeof archetypeRaw === 'string' ? archetypeRaw : 'contemplative-thinker';

  const aphorismCands = extractAphorismCandidates(input.canons);
  const blockCands = extractBlockquotedAphorisms(input.canons);
  const principleCands = extractShortPrincipleSentences(input.canons, { archetype });

  const all = dedupCandidates([...aphorismCands, ...blockCands, ...principleCands]);

  const max = opts.cardOptions?.maxCards ?? 200;
  const trimmed = all.slice(0, max);

  // Author metadata in parallel — every Codex call is independent.
  const cards = await Promise.all(
    trimmed.map(async (cand, i): Promise<AphorismCard> => {
      const meta = await authorCardMetadata(cand, input.creatorName, opts.codex);
      return {
        id: `card_${cand.canonId}_${i}`,
        text: cand.text,
        themeTags: meta.themeTags,
        whyThisMatters: meta.whyThisMatters,
        sourceCanonId: cand.canonId,
        ...(meta.journalingPrompt ? { journalingPrompt: meta.journalingPrompt } : {}),
      };
    }),
  );

  return cards;
}
