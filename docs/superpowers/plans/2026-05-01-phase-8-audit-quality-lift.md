# Phase 8 — Audit Quality Lift (7.2 → 9+) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the v2 audit pipeline from agency-MVP (7.2/10) to agency-premium (9+/10) by adding voice-mode flexibility, raising body length floors, fixing Codex truncation, and validating against 7 creators × 4 archetypes.

**Architecture:** Three pure-code workstreams (json-repair / voiceMode / body length floors) land first as orthogonal modules with unit tests. Then the 4 body writers + evidence tagger get extended to consume them. Then 4 new creators get ingested + audited. Final cohort report aggregates across 7 creators.

**Tech Stack:** Existing — TypeScript pipeline, Codex CLI, Drizzle ORM with JSONB, Next.js audit page renderer, Postgres + R2.

**Spec:** [`docs/superpowers/specs/2026-05-01-phase-8-audit-quality-lift-design.md`](../specs/2026-05-01-phase-8-audit-quality-lift-design.md)

**Where we're starting:**
- Phase 5 + 7 shipped to main as commit `4ae47bf`
- 3 creators (Jordan / Walker / Hormozi) audited at 7.2/10 quality
- Bar 5 verification rate at 84-90% (target 95%)
- Walker stuck in `first_person` voice (better as `third_person_editorial`)
- Body length floors are too low for agency-premium

**Where we land:**
- 7 creators audited (3 existing + 4 new: Naval, Nippard, Codie, Veritasium)
- Aggregate quality bar score 9.1+/10
- Verification rate ≥ 95% across all creators
- Voice mode enforced + validated per creator
- Body length floors raised + retry-on-failure absorbs short outputs
- Cohort report (single page) demonstrates agency-premium readiness

---

## File Structure

```
packages/pipeline/src/scripts/util/
  json-repair.ts                          ← NEW (Task 8.1) — truncated-JSON parser
  json-repair.test.ts                     ← NEW (Task 8.1) — node:test unit tests

  evidence-tagger.ts                      ← MODIFY (Task 8.2) — tighter supportingPhrase
                                            prompt + json-repair fallback in tagEntityEvidence
  evidence-tagger.test.ts                 ← extend (Task 8.2) — 2 new test cases

  voice-mode.ts                           ← NEW (Task 8.3) — VoiceMode type + helpers
  voice-mode.test.ts                      ← NEW (Task 8.3) — node:test unit tests

  canon-body-writer.ts                    ← MODIFY (Task 8.4) — branch on voiceMode +
                                            raise minWordCount() floors
  synthesis-body-writer.ts                ← MODIFY (Task 8.5) — branch on voiceMode
  journey-body-writer.ts                  ← MODIFY (Task 8.6) — branch on voiceMode
  brief-body-writer.ts                    ← MODIFY (Task 8.7) — branch on voiceMode

packages/pipeline/src/scripts/
  seed-audit-v2.ts                        ← MODIFY (Task 8.8) — read voice mode,
                                            propagate, --voice-mode flag

  check-voice-mode.ts                     ← NEW (Task 8.9) — voice register validator

  v2-cohort-report.ts                     ← NEW (Task 8.10) — aggregate 7-creator
                                            quality bar status

  seed-creator-from-channel.ts            ← NEW (Task 8.11) — operator-helper for
                                            ingesting a YouTube channel + dispatching
                                            seed-audit-v2 (used for Naval, Nippard,
                                            Codie, Veritasium onboarding)

docs/superpowers/specs/
  2026-05-01-hub-source-document-schema.md ← extend (Task 8.12) — add voice_mode
                                              field to ChannelProfile_v2

docs/builder-handoff/
  hub-source-document-format.md           ← extend (Task 8.12) — voice_mode rendering
                                              guidance for builders

docs/superpowers/plans/
  2026-05-01-phase-8-results.md           ← NEW (Task 8.13) — cohort results +
                                              STOP gate + agency-premium claim
```

---

## Task 8.1: json-repair module + unit tests

**Files:**
- Create: `packages/pipeline/src/scripts/util/json-repair.ts`
- Create: `packages/pipeline/src/scripts/util/json-repair.test.ts`

**Why:** Codex CLI truncates JSON responses at token boundaries (~5-10% rate). Current behavior: tagger retries 3x, all 3 hit the same truncation, falls back to all-degraded registry → depresses verification rate. With json-repair, truncated responses recover most of their entries — only the truncated entry itself is lost.

- [ ] **Step 1: Write the type signature + 6 failing tests**

```ts
// packages/pipeline/src/scripts/util/json-repair.test.ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { repairTruncatedJson } from './json-repair';

describe('repairTruncatedJson', () => {
  test('returns parsed value when input is already valid JSON object', () => {
    assert.deepEqual(repairTruncatedJson('{"a": 1, "b": 2}'), { a: 1, b: 2 });
  });

  test('returns parsed value when input is already valid JSON array', () => {
    assert.deepEqual(repairTruncatedJson('[{"a":1},{"b":2}]'), [{ a: 1 }, { b: 2 }]);
  });

  test('handles trailing comma after the last entry', () => {
    assert.deepEqual(repairTruncatedJson('{"a": 1, "b": 2,}'), { a: 1, b: 2 });
  });

  test('recovers a truncated array by dropping the unterminated last entry', () => {
    // Codex truncated mid-string in the second array element
    const truncated = '[{"a":1, "b":2}, {"a":3, "b":"hello wor';
    const result = repairTruncatedJson(truncated) as Array<unknown>;
    assert.equal(result.length, 1);
    assert.deepEqual(result[0], { a: 1, b: 2 });
  });

  test('recovers a truncated object by dropping the unterminated last key/value pair', () => {
    // Codex truncated mid-value in the third key
    const truncated = '{"a": 1, "b": 2, "c": "hello wor';
    const result = repairTruncatedJson(truncated) as Record<string, unknown>;
    assert.equal(result.a, 1);
    assert.equal(result.b, 2);
    assert.equal(result.c, undefined);
  });

  test('returns null when input is unrepairable garbage', () => {
    assert.equal(repairTruncatedJson('not json at all'), null);
  });
});
```

- [ ] **Step 2: Run the failing tests**

```bash
cd packages/pipeline
NODE_ENV=test node --import "../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs" --test src/scripts/util/json-repair.test.ts
```

Expected: 6/6 fail with "Cannot find module './json-repair'".

- [ ] **Step 3: Implement json-repair.ts**

```ts
// packages/pipeline/src/scripts/util/json-repair.ts

/**
 * Truncated-JSON repair. Codex CLI sometimes returns JSON cut off mid-string
 * (token boundary truncation). This helper attempts a 4-step recovery:
 *
 *   1. Direct JSON.parse — works for well-formed input.
 *   2. Trim trailing whitespace + dangling commas, retry parse.
 *   3. Walk from start counting brackets/braces; when depth returns to 0
 *      (last balanced top-level close), parse only that prefix.
 *   4. If 3 fails, drop the last incomplete entry of the outermost array
 *      or object and parse the rest.
 *
 * Returns null when no strategy recovers a parseable result. Caller then
 * falls back to its own degraded path (e.g., evidence-tagger's degraded
 * registry).
 */

export function repairTruncatedJson(raw: string): unknown | null {
  if (!raw || typeof raw !== 'string') return null;

  // Strategy 1: direct parse
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }

  // Strategy 2: trim trailing whitespace + dangling commas
  const trimmed = raw.trimEnd().replace(/,\s*$/, '');
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  // Strategy 3: find the last balanced close at depth-0
  const balanced = findLastBalancedPrefix(trimmed);
  if (balanced) {
    try {
      return JSON.parse(balanced);
    } catch {
      /* fall through */
    }
  }

  // Strategy 4: drop the last incomplete top-level entry, retry
  const dropped = dropLastTopLevelEntry(trimmed);
  if (dropped) {
    try {
      return JSON.parse(dropped);
    } catch {
      /* fall through */
    }
  }

  return null;
}

/** Walk from the first '{' or '[' tracking depth + string state.
 *  When depth returns to 0 at a closing bracket/brace, that's the last
 *  balanced top-level close. Return the prefix up to and including it. */
function findLastBalancedPrefix(raw: string): string | null {
  const startIdx = raw.search(/[{[]/);
  if (startIdx < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastBalancedEnd = -1;

  for (let i = startIdx; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === '}' || ch === ']') {
      depth -= 1;
      if (depth === 0) {
        lastBalancedEnd = i;
      }
    }
  }

  if (lastBalancedEnd < 0) return null;
  return raw.slice(startIdx, lastBalancedEnd + 1);
}

/** Drop the last incomplete top-level array/object entry. Returns a string
 *  that — if it parses — represents everything before the truncation. */
function dropLastTopLevelEntry(raw: string): string | null {
  const startIdx = raw.search(/[{[]/);
  if (startIdx < 0) return null;
  const opener = raw[startIdx];
  const closer = opener === '{' ? '}' : ']';

  // Walk forward, tracking depth + string state. Find the LAST comma at
  // depth 1 that's NOT inside a string. Truncate after that comma, append
  // the closer.
  let depth = 0;
  let inString = false;
  let escaped = false;
  let lastTopLevelComma = -1;

  for (let i = startIdx; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      depth += 1;
    } else if (ch === '}' || ch === ']') {
      depth -= 1;
    } else if (ch === ',' && depth === 1) {
      lastTopLevelComma = i;
    }
  }

  if (lastTopLevelComma < 0) return null;
  return raw.slice(startIdx, lastTopLevelComma) + closer;
}
```

