/**
 * Evidence tagger (Phase 7 / Task 7.2).
 *
 * Per-entity batched tagger: reads each body field's inline [<UUID>] citations
 * and produces a structured evidence registry mapping each UUID to
 * role/relevance/why metadata.
 *
 * This is THE most important new prompt in Phase 7. It produces role labels
 * that hold up to operator review, supportingPhrases that are literal substrings
 * of source segments, and confidence values that correctly correlate with
 * relevance scores.
 *
 * Independent per entity → parallelized with bounded concurrency.
 * Gracefully degrades to a minimal synthetic registry on persistent failure
 * so downstream "orphan citation" checks never block.
 */

import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
import { runCodex } from './codex-runner';
import { repairTruncatedJson } from './json-repair';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EvidenceType =
  | 'claim'
  | 'framework_step'
  | 'example'
  | 'caveat'
  | 'mistake'
  | 'tool'
  | 'story'
  | 'proof';

export interface EvidenceEntry {
  segmentId: string;
  supportingPhrase: string;
  evidenceType: EvidenceType;
  supports: string;
  relevanceScore: number;             // 0-100
  confidence: 'high' | 'medium' | 'low';
  roleEvidence: string;
  whyThisSegmentFits: string;
  whyThisSegmentMayNotFit?: string;
  verificationStatus: 'verified' | 'needs_review' | 'unsupported';
}

export interface EvidenceTaggerInput {
  /** Entity ID (cn_xxx, pb_xxx). For logging only. */
  entityId: string;
  /** Entity body markdown with inline [<UUID>] citations. */
  body: string;
  /** Per-cited-UUID lookup of full segment text. */
  segmentTextById: Record<string, string>;
  /** Voice fingerprint context — informs role attribution strictness. */
  voiceFingerprint: { tonePreset: string; preserveTerms: string[] };
}

export interface EvidenceTaggerResult {
  registry: Record<string, EvidenceEntry>;  // segmentId → entry
}

// ---------------------------------------------------------------------------
// Canonical enum set (for validation)
// ---------------------------------------------------------------------------

const EVIDENCE_TYPES = new Set<EvidenceType>([
  'claim',
  'framework_step',
  'example',
  'caveat',
  'mistake',
  'tool',
  'story',
  'proof',
]);

const UUID_REGEX = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;

// ---------------------------------------------------------------------------
// Step 2: verificationStatus calculator (pure function)
// ---------------------------------------------------------------------------

export function computeVerificationStatus(
  entry: EvidenceEntry,
  segmentText: string,
): EvidenceEntry['verificationStatus'] {
  if (!segmentText.includes(entry.supportingPhrase)) return 'unsupported';
  if (entry.relevanceScore < 40) return 'unsupported';
  if (entry.relevanceScore >= 70 && entry.confidence !== 'low') return 'verified';
  return 'needs_review';
}

// ---------------------------------------------------------------------------
// Step 3: Prompt builder
// ---------------------------------------------------------------------------

