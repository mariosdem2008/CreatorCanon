/**
 * Hero re-pass / awkwardness rewriter (Phase 5 / Task 6.4).
 *
 * After the initial hero generator runs, some candidates land awkward:
 *   - Transcript stutter fragments ("AI lead generation is, it's a service-based business")
 *   - Missing leading prefixes ("pre-10k a month revenue" — should be "Build to pre-10K-a-month revenue")
 *   - Lowercased proper nouns
 *   - Lines that read like a slide title, not a billboard
 *
 * This module:
 *   1. Heuristically scores each candidate (0-10)
 *   2. Sends ONLY the awkward ones (score < 7) back to Codex for rewrite
 *   3. Returns the refined 5 with their scores
 *
 * The heuristic catches obvious problems (commas-as-stutter, fragment-start,
 * lowercased opening). Codex catches the subtle ones (still-not-billboard).
 *
 * Title-case is also enforced on hub_title via title-casing.ts.
 */

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { enforceTitleCase } from './title-casing';

export interface HeroRewriteContext {
  creatorName: string;
  niche: string;
  audience: string;
  recurringPromise: string;
  preserveTerms: string[];
  voiceFingerprint: { profanityAllowed: boolean; tonePreset: string };
}

export interface HeroLineEvaluation {
  line: string;
  score: number;        // 0-10
  reason: string;       // why this score
}

/** Heuristic score for a single hero line. Lower = more awkward.
 *
 *  Penalties:
 *   - Has a comma in the first 4 words (stutter pattern: "X is, it's Y")
 *   - Starts with lowercase letter
 *   - Starts with a fragment article ("a", "an", "the") that hangs
 *   - Word count < 5 or > 16 (target 6-14)
 *   - Contains "uh", "um", "you know"
 *   - Title-case violation: lowercased proper noun (heuristic: word longer than 4 chars + lowercased)
 *
 *  Bonuses:
 *   - Contains a specific number
 *   - First-person pronoun (I/you/we) in first 3 words
 */
export function scoreHeroLine(line: string): HeroLineEvaluation {
  const trimmed = line.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  let score = 8;
  const reasons: string[] = [];

  if (wordCount < 5) {
    score -= 4;
    reasons.push(`only ${wordCount} words (target 6-14)`);
  } else if (wordCount < 6) {
    score -= 2;
    reasons.push(`${wordCount} words is short (target 6-14)`);
  } else if (wordCount > 16) {
    score -= 3;
    reasons.push(`${wordCount} words is long (target 6-14)`);
  } else if (wordCount > 14) {
    score -= 1;
    reasons.push(`${wordCount} words is on the long side`);
  }

  // First-4-word comma = stutter (but ignore thousands separators like 5,000).
  const first4 = words.slice(0, 4).join(' ');
  const stutterComma = /(?<!\d),(?!\d{3}\b)/.test(first4);
  if (stutterComma) {
    score -= 4;
    reasons.push('comma in first 4 words (stutter pattern)');
  }

  // Lowercase first letter.
  const firstChar = trimmed.charAt(0);
  if (firstChar && firstChar !== firstChar.toUpperCase() && /\p{L}/u.test(firstChar)) {
    score -= 3;
    reasons.push('starts with lowercase letter');
  }

  // Filler words.
  if (/\b(uh|um|you know|kinda|sorta)\b/i.test(trimmed)) {
    score -= 4;
    reasons.push('contains filler word (uh/um/you know)');
  }

  // Fragment-start: opening with "a/an/the" alone (hanging article).
  if (/^(a|an|the)\s/i.test(trimmed) && wordCount < 8) {
    score -= 2;
    reasons.push('opens with hanging article');
  }

  // Bonuses.
  if (/\d/.test(trimmed)) {
    score += 1;
    reasons.push('contains a specific number (+)');
  }
  const firstThree = words.slice(0, 3).join(' ').toLowerCase();
  if (/\b(i|you|we|my|your|our)\b/.test(firstThree)) {
    score += 1;
    reasons.push('first-person pronoun in first 3 words (+)');
  }

  // Lowercased proper-noun heuristic: any word ≥5 chars that's all lowercase
  // and doesn't appear in our SMALL_WORDS set is suspicious.
  const lowercaseLongWords = words.filter(
    (w) => w.length >= 5 && w === w.toLowerCase() && /^\p{L}+$/u.test(w),
  );
  if (lowercaseLongWords.length >= 2) {
    score -= 1;
    reasons.push(`${lowercaseLongWords.length} long-lowercase words (likely proper-noun violation)`);
  }

  return {
    line: trimmed,
    score: Math.max(0, Math.min(10, score)),
    reason: reasons.join('; '),
  };
}

/** Codex prompt for rewriting awkward heroes. Sends the full context + only
 *  the awkward lines + their flagged reasons, asks for replacements. */
