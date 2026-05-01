/**
 * Title-case enforcer (Phase 5 / Task 6.4).
 *
 * Applies AP-style title case to canon titles, page titles, and synthesis
 * titles produced by Codex. The pipeline's generators try to write proper
 * case, but a Jordan-v2 spot check showed cases like "pre-10k a month revenue"
 * that should be "Pre-10K a Month Revenue".
 *
 * Rules:
 *   - Capitalize the FIRST and LAST word always
 *   - Capitalize the first word AFTER a colon ("Word: First-Cap-After")
 *   - Lowercase short articles/conjunctions/prepositions (≤4 chars):
 *     a, an, the, and, but, or, nor, for, yet, so, at, by, in, of, on, to, up, vs
 *   - Capitalize all other words
 *   - Preserve all-caps tokens that are likely acronyms (AI, SEO, ROI, K, M, x10)
 *     — heuristic: if input token is all-uppercase AND ≤ 5 chars → keep as-is
 *   - Preserve mixed-case number/unit combos: "10K", "£5,000", "100x"
 *   - Hyphenated words: title-case each segment ("Pre-10K", "Stop-the-Scroll")
 *   - DOES NOT touch markdown body text (this is for short titles only)
 *
 * Reverse rule: the FIRST letter of the title is always capitalized, even if
 * the first word is normally lowercase ("an" → "An " when leading).
 */

const SMALL_WORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by',
  'en', 'for', 'if', 'in', 'is', 'of', 'on',
  'or', 'nor', 'so', 'the', 'to', 'up', 'vs',
  'via', 'yet',
]);

/** Known acronyms that should be uppercased even when the input is lowercase.
 *  Add to this list when a creator's terminology routinely needs preservation. */
const KNOWN_ACRONYMS = new Set([
  'ai', 'ar', 'vr', 'ml', 'nlp', 'seo', 'roi', 'kpi', 'ctr',
  'cpa', 'cpc', 'cpm', 'b2b', 'b2c', 'saas', 'pdf', 'api',
  'css', 'html', 'http', 'https', 'json', 'sql', 'sdk', 'cli',
  'gpu', 'cpu', 'rgb', 'jpeg', 'png', 'usa', 'uk', 'eu',
  'ceo', 'cto', 'cfo', 'coo', 'vp', 'rep', 'crm', 'erp',
  'gpt', 'llm', 'rag', 'mcp', 'ide', 'tdd', 'bdd', 'ux', 'ui',
]);

/** Returns true if the token looks like an acronym we should preserve as-is. */
function looksLikeAcronym(token: string): boolean {
  if (token.length === 0 || token.length > 5) return false;
  if (!/^[A-Z]+$/.test(token)) return false;
  return true;
}

/** Returns true if the token is a number-unit combo we should preserve as-is.
 *  Examples: "10K", "100x", "£5,000", "5%", "v2", "GPT-4". */
function looksLikeNumberUnit(token: string): boolean {
  return /\d/.test(token);
}

/** Capitalize a single word, respecting acronym/number rules. */
function capWord(token: string): string {
  if (token.length === 0) return token;
  if (looksLikeAcronym(token)) return token;
  if (KNOWN_ACRONYMS.has(token.toLowerCase())) return token.toUpperCase();
  if (looksLikeNumberUnit(token)) {
    // Mixed: lowercase trailing letters become uppercase if 1-2 chars (units),
    // otherwise capitalize the leading char.
    return token.replace(/^([^\p{L}]*)([\p{L}].*)$/u, (_, prefix, rest) =>
      `${prefix}${rest.charAt(0).toUpperCase()}${rest.slice(1)}`,
    );
  }
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Title-case a single segment (no colons assumed). */
function titleCaseSegment(segment: string, isFirst: boolean, isLast: boolean): string {
  const words = segment.split(/\s+/).filter(Boolean);
  return words
    .map((word, i) => {
      // Hyphenated: title-case each piece, except small inner words that follow
      // the leading hyphen (e.g. "Stop-the-Scroll": stop→Stop, the→the, scroll→Scroll).
      if (word.includes('-')) {
        const pieces = word.split('-');
        return pieces
          .map((piece, j) => {
            const isFirstPiece = j === 0;
            const isLastPiece = j === pieces.length - 1;
            const lower = piece.toLowerCase();
            if (looksLikeAcronym(piece)) return piece;
            if (looksLikeNumberUnit(piece)) return capWord(piece);
            if (!isFirstPiece && !isLastPiece && SMALL_WORDS.has(lower)) return lower;
            return capWord(piece);
          })
          .join('-');
      }
      const lower = word.toLowerCase();
      const isFirstOverall = isFirst && i === 0;
      const isLastOverall = isLast && i === words.length - 1;
      if (!isFirstOverall && !isLastOverall && SMALL_WORDS.has(lower)) return lower;
      return capWord(word);
    })
    .join(' ');
}

export function enforceTitleCase(title: string): string {
  if (typeof title !== 'string') return title;
  const trimmed = title.trim();
  if (trimmed.length === 0) return trimmed;

  // Split on colons — each segment gets its own first/last cap rules.
  const segments = trimmed.split(/(\s*:\s*)/);
  const out: string[] = [];
  // Track which output segments are content (vs the colon separators).
  const contentIdx: number[] = [];
  segments.forEach((s, i) => {
    if (i % 2 === 0) contentIdx.push(i);
  });
  segments.forEach((s, i) => {
    if (i % 2 === 1) {
      out.push(s); // Colon separator — push as-is.
      return;
    }
    const segIdx = contentIdx.indexOf(i);
    // Each colon-separated segment is treated as a fresh clause: its first
    // word is always capitalized (so "Pillar: The Bedrock", not "Pillar: the").
    const isFirst = true;
    const isLast = segIdx === contentIdx.length - 1;
    out.push(titleCaseSegment(s, isFirst, isLast));
  });
  // Force capital on the very first non-whitespace character.
  let result = out.join('');
  result = result.replace(/^(\s*)([\p{L}])/u, (_m, ws, c) => `${ws}${c.toUpperCase()}`);
  return result;
}