- [ ] **Step 4: Run tests, expect all 6 pass**

```bash
cd packages/pipeline
NODE_ENV=test node --import "../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs" --test src/scripts/util/json-repair.test.ts
```

Expected: `pass 6 / fail 0`.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/util/json-repair.ts packages/pipeline/src/scripts/util/json-repair.test.ts
git commit -m "feat(phase-8): json-repair module — recover truncated Codex JSON

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.2: Wire json-repair into evidence-tagger + tighten supportingPhrase prompt

**Files:**
- Modify: `packages/pipeline/src/scripts/util/evidence-tagger.ts`
- Modify: `packages/pipeline/src/scripts/util/evidence-tagger.test.ts`

**Why:** With the json-repair module in place, the tagger can recover from Codex truncation instead of falling back to the degraded registry. Combined with a tighter supportingPhrase prompt (10-25 word target instead of unspecified length), this lifts bar 5 verification rate from 84-90% to ≥95%.

- [ ] **Step 1: Add the supportingPhrase length rule to the prompt**

In `evidence-tagger.ts`, find the `# supportingPhrase rules (HARD-FAIL if violated)` section in `buildEvidencePrompt`. Insert this paragraph BEFORE the existing "GOOD examples" block:

```ts
lines.push('# supportingPhrase length rule');
lines.push('Pick an 8-25 word substring. NOT the whole segment. NOT a single word.');
lines.push('The phrase should be the TIGHTEST verbatim chunk that supports the cited claim.');
lines.push('Avoid phrases ending mid-sentence — pick complete clauses where possible.');
lines.push('');
lines.push('✓ GOOD: "the mistake I made was niching too early" (8 words, complete clause)');
lines.push('✓ GOOD: "we want to make sure that we\'re going for clients that are high demand" (14 words, complete clause)');
lines.push('✗ BAD: "we ran 100 prospects every single day for six weeks straight, and what we found was that the conversion rate was higher" (>25 words — too long)');
lines.push('✗ BAD: "the mistake" (2 words — not enough context)');
lines.push('');
```

- [ ] **Step 2: Replace JSON.parse with repairTruncatedJson in tagEntityEvidence**

Add to imports at the top:

```ts
import { repairTruncatedJson } from './json-repair';
```

Find the `tagEntityEvidence` function. Replace the `JSON.parse(json)` call inside the try block with:

```ts
const parsed = repairTruncatedJson(json);
if (parsed === null) {
  throw new Error(`[evidence_tagger_${input.entityId}] failed to parse + repair JSON output`);
}
```

The rest of the parser (validating registry shape) stays the same.

- [ ] **Step 3: Add the 2 new test cases to evidence-tagger.test.ts**

```ts
test('repairs a truncated registry by dropping the unterminated last entry', () => {
  // Mock setup is mechanical — see existing test file for patterns
  // The new test verifies that when the LLM returns a truncated JSON
  // string (with one incomplete trailing entry), the tagger still
  // returns a partial registry covering the parseable entries.
  // Implementation note: this is a unit test on tagEntityEvidence,
  // requires mocking runCodex. See existing computeVerificationStatus
  // test pattern in the same file.
});

test('returns degraded registry when JSON is unrepairable', () => {
  // When repairTruncatedJson returns null, tagEntityEvidence's quality
  // gate fires the throw, the orchestrator catches it after retries,
  // and the degraded registry is returned. Verify that path remains
  // wired correctly.
});
```

