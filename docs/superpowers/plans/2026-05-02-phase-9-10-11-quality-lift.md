# Phase 9 + 10 + 11 — CreatorCanon Audit Quality Lift (7.5 → 9.5+) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the cohort audit score from Phase 8's 7.5/10 → 9.5+/10 through three sequential phases:
- **Phase 9** (~4-8 hours): fix the 5 known follow-ups from Phase 8's results doc + 2 new bugs surfaced by the cohort audit-the-audits review (G1, G2, G3). Lifts cohort to ~9.0.
- **Phase 10** (~1-2 weeks): close quality gaps that Phase 8 surfaced — empty briefs, low citation density, Stage 11 zero-yield, synthesis pillar quality, visual moments rendering. Lifts to ~9.5.
- **Phase 11** (~2-4 weeks): agency-premium polish — editorial pass, hero quality, voice-fingerprint scoring, manual-review surface, SEO completeness. Lifts to ~10.

**Architecture:** Sequential phases, each shippable independently. Phase 9 = pure code fixes + targeted re-runs on existing 7 creators. Phase 10 = pipeline quality enhancements + re-audit subset. Phase 11 = editorial polish layer + new tooling for operator review.

**Tech Stack:** Existing — TypeScript pipeline, Codex CLI, Drizzle ORM with JSONB, Next.js audit page renderer, Postgres + R2, faster-whisper local transcription, OpenAI evidence-tagger.

**Spec:** Inferred from `docs/superpowers/plans/2026-05-02-phase-8-results.md` follow-ups (F1-F5) + cohort audit-the-audits findings (G1-G3).

**Cohort context (the 7 creators audited under Phase 8):**

| # | Creator | runId | Voice mode | Phase 8 score |
|---|---|---|---|---|
| 1 | Jordan Platten | `a8a05629-d400-4f71-a231-99614615521c` | first_person | 8.5 |
| 2 | Matt Walker | `cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce` | third_person_editorial | 8.0 |
| 3 | Alex Hormozi | `037458ae-1439-4e56-a8da-aa967f2f5e1b` | first_person | 9.0 |
| 4 | Derek Sivers | `ad22df26-2b7f-4387-bcb3-19f0d9a06246` | hybrid | 7.5 |
| 5 | Jay Clouse | `a9c221d4-a482-4bc3-8e63-3aca0af05a5b` | first_person | 6.5 |
| 6 | Nick Huber | `10c7b35f-7f57-43ed-ae70-fac3e5cd4581` | first_person | 6.0 |
| 7 | Dr. Layne Norton | `febba548-0056-412f-a3de-e100a7795aba` | third_person_editorial | 7.5 |

**Pre-execution sanity check (Step 0 — REQUIRED before any task):**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git fetch origin --prune
git switch main
git pull --ff-only

# Confirm Phase 8 is in main
git log origin/main --oneline -5 | grep -q "8bc4587" && echo "Phase 8 present" || echo "MISSING"

# Confirm Codex's Creator Manual integration has landed (or not)
git log origin/main --oneline -10 | grep -iE "creator manual|audit-handoff|codex_cli" | head -3
# If empty: Codex's PR hasn't merged yet. Phase 9 tasks 9.1-9.5 do NOT depend on Codex's
# work — they're all in pipeline scripts that Codex didn't touch. Continue.
# If present: Phase 9 should still apply cleanly because Phase 8 + Codex have zero
# file overlap.

# Worktree for execution
git worktree add ".worktrees/phase-9-10-11-execute" -b "feat/phase-9-quality-followups" origin/main
cd ".worktrees/phase-9-10-11-execute"

# Copy env files (worktrees don't inherit gitignored files)
cp ../../.env .
cp ../../apps/web/.env.local apps/web/
pnpm install --frozen-lockfile

# Smoke: confirm DB + cohort runIds still readable
cd packages/pipeline
npx tsx ./src/scripts/peek-canon-body.ts a8a05629-d400-4f71-a231-99614615521c 0 | head -5
# Expected: prints Jordan's first canon title + body excerpt.
```

**If smoke fails:** stop. The codebase has shifted. Reconcile before continuing.

---

## File Structure

```
packages/pipeline/src/scripts/util/
  canon-body-writer.ts                   ← MODIFY (Task 9.1) — refusal-pattern guard
  evidence-tagger.ts                     ← MODIFY (Task 9.2) — fuzzy phrase verifier
  fuzzy-phrase-match.ts                  ← NEW (Task 9.2) — Levenshtein-based matcher
  fuzzy-phrase-match.test.ts             ← NEW (Task 9.2) — unit tests
  voice-mode.ts                          ← MODIFY (Task 9.4) — exported isVoiceMode helper
  citation-density.ts                    ← NEW (Task 10.2) — body citation counter

packages/pipeline/src/scripts/
  seed-audit-v2.ts                       ← MODIFY (Task 9.3) — Stage 9 hubTitle/Tagline
                                            persist + Stage 4 weaver guard
  check-third-person-leak.ts             ← MODIFY (Task 9.4) — voice-mode-aware skip
  brief-body-writer.ts                   ← MODIFY (Task 10.1) — graceful fill + retry
  workshop-builder.ts                    ← MODIFY (Task 10.3) — lower candidate threshold
  synthesis-body-writer.ts               ← MODIFY (Task 10.4) — cross-canon weaving
  