function buildEvidencePrompt(input: EvidenceTaggerInput): string {
  const lines: string[] = [];

  lines.push(`You are an evidence classifier for a creator knowledge hub.`);
  lines.push(``);
  lines.push(`Your job is to analyse an entity body and classify each cited segment's`);
  lines.push(`role, relevance, and fit — producing a structured evidence registry.`);
  lines.push(``);
  lines.push(`# Entity`);
  lines.push(`- entityId: ${input.entityId}`);
  lines.push(`- tonePreset: ${input.voiceFingerprint.tonePreset}`);
  if (input.voiceFingerprint.preserveTerms.length > 0) {
    lines.push(`- preserveTerms: ${input.voiceFingerprint.preserveTerms.join(', ')}`);
  }
  lines.push(``);
  lines.push(`# Entity body (with inline [<UUID>] citations)`);
  lines.push(``);
  lines.push(input.body);
  lines.push(``);

  const citedIds = Array.from(
    new Set(Array.from(input.body.matchAll(UUID_REGEX)).map((m) => m[1]!)),
  );

  lines.push(`# Source segments (full text for every cited UUID)`);
  lines.push(``);
  for (const id of citedIds) {
    const text = input.segmentTextById[id] ?? '(segment text unavailable)';
    lines.push(`[${id}]`);
    lines.push(`"${text.replace(/"/g, '\\"').slice(0, 800)}"`);
    lines.push(``);
  }

  lines.push(`# Task`);
  lines.push(`For EVERY cited UUID listed above, produce an EvidenceEntry object.`);
  lines.push(`Return {registry: {<UUID>: EvidenceEntry, ...}} for ALL ${citedIds.length} UUID(s).`);
  lines.push(``);

  lines.push(`# supportingPhrase rules (HARD-FAIL if violated)`);
  lines.push(`supportingPhrase MUST be a contiguous substring of the source segment text.`);
  lines.push(`NO paraphrasing. NO cleaning. NO abbreviation. Copy the EXACT characters.`);
  lines.push(``);
  lines.push('# supportingPhrase length rule');
  lines.push('Pick a 10-25 word substring. NOT the whole segment. NOT a single word.');
  lines.push('The phrase should be the TIGHTEST verbatim chunk that supports the cited claim.');
  lines.push('Avoid phrases ending mid-sentence — pick complete clauses where possible.');
  lines.push('');
  lines.push('✓ GOOD: "the mistake I made was niching too early" (8 words, complete clause)');
  lines.push('✓ GOOD: "we want to make sure that we\'re going for clients that are high demand" (14 words, complete clause)');
  lines.push('✗ BAD: "we ran 100 prospects every single day for six weeks straight, and what we found was that the conversion rate was higher" (>25 words — too long)');
  lines.push('✗ BAD: "the mistake" (2 words — not enough context)');
  lines.push('');
  lines.push(`✓ GOOD examples (these phrases ARE in the segment text verbatim):`);
  lines.push(`  segment text: "...we ran 100 prospects every single day for six weeks..."`);
  lines.push(`  supportingPhrase: "ran 100 prospects every single day"`);
  lines.push(``);
  lines.push(`  segment text: "...the mistake I made was niching too early before market feedback..."`);
  lines.push(`  supportingPhrase: "the mistake I made was niching too early"`);
  lines.push(``);
  lines.push(`  segment text: "...REM sleep paradoxically activates the same threat-detection circuits..."`);
  lines.push(`  supportingPhrase: "REM sleep paradoxically activates the same threat-detection circuits"`);
  lines.push(``);
  lines.push(`✗ BAD examples (these are paraphrases — would FAIL the substring check):`);
  lines.push(`  segment text: "...we ran 100 prospects every single day..."`);
  lines.push(`  supportingPhrase: "ran a hundred prospects daily"      ← NO. Not verbatim.`);
  lines.push(`  supportingPhrase: "100 prospects per day"              ← NO. Reworded.`);
  lines.push(`  supportingPhrase: "ran 100 prospects... every day"     ← NO. Has "..." which isn't in source.`);
  lines.push(``);

  lines.push(`# evidenceType examples (one per type)`);
  lines.push(`- claim: cites a creator's assertion. Body context: "I prospect daily because rent is due [UUID]" → claim`);
  lines.push(`- framework_step: cites a step in a numbered/named procedure. "Step 3 of CPS is to invert the objection [UUID]" → framework_step`);
  lines.push(`- example: cites a concrete instance. "When I sold a £5K retainer to a dental clinic [UUID]" → example`);
  lines.push(`- caveat: cites a conditional/exception. "Don't apply this if you have <100 prospects [UUID]" → caveat`);
  lines.push(`- mistake: cites a named anti-pattern. "I niched too early before market feedback [UUID]" → mistake`);
  lines.push(`- tool: cites a named tool/product/service. "I use Apollo for the prospect list [UUID]" → tool`);
  lines.push(`- story: cites a narrative arc with stakes. "The first time I closed a £10K month [UUID]" → story`);
  lines.push(`- proof: cites external evidence (study, data, named authority). "Studies show 80% of buyers [UUID]" → proof`);
  lines.push(``);
  lines.push(`If two types fit equally, pick the more specific one (mistake > caveat > claim).`);
  lines.push(`Use roleEvidence to explain the choice in 1 sentence.`);
  lines.push(``);

  lines.push(`# relevanceScore rubric (0-100)`);
  lines.push(`- 90-100: exact match — the segment is precisely the source of the body claim`);
  lines.push(`- 70-89:  clear support — the segment clearly backs the body claim with minor paraphrase`);
  lines.push(`- 40-69:  partial — the segment partially supports; some inference required`);
  lines.push(`- 0-39:   unsupported — the segment barely or doesn't relate to the body claim`);
  lines.push(``);

  lines.push(`# confidence rubric`);
  lines.push(`- high:   segment explicitly states what the body claims (no inference needed)`);
  lines.push(`- medium: segment paraphrases or implies the claim (light inference)`);
  lines.push(`- low:    connection requires significant inference or is speculative`);
  lines.push(``);

  lines.push(`# EvidenceEntry schema (required fields for every UUID)`);
  lines.push(`{`);
  lines.push(`  "segmentId":             "<the UUID>",`);
  lines.push(`  "supportingPhrase":      "<verbatim substring of segment text — NEVER paraphrased>",`);
  lines.push(`  "evidenceType":          "<one of: claim | framework_step | example | caveat | mistake | tool | story | proof>",`);
  lines.push(`  "supports":              "<one sentence: what body claim this segment supports>",`);
  lines.push(`  "relevanceScore":        <integer 0-100>,`);
  lines.push(`  "confidence":            "<high | medium | low>",`);
  lines.push(`  "roleEvidence":          "<one sentence: why you chose that evidenceType>",`);
  lines.push(`  "whyThisSegmentFits":    "<one sentence: why this segment fits the body context>",`);
  lines.push(`  "whyThisSegmentMayNotFit": "<one sentence or omit if clearly fits>",`);
  lines.push(`  "verificationStatus":    "<verified | needs_review | unsupported — apply the rubric yourself>"`);
  lines.push(`}`);
  lines.push(``);

  lines.push(`# Output format`);
  lines.push(`ONE JSON object. No code fences. No preamble. First char \`{\`, last char \`}\`.`);
  lines.push(``);
  lines.push(`{`);
  lines.push(`  "registry": {`);
  lines.push(`    "<UUID-1>": { ...EvidenceEntry },`);
  lines.push(`    "<UUID-2>": { ...EvidenceEntry },`);
  lines.push(`    ...`);
  lines.push(`  }`);
  lines.push(`}`);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Step 5 (helper): Degraded registry fallback
// ---------------------------------------------------------------------------

function buildDegradedRegistry(
  body: string,
  segmentTextById: Record<string, string>,
): Record<string, EvidenceEntry> {
  const registry: Record<string, EvidenceEntry> = {};
  const uuids = Array.from(body.matchAll(/\[([a-f0-9-]{36})\]/g)).map((m) => m[1]!);
  for (const id of [...new Set(uuids)]) {
    const segText = segmentTextById[id] ?? '';
    registry[id] = {
      segmentId: id,
      supportingPhrase: segText.slice(0, 80),  // first 80 chars — guaranteed substring
      evidenceType: 'claim',
      supports: '(tagger failed — manual review required)',
      relevanceScore: 0,
      confidence: 'low',
      roleEvidence: '(tagger failed; default classification applied)',
      whyThisSegmentFits: '(tagger failed; manual review required)',
      verificationStatus: 'unsupported',
    };
  }
  return registry;
}

// ---------------------------------------------------------------------------
// Step 4: Parser + quality gates (single-entity tagger)
// ---------------------------------------------------------------------------

export async function tagEntityEvidence(
  input: EvidenceTaggerInput,
  options: { timeoutMs?: number } = {},
): Promise<EvidenceTaggerResult> {
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;

  // Extract cited UUIDs from body
  const citedIds = Array.from(
    new Set(Array.from(input.body.matchAll(/\[([a-f0-9-]{36})\]/g)).map((m) => m[1]!)),
  );

  // If no citations in body, return empty registry immediately
  if (citedIds.length === 0) {
    return { registry: {} };
  }

  const prompt = buildEvidencePrompt(input);
  const raw = await runCodex(prompt, { timeoutMs, label: `evidence_tagger_${input.entityId}` });
  const json = extractJsonFromCodexOutput(raw);
  const parsedRaw = repairTruncatedJson(json);
  if (parsedRaw === null) {
    throw new Error(`[evidence_tagger_${input.entityId}] failed to parse + repair JSON output`);
  }
  const parsed = parsedRaw as { registry?: Record<string, Partial<EvidenceEntry>> };

  if (!parsed.registry || typeof parsed.registry !== 'object') {
    throw new Error(`[evidence_tagger_${input.entityId}] Codex returned no registry object`);
  }

  const registry: Record<string, EvidenceEntry> = {};

  for (const uuid of citedIds) {
    // Hard-fail if any cited UUID is missing from the registry
    if (!(uuid in parsed.registry)) {
      throw new Error(
        `[evidence_tagger_${input.entityId}] Missing registry entry for cited UUID: ${uuid}`,
      );
    }

    const raw_entry = parsed.registry[uuid]!;

    // Hard-fail if supportingPhrase not a substring of the segment text
    const segText = input.segmentTextById[uuid] ?? '';
    if (
      typeof raw_entry.supportingPhrase !== 'string' ||
      raw_entry.supportingPhrase.length === 0 ||
      !segText.includes(raw_entry.supportingPhrase)
    ) {
      throw new Error(
        `[evidence_tagger_${input.entityId}] supportingPhrase is not a substring of segment ${uuid}. ` +
        `Got: "${String(raw_entry.supportingPhrase).slice(0, 80)}"`,
      );
    }

    // Hard-fail if evidenceType not in canonical enum
    if (!EVIDENCE_TYPES.has(raw_entry.evidenceType as EvidenceType)) {
      throw new Error(
        `[evidence_tagger_${input.entityId}] Invalid evidenceType "${raw_entry.evidenceType}" for UUID ${uuid}`,
      );
    }

    // Hard-fail if relevanceScore out of range
    const score = Number(raw_entry.relevanceScore);
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      throw new Error(
        `[evidence_tagger_${input.entityId}] relevanceScore out of [0,100] for UUID ${uuid}: ${raw_entry.relevanceScore}`,
      );
    }

    const entry: EvidenceEntry = {
      segmentId: uuid,
      supportingPhrase: raw_entry.supportingPhrase,
      evidenceType: raw_entry.evidenceType as EvidenceType,
      supports: typeof raw_entry.supports === 'string' ? raw_entry.supports : '',
      relevanceScore: Math.round(score),
      confidence: (['high', 'medium', 'low'] as const).includes(
        raw_entry.confidence as 'high' | 'medium' | 'low',
      )
        ? (raw_entry.confidence as 'high' | 'medium' | 'low')
        : 'low',
      roleEvidence: typeof raw_entry.roleEvidence === 'string' ? raw_entry.roleEvidence : '',
      whyThisSegmentFits: typeof raw_entry.whyThisSegmentFits === 'string' ? raw_entry.whyThisSegmentFits : '',
      whyThisSegmentMayNotFit: typeof raw_entry.whyThisSegmentMayNotFit === 'string'
        ? raw_entry.whyThisSegmentMayNotFit
        : undefined,
      // Compute verificationStatus from our pure function (ignore any Codex-supplied value)
      verificationStatus: computeVerificationStatus(
        {
          segmentId: uuid,
          supportingPhrase: raw_entry.supportingPhrase,
          evidenceType: raw_entry.evidenceType as EvidenceType,
          supports: typeof raw_entry.supports === 'string' ? raw_entry.supports : '',
          relevanceScore: Math.round(score),
          confidence: (['high', 'medium', 'low'] as const).includes(
            raw_entry.confidence as 'high' | 'medium' | 'low',
          )
            ? (raw_entry.confidence as 'high' | 'medium' | 'low')
            : 'low',
          roleEvidence: typeof raw_entry.roleEvidence === 'string' ? raw_entry.roleEvidence : '',
          whyThisSegmentFits: typeof raw_entry.whyThisSegmentFits === 'string' ? raw_entry.whyThisSegmentFits : '',
          verificationStatus: 'needs_review', // placeholder — overwritten below
        },
        segText,
      ),
    };

    registry[uuid] = entry;
  }

  return { registry };
}