(These are stub tests; the real test requires mocking `runCodex`. If the team mocks `runCodex` with `mock.module(...)`, write full tests. Otherwise leave as `test.todo()` and rely on integration testing with real Codex truncation in Task 8.13's backfill.)

For the stub form, use:

```ts
test.todo('repairs a truncated registry by dropping the unterminated last entry');
test.todo('returns degraded registry when JSON is unrepairable');
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/pipeline && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run unit tests**

```bash
cd packages/pipeline
pnpm test
```

Expected: all existing tests still pass + 2 new `todo` markers.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/util/evidence-tagger.ts packages/pipeline/src/scripts/util/evidence-tagger.test.ts
git commit -m "feat(phase-8): tagger uses json-repair + tighter supportingPhrase prompt (10-25w)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.3: voice-mode module + tests

**Files:**
- Create: `packages/pipeline/src/scripts/util/voice-mode.ts`
- Create: `packages/pipeline/src/scripts/util/voice-mode.test.ts`

**Why:** Voice mode is structural (controls register), separate from VoiceFingerprint (controls stylistic details). Body writers consume it as a top-level input. This module exports the type + the archetype-default mapping + a small leak-detection helper.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/pipeline/src/scripts/util/voice-mode.test.ts
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { defaultVoiceMode, hasFirstPersonMarkers, hasThirdPersonAttribution } from './voice-mode';

describe('defaultVoiceMode', () => {
  test('operator-coach defaults to first_person', () => {
    assert.equal(defaultVoiceMode('operator-coach'), 'first_person');
  });

  test('instructional-craft defaults to first_person', () => {
    assert.equal(defaultVoiceMode('instructional-craft'), 'first_person');
  });

  test('science-explainer defaults to third_person_editorial', () => {
    assert.equal(defaultVoiceMode('science-explainer'), 'third_person_editorial');
  });

  test('contemplative-thinker defaults to hybrid', () => {
    assert.equal(defaultVoiceMode('contemplative-thinker'), 'hybrid');
  });

  test('_DEFAULT falls back to first_person', () => {
    assert.equal(defaultVoiceMode('_DEFAULT'), 'first_person');
  });
});

describe('hasFirstPersonMarkers', () => {
  test('matches I / my as standalone words (only personal first-person)', () => {
    assert.equal(hasFirstPersonMarkers('I prospect daily'), true);
    assert.equal(hasFirstPersonMarkers('my system is built on'), true);
    assert.equal(hasFirstPersonMarkers('the path I took'), true);
  });

  test('does not match inside other words', () => {
    assert.equal(hasFirstPersonMarkers('iridescent'), false);
    assert.equal(hasFirstPersonMarkers('myth myriad mystic'), false);
  });

  test('does not flag editorial we/our/us (those are intentionally allowed)', () => {
    // Editorial third-person legitimately uses "we as a field" / "our
    // understanding has improved" — these are NOT first-person markers.
    assert.equal(hasFirstPersonMarkers('we as a field'), false);
    assert.equal(hasFirstPersonMarkers('our understanding of sleep'), false);
    assert.equal(hasFirstPersonMarkers('the topic helps us see'), false);
  });

  test('handles empty input', () => {
    assert.equal(hasFirstPersonMarkers(''), false);
  });
});

describe('hasThirdPersonAttribution', () => {
  test('matches "the creator says"', () => {
    assert.equal(hasThirdPersonAttribution('the creator says X', 'Jordan'), true);
  });

  test('matches "<creatorName> says/argues"', () => {
    assert.equal(hasThirdPersonAttribution('Jordan says X', 'Jordan'), true);
    assert.equal(hasThirdPersonAttribution('Walker argues that', 'Walker'), true);
  });

  test('matches "she says" / "he says"', () => {
    assert.equal(hasThirdPersonAttribution('she says X', 'Jordan'), true);
    assert.equal(hasThirdPersonAttribution('he explains Y', 'Jordan'), true);
  });

  test('does not match plain editorial third-person', () => {
    assert.equal(hasThirdPersonAttribution('Sleep is structured', 'Walker'), false);
    assert.equal(hasThirdPersonAttribution('REM activates threat-detection circuits', 'Walker'), false);
  });
});
```

- [ ] **Step 2: Run tests, confirm failure**

```bash
cd packages/pipeline
NODE_ENV=test node --import "../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs" --test src/scripts/util/voice-mode.test.ts
```

Expected: all tests fail with "Cannot find module './voice-mode'".

- [ ] **Step 3: Implement voice-mode.ts**

```ts
// packages/pipeline/src/scripts/util/voice-mode.ts

import type { ArchetypeSlug } from '../../agents/skills/archetype-detector';

export type VoiceMode = 'first_person' | 'third_person_editorial' | 'hybrid';

/** Archetype → voice mode default. Operator can override via --voice-mode flag. */
export function defaultVoiceMode(archetype: ArchetypeSlug | string): VoiceMode {
  switch (archetype) {
    case 'operator-coach':
    case 'instructional-craft':
      return 'first_person';
    case 'science-explainer':
      return 'third_person_editorial';
    case 'contemplative-thinker':
      return 'hybrid';
    default:
      return 'first_person';
  }
}

/** Personal first-person markers that should NOT appear in third_person_editorial
 *  bodies. INTENTIONALLY narrow: only "I" and "my" — NOT "we"/"us"/"our" because
 *  editorial third-person legitimately uses "we" / "our" in the sense of "we as
 *  a field" or "our understanding." Walker's third-person body could say "our
 *  understanding of REM sleep has improved" without that being a violation. */
const FIRST_PERSON_RE = /\b(I|my)\b/;

export function hasFirstPersonMarkers(text: string | undefined | null): boolean {
  if (!text) return false;
  return FIRST_PERSON_RE.test(text);
}

/** Third-person attribution markers that should NOT appear in first_person bodies. */
const PRONOUN_ATTRIBUTION_RE = /\b(she|he|they) (says|argues|explains|notes|claims|believes|recommends|suggests)\b/i;
const GENERIC_ATTRIBUTION_RE = /\bthe (creator|speaker|host|author|narrator) (says|argues|explains|notes|claims|believes)\b/i;

export function hasThirdPersonAttribution(
  text: string | undefined | null,
  creatorName: string,
): boolean {
  if (!text) return false;
  if (PRONOUN_ATTRIBUTION_RE.test(text)) return true;
  if (GENERIC_ATTRIBUTION_RE.test(text)) return true;
  if (text.toLowerCase().includes('the creator')) return true;
  if (creatorName && creatorName.length > 0) {
    const escaped = creatorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const creatorRe = new RegExp(
      `\\b${escaped}\\s+(says|argues|explains|notes|claims|believes|recommends|suggests|describes)\\b`,
      'i',
    );
    if (creatorRe.test(text)) return true;
  }
  return false;
}

/** Render a 1-paragraph voice-rules block for body writer prompts.
 *  Used by all 4 body writers — single source of truth for voice rules. */
export function voiceRulesPrompt(voiceMode: VoiceMode, creatorName: string): string {
  switch (voiceMode) {
    case 'first_person':
      return [
        '# Voice rules (HARD-FAIL otherwise)',
        '- First-person only. NEVER "the creator", "${creatorName}", "she/he says", "in this video"',
        '- Subject of every sentence is "I" or "you" — never the creator-as-third-person',
        '- Verbatim preserveTerms; no rephrasing of named concepts',
        '- Markdown allowed: ## subheadings, **bold**, lists, blockquotes',
      ].join('\n').replace('${creatorName}', creatorName);
    case 'third_person_editorial':
      return [
        '# Voice rules (HARD-FAIL otherwise)',
        '- Third-person editorial. Subject of every sentence is the TOPIC, not the creator',
        `- ${creatorName}'s claims are EVIDENCE, not voice. Quote ${creatorName} directly when needed: As ${creatorName} notes, "..."`,
        '- NEVER "I", "my", "we", "our" except inside a directly quoted block from the source',
        '- Editorial register: the body should read like a definitive reference page, not a personal blog post',
        '- Verbatim preserveTerms; no rephrasing of named concepts',
        '- Markdown allowed: ## subheadings, **bold**, lists, blockquotes',
      ].join('\n');
    case 'hybrid':
      return [
        '# Voice rules (HARD-FAIL otherwise)',
        '- Mixed register: third-person editorial framing + first-person aphoristic insertions',
        `- Default register is third-person editorial — claims/mechanisms/structure are "the topic does X"`,
        `- Insert 1-3 first-person aphorism slots as direct quotes from ${creatorName}: "I do X" or "my rule is Y"`,
        '- Aphorisms set off with blockquote markdown (>)',
        '- Markdown allowed: ## subheadings, **bold**, lists, blockquotes',
        '',
        '# Hybrid mode example structure (use this shape for body):',
        '',
        '## [Concept name]',
        '',
        '[Third-person editorial framing of the concept — 50-100 words. Defines the topic, names the mechanism.]',
        '',
        `> [First-person aphorism from ${creatorName} — 1-3 sentences in their voice. e.g. "I do not think wealth is about money. It\'s about not having to think about money."]`,
        '',
        '[Third-person editorial unfold — 100-200 words explaining the mechanism, citing evidence with [<segmentId>] tokens.]',
        '',
        `> [Second first-person aphorism — sharp, memorable. e.g. "I want to play games where the time horizon is years, not minutes."]`,
        '',
        '[Third-person tie-back — 80-150 words on what the reader should do, in editorial register.]',
        '',
        '✓ The blockquoted aphorisms are the ONLY first-person sentences in the body.',
        '✗ DO NOT put first-person voice in the editorial framing paragraphs. Those stay third-person.',
      ].join('\n');
  }
}
```

- [ ] **Step 4: Run tests, expect all 16 pass**

```bash
cd packages/pipeline
NODE_ENV=test node --import "../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs" --test src/scripts/util/voice-mode.test.ts
```

Expected: `pass 16 / fail 0`.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/util/voice-mode.ts packages/pipeline/src/scripts/util/voice-mode.test.ts
git commit -m "feat(phase-8): voice-mode module with archetype defaults + leak detection helpers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.4: canon-body-writer integrates voiceMode + raises minWordCount

**Files:**
- Modify: `packages/pipeline/src/scripts/util/canon-body-writer.ts`

**Why:** Canon bodies are the primary content the audit produces. They need to (a) honor voice mode (first/third/hybrid) and (b) hit higher word-count floors (definition 250, principle 500, framework 700, playbook 800).

- [ ] **Step 1: Add VoiceMode import + extend CanonBodyInput type**

At the top of canon-body-writer.ts:

```ts
import { type VoiceMode, voiceRulesPrompt } from './voice-mode';
```

Modify the `CanonBodyInput` interface to add the new field:

```ts
export interface CanonBodyInput {
  // ... all existing fields ...
  voiceMode: VoiceMode;
  // ... rest of existing fields ...
}
```

- [ ] **Step 2: Replace the inline voice-rules block in buildBodyPrompt with voiceRulesPrompt(...)**

Find the existing `# Voice rules (HARD-FAIL otherwise)` block (the one currently hard-coded for first-person). Replace it with:

```ts
lines.push(voiceRulesPrompt(input.voiceMode, input.creatorName));
lines.push('');
```

For hybrid mode, also add:

```ts
if (input.voiceMode === 'hybrid') {
  lines.push('# Hybrid mode structure');
  lines.push('Structure the body in 3 layers:');
  lines.push('1. Editorial third-person framing for the concept (defines the topic)');
  lines.push('2. 1-3 first-person aphorism slots as blockquotes from the creator');
  lines.push('3. Editorial third-person tie-back to "what this means"');
  lines.push('');
}
```

- [ ] **Step 3: Raise minWordCount() floors**

Replace the existing function with:

```ts
function minWordCount(type: string): number {
  switch (type) {
    case 'definition': case 'aha_moment': case 'quote':
      return 250;
    case 'example':
      return 350;
    case 'lesson': case 'pattern': case 'tactic':
      return 450;
    case 'principle': case 'topic':
      return 500;
    case 'framework':
      return 700;
    case 'playbook':
      return 800;
    default:
      return 450;
  }
}
```

Also bump the `targetWordCount()` ranges by ~30%:

```ts
function targetWordCount(type: string): { min: number; max: number } {
  switch (type) {
    case 'framework': return { min: 700, max: 1500 };
    case 'playbook': return { min: 1000, max: 1800 };
    case 'principle': case 'topic': return { min: 500, max: 1200 };
    case 'lesson': case 'pattern': case 'tactic': return { min: 450, max: 1000 };
    case 'definition': case 'aha_moment': case 'quote': return { min: 250, max: 600 };
    case 'example': return { min: 350, max: 800 };
    default: return { min: 500, max: 1200 };
  }
}
```

- [ ] **Step 3.5: Add graceful degradation for thin source content**

Naval's content is sparse (short clips, aphoristic). If the body writer hits the new 500w/700w/800w floor on a canon backed by only 30 seconds of source segment, retry-on-failure could spin forever. Add a downgrade path: after 2 retries fail to hit the floor, accept the body at the lower length AND log a warning.

In `writeCanonBody`'s retry loop (or in `writeCanonBodiesParallel`), modify the retry-exhausted branch to NOT throw. Instead, return the body with a `degraded: true` marker:

```ts
// Inside writeCanonBodiesParallel's worker loop, after maxRetries exhausted:
if (!out.has(input.id) && lastErr) {
  const wordCountErr = lastErr.message.includes('body too short');
  if (wordCountErr && lastResult) {
    // Accept the under-length body; log + continue rather than degraded-fallback
    console.warn(
      `[body] ${input.id} permanently under length after ${1 + maxRetries} attempts ` +
      `(got ${lastResult.body.split(/\s+/).filter(Boolean).length} words, target ${minWordCount(input.type)}); ` +
      `accepting at lower length to avoid blocking pipeline.`
    );
    out.set(input.id, lastResult);
  } else {
    // Other failure modes (parse error, third-person leak, etc.) still hard-fail.
    console.error(`[body] ${input.id} permanently failed: ${lastErr.message.slice(0, 200)}`);
    out.set(input.id, {
      body: '',
      cited_segment_ids: [],
      used_example_ids: [],
      used_story_ids: [],
      used_mistake_ids: [],
      used_contrarian_take_ids: [],
    });
  }
}
```

This requires capturing `lastResult` from the most recent attempt (even when it threw). Track it in the for-loop: store `result` in a `lastResult` variable BEFORE the throw inside the try block.

Tradeoff: a short body with citations is better than no body at all for thin-content creators. For agency-quality creators with thick content, the 800w floor is realistic.

- [ ] **Step 4: Typecheck**

```bash
cd packages/pipeline && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Existing unit tests still pass**

```bash
cd packages/pipeline && pnpm test 2>&1 | tail -5
```

Expected: 273+ tests pass (existing computeVerificationStatus tests etc. unaffected).

- [ ] **Step 6: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/util/canon-body-writer.ts
git commit -m "feat(phase-8): canon-body-writer reads voiceMode + raised word floors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.5: synthesis-body-writer integrates voiceMode

**Files:**
- Modify: `packages/pipeline/src/scripts/util/synthesis-body-writer.ts`

**Why:** Synthesis bodies (pillar pages) need the same voice-mode discipline as canon bodies. Word floors stay at 400-1000w (synthesis is argument-thread content, not deep teaching — no need to raise).

- [ ] **Step 1: Add VoiceMode import**

At the top of `synthesis-body-writer.ts`, after existing imports:

```ts
import { type VoiceMode, voiceRulesPrompt } from './voice-mode';
```

- [ ] **Step 2: Add `voiceMode` field to `SynthesisBodyInput` interface**

Find the `SynthesisBodyInput` interface declaration. Add the field at the top (right after `id` / `shell`):

```ts
export interface SynthesisBodyInput {
  id: string;
  shell: SynthesisShell;
  voiceMode: VoiceMode;          // NEW (Phase 8)
  // ... existing fields below unchanged ...
  children: ChildCanonRef[];
  creatorName: string;
  archetype: ArchetypeSlug;
  voiceFingerprint: VoiceFingerprint;
  channelDominantTone?: string;
  channelAudience?: string;
}
```

- [ ] **Step 3: Replace inline voice-rules block with voiceRulesPrompt**

Find the inline voice-rules block in the synthesis prompt builder (`buildBodyPrompt`). It currently has hard-coded first-person rules. Replace those lines with:

```ts
lines.push(voiceRulesPrompt(input.voiceMode, input.creatorName));
lines.push('');
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/pipeline && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/util/synthesis-body-writer.ts
git commit -m "feat(phase-8): synthesis-body-writer reads voiceMode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.6: journey-body-writer integrates voiceMode

**Files:**
- Modify: `packages/pipeline/src/scripts/util/journey-body-writer.ts`

**Why:** Reader-journey phase bodies (200-400w each) need the same voice-mode discipline.

- [ ] **Step 1: Add VoiceMode import**

```ts
import { type VoiceMode, voiceRulesPrompt } from './voice-mode';
```

- [ ] **Step 2: Add voiceMode to PhaseBodyInput interface**

Find the `PhaseBodyInput` interface. Add:

```ts
export interface PhaseBodyInput {
  phase: ReaderJourneyPhaseShell;
  voiceMode: VoiceMode;               // NEW (Phase 8)
  // ... existing fields below unchanged ...
  primaryCanons: CanonRefForJourney[];
  creatorName: string;
  archetype: ArchetypeSlug;
  voiceFingerprint: VoiceFingerprint;
  channelDominantTone?: string;
  channelAudience?: string;
  phaseNumber: number;
  totalPhases: number;
}
```

- [ ] **Step 3: Replace inline voice-rules block in phase prompt builder**

Find the existing voice-rules block in `buildPhaseBodyPrompt` (currently hard-coded first-person). Replace with:

```ts
lines.push(voiceRulesPrompt(input.voiceMode, input.creatorName));
lines.push('');
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/pipeline && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/util/journey-body-writer.ts
git commit -m "feat(phase-8): journey-body-writer reads voiceMode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.7: brief-body-writer integrates voiceMode

**Files:**
- Modify: `packages/pipeline/src/scripts/util/brief-body-writer.ts`

**Why:** Page-brief intro bodies (200-400w each) need the same voice-mode discipline.

- [ ] **Step 1: Add VoiceMode import**

```ts
import { type VoiceMode, voiceRulesPrompt } from './voice-mode';
```

- [ ] **Step 2: Add voiceMode to BriefBodyInput interface**

Find the `BriefBodyInput` interface. Add:

```ts
export interface BriefBodyInput {
  brief: PageBriefShell;
  voiceMode: VoiceMode;               // NEW (Phase 8)
  // ... existing fields below unchanged ...
  primaryCanons: CanonRefForBrief[];
  creatorName: string;
  archetype: ArchetypeSlug;
  voiceFingerprint: VoiceFingerprint;
  channelDominantTone?: string;
  channelAudience?: string;
}
```

- [ ] **Step 3: Replace inline voice-rules block in brief prompt builder**

Find the existing voice-rules block in `buildBodyPrompt` (currently hard-coded first-person). Replace with:

```ts
lines.push(voiceRulesPrompt(input.voiceMode, input.creatorName));
lines.push('');
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/pipeline && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/util/brief-body-writer.ts
git commit -m "feat(phase-8): brief-body-writer reads voiceMode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.8: seed-audit-v2 reads + propagates voiceMode + adds --voice-mode flag

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-v2.ts`

**Why:** The driver script needs to (a) accept `--voice-mode` from CLI, (b) write `_index_voice_mode` to the channel profile, (c) propagate the resolved voiceMode to every body writer's input.

- [ ] **Step 1: Add the --voice-mode flag + flag parsing**

After the existing flag block in `main()`:

```ts
const voiceModeFlag = (() => {
  const idx = process.argv.indexOf('--voice-mode');
  if (idx < 0) return null;
  const val = process.argv[idx + 1];
  if (val === 'first_person' || val === 'third_person_editorial' || val === 'hybrid') {
    return val as VoiceMode;
  }
  console.warn(`[v2] --voice-mode: invalid value "${val}", ignoring`);
  return null;
})();
```

Add VoiceMode import at top:

```ts
import { type VoiceMode, defaultVoiceMode } from './util/voice-mode';
```

- [ ] **Step 2: After channel profile is loaded/generated, resolve voiceMode**

Find the spot where `profile` is fully resolved (after Stage 1 completes). Add:

```ts
const resolvedVoiceMode: VoiceMode =
  voiceModeFlag ??
  (profile._index_voice_mode as VoiceMode | undefined) ??
  defaultVoiceMode(profile._index_archetype);

// Persist if missing on profile (additive; doesn't overwrite existing)
if (!profile._index_voice_mode) {
  profile._index_voice_mode = resolvedVoiceMode;
  await db.update(channelProfile)
    .set({ payload: profile as unknown as Record<string, unknown> })
    .where(eq(channelProfile.runId, runId));
}

console.info(`[v2] voiceMode: ${resolvedVoiceMode} (archetype=${profile._index_archetype})`);
```

- [ ] **Step 3: Pass voiceMode into every body writer's input**

Find every place where a body-writer input is constructed (CanonBodyInput, SynthesisBodyInput, PhaseBodyInput, BriefBodyInput). Add `voiceMode: resolvedVoiceMode,` to each.

For canon bodies (Stage 5):
```ts
const inputs: CanonBodyInput[] = canonShells.map((shell) => ({
  // ... existing fields ...
  voiceMode: resolvedVoiceMode,
}));
```

For synthesis bodies (Stage 6):
```ts
const synthInputs: SynthesisBodyInput[] = synthShells.map((s) => ({
  // ... existing fields ...
  voiceMode: resolvedVoiceMode,
}));
```

For journey phase bodies (Stage 7):
```ts
const phaseInputs: PhaseBodyInput[] = phases.map((phase) => ({
  // ... existing fields ...
  voiceMode: resolvedVoiceMode,
}));
```

For brief bodies (Stage 8):
```ts
const briefInputs: BriefBodyInput[] = shells.map((shell) => ({
  // ... existing fields ...
  voiceMode: resolvedVoiceMode,
}));
```

- [ ] **Step 4: Update header docblock with --voice-mode flag**

In the file header docblock, in the "Flags" section, add:

```ts
 *   --voice-mode <mode>  Override voice register: first_person | third_person_editorial | hybrid
 *                        (defaults from archetype if omitted)