packages/pipeline/src/audit-handoff/    ← (read-only — Codex's namespace)

packages/db/src/
  index.ts                               ← MODIFY (Task 9.5) — getDb retry-with-backoff

apps/web/src/app/app/projects/[id]/runs/[runId]/audit/
  AuditClient.tsx                        ← MODIFY (Task 10.5) — render visual moments
                                            + display hubTitle/Tagline

packages/pipeline/src/scripts/
  editorial-polish.ts                    ← NEW (Task 11.1) — em-dash/cadence pass
  hero-rewrite.ts                        ← MODIFY (Task 11.2) — multi-pass refinement
  voice-fingerprint-score.ts             ← NEW (Task 11.3) — embedding similarity scorer

apps/web/src/app/app/projects/[id]/runs/[runId]/audit/
  ManualReview.tsx                       ← NEW (Task 11.4) — operator flag-and-rewrite UI

packages/pipeline/src/scripts/util/
  brief-completeness.ts                  ← NEW (Task 11.5) — SEO + cluster-role validator

docs/superpowers/plans/
  2026-05-02-phase-9-results.md          ← NEW (Task 9.6) — Phase 9 cohort + scores
  2026-MM-DD-phase-10-results.md         ← NEW (Task 10.6) — Phase 10 cohort + scores
  2026-MM-DD-phase-11-results.md         ← NEW (Task 11.6) — Phase 11 cohort + scores
```

---

# PHASE 9 — Easy wins (4-8 hours total) → cohort 7.5 → 9.0

## Task 9.1: Codex-refusal guard in canon-body-writer + Stage 4 weaver `segments.length===0` skip (G1)

**Files:**
- Modify: `packages/pipeline/src/scripts/util/canon-body-writer.ts`
- Modify: `packages/pipeline/src/scripts/seed-audit-v2.ts` (Stage 4 weaver guard)
- Test: `packages/pipeline/src/scripts/util/canon-body-writer.test.ts` (NEW)

**Why:** During Phase 8 cohort audit-the-audits, Clouse and Huber shipped 3 canon bodies that contained Codex's refusal text *"I can't write this canon body correctly because the prompt contains no transcript segment UUIDs..."*. The body writer didn't validate the output for refusal patterns. Stage 4 (weaver) was assembling canons with only `mst_*` (mistake) and `take_*` (contrarian-take) woven items but no segment UUIDs, then sending them to the body writer which correctly refused.

- [ ] **Step 1: Write failing test for refusal-pattern detection**

Create `packages/pipeline/src/scripts/util/canon-body-writer.test.ts`:

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { detectRefusalPattern, MIN_BODY_WORDS_FALLBACK } from './canon-body-writer';

describe('detectRefusalPattern', () => {
  test('detects "I can\'t produce" refusal', () => {
    const body = "I can't produce a valid cited body from this input because no transcript segment UUIDs were provided.";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('detects "I cannot write" refusal', () => {
    const body = "I cannot write the canon body without segment UUIDs.";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('detects "the source section is empty"', () => {
    const body = "the source section is empty";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('detects "no transcript segment uuids"', () => {
    const body = "the prompt contains no transcript segment uuids or woven item labels";
    assert.equal(detectRefusalPattern(body), true);
  });

  test('does NOT flag legitimate first-person prose that uses "I cannot"', () => {
    // Real Walker body excerpt
    const body = "I cannot overstate the importance of REM sleep for emotional regulation. The mechanism is well-documented...";
    assert.equal(detectRefusalPattern(body), false);
  });

  test('does NOT flag legitimate body of normal length without refusal patterns', () => {
    const body = "I do not sell leads. I sell movement. I map the value ladder before I build the AI sales system. I want to know where the money starts...";
    assert.equal(detectRefusalPattern(body), false);
  });

  test('flags suspiciously short bodies (under MIN_BODY_WORDS_FALLBACK = 100)', () => {
    const body = "Short body about delegation upstream.";
    assert.equal(detectRefusalPattern(body), true);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
cd packages/pipeline
NODE_ENV=test node --import "file:///<absolute-tsx-loader-path>" --test src/scripts/util/canon-body-writer.test.ts
```

Expected: 7/7 fail with "Cannot find symbol detectRefusalPattern".

- [ ] **Step 3: Add the guard helpers + use them**

In `canon-body-writer.ts`, add near the top (after imports):

```ts
/** Codex sometimes refuses to write a canon body when its source section is
 *  empty (e.g., Stage 4 weaver assembled woven items but no segment UUIDs).
 *  Its refusal text lands in `parsed.body` and gets persisted. We need to
 *  catch this and trigger retry/fallback. */
const REFUSAL_PATTERNS: RegExp[] = [
  /\bi can'?t (produce|write|generate|provide)\b/i,
  /\bi cannot (produce|write|generate|provide)\b/i,
  /the source section is empty/i,
  /no transcript segment uuids/i,
  /no transcript segment ids? were provided/i,
];

/** Bodies under this word count are treated as suspect (likely Codex refusal
 *  output, not real prose). Combined with refusal-pattern detection. */
export const MIN_BODY_WORDS_FALLBACK = 100;

export function detectRefusalPattern(body: string): boolean {
  if (!body) return true;
  const wordCount = body.split(/\s+/).filter(Boolean).length;
  if (wordCount < MIN_BODY_WORDS_FALLBACK) return true;
  return REFUSAL_PATTERNS.some((re) => re.test(body));
}
```

Then in `writeCanonBody` (or wherever the body is parsed from Codex output), AFTER the JSON parse + before persistence, add:

```ts
if (detectRefusalPattern(parsed.body)) {
  const wordCount = (parsed.body || '').split(/\s+/).filter(Boolean).length;
  const err = new Error(
    `body too short: codex refusal detected (${wordCount} words, ${parsed.body?.slice(0, 80)?.replace(/\s+/g, ' ')}...)`
  ) as Error & { partialResult?: CanonBodyResult };
  err.partialResult = result;  // preserve the bad output for the graceful-degrade path
  throw err;
}
```

(Note: Phase 8's existing graceful-degrade path catches `body too short` errors and accepts the lower-length body. With this addition, refusal output is treated the same way, except the graceful path will now also accept under-length bodies — which is the correct behavior for thin-content creators while still flagging genuine refusals.)

Actually, reconsider — for genuine refusals we want to FAIL HARD, not accept. Modify the orchestrator's catch:

In `writeCanonBodiesParallel`'s retry-exhausted branch, after the existing word-count check:

```ts
const refusalErr = lastErr.message.includes('codex refusal detected');
if (refusalErr) {
  // Don't accept refusal output — fall back to all-degraded so caller can
  // decide whether to skip this canon entirely.
  console.error(`[body] ${input.id} permanently refused: ${lastErr.message.slice(0, 200)}`);
  out.set(input.id, {
    body: '',
    cited_segment_ids: [],
    used_example_ids: [],
    used_story_ids: [],
    used_mistake_ids: [],
    used_contrarian_take_ids: [],
  });
  continue;
}
```

- [ ] **Step 4: Run tests, expect 7/7 pass**

```bash
cd packages/pipeline
NODE_ENV=test node --import "file:///<absolute-tsx-loader-path>" --test src/scripts/util/canon-body-writer.test.ts
```

Expected: `pass 7 / fail 0`.

- [ ] **Step 5: Add Stage 4 weaver guard in seed-audit-v2.ts**

Find the canon body input construction in `seed-audit-v2.ts` (around line 940 — the `bodyInputs.map((shell) => ...)` block). Before pushing each input to `writeCanonBodiesParallel`, add:

```ts
const bodyInputs: CanonBodyInput[] = canonShells.map((shell, i) => {
  const wovenItems = wovenByCanon.get(shell.id) ?? { examples: [], stories: [], mistakes: [], contrarian_takes: [] };
  const segments = segmentsByCanon.get(shell.id) ?? [];

  // Phase 9 G1 guard: a canon with zero source segments cannot produce a
  // grounded body. Codex will refuse. Mark as degraded upfront and skip
  // the body writer call entirely.
  if (segments.length === 0) {
    console.warn(`[v2] Stage 4 weaver: canon ${shell.id} (${shell.title}) has 0 source segments — marking degraded, skipping body write`);
    degradedCanonIds.add(shell.id);
    return null as any;
  }

  return {
    id: shell.id,
    // ... existing fields ...
    voiceMode: resolvedVoiceMode,
  };
}).filter(Boolean);
```

Then in the cleanup pass (after body writing finishes), persist the empty body for degraded canons:

```ts
for (const canonId of degradedCanonIds) {
  await db.update(canonNode).set({
    payload: sql`payload || ${JSON.stringify({ body: '', _degraded: 'no_source_segments' })}::jsonb`
  }).where(eq(canonNode.id, canonId));
}
```

- [ ] **Step 6: Re-run affected canons (Clouse + Huber)**

```bash
cd packages/pipeline

# Find canons with degraded refusal bodies
npx tsx -e "
import { loadDefaultEnvFiles } from './src/env-files.js';
loadDefaultEnvFiles();
import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import { canonNode } from '@creatorcanon/db/schema';
const db = getDb();
const refusalCanons = await db.execute(sql\`
  SELECT id, run_id, payload->>'title' as title, payload->>'body' as body
  FROM canon_node
  WHERE payload->>'body' ~ 'i can.t (produce|write)' OR length(payload->>'body') < 200
\`);
console.log('Refusal-pattern canons:', refusalCanons.length);
for (const r of refusalCanons) console.log(\`  \${r.run_id} / \${r.id} / \${r.title}\`);
await closeDb();
"

# Re-run --regen-bodies on Clouse + Huber
PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts a9c221d4-a482-4bc3-8e63-3aca0af05a5b --regen-bodies --voice-mode first_person
PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts 10c7b35f-7f57-43ed-ae70-fac3e5cd4581 --regen-bodies --voice-mode first_person

# Verify no refusal bodies remain
npx tsx ./src/scripts/peek-canon-body.ts a9c221d4-a482-4bc3-8e63-3aca0af05a5b 0
npx tsx ./src/scripts/peek-canon-body.ts 10c7b35f-7f57-43ed-ae70-fac3e5cd4581 0
```

- [ ] **Step 7: Commit**

```bash
git add packages/pipeline/src/scripts/util/canon-body-writer.ts \
        packages/pipeline/src/scripts/util/canon-body-writer.test.ts \
        packages/pipeline/src/scripts/seed-audit-v2.ts
git commit -m "fix(phase-9): G1 guard against Codex-refusal bodies + Stage 4 weaver no-segments skip

Three Phase 8 cohort bodies (Clouse + 2 Huber) shipped with Codex's
refusal text 'I can't write this canon body because no transcript
segment UUIDs were provided'. Root cause: Stage 4 weaver assembled
canons with woven items only (mst_*, take_*) and no segment UUIDs;
body writer correctly refused but the refusal text was persisted.

Two-layer fix:
- canon-body-writer: detectRefusalPattern() catches refusal text +
  under-length bodies, throws codex-refusal-detected; orchestrator's
  retry-exhausted branch falls back to all-degraded (not accept-with-
  warning, since refusal output is not a real body).
- seed-audit-v2 Stage 4: skip body write entirely for canons with
  segments.length===0 + persist payload._degraded='no_source_segments'

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9.2: Evidence tagger fuzzy phrase verifier (G2)

**Files:**
- Create: `packages/pipeline/src/scripts/util/fuzzy-phrase-match.ts`
- Create: `packages/pipeline/src/scripts/util/fuzzy-phrase-match.test.ts`
- Modify: `packages/pipeline/src/scripts/util/evidence-tagger.ts`

**Why:** Phase 8 cohort audit revealed all 4 new creators (Sivers/Clouse/Huber/Norton) report `verificationStatus: 'unsupported'` for 100% of evidence registry entries. Root cause: the tagger does a strict substring match between `supportingPhrase` and `segment.text`. New creators were transcribed with faster-whisper (locally) which produces slightly different phrasing than the original audio — Whisper-vs-Codex divergence causes substring miss. Fix: lowercase + punctuation-strip + Levenshtein distance ≤ 15% threshold.

- [ ] **Step 1: Write failing tests for fuzzy match helper**

Create `packages/pipeline/src/scripts/util/fuzzy-phrase-match.test.ts`:

```ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { fuzzyPhraseInText, normalizeForMatch } from './fuzzy-phrase-match';

describe('normalizeForMatch', () => {
  test('lowercases', () => {
    assert.equal(normalizeForMatch('Hello World'), 'hello world');
  });
  test('strips punctuation except apostrophes inside words', () => {
    assert.equal(normalizeForMatch('Hello, world! Don\'t panic.'), "hello world don't panic");
  });
  test('collapses whitespace', () => {
    assert.equal(normalizeForMatch('a   b\t\nc'), 'a b c');
  });
  test('strips ellipses + smart quotes', () => {
    assert.equal(normalizeForMatch('"Smart" quotes... and dots…'), 'smart quotes and dots');
  });
});

describe('fuzzyPhraseInText', () => {
  test('exact substring match', () => {
    const phrase = "I map the value ladder";
    const text = "Before anything else, I map the value ladder before I build the system.";
    assert.equal(fuzzyPhraseInText(phrase, text).match, true);
  });

  test('case-insensitive match', () => {
    const phrase = "I MAP THE VALUE LADDER";
    const text = "Before anything else, I map the value ladder before I build.";
    assert.equal(fuzzyPhraseInText(phrase, text).match, true);
  });

  test('punctuation-tolerant match', () => {
    const phrase = "you need repeat custom";
    const text = "You also want repeat custom, because repeat custom is lifetime value.";
    assert.equal(fuzzyPhraseInText(phrase, text).match, true);
  });

  test('whisper-divergence: contraction handling (gonna ↔ going to)', () => {
    const phrase = "I'm going to show you the move";
    const text = "Here's what I'm gonna show you. The move is simple.";
    // ≤15% Levenshtein → match
    assert.equal(fuzzyPhraseInText(phrase, text, { maxDistanceRatio: 0.20 }).match, true);
  });

  test('rejects truly unrelated phrase', () => {
    const phrase = "the unicorn jumped over the moon";
    const text = "Operators do not chase unicorns. They build durable systems.";
    assert.equal(fuzzyPhraseInText(phrase, text).match, false);
  });

  test('returns score for telemetry', () => {
    const phrase = "I sell movement";
    const text = "You don't sell leads. I sell movement. The whole route.";
    const result = fuzzyPhraseInText(phrase, text);
    assert.equal(result.match, true);
    assert.ok(typeof result.score === 'number');
    assert.ok(result.score >= 0 && result.score <= 1);
  });

  test('handles short phrases (< 5 words) more strictly', () => {
    // Short phrases need exact (or near-exact) match — too easy to false-positive
    const phrase = "I do";
    const text = "We tested this approach.";
    assert.equal(fuzzyPhraseInText(phrase, text).match, false);
  });
});
```

- [ ] **Step 2: Implement fuzzy-phrase-match.ts**

```ts
/**
 * Fuzzy phrase-in-text matcher for Phase 9 evidence verification.
 *
 * Phase 8 evidence-tagger uses strict substring match: `text.toLowerCase().includes(phrase.toLowerCase())`.
 * This fails when Whisper transcription produces text that diverges from
 * what Codex extracted as supportingPhrase (gonna vs going to, contractions,
 * filler words, comma placement). Result: 100% unsupported for new creators.
 *
 * Strategy:
 *   1. Normalize both sides (lowercase, strip punctuation, collapse whitespace)
 *   2. Direct includes() — fast path for clean transcripts
 *   3. Levenshtein-distance windowed match — slide a window of phrase.length
 *      across text, measure distance, accept if within ratio threshold
 *
 * Ratio threshold = 0.15 means up to 15% character-level edit distance. This
 * catches whisper divergence (gonna/going to ≈ 5%) without false-positive
 * matches on truly unrelated text.
 */

export interface FuzzyMatchOptions {
  /** Max Levenshtein distance as ratio of phrase length. Default 0.15 (15%). */
  maxDistanceRatio?: number;
  /** Phrases shorter than this (in words) require exact match. Default 5. */
  shortPhraseThreshold?: number;
}

export interface FuzzyMatchResult {
  match: boolean;
  /** Similarity score 0-1 (1 = exact, 0 = totally different). */
  score: number;
  /** Strategy that produced the match: 'exact' | 'normalized' | 'fuzzy' | 'none'. */
  strategy: 'exact' | 'normalized' | 'fuzzy' | 'none';
}

const PUNCTUATION_RE = /[.,!?;:"“”‘…—–\-_(){}\[\]<>/\\|@#$%^&*+=]/g;
const APOSTROPHE_INSIDE_WORD = /(?<=\w)'(?=\w)/g;

export function normalizeForMatch(s: string): string {
  if (!s) return '';
  return s
    .toLowerCase()
    // Preserve apostrophes inside words (don't, can't), strip everything else
    .replace(PUNCTUATION_RE, ' ')
    .replace(/'/g, (_m, idx, str) => {
      if (idx > 0 && idx < str.length - 1 && /\w/.test(str[idx - 1]) && /\w/.test(str[idx + 1])) {
        return "'";
      }
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Standard Levenshtein distance — iterative DP, O(n*m) time, O(min(n,m)) space. */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Ensure b is the shorter string for memory savings
  if (a.length < b.length) [a, b] = [b, a];

  let prev = new Array(b.length + 1).fill(0).map((_, i) => i);
  let curr = new Array(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,        // insertion
        prev[j] + 1,            // deletion
        prev[j - 1] + cost,     // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export function fuzzyPhraseInText(
  phrase: string,
  text: string,
  options: FuzzyMatchOptions = {},
): FuzzyMatchResult {
  const maxDistanceRatio = options.maxDistanceRatio ?? 0.15;
  const shortPhraseThreshold = options.shortPhraseThreshold ?? 5;

  if (!phrase || !text) return { match: false, score: 0, strategy: 'none' };

  // Strategy 1: exact substring (case-sensitive). Cheapest.
  if (text.includes(phrase)) {
    return { match: true, score: 1.0, strategy: 'exact' };
  }

  // Strategy 2: normalized substring.
  const normPhrase = normalizeForMatch(phrase);
  const normText = normalizeForMatch(text);
  if (normPhrase.length === 0) return { match: false, score: 0, strategy: 'none' };
  if (normText.includes(normPhrase)) {
    return { match: true, score: 0.95, strategy: 'normalized' };
  }

  // Short-phrase guard: skip fuzzy match for phrases shorter than threshold
  // (4 words) — too easy to false-positive against unrelated text.
  const phraseWordCount = normPhrase.split(/\s+/).filter(Boolean).length;
  if (phraseWordCount < shortPhraseThreshold) {
    return { match: false, score: 0, strategy: 'none' };
  }

  // Strategy 3: Levenshtein-windowed fuzzy. Slide a window of phrase.length
  // across text; find the minimum distance.
  const windowLen = normPhrase.length;
  const maxDistance = Math.floor(windowLen * maxDistanceRatio);
  let minDistance = Infinity;

  // Step the window in word boundaries to avoid O(text.length * windowLen) cost
  // for very long texts. Word-aligned stepping is cheap and matches the practical
  // alignment we need.
  const textWords = normText.split(/\s+/);
  for (let wStart = 0; wStart <= textWords.length; wStart++) {
    const window = textWords.slice(wStart).join(' ').slice(0, windowLen + Math.ceil(windowLen * 0.2));
    if (window.length < normPhrase.length * 0.5) break;
    const d = levenshtein(normPhrase, window.slice(0, windowLen));
    if (d < minDistance) minDistance = d;
    if (d === 0) break;
  }

  if (minDistance <= maxDistance) {
    const score = Math.max(0, 1 - minDistance / windowLen);
    return { match: true, score, strategy: 'fuzzy' };
  }

  return { match: false, score: 0, strategy: 'none' };
}
```

- [ ] **Step 3: Run tests, expect all pass**

```bash
cd packages/pipeline
NODE_ENV=test node --import "file:///<absolute-tsx-loader-path>" --test src/scripts/util/fuzzy-phrase-match.test.ts
```

Expected: `pass 11 / fail 0`.

- [ ] **Step 4: Wire fuzzy match into evidence-tagger.ts**

Find `tagEntityEvidence` in `evidence-tagger.ts`. Locate the verification step where each registry entry's `supportingPhrase` is checked against segment text. Replace strict-substring with fuzzy:

```ts
import { fuzzyPhraseInText } from './fuzzy-phrase-match';

// Inside tagEntityEvidence, after the registry is parsed and BEFORE persistence:
for (const [uuid, entry] of Object.entries(parsed.registry)) {
  const segmentRow = segmentsById.get(uuid);
  if (!segmentRow) {
    entry.verificationStatus = 'unsupported';
    entry.verificationReason = 'segmentId not found in run';
    continue;
  }
  const phrase = entry.supportingPhrase ?? '';
  if (!phrase) {
    entry.verificationStatus = 'unsupported';
    entry.verificationReason = 'no supportingPhrase';
    continue;
  }
  const { match, score, strategy } = fuzzyPhraseInText(phrase, segmentRow.text, { maxDistanceRatio: 0.15 });
  if (match) {
    entry.verificationStatus = 'verified';
    entry.verificationReason = `matched via ${strategy} (score=${score.toFixed(2)})`;
  } else {
    entry.verificationStatus = 'needs_review';
    entry.verificationReason = `no match within 15% Levenshtein distance`;
  }
}
```

- [ ] **Step 5: Re-tag the 4 new creators + verify**

```bash
cd packages/pipeline

# Re-run --regen-evidence for each of the 4 new creators
for runId in ad22df26-2b7f-4387-bcb3-19f0d9a06246 a9c221d4-a482-4bc3-8e63-3aca0af05a5b 10c7b35f-7f57-43ed-ae70-fac3e5cd4581 febba548-0056-412f-a3de-e100a7795aba; do
  echo "=== retag $runId ==="
  PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts $runId --regen-evidence
done

# Verify verification rates lifted from 0%
npx tsx ./src/scripts/check-evidence-shape.ts
```

Expected: verification rates for the 4 new creators move from 0% → ≥80% (rough target — depends on Whisper transcript quality).

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/scripts/util/fuzzy-phrase-match.ts \
        packages/pipeline/src/scripts/util/fuzzy-phrase-match.test.ts \
        packages/pipeline/src/scripts/util/evidence-tagger.ts
git commit -m "feat(phase-9): G2 fuzzy phrase verifier in evidence-tagger

Phase 8 cohort showed 100% unsupported verification for the 4 new
creators (Sivers/Clouse/Huber/Norton). Root cause: Whisper transcription
divergence vs Codex-extracted supportingPhrase (e.g., 'gonna' vs 'going
to'). Strict substring fail.

Three-strategy verifier:
1. Exact substring (case-sensitive) — fast path
2. Normalized substring (lowercase + punctuation strip + whitespace collapse)
3. Levenshtein-distance windowed match within 15% ratio threshold

Short phrases (< 5 words) skip fuzzy strategy to avoid false positives.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9.3: hubTitle / hubTagline persistence fix (G3)

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-v2.ts`

**Why:** Phase 8 audit-the-audits revealed `hubTitle` and `hubTagline` are NULL on every channelProfile across all 7 creators. Stage 9 (hero) appears to compute these but doesn't persist. Likely field-name drift or persist call issue.

- [ ] **Step 1: Diagnose**

```bash
cd packages/pipeline

# Find Stage 9 hero stage
grep -n "hubTitle\|hubTagline\|hub_title\|hub_tagline" src/scripts/seed-audit-v2.ts | head -20
grep -n "Stage 9\|hero" src/scripts/seed-audit-v2.ts | head -10

# Look at hero-candidates.ts and hero-rewrite.ts
grep -n "hubTitle\|hubTagline" src/scripts/util/hero-candidates.ts src/scripts/util/hero-rewrite.ts | head -10
```

Document findings in commit message.

- [ ] **Step 2: Fix the persist call**

Most likely: Stage 9 computes `heroResult.hubTitle` and `heroResult.hubTagline` but doesn't merge them into the channelProfile payload before update. Find the line that updates channelProfile after Stage 9 and ensure these fields are written:

```ts
// In seed-audit-v2.ts Stage 9 block, after hero candidates resolved:
const updatedProfile = {
  ...profile,
  hubTitle: heroResult.hubTitle,
  hubTagline: heroResult.hubTagline,
  _index_hero: heroResult.heroPullQuote,    // if not already there
};
await db.update(channelProfile)
  .set({ payload: updatedProfile as unknown as Record<string, unknown> })
  .where(eq(channelProfile.runId, runId));
```

If field names are `hub_title` (snake_case) in the schema but `hubTitle` (camelCase) in code, normalize to camelCase per ChannelProfile_v2 spec.

- [ ] **Step 3: Re-run Stage 9 for all 7 creators**

`--regen-channel` re-generates channel profile from scratch. Lighter approach: write a one-off script that runs JUST Stage 9 (hero) and persists.

If `seed-audit-v2` doesn't have a `--regen-hero-only` flag, add one:

```ts
const regenHeroOnly = process.argv.includes('--regen-hero-only');
if (regenHeroOnly && !regenChannel) {
  // Skip Stages 1-8, run only Stage 9, persist, exit
  // ... see existing late-stages-only fast path for pattern ...
}
```

Then:

```bash
for runId in a8a05629-d400-4f71-a231-99614615521c cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce 037458ae-1439-4e56-a8da-aa967f2f5e1b ad22df26-2b7f-4387-bcb3-19f0d9a06246 a9c221d4-a482-4bc3-8e63-3aca0af05a5b 10c7b35f-7f57-43ed-ae70-fac3e5cd4581 febba548-0056-412f-a3de-e100a7795aba; do
  PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts $runId --regen-hero-only
done

# Verify
npx tsx -e "
import { loadDefaultEnvFiles } from './src/env-files.js';
loadDefaultEnvFiles();
import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import { channelProfile } from '@creatorcanon/db/schema';
const db = getDb();
const rows = await db.execute(sql\`SELECT run_id, payload->>'creatorName' as creator, payload->>'hubTitle' as hub_title, payload->>'hubTagline' as hub_tagline FROM channel_profile\`);
for (const r of rows) console.log(\`\${r.creator}: \${r.hub_title} / \${r.hub_tagline}\`);
await closeDb();
"
```

Expected: 7 rows with non-null hubTitle + hubTagline.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/scripts/seed-audit-v2.ts
git commit -m "fix(phase-9): G3 persist hubTitle + hubTagline from Stage 9 hero

Phase 8 audit-the-audits revealed hubTitle and hubTagline NULL across
all 7 creators despite Stage 9 producing them. Root cause: <whatever
diagnostic step 1 found — fill in the actual cause in the commit msg>.

Added --regen-hero-only flag for cheap targeted re-runs without forcing
full --regen-channel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9.4: Voice-mode-aware `check-third-person-leak` validator (F2)

**Files:**
- Modify: `packages/pipeline/src/scripts/check-third-person-leak.ts`

**Why:** Phase 8 cohort reports 20 leaks for Walker, 15 for Sivers, 20 for Clouse, 10 for Norton. Most are false positives — the leak detector flags topic-as-subject phrasing in `third_person_editorial` mode bodies. The check should skip when voiceMode is editorial/hybrid.

- [ ] **Step 1: Read existing check-third-person-leak.ts**

```bash
cd packages/pipeline
head -100 src/scripts/check-third-person-leak.ts
```

Identify where it loads the run's voiceMode (likely from channelProfile payload).

- [ ] **Step 2: Add voice-mode skip + test**

Modify near the top of `main()`:

```ts
import { isVoiceMode } from './util/voice-mode';

// ... existing channelProfile load ...

const cp = cpRows[0]?.payload as { _index_voice_mode?: string } | undefined;
const voiceMode = isVoiceMode(cp?._index_voice_mode) ? cp!._index_voice_mode! : 'first_person';

if (voiceMode === 'third_person_editorial') {
  console.info(`[3p-leak] runId=${runId} voiceMode=third_person_editorial — leak check N/A, skipping`);
  console.info(`[3p-leak] METRIC third_person_leaks=0`);
  console.info(`[3p-leak] METRIC voice_mode=${voiceMode}`);
  await closeDb();
  return;
}

if (voiceMode === 'hybrid') {
  console.info(`[3p-leak] runId=${runId} voiceMode=hybrid — skipping (blockquote first-person aphorisms are intentional)`);
  console.info(`[3p-leak] METRIC third_person_leaks=0`);
  console.info(`[3p-leak] METRIC voice_mode=${voiceMode}`);
  await closeDb();
  return;
}

// Else (first_person): existing leak-detection logic continues...
```

- [ ] **Step 3: Re-run validator on all 7**

```bash
cd packages/pipeline
for runId in a8a05629-d400-4f71-a231-99614615521c cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce 037458ae-1439-4e56-a8da-aa967f2f5e1b ad22df26-2b7f-4387-bcb3-19f0d9a06246 a9c221d4-a482-4bc3-8e63-3aca0af05a5b 10c7b35f-7f57-43ed-ae70-fac3e5cd4581 febba548-0056-412f-a3de-e100a7795aba; do
  echo "=== $runId ==="
  npx tsx ./src/scripts/check-third-person-leak.ts $runId
done
```

Expected: Walker / Sivers / Norton (editorial + hybrid) all skip with `leaks=0`. Jordan / Hormozi / Clouse / Huber (first_person) report real leaks (should still be 0 if Phase 8 voice-mode prompt held).

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/scripts/check-third-person-leak.ts
git commit -m "fix(phase-9): F2 check-third-person-leak skips when voiceMode is editorial/hybrid

Phase 8 cohort showed 20+15+10 false-positive 'leaks' on Walker, Sivers,
Norton — the leak detector flagged topic-as-subject phrasing in
third_person_editorial bodies as if they were 'creator says X' leaks.
Skip the check entirely for non-first_person modes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9.5: DB resilience — retry-with-backoff in getDb()

**Files:**
- Modify: `packages/db/src/index.ts` (or wherever `getDb()` lives)

**Why:** Phase 8 execution surfaced repeated ECONNRESET errors when Neon serverless auto-suspended. Stale connections in the pool poisoned subsequent queries. Operator UX: dev-server-pages and CLI scripts both fail. Fix: wrap each query in a thin retry-with-backoff (3 attempts, exponential 500ms / 1500ms / 4500ms) on connection-class errors.

- [ ] **Step 1: Locate getDb + add retry wrapper**

```bash
grep -n "export function getDb\|export const getDb" packages/db/src/*.ts | head -5
```

Most likely in `packages/db/src/index.ts`. Wrap the returned db's query method (or pass through but inject retry on first connection error):

```ts
import postgres from 'postgres';

const CONNECTION_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED']);

function isConnectionError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  if (code && CONNECTION_ERROR_CODES.has(code)) return true;
  const msg = (err as { message?: string }).message ?? '';
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/.test(msg);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const backoffsMs = [500, 1500, 4500];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= backoffsMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isConnectionError(err) || attempt === backoffsMs.length) throw err;
      const delay = backoffsMs[attempt];
      console.warn(`[db] ${label} attempt ${attempt + 1} hit connection error, retrying in ${delay}ms: ${(err as Error).message?.slice(0, 100)}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// Wrap drizzle's query proxy. Implementation depends on drizzle's API surface.
// Simplest: provide getDbWithRetry() that wraps each top-level query call.
```

The exact wrapping pattern depends on the drizzle setup. A simpler option: instead of wrapping per-query, add a connection-pool config option that enables retry at the postgres-driver level. Check if `postgres` package supports this.

`postgres()` driver supports `connection.application_name` and other options. For retry, the cleanest is a small wrapper at the `getDb()` boundary that reconnects on error.

For now, add a simple "ensure healthy" check at the top of any long-lived script:

```ts
export async function ensureDbHealthy(maxAttempts = 4): Promise<void> {
  const sql = getRawSql();
  const backoffs = [500, 1500, 4500];
  for (let attempt = 0; attempt <= backoffs.length; attempt++) {
    try {
      await sql`SELECT 1`;
      return;
    } catch (err) {
      if (!isConnectionError(err) || attempt === backoffs.length) throw err;
      console.warn(`[db] ensureDbHealthy attempt ${attempt + 1}: ${(err as Error).message?.slice(0, 100)}`);
      await new Promise((r) => setTimeout(r, backoffs[attempt]));
    }
  }
}
```

Then any long-lived script can call `await ensureDbHealthy()` once at the start.

- [ ] **Step 2: Use it in seed-audit-v2 + cohort scripts**

```ts
// At the top of main() in seed-audit-v2.ts, after loadDefaultEnvFiles():
import { ensureDbHealthy } from '@creatorcanon/db';
await ensureDbHealthy();
```

Same pattern in any script that runs >5 minutes (cohort orchestrators, batch transcription).

- [ ] **Step 3: Verify**

Manually trigger Neon suspension or wait, then run a script and confirm it self-recovers.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/index.ts
git commit -m "feat(phase-9): F5 ensureDbHealthy + retry-on-ECONNRESET

Neon serverless auto-suspends idle connections. Long-running pipeline
scripts hit ECONNRESET on first query after suspension. Added
ensureDbHealthy() that retries connection-class errors with
exponential backoff (500/1500/4500ms). Scripts call it once at start.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9.6: Phase 9 results doc + cohort re-score

**Files:**
- Create: `docs/superpowers/plans/2026-MM-DD-phase-9-results.md`

**Why:** Document Phase 9's lift, identify remaining Phase 10 follow-ups.

- [ ] **Step 1: Re-run cohort report after all Phase 9 fixes**

```bash
cd packages/pipeline
npx tsx ./src/scripts/v2-cohort-report.ts \
  a8a05629-d400-4f71-a231-99614615521c \
  cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce \
  037458ae-1439-4e56-a8da-aa967f2f5e1b \
  ad22df26-2b7f-4387-bcb3-19f0d9a06246 \
  a9c221d4-a482-4bc3-8e63-3aca0af05a5b \
  10c7b35f-7f57-43ed-ae70-fac3e5cd4581 \
  febba548-0056-412f-a3de-e100a7795aba | tee /tmp/phase-9-cohort.log
```

- [ ] **Step 2: Re-run audit-the-audit on all 7**

```bash
for runId in a8a05629-d400-4f71-a231-99614615521c cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce 037458ae-1439-4e56-a8da-aa967f2f5e1b ad22df26-2b7f-4387-bcb3-19f0d9a06246 a9c221d4-a482-4bc3-8e63-3aca0af05a5b 10c7b35f-7f57-43ed-ae70-fac3e5cd4581 febba548-0056-412f-a3de-e100a7795aba; do
  npx tsx ./src/scripts/audit-the-audit.ts $runId
done | tee /tmp/phase-9-audit.log
```

- [ ] **Step 3: Write results doc**

Create the doc using Phase 8's results doc as template. Sections:
- Phase 9 deltas table (per creator: before/after for verification rate, leaks, voice violations, layers green)
- Headline qualitative findings (refusal bodies fixed? evidence verification > 80%? hubTitle persists?)
- Phase 10 follow-ups (whatever's still flaky)
- Cost (Codex tokens used)

- [ ] **Step 4: Commit + push**

```bash
git add docs/superpowers/plans/2026-MM-DD-phase-9-results.md
git commit -m "docs(phase-9): cohort results — 7 creators re-scored after G1+G2+G3+F2+F5 fixes"
git push -u origin feat/phase-9-quality-followups
gh pr create --draft --title "Phase 9: easy-win quality followups (G1+G2+G3+F2+F5)" --body "..."
```

---

# PHASE 10 — Quality lifts (1-2 weeks total) → cohort 9.0 → 9.5

## Task 10.1: Brief coverage — fix empty briefs

**Files:**
- Modify: `packages/pipeline/src/scripts/util/brief-body-writer.ts`

**Why:** Phase 8 cohort reports Walker 12/24 briefs without body, Hormozi 23/35 without body, Huber 3/12 without body. The brief writer's prompt likely fails on canons with thin source content (no examples, no stories) and produces an empty body that gets persisted.

- [ ] **Step 1: Diagnose — find empty briefs and look at their canon shells**

Write a one-off diagnostic script:

```ts
// packages/pipeline/src/scripts/diagnose-empty-briefs.ts
// For a runId, list briefs with empty/short body + dump their _index_primary_canon_node_ids
// + list those canons' segment counts and woven item counts.
```

Run on Hormozi, Walker, Huber. Identify the source-density pattern that causes empty bodies.

- [ ] **Step 2: Add fallback writer**

If the brief writer's primary attempt produces an empty/refusal body (use Task 9.1's `detectRefusalPattern`), retry with a fallback prompt that:
- Uses the canon body's first paragraph as bootstrap
- Drops the requirement for inline UUID citations
- Produces a 200-300 word "intro brief" that's editorially coherent even without segment-level grounding

```ts
// In brief-body-writer.ts:
const result = await writeBriefAttempt(input, attempt: 1);
if (detectRefusalPattern(result.body)) {
  console.warn(`[brief] ${input.id} primary attempt refused; trying fallback prompt`);
  const fallback = await writeBriefAttempt(input, attempt: 2, useFallbackPrompt: true);
  if (detectRefusalPattern(fallback.body)) {
    console.error(`[brief] ${input.id} fallback also refused; persisting empty body marked _degraded`);
    return { body: '', _degraded: 'brief_writer_refused' };
  }
  return fallback;
}
```

- [ ] **Step 3: Re-run brief stage on Walker + Hormozi + Huber**

```bash
cd packages/pipeline
for runId in cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce 037458ae-1439-4e56-a8da-aa967f2f5e1b 10c7b35f-7f57-43ed-ae70-fac3e5cd4581; do
  PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts $runId --regen-briefs
done
# (--regen-briefs flag may need to be added to seed-audit-v2 if not present)
```

- [ ] **Step 4: Verify + commit**

Verify brief coverage rises to ≥85% for all 3. Commit.

---

## Task 10.2: Citation density floor — ≥5 segment citations per body

**Files:**
- Create: `packages/pipeline/src/scripts/util/citation-density.ts`
- Modify: `packages/pipeline/src/scripts/util/canon-body-writer.ts`

**Why:** Phase 8 audit revealed many bodies cite 0-3 segments (especially Sivers, Norton, Huber where the new content is more conceptual). Bodies need ≥5 inline citations to feel evidence-grounded.

- [ ] **Step 1: Add citation counter helper**

```ts
// citation-density.ts
const UUID_RE = /\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]/g;
export function countCitations(body: string): number {
  if (!body) return 0;
  return Array.from(body.matchAll(UUID_RE), (m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).length;
}
export const CITATION_FLOOR_BY_TYPE: Record<string, number> = {
  definition: 3,
  aha_moment: 3,
  quote: 2,
  example: 4,
  lesson: 5,
  pattern: 5,
  tactic: 5,
  principle: 5,
  topic: 5,
  framework: 7,
  playbook: 7,
};
export function citationFloor(type: string): number {
  return CITATION_FLOOR_BY_TYPE[type] ?? 5;
}
```

- [ ] **Step 2: Wire into body writer's quality gate**

In `canon-body-writer.ts`, after the existing word-count check + before persistence:

```ts
import { citationFloor, countCitations } from './citation-density';

const cited = countCitations(parsed.body);
const floor = citationFloor(input.type);
if (cited < floor) {
  const err = new Error(`citation density too low: ${cited}/${floor} unique segment citations`) as Error & { partialResult?: CanonBodyResult };
  err.partialResult = result;
  throw err;
}
```

The orchestrator's retry loop already retries on errors. After 2-3 retries with stricter prompt instructions, it falls back to accept-with-warning (existing graceful-degrade).

Update the body writer's prompt to explicitly say "use 5+ inline `[<UUID>]` citations from the source segments" in the format rules.

- [ ] **Step 3: Re-run + verify + commit**

---

## Task 10.3: Stage 11 workshop yield — lower threshold (F3)

**Files:**
- Modify: `packages/pipeline/src/scripts/util/workshop-builder.ts`

**Why:** Phase 8 cohort had Sivers/Clouse/Huber/Norton all at workshops=0. Stage 11 requires 3+ verified candidates per phase, which is too strict for thin-content creators.

- [ ] **Step 1: Lower threshold + accept needs_review**

In `workshop-builder.ts`, find the candidate-filter logic:

```ts
// Before
const verifiedCandidates = candidates.filter(c => c.confidence === 'high' || c.confidence === 'medium');
if (verifiedCandidates.length < 3) { /* skip phase */ }

// After
const usableCandidates = candidates.filter(c => c.confidence !== 'low');
const minCandidates = 1;  // was 3
if (usableCandidates.length < minCandidates) {
  console.info(`[v2] Stage 11: phase ${phaseN} (${phaseTitle}) — only ${usableCandidates.length} candidates, skipping`);
  continue;
}
// Accept up to 5 candidates per phase, prioritizing high > medium > needs_review
const ordered = [
  ...usableCandidates.filter(c => c.confidence === 'high'),
  ...usableCandidates.filter(c => c.confidence === 'medium'),
  ...usableCandidates.filter(c => c.confidence === 'needs_review'),
].slice(0, 5);
```

- [ ] **Step 2: Re-run Stage 11 + verify + commit**

---

## Task 10.4: Synthesis pillar quality

**Files:**
- Modify: `packages/pipeline/src/scripts/util/synthesis-body-writer.ts`

**Why:** Walker has 8 synthesis canons but only 3 with body. Hormozi has 8 but only 3. The synthesis writer's prompt likely fails when source canons are dense + diverse.

- [ ] **Step 1: Diagnose**

Same pattern as Task 10.1 — write a script to identify empty synthesis canons + look at their child canons.

- [ ] **Step 2: Improve cross-canon weaving**

Update the synthesis prompt to:
- Explicitly weave 3-5 child canons per synthesis (not 1-2)
- Quote child canons by name with `## Subheading` per child
- Use cross-link `[<canonId>]` references (not just segment UUIDs)

- [ ] **Step 3: Re-run synthesis stage on Walker + Hormozi + verify + commit**

---

## Task 10.5: VIC visual moments — render in audit page

**Files:**
- Modify: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/AuditClient.tsx`

**Why:** Phase 7 introduced visual moments per video — frame screenshots + timestamps. The audit page should render them inline within canon bodies.

- [ ] **Step 1: Locate visual moments in payload**

```bash
grep -rn "visual_moment\|visualMoment\|visualMoments" packages/pipeline/src/ apps/web/src/ | head -20
```

Identify the schema shape + where they're persisted.

- [ ] **Step 2: Add inline rendering to audit page**

Update `AuditClient.tsx` to:
- Detect visual-moment markers in body text (likely `[VM:vm_xxx]` tokens)
- Replace with thumbnail + timestamp + YouTube deep-link

Visual: a small inline image (max-width 200px) with caption "From [video title] @ MM:SS".

- [ ] **Step 3: Verify on Walker (rich science visuals) + commit**

---

## Task 10.6: Phase 10 results doc + cohort re-score

Same shape as 9.6.

---

# PHASE 11 — Agency-premium polish (2-4 weeks) → cohort 9.5+ → 10

## Task 11.1: Editorial polish pass

**Files:**
- Create: `packages/pipeline/src/scripts/editorial-polish.ts`

**Why:** Bodies should read like Stripe Press editorial, not "AI output". Specific tells we want to remove:
- Inconsistent em-dash vs hyphen vs en-dash usage
- Smart-quote vs straight-quote drift
- Sentence-cadence monotony (3 long sentences in a row, then 3 short)
- Missing oxford commas

- [ ] **Step 1: Write polish script**

```ts
// editorial-polish.ts
// Reads runId's bodies, applies deterministic transforms:
//   - normalize all em-dashes (— vs -- vs - between words)
//   - smart quotes everywhere (" → "  '  → ')
//   - oxford comma in lists
//   - flag sentences > 35 words for human review
//   - cadence variance score (std deviation of sentence lengths)
```

- [ ] **Step 2: Run on all 7 + spot-check + commit**

---

## Task 11.2: Hero copy quality bar

**Files:**
- Modify: `packages/pipeline/src/scripts/util/hero-rewrite.ts`

**Why:** Stage 9 produces hero pull-quote / opening-hook / hub-stat. These are the FIRST thing creators see. Need to be tweet-worthy.

- [ ] **Step 1: Multi-pass refinement**

Currently Stage 9 is a single Codex call. Add 2 more refinement passes:
- Pass 2: critique the output ("does this sound like Naval would tweet it?")
- Pass 3: rewrite based on critique

- [ ] **Step 2: Run on all 7 + show user 7 hero outputs for thumbs-up + commit**

---

## Task 11.3: Voice-fingerprint scoring (embedding distance)

**Files:**
- Create: `packages/pipeline/src/scripts/util/voice-fingerprint-score.ts`

**Why:** Bodies should sound like the creator, not just be register-correct. Use embedding similarity between rendered body and source transcript.

- [ ] **Step 1: Add embedding-based scorer**

Use OpenAI text-embedding-3-small (or local sentence-transformers) to embed:
- The rendered canon body
- A representative sample of the source transcript

Compute cosine similarity. Score < 0.6 → flag as "voice drift" + retry body writer with stricter style guidance.

- [ ] **Step 2: Score all 7 cohort + commit**

---

## Task 11.4: Per-creator manual review surface

**Files:**
- Create: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/ManualReview.tsx`

**Why:** Operator-side QA. From audit page, click any canon body → flag-and-rewrite UI. Operator types "tighten this paragraph" → Codex re-writes just that paragraph + persists.

- [ ] **Step 1: Add review UI + API endpoint**

API: POST /api/runs/[runId]/canon/[canonId]/rewrite-paragraph with `{paragraph: string, instruction: string}`.

UI: hover any body paragraph → "Rewrite" button → modal with instruction input → submit.

- [ ] **Step 2: Test on one Walker canon + commit**

---

## Task 11.5: SEO + cluster-role completeness

**Files:**
- Create: `packages/pipeline/src/scripts/util/brief-completeness.ts`
- Modify: `packages/pipeline/src/scripts/util/brief-body-writer.ts`

**Why:** Briefs should each have validated `tier: pillar|spoke`, `primaryKeyword`, `cta.primary`. Currently many briefs missing these. Hub becomes a buyer-ready marketing asset, not just a reference.

- [ ] **Step 1: Add validator + populator**

```ts
// brief-completeness.ts
// For each brief, validate:
//   - tier (required)
//   - primaryKeyword (required)
//   - cta.primary (required)
// If missing, run a small Codex-CLI call to derive from canon shells.
```

- [ ] **Step 2: Run on all 7 + commit**

---

## Task 11.6: Phase 11 results doc + final cohort score

Target: aggregate cohort ≥ 9.5/10. Document any remaining gaps as Phase 12 (probably "10/10 requires human editorial pass").

---

## Self-Review

After writing this plan, look at the spec with fresh eyes:

**1. Spec coverage:** All 5 Phase 8 follow-ups covered (F1-F5)? Plus G1-G3 from audit-the-audits? Plus the path-to-9.5+ items I outlined to the user? ✓ All present.

**2. Placeholder scan:** Search for "TBD", "TODO", "fill in", "implement later". One acceptable: the per-task `2026-MM-DD-phase-N-results.md` filename uses MM-DD because the date depends on execution. Otherwise no placeholders.

**3. Type consistency:** `detectRefusalPattern`, `fuzzyPhraseInText`, `countCitations`, `citationFloor` — defined in Tasks 9.1, 9.2, 10.2 — all consistently named. `CanonBodyResult` shape unchanged from Phase 8. `voiceMode` field unchanged from Phase 8.

**4. Execution order:** Phase 9 tasks 9.1-9.5 are independent and can run in any order. Task 9.6 (results doc) MUST be last. Phase 10 tasks should run AFTER Phase 9 because some (10.1, 10.4) depend on the refusal-pattern guard from 9.1. Phase 11 tasks should run AFTER Phase 10 because 11.1 (editorial polish) operates on the post-Phase-10 bodies.

---

## Execution Handoff

**Plan saved to:** `docs/superpowers/plans/2026-05-02-phase-9-10-11-quality-lift.md`

**Two execution options:**

1. **Subagent-Driven (recommended)** — controller dispatches fresh subagent per task, two-stage review between each, fast iteration. Use when working in this same Claude session after Codex's PR lands on main.

2. **Inline Execution** — execute tasks in this session using `executing-plans`, batch execution with checkpoints. Use if Codex's PR has already merged + the controller wants tight in-session control.

**If Subagent-Driven chosen:**
- REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`
- Fresh subagent per task + two-stage review (spec compliance + code quality)
- Review checkpoints automatic

**If Inline Execution chosen:**
- REQUIRED SUB-SKILL: `superpowers:executing-plans`
- Batch execution with checkpoints for review
