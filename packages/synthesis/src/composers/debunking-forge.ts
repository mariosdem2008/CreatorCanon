/**
 * Debunking forge — myth → counter-narrative share artifacts for
 * science-explainer creators.
 *
 * Pipeline:
 *   1. detectDebunkingCanon: scan canon body + voice fingerprint signals to
 *      surface canons that push back on a popular narrative.
 *   2. Cap at maxItems (default 20) to bound Codex spend.
 *   3. authorDebunkingItem: 1 Codex call per canon → myth + reality copy.
 *   4. Emit DebunkingComponent. Share-card image rendering happens at
 *      runtime via @vercel/og (Phase A pattern); this composer does not
 *      pre-render images, it only authors the prose payload.
 *
 * Total Codex calls per creator: up to maxItems (default 20).
 */

import type {
  CanonRef,
  CodexClient,
  ComposeInput,
  DebunkingComponent,
  DebunkingItem,
} from '../types';

const DEFAULT_MAX_ITEMS = 20;

const DEBUNKING_BODY_CUES: RegExp[] = [
  /\bthe myth is\b/i,
  /\bactually,?\s+(?:the data|the evidence|studies)/i,
  /\bcommonly believed\b/i,
  /\bcommon misconception\b/i,
  /\bdebunk(?:ed|s|ing)?\b/i,
  /\bfear[- ]?mongering\b/i,
  /\bcontrary to (?:popular )?belief\b/i,
  /\bno evidence (?:for|that|to support)\b/i,
];

// Forward-hook tag set. The current audit pipeline does NOT emit these tags
// on `_index_voice_fingerprint.rhetoricalMoves` — that path is intentionally
// open for a future audit-side enhancement that classifies rhetorical posture
// (myth-busting, fearmongering-pushback, contrarian-evidence) in Stage 6 or
// 7. Until that lands, only DEBUNKING_BODY_CUES is exercised in real cohort
// runs; the smoke fixture fabricates these tags to verify the hook does the
// right thing once it goes live.
//
// TODO(audit-pipeline): emit these tags on the voice fingerprint so this
// branch isn't dead in production. Tracked in phase-h-followups.md.
const DEBUNKING_FINGERPRINT_TAGS = [
  'fearmongering-pushback',
  'myth-busting',
  'contrarian-evidence',
];

function fingerprintHasTag(canon: CanonRef): boolean {
  const fp = canon.payload._index_voice_fingerprint;
  if (!fp || typeof fp !== 'object') return false;
  const moves = (fp as { rhetoricalMoves?: unknown }).rhetoricalMoves;
  if (!Array.isArray(moves)) return false;
  return moves.some(
    (m): m is string =>
      typeof m === 'string' && DEBUNKING_FINGERPRINT_TAGS.includes(m),
  );
}

export function detectDebunkingCanon(canon: CanonRef): boolean {
  if (canon.payload.type === 'debunking') return true;
  if (fingerprintHasTag(canon)) return true;
  const body = canon.payload.body ?? '';
  return DEBUNKING_BODY_CUES.some((re) => re.test(body));
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

interface RawDebunking {
  myth: string;
  reality: string;
}

async function authorDebunkingItem(
  canon: CanonRef,
  codex: CodexClient,
): Promise<DebunkingItem | null> {
  const prompt = [
    'You are writing one debunking item for a science-explainer hub. Read the canon and emit a myth/reality JSON object.',
    '',
    `Canon title: ${canon.payload.title ?? canon.id}`,
    `Canon body excerpt:`,
    (canon.payload.body ?? '').slice(0, 1500),
    '',
    'Output rules:',
    '- "myth": 6-15 words; the popular claim being pushed back on, in plain language',
    '- "reality": 1-paragraph counter-narrative grounded in the canon body; 2-4 sentences max',
    '',
    'Format: ONE JSON object. First char {, last char }. No code fences. No prose.',
  ].join('\n');

  const raw = await codex.run(prompt, {
    stage: 'debunking_item',
    timeoutMs: 60_000,
    label: `debunking-item:${canon.id}`,
  });

  const parsed = safeJsonParse<RawDebunking>(raw);
  if (!parsed?.myth || !parsed?.reality) {
    // Graceful fallback: ship a minimal item rather than failing the bundle.
    const titleLine = canon.payload.title?.toString().trim();
    if (!titleLine) return null;
    return {
      id: `myth_${canon.id}`,
      myth: titleLine,
      reality: (canon.payload.body ?? '').slice(0, 280) || 'See evidence canon for details.',
      primaryEvidenceCanonIds: [canon.id],
    };
  }

  return {
    id: `myth_${canon.id}`,
    myth: parsed.myth.trim(),
    reality: parsed.reality.trim(),
    primaryEvidenceCanonIds: [canon.id],
  };
}

export async function composeDebunking(
  input: ComposeInput,
  opts: { codex: CodexClient; maxItems?: number },
): Promise<DebunkingComponent> {
  const max = opts.maxItems ?? DEFAULT_MAX_ITEMS;
  const candidates = input.canons
    .filter((c) => detectDebunkingCanon(c))
    .slice(0, max);

  if (candidates.length === 0) {
    return { items: [] };
  }

  const items = (
    await Promise.all(
      candidates.map((canon) => authorDebunkingItem(canon, opts.codex)),
    )
  ).filter((it): it is DebunkingItem => it !== null);

  return { items };
}