```

- [ ] **Step 5: Typecheck**

```bash
cd packages/pipeline && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd ../..
git add packages/pipeline/src/scripts/seed-audit-v2.ts
git commit -m "feat(phase-8): seed-audit-v2 wires voiceMode + --voice-mode flag

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.9: check-voice-mode validator

**Files:**
- Create: `packages/pipeline/src/scripts/check-voice-mode.ts`

**Why:** New hard-fail validator that scans body fields for voice-mode violations. Mirrors check-third-person-leak.ts shape.

- [ ] **Step 1: Implement the validator**

```ts
// packages/pipeline/src/scripts/check-voice-mode.ts

import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  pageBrief,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';
import {
  type VoiceMode,
  hasFirstPersonMarkers,
  hasThirdPersonAttribution,
} from './util/voice-mode';

loadDefaultEnvFiles();

interface Violation {
  location: string;
  rule: string;
  excerpt: string;
}

function scanFirstPersonBody(
  text: string | undefined,
  location: string,
  creatorName: string,
  violations: Violation[],
): void {
  if (!text) return;
  if (hasThirdPersonAttribution(text, creatorName)) {
    violations.push({
      location,
      rule: 'first_person body should not contain third-person attribution',
      excerpt: text.slice(0, 200).replace(/\s+/g, ' '),
    });
  }
}

function scanThirdPersonBody(
  text: string | undefined,
  location: string,
  violations: Violation[],
): void {
  if (!text) return;
  if (hasFirstPersonMarkers(text)) {
    violations.push({
      location,
      rule: 'third_person_editorial body should not contain first-person markers',
      excerpt: text.slice(0, 200).replace(/\s+/g, ' '),
    });
  }
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/check-voice-mode.ts <runId>');

  const db = getDb();

  const cpRows = await db.select({ payload: channelProfile.payload })
    .from(channelProfile).where(eq(channelProfile.runId, runId));
  const cp = cpRows[0]?.payload as {
    schemaVersion?: string;
    creatorName?: string;
    _index_voice_mode?: VoiceMode;
  } | undefined;
  if (!cp || cp.schemaVersion !== 'v2') {
    console.info(`[voice-mode] runId=${runId} — not v2, skipping`);
    await closeDb();
    return;
  }

  const voiceMode: VoiceMode = cp._index_voice_mode ?? 'first_person';
  const creatorName = cp.creatorName ?? '';
  const violations: Violation[] = [];

  // Canon nodes (incl. synthesis; excl. reader_journey for now — phases handled separately)
  const canonRows = await db.select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode).where(eq(canonNode.runId, runId));

  for (const c of canonRows) {
    const p = c.payload as { schemaVersion?: string; kind?: string; body?: string; _index_phases?: any[] };
    if (p.schemaVersion !== 'v2') continue;
    if (p.kind === 'reader_journey') {
      // Per-phase scan
      for (const phase of (p._index_phases ?? [])) {
        const phaseLoc = `canon[${c.id}].phases[${phase._index_phase_number}].body`;
        if (voiceMode === 'first_person') {
          scanFirstPersonBody(phase.body, phaseLoc, creatorName, violations);
        } else if (voiceMode === 'third_person_editorial') {
          scanThirdPersonBody(phase.body, phaseLoc, violations);
        }
      }
      continue;
    }
    const loc = `canon[${c.id}].body`;
    if (voiceMode === 'first_person') {
      scanFirstPersonBody(p.body, loc, creatorName, violations);
    } else if (voiceMode === 'third_person_editorial') {
      scanThirdPersonBody(p.body, loc, violations);
    }
    // hybrid: no violations checked (mixed register is by design)
  }

  // Page briefs
  const briefRows = await db.select({ id: pageBrief.id, payload: pageBrief.payload })
    .from(pageBrief).where(eq(pageBrief.runId, runId));
  for (const b of briefRows) {
    const p = b.payload as { schemaVersion?: string; body?: string };
    if (p.schemaVersion !== 'v2') continue;
    const loc = `brief[${b.id}].body`;
    if (voiceMode === 'first_person') {
      scanFirstPersonBody(p.body, loc, creatorName, violations);
    } else if (voiceMode === 'third_person_editorial') {
      scanThirdPersonBody(p.body, loc, violations);
    }
  }

  // Render markdown report
  const reportPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `voice-mode-${runId}.md`,
  );
  const lines = [
    `# Voice Mode Validation — \`${runId}\``,
    '',
    `_Generated: ${new Date().toISOString()}_`,
    `_Creator: ${creatorName}_`,
    `_Voice mode: ${voiceMode}_`,
    '',
    `## Violations: ${violations.length}`,
    '',
  ];
  if (violations.length === 0) {
    lines.push('✅ No violations. Voice mode adherence verified across all body fields.');
  } else {
    for (const v of violations) {
      lines.push(`### \`${v.location}\``);
      lines.push(`Rule: ${v.rule}`);
      lines.push('');
      lines.push(`> ${v.excerpt}…`);
      lines.push('');
    }
  }
  fs.writeFileSync(reportPath, lines.join('\n'));

  // Stdout summary
  console.info(`[voice-mode] runId=${runId}`);
  console.info(`[voice-mode]   creator: ${creatorName}`);
  console.info(`[voice-mode]   voiceMode: ${voiceMode}`);
  console.info(`[voice-mode]   violations: ${violations.length}`);
  console.info(`[voice-mode] report: ${reportPath}`);

  await closeDb();
  if (violations.length > 0) process.exit(2);
}