function buildRewritePrompt(
  toRewrite: HeroLineEvaluation[],
  keptLines: string[],
  ctx: HeroRewriteContext,
): string {
  return [
    `You are ${ctx.creatorName}. We have ${5 - toRewrite.length} good homepage hero lines and ${toRewrite.length} that need rewriting.`,
    '',
    `Each line is a stop-the-scroll billboard for your homepage. 6-14 words, first-person, sticky, in your voice.`,
    '',
    `# Channel context`,
    `- niche: ${ctx.niche}`,
    `- audience: ${ctx.audience}`,
    `- recurring promise: ${ctx.recurringPromise}`,
    `- preserveTerms (use VERBATIM if natural): ${ctx.preserveTerms.slice(0, 10).join(', ')}`,
    `- profanityAllowed: ${ctx.voiceFingerprint.profanityAllowed}`,
    `- tonePreset: ${ctx.voiceFingerprint.tonePreset}`,
    '',
    `# Lines we're KEEPING (do not duplicate angles)`,
    keptLines.length > 0 ? keptLines.map((l, i) => `${i + 1}. ${l}`).join('\n') : '(none)',
    '',
    `# Lines that need REWRITING`,
    ...toRewrite.map((e, i) => `${i + 1}. "${e.line}" — flagged: ${e.reason}`),
    '',
    `# Task`,
    `Replace each flagged line with a fresh billboard line. Keep them DIFFERENT in angle from the kept lines (cover any of: pain / aspiration / contrarian / specific number / curiosity that aren't already covered).`,
    '',
    `Voice rules (HARD-FAIL):`,
    `- 6-14 words EACH`,
    `- First-person ("I", "you", "we", "my", "your"). NEVER "the creator", "${ctx.creatorName}", "she/he says".`,
    `- Capital first letter`,
    `- No transcript stutters, no commas in first 4 words, no filler ("uh", "um", "you know")`,
    `- Build clean, intentional lines. Don't lift verbatim from the flagged versions.`,
    '',
    `# Output format`,
    `ONE JSON object. No code fences. First char \`{\`, last char \`}\`.`,
    '',
    `{`,
    `  "rewritten": [${toRewrite.map(() => '"<replacement line>"').join(', ')}]`,
    `}`,
    '',
    `Return EXACTLY ${toRewrite.length} replacement lines in the same order as the flagged list.`,
    `JSON only.`,
  ].join('\n');
}

export interface HeroRewriteResult {
  refined: string[];                  // 5 final lines
  evaluations: HeroLineEvaluation[];  // pre-rewrite scores (length 5)
  rewriteCount: number;               // how many were swapped
}

/** Re-pass on the 5 hero candidates. Heuristic-score, send awkward ones to
 *  Codex, splice in replacements, return refined 5. */
export async function rewriteAwkwardHeroes(
  candidates: string[],
  ctx: HeroRewriteContext,
  options: { threshold?: number; timeoutMs?: number } = {},
): Promise<HeroRewriteResult> {
  const threshold = options.threshold ?? 7;
  const timeoutMs = options.timeoutMs ?? 5 * 60 * 1000;

  // Pad to exactly 5.
  const padded = candidates.slice(0, 5);
  while (padded.length < 5) padded.push('');

  const evaluations = padded.map(scoreHeroLine);
  const flaggedIdx: number[] = evaluations
    .map((e, i) => (e.line.length === 0 || e.score < threshold ? i : -1))
    .filter((i) => i >= 0);

  if (flaggedIdx.length === 0) {
    console.info(`[hero-rewrite] all 5 candidates ≥ ${threshold}/10 — no rewrite needed`);
    return { refined: padded, evaluations, rewriteCount: 0 };
  }

  const flagged = flaggedIdx.map((i) => evaluations[i]!);
  const kept = evaluations.filter((_, i) => !flaggedIdx.includes(i)).map((e) => e.line);
  console.info(`[hero-rewrite] ${flaggedIdx.length}/5 flagged for rewrite: ${flagged.map((e) => `"${e.line.slice(0, 40)}…" (${e.score}/10)`).join(' · ')}`);

  const prompt = buildRewritePrompt(flagged, kept, ctx);
  let replacements: string[] = [];
  try {
    const raw = await runCodex(prompt, { timeoutMs, label: 'hero_rewrite' });
    const json = extractJsonFromCodexOutput(raw);
    const parsed = JSON.parse(json) as { rewritten?: unknown };
    replacements = Array.isArray(parsed.rewritten)
      ? parsed.rewritten.filter((x): x is string => typeof x === 'string').map((s) => s.trim())
      : [];
  } catch (err) {
    console.warn(`[hero-rewrite] failed: ${(err as Error).message.slice(0, 200)} — keeping originals`);
    return { refined: padded, evaluations, rewriteCount: 0 };
  }

  const refined = [...padded];
  for (let i = 0; i < flaggedIdx.length; i += 1) {
    const replacement = replacements[i];
    if (replacement && replacement.length > 0) {
      refined[flaggedIdx[i]!] = replacement;
    }
  }
  return { refined, evaluations, rewriteCount: replacements.filter(Boolean).length };
}

/** Convenience wrapper: enforce title case on hub_title and run hero re-pass. */
export async function refineHeroBlock(
  block: { hub_title: string; hub_tagline: string; hero_candidates: string[] },
  ctx: HeroRewriteContext,
  options: { threshold?: number } = {},
): Promise<{ hub_title: string; hub_tagline: string; hero_candidates: string[]; rewriteCount: number }> {
  const titleCased = enforceTitleCase(block.hub_title);
  const heroResult = await rewriteAwkwardHeroes(block.hero_candidates, ctx, options);
  return {
    hub_title: titleCased,
    hub_tagline: block.hub_tagline,
    hero_candidates: heroResult.refined,
    rewriteCount: heroResult.rewriteCount,
  };
}
