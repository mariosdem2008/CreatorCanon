/**
 * Reference composer — the headline science-explainer product moment.
 *
 * Builds EvidenceCards from claim / evidence_review / definition canons.
 * The audience lands here from claim search asking "does X cause Y?" —
 * each card carries a verdict badge + mechanism + study citations.
 *
 * Pipeline:
 *   1. Filter canons to type ∈ {claim, evidence_review, definition}.
 *   2. classifyVerdictFromCanon: read _index_verification_status (set by
 *      audit) or fall back to body-language cues.
 *   3. topicSlugFromCanon: bucket into topics for grouping in topicIndex.
 *   4. authorEvidenceCard: 1 Codex call per canon → claim summary +
 *      mechanism + caveats + counterClaim.
 *   5. Build topicIndex (topic slug → card ids).
 *
 * Total Codex calls per creator: ~30-50 (one per claim canon).
 */

import type {
  CanonRef,
  CodexClient,
  ComposeInput,
  EvidenceCard,
  EvidenceVerdict,
  ReferenceComponent,
  VoiceMode,
} from '../types';

const ELIGIBLE_TYPES = new Set(['claim', 'evidence_review', 'definition']);

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

/** Slugify a free-text topic for use as a topicIndex key. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function topicSlugFromCanon(canon: CanonRef): string {
  const explicit = canon.payload._index_topic;
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return slugify(explicit) || 'general';
  }
  const tags = canon.payload._index_audience_job_tags;
  if (Array.isArray(tags) && tags.length > 0 && typeof tags[0] === 'string') {
    return slugify(tags[0]) || 'general';
  }
  return 'general';
}

const SUPPORTED_BODY_CUES = [
  /the data shows?/i,
  /well[- ]tolerated/i,
  /robust evidence/i,
  /\bRCT\b/,
  /meta[- ]analy[sz]es? (?:show|demonstrate|find)/i,
];
const CONTRADICTED_BODY_CUES = [
  /\bdebunked\b/i,
  /no evidence (?:for|that|to support)/i,
  /myth\b/i,
  /\bpseudoscience\b/i,
];
const PARTIAL_BODY_CUES = [
  /mixed (?:results|findings|evidence)/i,
  /\binconclusive\b/i,
  /it depends/i,
  /partially/i,
];

export function classifyVerdictFromCanon(canon: CanonRef): EvidenceVerdict {
  const status = canon.payload._index_verification_status;
  if (typeof status === 'string') {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'supported') return 'supported';
    if (s === 'contradicted' || s === 'refuted') return 'contradicted';
    if (s.startsWith('partial') || s === 'partially_confirmed' || s === 'mixed_partial') {
      return 'partially_supported';
    }
    if (s === 'mixed') return 'mixed';
  }
  const body = canon.payload.body ?? '';
  if (SUPPORTED_BODY_CUES.some((re) => re.test(body))) return 'supported';
  if (CONTRADICTED_BODY_CUES.some((re) => re.test(body))) return 'contradicted';
  if (PARTIAL_BODY_CUES.some((re) => re.test(body))) return 'partially_supported';
  return 'mixed';
}

interface RawEvidenceCard {
  claim: string;
  mechanismExplanation: string;
  caveats?: string[];
  counterClaim?: string;
}

async function authorEvidenceCard(
  canon: CanonRef,
  verdict: EvidenceVerdict,
  topic: string,
  codex: CodexClient,
  voiceMode: VoiceMode,
): Promise<EvidenceCard> {
  const voiceLabel =
    voiceMode === 'first_person'
      ? 'first-person'
      : voiceMode === 'third_person_editorial'
        ? 'editorial third-person'
        : 'mixed register';

  const prompt = [
    'You are writing one evidence card for a science-explainer reference. Read the canon and emit a JSON evidence card.',
    '',
    `Canon title: ${canon.payload.title ?? canon.id}`,
    `Canon body excerpt:`,
    (canon.payload.body ?? '').slice(0, 1500),
    '',
    `Verdict (already classified): ${verdict}`,
    '',
    'Output rules:',
    '- "claim": 6-15 words, the core claim ("Linoleic acid is not pro-inflammatory at typical intake")',
    `- "mechanismExplanation": 1-2 sentences, ${voiceLabel}, explaining WHY the verdict holds`,
    '- "caveats": 0-3 short items, each <= 18 words; nuance/limits',
    '- "counterClaim": optional, the popular myth this card pushes back on (omit if not applicable)',
    '',
    'Format: ONE JSON object. First char {, last char }. No code fences. No prose.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'reference_evidence_card',
    timeoutMs: 60_000,
    label: `evidence-card:${canon.id}`,
  });

  const parsed = safeJsonParse<RawEvidenceCard>(raw);
  // Graceful fallback: if Codex returned junk, derive a minimal card from the
  // canon. Better to ship a thin card than to throw and lose the whole bundle.
  const claim =
    parsed?.claim?.trim() ||
    canon.payload.title?.toString().trim() ||
    `Claim from ${canon.id}`;
  const mechanism =
    parsed?.mechanismExplanation?.trim() ||
    (canon.payload.body ?? '').slice(0, 200) ||
    'No mechanism summary available.';

  return {
    id: `card_${canon.id}`,
    claim,
    verdict,
    mechanismExplanation: mechanism,
    topic,
    studyEvidenceCanonIds: [canon.id],
    caveats: Array.isArray(parsed?.caveats)
      ? parsed!.caveats.filter((c): c is string => typeof c === 'string')
      : [],
    ...(parsed?.counterClaim ? { counterClaim: parsed.counterClaim } : {}),
  };
}

export async function composeReference(
  input: ComposeInput,
  opts: { codex: CodexClient },
): Promise<ReferenceComponent> {
  const eligible = input.canons.filter((c) =>
    ELIGIBLE_TYPES.has(c.payload.type ?? ''),
  );

  if (eligible.length === 0) {
    return { cards: [], topicIndex: {} };
  }

  const cards = await Promise.all(
    eligible.map(async (canon) => {
      const verdict = classifyVerdictFromCanon(canon);
      const topic = topicSlugFromCanon(canon);
      return authorEvidenceCard(canon, verdict, topic, opts.codex, input.voiceMode);
    }),
  );

  const topicIndex: Record<string, string[]> = {};
  for (const card of cards) {
    const list = topicIndex[card.topic] ?? [];
    list.push(card.id);
    topicIndex[card.topic] = list;
  }

  return { cards, topicIndex };
}