main().catch(async (err) => {
  await closeDb();
  console.error('[voice-mode] FAILED', err);
  process.exit(1);
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && npx tsc --noEmit
cd ../..
git add packages/pipeline/src/scripts/check-voice-mode.ts
git commit -m "feat(phase-8): voice-mode validator (hard-fails register violations per channel)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.10: v2-cohort-report — single-page status across N creators

**Files:**
- Create: `packages/pipeline/src/scripts/v2-cohort-report.ts`

**Why:** Phase 8's success criterion is "all 7 creators pass bars 1-10." This script aggregates per-creator status into a single comparison table.

- [ ] **Step 1: Implement the cohort report**

```ts
// packages/pipeline/src/scripts/v2-cohort-report.ts
//
// Usage: tsx ./src/scripts/v2-cohort-report.ts <runId-1> <runId-2> ... <runId-N>
//
// Aggregates v2-completeness-report data across N creators and emits a
// side-by-side comparison table. Used in Phase 8 to demonstrate that
// 7 creators × 4 archetypes all clear agency-premium bars.

import { spawnSync } from 'node:child_process';
import path from 'node:path';

interface PerCreatorStatus {
  runId: string;
  creator: string;
  archetype: string;
  voiceMode: string;
  layersGreen: string;        // e.g. "7/7"
  verificationRate: string;   // e.g. "94%"
  workshopAvgRelevance: string;
  workshopHardFails: string;  // 0 or count
  thirdPersonLeaks: string;   // 0 or count
  voiceModeViolations: string;// 0 or count
}

async function main() {
  const runIds = process.argv.slice(2);
  if (runIds.length === 0) {
    throw new Error('Usage: tsx ./src/scripts/v2-cohort-report.ts <runId-1> ... <runId-N>');
  }

  const results: PerCreatorStatus[] = [];
  for (const runId of runIds) {
    console.info(`[cohort] processing ${runId}…`);
    // Run completeness + voice-mode + leak validators, capture outputs
    const completeness = spawnSync(
      'tsx', [path.join(__dirname, 'v2-completeness-report.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );
    const voiceMode = spawnSync(
      'tsx', [path.join(__dirname, 'check-voice-mode.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );
    const leak = spawnSync(
      'tsx', [path.join(__dirname, 'check-third-person-leak.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );
    const workshops = spawnSync(
      'tsx', [path.join(__dirname, 'validate-workshops.ts'), runId],
      { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 },
    );

    // Parse machine-readable METRIC lines emitted by each validator. The
    // validators print `[<tag>] METRIC <key>=<value>` lines for stable parsing.
    // (See `--metric-line` flag in each validator — Task 8.10 also tweaks
    // the existing validators to emit these.)
    const all = [completeness.stdout, voiceMode.stdout, leak.stdout, workshops.stdout].join('\n');

    function metric(key: string, fallback: string): string {
      const re = new RegExp(`METRIC ${key}=(\\S+)`);
      const m = all.match(re);
      return m ? m[1]! : fallback;
    }

    results.push({
      runId,
      creator: metric('creator', '?'),
      archetype: metric('archetype', '?'),
      voiceMode: metric('voice_mode', '?'),
      layersGreen: metric('layers_green', '?'),
      verificationRate: metric('verification_rate', '?') + '%',
      workshopAvgRelevance: metric('workshop_avg_relevance', '?'),
      workshopHardFails: metric('workshop_hard_fails', '?'),
      thirdPersonLeaks: metric('third_person_leaks', '?'),
      voiceModeViolations: metric('voice_mode_violations', '?'),
    });
  }

  // Render comparison table
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log(`  v2 Cohort Report — ${runIds.length} creators`);
  console.log('═══════════════════════════════════════════════════════════════════════════\n');
  for (const r of results) {
    console.log(`  ${r.creator.padEnd(20)} ${r.archetype.padEnd(22)} ${r.voiceMode}`);
    console.log(`    layers:           ${r.layersGreen}`);
    console.log(`    verification:     ${r.verificationRate}`);
    console.log(`    workshop avg rel: ${r.workshopAvgRelevance}`);
    console.log(`    workshop fails:   ${r.workshopHardFails}`);
    console.log(`    3rd-person leaks: ${r.thirdPersonLeaks}`);
    console.log(`    voice-mode viols: ${r.voiceModeViolations}`);
    console.log('');
  }
  console.log('═══════════════════════════════════════════════════════════════════════════');

  // Aggregate pass criteria
  const allGreen = results.every((r) =>
    r.layersGreen === '7/7' &&
    parseFloat(r.verificationRate) >= 95 &&
    parseFloat(r.workshopAvgRelevance) >= 90 &&
    r.workshopHardFails === '0' &&
    r.thirdPersonLeaks === '0' &&
    r.voiceModeViolations === '0',
  );
  console.log(`Aggregate: ${allGreen ? '✓ ALL CREATORS PASS AGENCY-PREMIUM BARS' : '✗ One or more creators fall short'}`);

  // Delta from Phase 7 baseline (verification rate was 84-90%; aggregate audit grade was 7.2/10).
  const verificationRates = results.map((r) => parseFloat(r.verificationRate));
  const avgVerification = verificationRates.reduce((a, b) => a + b, 0) / verificationRates.length;
  const phase7Baseline = 87;  // mean of Jordan 87 / Walker 84 / Hormozi 90 from Phase 7 results.
  const delta = avgVerification - phase7Baseline;
  console.log(`Verification rate: ${avgVerification.toFixed(1)}% (Phase 7 baseline: ${phase7Baseline}%, delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}pp)`);
  console.log('');
}

main().catch((err) => {
  console.error('[cohort] FAILED', err);
  process.exit(1);
});
```

- [ ] **Step 1.5: Add METRIC lines to existing validators (so cohort report can parse stable)**

Each existing validator (`v2-completeness-report.ts`, `check-third-person-leak.ts`, `check-voice-mode.ts`, `validate-workshops.ts`) gets a single new `console.info` line at the end emitting machine-readable metrics. Format: `[<tag>] METRIC <key>=<value>`.

For `v2-completeness-report.ts`, add at the end of `main()`:

```ts
console.info(`[completeness] METRIC creator=${(cp?.creatorName ?? '?').replace(/\s+/g, '_')}`);
console.info(`[completeness] METRIC archetype=${cp?._index_archetype ?? '?'}`);
console.info(`[completeness] METRIC layers_green=${layersGreen}/${layersTotal}`);
console.info(`[completeness] METRIC verification_rate=${Math.round(verificationRate * 100)}`);
```

For `check-third-person-leak.ts`, add at the end of `main()`:

```ts
console.info(`[3p-leak] METRIC third_person_leaks=${leaks.length}`);
```

For `check-voice-mode.ts`, add at the end of `main()`:

```ts
console.info(`[voice-mode] METRIC voice_mode=${voiceMode}`);
console.info(`[voice-mode] METRIC voice_mode_violations=${violations.length}`);
```

For `validate-workshops.ts`, add at the end of `main()`:

```ts
console.info(`[workshops] METRIC workshop_avg_relevance=${avgRelevance.toFixed(1)}`);
console.info(`[workshops] METRIC workshop_hard_fails=${hardFails.length}`);
```

(Variable names like `verificationRate`, `hardFails` should match what each script already computes — verify by grep before adding.)

- [ ] **Step 2: Typecheck + commit**

```bash
cd packages/pipeline && npx tsc --noEmit
cd ../..
git add packages/pipeline/src/scripts/v2-cohort-report.ts \
  packages/pipeline/src/scripts/v2-completeness-report.ts \
  packages/pipeline/src/scripts/check-third-person-leak.ts \
  packages/pipeline/src/scripts/check-voice-mode.ts \
  packages/pipeline/src/scripts/validate-workshops.ts
git commit -m "feat(phase-8): cohort report + METRIC lines for stable cross-validator parsing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.11: New-creator onboarding wrapper (uses existing manual upload helper)

**Files:**
- Create: `packages/pipeline/src/scripts/seed-creator-batch.ts`

**Why:** The existing `seed-hormozi-and-dispatch.ts` takes a directory of MP4 files and uploads them via the manual-upload pipeline. It does NOT fetch from YouTube by handle. Phase 8's onboarding workflow uses this manual MP4 path; YouTube fetching is **out of scope for Phase 8** (scoped to Phase 9).

The new wrapper accepts the same shape as `seed-hormozi-and-dispatch` plus a `--voice-mode` flag, then chains the dispatch to call `seed-audit-v2.ts` with the new flag.

- [ ] **Step 1: Read the existing helper to confirm CLI shape**

```bash
cd packages/pipeline
head -80 src/scripts/seed-hormozi-and-dispatch.ts
```

Confirmed CLI shape: `--dir <path>`, `--workspaceId <id>`, `--userId <id>`, `--channelId <id>`, `--projectTitle <title>`, `[--dispatch]`. Takes a directory of MP4 files.

- [ ] **Step 2: Operator pre-step (one-time per creator) — download MP4s**

For each Phase 8 creator, the operator must download MP4s to a local directory before this script runs. Recommended tool: `yt-dlp` (operator runs locally, not in this script). Example for Naval:

```bash
mkdir -p "$HOME/Downloads/yt/naval"
yt-dlp -f "best[height<=720]" -o "$HOME/Downloads/yt/naval/%(title)s.%(ext)s" \
  "https://www.youtube.com/playlist?list=PLEHSnxAAhxECBOYUtznvjnURWbQiZ4LbS"
```

This is operator-side work, not part of the script.

- [ ] **Step 3: Implement seed-creator-batch.ts as a wrapper around the existing helper**

```ts
// packages/pipeline/src/scripts/seed-creator-batch.ts
//
// Phase 8 onboarding wrapper. Wraps seed-hormozi-and-dispatch with a
// --voice-mode flag and ensures the resulting v2 audit run inherits the
// archetype's voice mode default (or the explicit override).
//
// Usage:
//   tsx ./src/scripts/seed-creator-batch.ts \
//     --dir "C:\\path\\to\\creator-mp4s" \
//     --workspaceId <id> --userId <id> --channelId <id> \
//     --projectTitle "Creator Name — Hub Title" \
//     --archetype contemplative-thinker \
//     --voice-mode hybrid
//
// (The existing helper handles MP4 upload + project/run creation. This
// wrapper adds voice-mode propagation + archetype hint.)

import { spawnSync } from 'node:child_process';
import path from 'node:path';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

const dir = arg('--dir');
const workspaceId = arg('--workspaceId');
const userId = arg('--userId');
const channelId = arg('--channelId');
const projectTitle = arg('--projectTitle');
const voiceMode = arg('--voice-mode');
// archetype is informational; the channel-profile generator detects it
// from segments. We log it for traceability.
const archetype = arg('--archetype');

if (!dir || !workspaceId || !userId || !channelId || !projectTitle) {
  console.error('Usage: tsx ./src/scripts/seed-creator-batch.ts --dir <path> --workspaceId <id> --userId <id> --channelId <id> --projectTitle <title> [--archetype <slug>] [--voice-mode <mode>]');
  process.exit(1);
}

console.info(`[seed-creator-batch] starting onboarding for ${projectTitle}`);
if (archetype) console.info(`[seed-creator-batch] archetype hint: ${archetype}`);
if (voiceMode) console.info(`[seed-creator-batch] voiceMode: ${voiceMode}`);

// Step 1: upload + create run via existing helper (without --dispatch yet)
const helperPath = path.join(__dirname, 'seed-hormozi-and-dispatch.ts');
const helperResult = spawnSync(
  'tsx',
  [helperPath, '--dir', dir, '--workspaceId', workspaceId, '--userId', userId, '--channelId', channelId, '--projectTitle', projectTitle],
  { stdio: 'inherit' },
);
if (helperResult.status !== 0) {
  console.error('[seed-creator-batch] helper failed; aborting');
  process.exit(helperResult.status ?? 1);
}

// Step 2: parse runId from helper's stdout. If helper doesn't expose it
// programmatically, the operator copies it from the prior step's output
// and re-runs seed-audit-v2 manually with --voice-mode.
console.info('[seed-creator-batch] helper completed.');
console.info('[seed-creator-batch] To dispatch v2 audit with the configured voice mode, run:');
console.info(`  tsx ./src/scripts/seed-audit-v2.ts <runId> ${voiceMode ? `--voice-mode ${voiceMode}` : ''}`);
console.info('(Replace <runId> with the runId printed by the helper above.)');
```

This is pragmatic: the wrapper handles upload + project/run creation, then prints the next command for the operator to run with the explicit voiceMode flag. Manual but reliable.

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/pipeline && npx tsc --noEmit
cd ../..
git add packages/pipeline/src/scripts/seed-creator-batch.ts
git commit -m "feat(phase-8): seed-creator-batch wrapper around manual-upload helper + voice-mode propagation

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

**SCOPE NOTE:** Automated YouTube channel fetch + transcribe is OUT OF SCOPE for Phase 8 — moved to Phase 9. The 4 new creators will be onboarded via downloaded MP4s + the existing manual-upload pipeline.

**SCALE NOTE:** Original plan called for 30 Nippard videos to stress-test scale. Reduced to **15 Nippard videos** to keep the operator's manual-download burden reasonable (15 × ~10 min videos = ~2.5 hours of download + ~75 min of pipeline run). 15 videos is sufficient to validate scale assumptions; we don't need to prove 30 works in Phase 8.

---

## Task 8.12: Schema spec + builder handoff doc updates

**Files:**
- Modify: `docs/superpowers/specs/2026-05-01-hub-source-document-schema.md`
- Modify: `docs/builder-handoff/hub-source-document-format.md`

**Why:** Phase 8 adds a new field to the Hub Source Document contract (`_index_voice_mode`). Both contract documents need updates so future implementations + builders know about it.

- [ ] **Step 1: Update schema spec**

In `docs/superpowers/specs/2026-05-01-hub-source-document-schema.md`, find the `ChannelProfile_v2` interface. Add this field at the end of the `_INDEX` section (just before the closing brace):

```markdown
### `_index_voice_mode` (Phase 8+)

Voice register for body fields produced by the audit pipeline. Defaults from
`_index_archetype` if not set:

- `operator-coach` + `instructional-craft` → `'first_person'`
- `science-explainer` → `'third_person_editorial'`
- `contemplative-thinker` → `'hybrid'`
- `_DEFAULT` → `'first_person'`

\```ts
type VoiceMode = 'first_person' | 'third_person_editorial' | 'hybrid';

interface ChannelProfile_v2 {
  // ... existing fields ...
  /** Voice register for body fields. Phase 8+. */
  _index_voice_mode: VoiceMode;
}
\```

(replace the \``` with triple backticks)
```

- [ ] **Step 2: Update builder handoff**

In `docs/builder-handoff/hub-source-document-format.md`, find the section on Channel profile rendering. Add this paragraph:

```markdown
## Voice mode (Phase 8+)

`channelProfile._index_voice_mode` declares the register the audit's body
fields were written in. Builders should respect this when generating
wrapper copy (callouts, summaries, hover tooltips, suggested questions):

- `'first_person'`: Match the body's first-person register. Wrapper copy
  reads as if the creator wrote it.
- `'third_person_editorial'`: Stay in third-person editorial register.
  Quote the creator directly when needed; never paraphrase as the creator.
- `'hybrid'`: Default to third-person framing; first-person aphorisms
  should remain in blockquote markdown.

If `_index_voice_mode` is missing, treat as `'first_person'` (Phase 5/7 default).
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-01-hub-source-document-schema.md docs/builder-handoff/hub-source-document-format.md
git commit -m "docs(phase-8): schema + builder handoff updated with _index_voice_mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8.13: Backfill all 7 creators + final cohort report

**Files:**
- (no new code; orchestration only)
- Create at end: `docs/superpowers/plans/2026-05-01-phase-8-results.md`

**Why:** Phase 8's success criterion is "7 creators pass agency-premium bars." This task runs the pipeline against all 7 (3 existing + 4 new) and aggregates results.

- [ ] **Step 0: Snapshot existing v2 state (rollback safety)**

Before any regen, snapshot the existing canon + brief payloads so we can restore Phase 7 state if Phase 8 regresses:

```bash
cd packages/pipeline
mkdir -p /tmp/phase7-backup
for runId in a8a05629-d400-4f71-a231-99614615521c \
             cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce \
             037458ae-1439-4e56-a8da-aa967f2f5e1b; do
  npx tsx ./src/scripts/inspect-audit-state.ts $runId > /tmp/phase7-backup/$runId.json
  echo "snapshotted $runId"
done
```

If Phase 8 regresses, the operator can restore from these JSON snapshots via the inspect-audit-state script's reverse mode (or by direct DB write).

- [ ] **Step 1a: Walker spike test (HIGHEST RISK — do this BEFORE full regen)**

Phase 8's biggest experiment is converting Walker from `first_person` to `third_person_editorial`. If the new mode produces stilted Wikipedia voice, we discover that BEFORE we regen all of Walker's bodies. Spike test on a single canon body first:

```bash
# Pick the SHORTEST canon node from Walker's audit (smallest test-batch size).
# Look at the audit page — pick a definition or aha_moment with minimal body.
# Then regen JUST that one body with --voice-mode third_person_editorial:
npx tsx ./src/scripts/seed-audit-v2.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce \
  --regen-bodies --regen-evidence \
  --voice-mode third_person_editorial \
  --canon-id-only <pick-one-canon-id-from-walker>
```

(Note: `--canon-id-only` doesn't exist yet. If the implementer wants this fast-fail capability, add a 1-step `--canon-id-only <id>` flag to seed-audit-v2 that filters Stage 5's body regen to a single canon. Otherwise: regen all and read 2-3 random outputs.)

Read 2-3 of the resulting bodies. Ask:
- Does it sound like a Stripe Press article? (good)
- Does it sound like a Wikipedia summary? (BAD — iterate prompt with explicit good/bad examples before continuing)

**If the spike fails, iterate the `voiceRulesPrompt` for `third_person_editorial`** with explicit good examples (paste 2-3 paragraphs of actual Stripe Press / Patagonia editorial) BEFORE proceeding to Step 1b. Don't waste the full Walker regen on a bad prompt.

- [ ] **Step 1b: Re-run Jordan / Walker / Hormozi with new prompts (full)**

```bash
cd packages/pipeline

# Jordan (operator-coach × first_person — voice mode unchanged; just regen bodies + evidence)
npx tsx ./src/scripts/seed-audit-v2.ts a8a05629-d400-4f71-a231-99614615521c \
  --regen-bodies --regen-evidence

# Walker (science-explainer; voice mode CHANGES first_person → third_person_editorial)
npx tsx ./src/scripts/seed-audit-v2.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce \
  --regen-channel --regen-bodies --regen-evidence \
  --voice-mode third_person_editorial

# Hormozi (operator-coach × first_person — voice mode unchanged; just regen bodies + evidence)
npx tsx ./src/scripts/seed-audit-v2.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b \
  --regen-bodies --regen-evidence
```

Expected: 30-45 min per creator (canon body regen is the expensive stage). Total: ~1.5-2 hours.

**Pre-step for steps 2-5: download MP4s + create channel rows**

For each new creator, the operator first:

1. **Downloads MP4s locally** (use `yt-dlp` — runs on operator's machine, NOT in the script):
   ```bash
   yt-dlp -f "best[height<=720]" -o "$HOME/Downloads/yt/<creator>/%(title)s.%(ext)s" \
     <youtube-channel-or-playlist-url>
   ```

2. **Creates a channel row** in the DB for the new creator. Use the existing inspect-workspace-state.ts to find the user's workspaceId, then create a manual_upload channel via SQL or via the existing `seed-hormozi-and-dispatch` pattern.

3. **Runs the seed-creator-batch wrapper** (new in Task 8.11) pointing at the local MP4 directory.

- [ ] **Step 2: Onboard Naval (contemplative-thinker × hybrid)** — 8 videos

```bash
# After downloading 8 of his "How to Get Rich" series clips:
cd packages/pipeline
npx tsx ./src/scripts/seed-creator-batch.ts \
  --dir "$HOME/Downloads/yt/naval" \
  --workspaceId <workspaceId> \
  --userId <userId> \
  --channelId <newly-created-naval-channelId> \
  --projectTitle "Naval Ravikant — Wealth & Clear Thinking" \
  --archetype contemplative-thinker \
  --voice-mode hybrid
```

Then run the printed `seed-audit-v2.ts <runId> --voice-mode hybrid` command.

Expected: 30-45 min for full pipeline run.

- [ ] **Step 3: Onboard Jeff Nippard (instructional-craft × first_person)** — **15 videos** (reduced from 30 to keep manual download burden manageable; still validates scale)

```bash
# After downloading 15 of his most-recent fitness/training videos:
npx tsx ./src/scripts/seed-creator-batch.ts \
  --dir "$HOME/Downloads/yt/nippard" \
  --workspaceId <workspaceId> \
  --userId <userId> \
  --channelId <newly-created-nippard-channelId> \
  --projectTitle "Jeff Nippard — Strength Training Science" \
  --archetype instructional-craft \
  --voice-mode first_person
```

Expected: 60-80 min. 15 videos = ~75 canon nodes, ~300 evidence entries, ~20 workshop clips.

- [ ] **Step 4: Onboard Codie Sanchez (operator-coach × first_person)** — 10 videos

```bash
npx tsx ./src/scripts/seed-creator-batch.ts \
  --dir "$HOME/Downloads/yt/codie" \
  --workspaceId <workspaceId> \
  --userId <userId> \
  --channelId <newly-created-codie-channelId> \
  --projectTitle "Codie Sanchez — Buying Boring Businesses" \
  --archetype operator-coach \
  --voice-mode first_person
```

Expected: 35-50 min.

- [ ] **Step 5: Onboard Veritasium (science-explainer × third_person_editorial)** — 10 videos

```bash
npx tsx ./src/scripts/seed-creator-batch.ts \
  --dir "$HOME/Downloads/yt/veritasium" \
  --workspaceId <workspaceId> \
  --userId <userId> \
  --channelId <newly-created-veritasium-channelId> \
  --projectTitle "Veritasium — Counterintuitive Physics" \
  --archetype science-explainer \
  --voice-mode third_person_editorial
```

Expected: 35-50 min.

**TOTAL onboarding work for new creators:** ~3-4 hours of operator-side MP4 downloads + ~3-4 hours of pipeline execution. Realistic but a real time investment.

- [ ] **Step 6: Run all validators on each of 7 creators**

For each runId, run:

```bash
npx tsx ./src/scripts/v2-completeness-report.ts <runId>
npx tsx ./src/scripts/check-third-person-leak.ts <runId>
npx tsx ./src/scripts/check-voice-mode.ts <runId>
npx tsx ./src/scripts/validate-evidence-registry.ts <runId>
npx tsx ./src/scripts/validate-workshops.ts <runId>
```

Expected: every validator returns 0 hard-fails. Verification rates ≥ 95% per creator.

- [ ] **Step 7: Run cohort report**

```bash
npx tsx ./src/scripts/v2-cohort-report.ts \
  a8a05629-d400-4f71-a231-99614615521c \
  cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce \
  037458ae-1439-4e56-a8da-aa967f2f5e1b \
  <naval-runId> <nippard-runId> <codie-runId> <veritasium-runId>
```

Expected: aggregate "✓ ALL CREATORS PASS AGENCY-PREMIUM BARS".

- [ ] **Step 8: Spot-check rendering for each creator on the audit page**

For each of the 7 creators, visit the audit URL in the browser and verify:
- Completeness banner shows 7/7 (or 9/9 if banner is updated to show new layers)
- 3-5 evidence chip popovers render with role + score + supportingPhrase
- Workshop section shows stages with expandable clips
- For Walker specifically: confirm the body NOW reads as third-person editorial (vs Phase 7's first-person leakage)

- [ ] **Step 9: Write Phase 8 results doc**

Create `docs/superpowers/plans/2026-05-01-phase-8-results.md`. Mirror the Phase 7 results doc shape:

- Commit list
- Per-creator results table (verification rate, voice mode, workshop count, hard-fail count)
- Quality bar 1-10 pass evidence
- Aggregate cohort score (target 9.1+/10)
- STOP gate URLs

- [ ] **Step 10: Commit results doc**

```bash
git add docs/superpowers/plans/2026-05-01-phase-8-results.md
git commit -m "docs(phase-8): cohort backfill results + STOP gate

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-review checklist (run after writing this plan)

1. **Spec coverage:** Every spec section is mapped:
   - voiceMode field → Tasks 8.3 (module), 8.8 (wiring), 8.12 (docs)
   - 4 body writers → Tasks 8.4 (canon), 8.5 (synthesis), 8.6 (journey), 8.7 (brief)
   - Codex truncation fix → Tasks 8.1 (json-repair), 8.2 (tagger integration)
   - Body length floors → Task 8.4 (canon-body-writer minWordCount)
   - Voice-mode validator → Task 8.9
   - Cross-archetype validation → Tasks 8.11 (helper), 8.13 (orchestration)
   - Cohort report → Task 8.10
   - Schema + handoff docs → Task 8.12
   - Phase 8 results doc → Task 8.13 step 9
   ✓ Complete coverage

2. **Placeholder check:** No "TBD" / "TODO" / "implement later". The synthesis-body-writer + journey + brief tasks (8.5-8.7) ARE briefer because the pattern from 8.4 fully covers their work — copy-paste with the file/type names changed.

3. **Type consistency:** `VoiceMode`, `defaultVoiceMode`, `voiceRulesPrompt`, `hasFirstPersonMarkers`, `hasThirdPersonAttribution` are all defined in 8.3 and consistently used in 8.4-8.9. CanonBodyInput/SynthesisBodyInput/PhaseBodyInput/BriefBodyInput each get a `voiceMode: VoiceMode` field — same field name everywhere.

---

**Quality bar — Phase 8 done means:**
- 7 creators all pass cohort report aggregate ✓
- Verification rate 95%+ across all 7
- Walker body reads as third-person editorial (the qualitative test)
- Naval body works in hybrid register (the qualitative test)
- Nippard scale test (30 videos) completes without timeout/failure
- 0 voice-mode validator violations across all 7
- 0 third-person leaks across all 7
- 0 workshop hard-fails across all 7

If any of those miss, iterate before claiming Phase 8 done.

---

## Pre-implementation hard audit (revisions applied 2026-05-01)

After writing the original plan, ran an adversarial pre-implementation audit. Found 7 issues; all addressed inline:

**Critical (would break implementation):**
- **C1: Task 8.11 wrapper assumed YouTube channel fetch.** The existing `seed-hormozi-and-dispatch.ts` actually takes a directory of MP4 files (manual upload path), not a YouTube handle. Replaced 8.11 with `seed-creator-batch.ts` — a wrapper around the manual upload helper. Documented operator pre-step (download MP4s with `yt-dlp` locally first). Pulled YouTube channel fetch out of scope → Phase 9.
- **C2: voice-mode `hasFirstPersonMarkers` regex was too aggressive.** Original regex matched `we|us|our` which would falsely flag editorial third-person ("we as a field," "our understanding"). Narrowed to `I|my` only.
- **C3: Cohort report regex parsing was fragile.** Replaced ad-hoc stdout regex with stable `METRIC <key>=<value>` lines emitted by each validator. Added Task 8.10 sub-step to add METRIC lines to existing validators.

**Important (would degrade quality):**
- **I1: Body length floor lift could spin retry-on-failure forever on thin Naval-style content.** Added Step 3.5 to Task 8.4: graceful degradation — accept under-length body after retries exhaust + log warning, instead of all-degraded fallback.
- **I2: Walker's voice-mode change is the highest-risk experiment.** Added Step 1a to Task 8.13: spike-test ONE Walker canon body with the new prompt BEFORE doing full regen. Iterate prompt with explicit good examples if voice reads as Wikipedia-stilted.
- **I3: Nippard 30-video scale test is too aggressive for manual download.** Reduced to 15 videos. Still validates scale assumptions without forcing 30 manual downloads.
- **I4: Hybrid voice mode under-defined.** Added concrete 200-word example structure to `voiceRulesPrompt('hybrid')` — third-person framing + blockquoted first-person aphorism slots. Codex now has a shape to copy.

**Minor (cosmetic):**
- **M1: Tasks 8.5/8.6/8.7 originally referenced "same pattern as 8.4" without inlining the import + type changes.** Inlined explicitly per writing-plans skill discipline.
- **M2: No rollback plan for Phase 7 baseline if regen regresses.** Added Step 0 to Task 8.13: snapshot existing v2 payloads to /tmp before regen.
- **M3: Cohort report could mark "FAIL" on substantial-but-incomplete progress.** Added delta-from-baseline reporting so 87% → 92% reads as "+5pp progress" even if the 95% absolute bar isn't yet hit.

**Plan grade after fixes:** 7.5 → 9.0 (estimated). Implementation should now land Phase 8 at the targeted 9+/10 audit quality with realistic operator workload.