// ---------------------------------------------------------------------------
// Step 5: Parallel orchestrator with graceful-degraded fallback
// ---------------------------------------------------------------------------

export async function tagAllEntities(
  inputs: EvidenceTaggerInput[],
  options: {
    concurrency?: number;
    timeoutMs?: number;
    maxRetries?: number;
  } = {},
): Promise<Map<string, EvidenceTaggerResult>> {
  const concurrency = Math.max(1, options.concurrency ?? 3);
  const timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  const maxRetries = options.maxRetries ?? 2;

  const out = new Map<string, EvidenceTaggerResult>();
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
          const res = await tagEntityEvidence(input, { timeoutMs });
          const entryCount = Object.keys(res.registry).length;
          console.info(
            `[evidence] ${input.entityId}: ` +
            `${entryCount} entries · ${(Date.now() - start) / 1000 | 0}s` +
            (attempt > 1 ? ` · attempt ${attempt}` : ''),
          );
          out.set(input.entityId, res);
          break;
        } catch (err) {
          lastErr = err as Error;
          if (attempt <= maxRetries) {
            console.warn(
              `[evidence] ${input.entityId} attempt ${attempt} failed: ` +
              `${lastErr.message.slice(0, 200)} — retrying`,
            );
            await new Promise((r) => setTimeout(r, 5000 * attempt));
          }
        }
      }

      // Graceful degraded fallback: all attempts failed — do NOT leave the entity
      // without a registry. Build a minimal synthetic registry so downstream
      // "orphan citation" checks pass, and flag all entries as unsupported.
      if (!out.has(input.entityId) && lastErr) {
        console.warn(
          `[evidence] ${input.entityId} permanently failed after ${1 + maxRetries} attempts: ` +
          `${lastErr.message.slice(0, 200)} — using degraded registry`,
        );
        const degraded = buildDegradedRegistry(input.body, input.segmentTextById);
        out.set(input.entityId, { registry: degraded });
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
