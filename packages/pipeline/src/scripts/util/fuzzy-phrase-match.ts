/**
 * Fuzzy phrase-in-text matcher for Phase 9 evidence verification.
 *
 * Phase 8 evidence-tagger uses strict substring match. This fails when
 * Whisper transcription diverges from Codex-extracted supportingPhrase
 * (gonna vs going to, contractions, filler words, comma placement).
 * Result: 100% unsupported for the 4 new creators in Phase 8 cohort
 * (Sivers/Clouse/Huber/Norton).
 *
 * Strategy cascade (first match wins):
 *   1. Exact substring (case-sensitive). Fast path for clean transcripts.
 *   2. Normalized substring (lowercase + punctuation strip + whitespace
 *      collapse). Handles most casing/punctuation drift.
 *   3. Word-coverage: >=60% of phrase words appear in text. Handles Whisper
 *      word substitutions (need->want, am->m, etc.) while keeping punctuation
 *      tolerance. Applied to phrases of any length.
 *   4. Levenshtein-distance windowed match. Slide a window of phrase.length
 *      across text, measure character-level edit distance, accept if within
 *      ratio threshold (default 15%). Skipped for short phrases (< 5 words)
 *      to avoid false positives.
 */

export interface FuzzyMatchOptions {
  /** Max Levenshtein distance as ratio of phrase length. Default 0.15 (15%). */
  maxDistanceRatio?: number;
  /** Phrases shorter than this (in words) skip fuzzy Levenshtein strategy. Default 5. */
  shortPhraseThreshold?: number;
}

export interface FuzzyMatchResult {
  match: boolean;
  /** Similarity score 0-1 (1 = exact, 0 = totally different). */
  score: number;
  /** Strategy that produced the match. */
  strategy: 'exact' | 'normalized' | 'fuzzy' | 'none';
}

// Smart/curly quotes (U+201C/D, U+2018/9), ellipsis (U+2026), en/em-dash (U+2013/4).
const SMART_CHARS_RE = /[“”‘’…–—]/g;

/**
 * Normalize a string for fuzzy matching:
 * - Lowercase
 * - Replace smart quotes / dashes / ellipsis with spaces
 * - Preserve inner-word ASCII apostrophes ("don't" stays "don't")
 * - Strip remaining punctuation (replace with space)
 * - Collapse whitespace
 */
export function normalizeForMatch(s: string): string {
  if (!s) return '';
  let out = s.toLowerCase();

  // Replace smart/curly quotes, dashes, ellipsis with space first (before apostrophe logic)
  out = out.replace(SMART_CHARS_RE, ' ');

  // Protect inner-word ASCII apostrophes (U+0027): word'word -> word\x00word
  out = out.replace(/(\w)'(\w)/g, '$1\x00$2');

  // Strip remaining apostrophes (leading/trailing/standalone)
  out = out.replace(/'/g, ' ');

  // Restore inner-word apostrophes
  out = out.replace(/\x00/g, "'");

  // Strip remaining punctuation (commas, periods, exclamation, etc.)
  out = out.replace(/[.,!?;:()\[\]{}<>/\|@#$%^&*+=\-_"]/g, ' ');

  // Collapse whitespace
  out = out.replace(/\s+/g, ' ').trim();

  return out;
}

/** Standard Levenshtein distance -- iterative DP, O(n*m) time, O(min(n,m)) space. */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  if (a.length < b.length) { const tmp = a; a = b; b = tmp; }

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1]! + 1,
        prev[j]! + 1,
        prev[j - 1]! + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

/**
 * Check whether `phrase` appears in `text` using a four-strategy cascade:
 *   1. Exact substring
 *   2. Normalized (lowercase + punctuation-strip) substring
 *   3. Word-coverage: >=60% of phrase words found in text (any position)
 *   4. Levenshtein-windowed fuzzy match (skipped for short phrases < 5 words)
 */
export function fuzzyPhraseInText(
  phrase: string,
  text: string,
  options: FuzzyMatchOptions = {},
): FuzzyMatchResult {
  const maxDistanceRatio = options.maxDistanceRatio ?? 0.15;
  const shortPhraseThreshold = options.shortPhraseThreshold ?? 5;

  if (!phrase || !text) return { match: false, score: 0, strategy: 'none' };

  // Strategy 1: exact substring (cheapest -- fast path for clean transcripts)
  if (text.includes(phrase)) {
    return { match: true, score: 1.0, strategy: 'exact' };
  }

  // Strategy 2: normalized substring
  const normPhrase = normalizeForMatch(phrase);
  const normText = normalizeForMatch(text);

  if (normPhrase.length === 0) return { match: false, score: 0, strategy: 'none' };

  if (normText.includes(normPhrase)) {
    return { match: true, score: 0.95, strategy: 'normalized' };
  }

  // Strategy 3: word-coverage check.
  // Count how many unique words from the phrase appear anywhere in the text.
  // Threshold: >=60% word coverage. This handles Whisper word substitutions
  // (need->want, going to->gonna, etc.) while preventing false positives.
  const phraseWords = normPhrase.split(/\s+/).filter(Boolean);
  const textWordSet = new Set(normText.split(/\s+/).filter(Boolean));
  const uniquePhraseWords = [...new Set(phraseWords)];
  if (uniquePhraseWords.length > 0) {
    let matchedWords = 0;
    for (const w of uniquePhraseWords) {
      if (textWordSet.has(w)) matchedWords += 1;
    }
    const wordCoverageRatio = matchedWords / uniquePhraseWords.length;
    if (wordCoverageRatio >= 0.6) {
      return { match: true, score: wordCoverageRatio * 0.8, strategy: 'normalized' };
    }
  }

  // Short-phrase guard: skip Levenshtein fuzzy for phrases shorter than threshold
  // (default 5 words) -- too easy to false-positive against unrelated text.
  if (phraseWords.length < shortPhraseThreshold) {
    return { match: false, score: 0, strategy: 'none' };
  }

  // Strategy 4: Levenshtein-windowed fuzzy.
  // Slide a word-aligned window across the normalized text. Window is sized to
  // match normPhrase.length (+-20% to absorb word-length drift).
  // Accept if edit distance <= maxDistanceRatio * normPhrase.length.
  const windowLen = normPhrase.length;
  const maxDistance = Math.floor(windowLen * maxDistanceRatio);
  let minDistance = Infinity;

  const textWords = normText.split(/\s+/).filter(Boolean);
  for (let wStart = 0; wStart < textWords.length; wStart += 1) {
    const windowText = textWords.slice(wStart).join(' ').slice(0, Math.ceil(windowLen * 1.2));
    if (windowText.length < normPhrase.length * 0.5) break; // rest of text is too short

    const candidate = windowText.slice(0, windowLen);
    const d = levenshtein(normPhrase, candidate);
    if (d < minDistance) minDistance = d;
    if (minDistance === 0) break; // perfect match found
  }

  if (minDistance <= maxDistance) {
    const score = Math.max(0, 1 - minDistance / windowLen);
    return { match: true, score, strategy: 'fuzzy' };
  }

  return { match: false, score: 0, strategy: 'none' };
}
