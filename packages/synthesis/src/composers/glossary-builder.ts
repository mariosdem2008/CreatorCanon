/**
 * Glossary builder — programmatic mechanism extractor.
 *
 * For each canon, find named mechanisms via regex (capitalized multi-word
 * phrases occurring across multiple canons). Pre-filter against a
 * stop-leading-word list, deduplicate by lowercase form, then ask Codex for
 * a 1-2 sentence definition per surviving term. Cross-link every canon id
 * that mentions the term.
 *
 * Total Codex calls per creator: up to maxTerms (default 60).
 */

import type {
  CanonRef,
  CodexClient,
  ComposeInput,
  GlossaryComponent,
  GlossaryEntry,
} from '../types';

const DEFAULT_MIN_OCCURRENCES = 3;
const DEFAULT_MAX_TERMS = 60;

// Words we never want as the leading token of a "term".
const LEADING_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'then',
  'because',
  'so',
  'this',
  'that',
  'these',
  'those',
  'i',
  'you',
  'we',
  'they',
  'he',
  'she',
  'it',
  'my',
  'your',
  'our',
  'their',
  'his',
  'her',
  'its',
  'when',
  'where',
  'why',
  'how',
  'who',
  'what',
  'which',
  'while',
  'before',
  'after',
  'every',
  'each',
  'some',
  'any',
  'no',
  'all',
  'one',
  'two',
  'three',
  'four',
  'five',
  // Sentence-starter verbs/discourse markers we don't want at the head.
  'use',
  'using',
  'used',
  'see',
  'seen',
  'note',
  'most',
  'many',
  'much',
  'few',
  'other',
  'another',
  'such',
  'first',
  'last',
  'next',
]);

const TERM_REGEX =
  /\b([A-Z][a-zA-Z0-9-]+(?:\s+[A-Z][a-zA-Z0-9-]+){1,4})\b/g;

export function termSlug(term: string): string {
  return term
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface Candidate {
  term: string;
  canonIds: string[];
  occurrences: number;
}

export function extractCandidateTerms(
  canons: CanonRef[],
  minOccurrences: number = DEFAULT_MIN_OCCURRENCES,
): Candidate[] {
  const map = new Map<
    string,
    { term: string; canonIds: Set<string>; occurrences: number }
  >();

  for (const c of canons) {
    const body = c.payload.body ?? '';
    if (typeof body !== 'string' || body.length === 0) continue;
    const seenInCanon = new Set<string>();
    for (const m of body.matchAll(TERM_REGEX)) {
      const phrase = m[1];
      if (!phrase) continue;
      const firstWord = phrase.split(/\s+/)[0]?.toLowerCase();
      if (!firstWord || LEADING_STOPWORDS.has(firstWord)) continue;
      const key = phrase.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.canonIds.add(c.id);
        existing.occurrences += 1;
      } else {
        map.set(key, {
          term: phrase,
          canonIds: new Set([c.id]),
          occurrences: 1,
        });
      }
      seenInCanon.add(key);
    }
  }

  const results: Candidate[] = [];
  for (const value of map.values()) {
    if (value.occurrences >= minOccurrences) {
      results.push({
        term: value.term,
        canonIds: [...value.canonIds],
        occurrences: value.occurrences,
      });
    }
  }
  // Stable order: most-frequent first, then alphabetical.
  results.sort((a, b) => {
    if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
    return a.term.localeCompare(b.term);
  });
  return results;
}

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

interface RawDefinition {
  definition: string;
}

async function authorDefinition(
  term: string,
  contextSample: string,
  codex: CodexClient,
): Promise<string> {
  const prompt = [
    'You are writing one glossary definition for a science-explainer hub.',
    `Term: "${term}"`,
    'Sample of how the creator uses it (excerpt):',
    contextSample.slice(0, 800),
    '',
    'Output rules:',
    '- "definition": 1-2 sentences, plain language, accurate to the creator\'s usage',
    '- Do NOT redefine the term using itself',
    '',
    'Format: ONE JSON object: {"definition":"..."}. First char {, last char }.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'glossary_definition',
    timeoutMs: 60_000,
    label: `glossary:${term}`,
  });
  const parsed = safeJsonParse<RawDefinition>(raw);
  if (parsed?.definition?.trim()) return parsed.definition.trim();
  // Graceful fallback so a failed Codex call does not lose the entry.
  return `Term used by the creator. See linked canons for usage.`;
}

export async function composeGlossary(
  input: ComposeInput,
  opts: { codex: CodexClient; maxTerms?: number; minOccurrences?: number },
): Promise<GlossaryComponent> {
  const candidates = extractCandidateTerms(
    input.canons,
    opts.minOccurrences ?? DEFAULT_MIN_OCCURRENCES,
  ).slice(0, opts.maxTerms ?? DEFAULT_MAX_TERMS);

  if (candidates.length === 0) return { entries: [] };

  // Build a quick canon-id → body lookup for context samples.
  const bodyById = new Map(input.canons.map((c) => [c.id, c.payload.body ?? '']));

  const entries: GlossaryEntry[] = await Promise.all(
    candidates.map(async (cand) => {
      const sample = cand.canonIds
        .map((id) => bodyById.get(id) ?? '')
        .filter((b): b is string => typeof b === 'string' && b.length > 0)
        .slice(0, 2)
        .join('\n---\n');
      const definition = await authorDefinition(cand.term, sample, opts.codex);
      return {
        id: `term_${termSlug(cand.term)}`,
        term: cand.term,
        definition,
        appearsInCanonIds: cand.canonIds,
      };
    }),
  );

  return { entries };
}
