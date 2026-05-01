# Phase 8 — Audit Quality Lift (7.2 → 9+) Design

**Status:** Design spec. Brainstormed 2026-05-01.
**Schema impact:** Extends Hub Source Document v2 (no v3 bump).
**Predecessor:** [Phase 5 + 7 shipped to main as commit `4ae47bf`](https://github.com/mariosdem2008/CreatorCanon/commit/4ae47bf63e842def8a972704c31d42e87441d5e8). Audit graded 7.2/10 agency-MVP. Phase 8 lifts to 9+ agency-premium.

---

## Goals

Take the v2 audit pipeline from agency-MVP (7.2/10) to agency-premium (9+/10) by addressing the four specific quality gaps surfaced by the post-Phase-7 audit:

1. **Citation precision (bar 5):** raise verification rate from 84-90% to ≥ 95% across all creators.
2. **Voice register flexibility:** make first-person vs third-person editorial a creator-level setting tied to archetype, instead of hard-coded first-person.
3. **Body depth (bar 3):** raise type-aware minimum word counts so even the thinnest body reads paywall-quality.
4. **Cross-archetype + scale validation:** prove the pipeline holds at 7 creators × 4 archetypes × thin-to-thick content shapes.

Success means: any of the 7 test creators' audits could ship to a paying agency client with under 30 minutes of human review per hub (vs the current 2-3 hours of citation triage + body-length judgment).

---

## Non-goals

- **Reproducibility seeds.** Codex CLI doesn't support deterministic generation. Adding it requires switching LLM providers (or proxying through Anthropic's API with `seed` param). Defer to Phase 9.
- **Schema version bump (v3).** Phase 8 is purely additive to v2.
- **Builder phase.** Phase 8 polishes the audit output; the builder service (which consumes `Copy Hub Source` JSON) is a separate phase.
- **YouTube ingestion overhaul.** We use the existing `seed-hormozi-and-dispatch` style ingestion path for the 4 new creators. Any improvements to ingestion are out of scope.
- **Per-claim semantic verification.** "Does this clip actually teach the step it claims to" is a Phase 9+ check (would need an LLM-graded second pass).

---

## Quality bars (raised from Phase 7)

| Bar | Phase 7 target | Phase 8 target | How measured |
|---|---|---|---|
| 1. Read-aloud bodies sound like creator | ✓ green | ✓ + verified by 3-creator-domain-knowledgeable reader | Random-sample 5 bodies × 7 creators; reader rates 1-10; aggregate ≥ 8.5 |
| 2. Hero candidates billboard-worthy | ✓ green | ✓ green | Hero re-pass score ≥ 7/10 across all 5 candidates |
| 3. Thinnest body paywall-worthy | type-min ≥ 200-500w | **type-min ≥ 250-800w** | Definition 250+, principle 500+, framework 700+, playbook 800+ |
| 4. Completeness | 7 layers green | 7 layers green | Banner shows 7/7 |
| 5. Evidence verification rate | ≥ 90% (target) / 84-90% (actual) | **≥ 95%** | `validate-evidence-registry` aggregate across all entities |
| 6. Workshop avg clip relevance | ≥ 90 | ≥ 90 | `validate-workshops` |
| 7. Workshop clip duration | 30-180s | 30-180s | `validate-workshops` |
| 8. Workshop completeness | every phase yields stage | every phase yields stage | `validate-workshops` |
| **9 NEW** | — | **Voice mode adherence** | Body voice matches `_index_voice_mode`; no first-person leakage in third-person bodies and vice versa | New validator |
| **10 NEW** | — | **Cross-archetype + scale baseline** | All 7 creators (3 existing + 4 new) pass bars 1-9 | Per-creator validator runs |

---

## Schema additions

### `ChannelProfile_v2._index_voice_mode`

```ts
type VoiceMode = 'first_person' | 'third_person_editorial' | 'hybrid';

interface ChannelProfile_v2 {
  // ... existing fields ...

  /** Voice register for body fields. Phase 8+. Defaults from archetype:
   *  - operator-coach + instructional-craft → 'first_person'
   *  - science-explainer → 'third_person_editorial'
   *  - contemplative-thinker → 'hybrid' (first-person aphorisms inside
   *    third-person framing)
   *  - _DEFAULT → 'first_person'
   *
   *  Operator can override via --voice-mode flag on seed-audit-v2.
   *
   *  Audits without this field default to 'first_person' (Phase 5/7 default).
   *  No migration needed — additive. */
  _index_voice_mode: VoiceMode;
}
```

### Voice mode behavior per body writer

The 4 body writers (canon-body, synthesis-body, journey-body, brief-body) all read `_index_voice_mode` from the channel profile and adapt their prompts:

**`first_person`** (Phase 5/7 default — unchanged):
- Body writer says "you are <creatorName>, writing a chapter of your knowledge hub"
- "First-person only. NEVER 'the creator', 'she/he says', 'in this video'"

**`third_person_editorial`** (NEW):
- Body writer says "you are an editor producing the definitive reference page on <topic> drawn from <creatorName>'s research"
- Voice rules: "Third-person editorial. Subject of every sentence is the topic, not <creatorName>. <creatorName>'s claims are evidence, not voice. NEVER 'I', 'my', 'we' — except inside a directly quoted block."
- Citations may quote the creator: "As Walker notes, '...'" — but body proper stays in editorial register.

**`hybrid`** (NEW):
- Mixed register. Default is third-person editorial; aphoristic insertions / direct quotes use first-person.
- "Naval-style" output: editorial framing introduces the concept, then a first-person aphorism delivers the punch.
- Body writer gets two sub-prompts: structure in third-person, then 1-3 first-person aphorism slots filled in.

---

## Implementation surface

### Files to modify (existing)

```
packages/pipeline/src/scripts/seed-audit-v2.ts
  ← read --voice-mode flag, pass to channel-profile generator
  ← read profile._index_voice_mode after channel profile lands
  ← pass voiceMode as a TOP-LEVEL field on every body writer's input
    (NOT nested inside VoiceFingerprint — voice mode is structural;
    fingerprint is stylistic. They're orthogonal concerns.)

packages/pipeline/src/scripts/util/canon-body-writer.ts
  ← buildBodyPrompt branches on voiceMode
  ← minWordCount() bumped per type (definition 250, principle 500, framework 700, playbook 800)

packages/pipeline/src/scripts/util/synthesis-body-writer.ts
  ← buildBodyPrompt branches on voiceMode
  ← min-words gate raised

packages/pipeline/src/scripts/util/journey-body-writer.ts
  ← phase body prompt branches on voiceMode

packages/pipeline/src/scripts/util/brief-body-writer.ts
  ← buildBriefBodyPrompt branches on voiceMode

packages/pipeline/src/scripts/util/evidence-tagger.ts
  ← supportingPhrase target tightened (10-25 words; specific examples added)
  ← parser handles truncated JSON (try-parse → if fails, try last-complete-object)

packages/pipeline/src/scripts/util/codex-runner.ts (POSSIBLY)
  ← if Codex truncation is consistently at the same boundary, may need stdout buffering/retry adjustments
```

### Files to create (new)

```
packages/pipeline/src/scripts/check-voice-mode.ts
  ← new validator: scans rendered fields against the channel's _index_voice_mode
  ← hard-fails first-person markers in third-person bodies
  ← hard-fails third-person markers in first-person bodies

packages/pipeline/src/scripts/util/json-repair.ts
  ← truncated-JSON repair helper used by evidence-tagger + any future LLM JSON parser
  ← tries: full parse → trim trailing partial → parse → drop last array element → parse → drop last object value → parse
```

### Files to delete

None.

### Test fixtures

4 new creator audits as on-disk fixtures + scripted ingestion. Documented in [`Cross-archetype creators`](#cross-archetype-creators).

---

## Cross-archetype creators

7 total creators tested in Phase 8. Existing 3 (Jordan/Walker/Hormozi) get re-run with new prompts + voice modes; 4 new get full pipeline runs.

### 1. Naval Ravikant — `contemplative-thinker` archetype, `hybrid` voiceMode
- Domain: wealth philosophy / clear thinking
- Source: 6-10 of his "How to Get Rich" series + selected interview clips
- Stress test: thin/aphoristic content, hybrid voice, paywall-grade body extraction from sparse material
- Channel/source: search "Naval Ravikant How to Get Rich" — 13-part series ~10-15 min each on YouTube

### 2. Jeff Nippard — `instructional-craft` archetype (lean toward `science-explainer` blend), `first_person` voiceMode
- Domain: fitness / strength training science
- Source: 30 videos pulled from his ~300-video archive
- Stress test: scale (30 videos = ~150 canon, ~600 evidence entries, ~25 workshop clips), domain-specific terminology (RPE, hypertrophy, periodization)
- Channel: youtube.com/@JeffNippard

### 3. Codie Sanchez — `operator-coach` archetype, `first_person` voiceMode
- Domain: small business buying / boring businesses / M&A
- Source: 8-12 videos covering buying playbook, financing, deal structure
- Stress test: operator-coach archetype in non-tech domain; validates that voice fingerprint extends beyond AI/agency space
- Channel: youtube.com/@CodieSanchezCT

### 4. Veritasium (Derek Muller) — `science-explainer` archetype, `third_person_editorial` voiceMode
- Domain: physics / engineering / counterintuitive science
- Source: 8-12 of his most-watched solo explanation videos
- Stress test: third-person editorial voice (the new mode), pure science-explainer with high-production demonstrative content
- Channel: youtube.com/@veritasium

### Existing 3 (re-run with new prompts)

5. **Jordan Platten** — operator-coach × first_person (unchanged voice mode)
6. **Matt Walker** — science-explainer × `third_person_editorial` (CHANGED from Phase 7's first_person)
7. **Alex Hormozi** — operator-coach × first_person (unchanged voice mode)

The Walker re-run is the most interesting — it tests whether Phase 8's third-person editorial mode actually produces better output than Phase 7's first-person Walker (where "Sleep is a structured biological event" already read as third-person despite being in a first-person mode — which is a sign that Walker's content naturally resists first-person).

---

## Codex truncation fix — detailed approach

### Diagnosis

Codex CLI intermittently truncates response strings at token boundaries. Affects ~5-10% of evidence-tagger calls. Failure mode:
```
"supportingPhrase": "teeth cleaning being a very low friction, under $100, first time appointmen
                                                                                          ^^^ truncated mid-word
```
The truncated phrase is not a substring of segment text → quality gate fails → all 3 retries hit the same truncation → degraded fallback fires (correct, but produces an `unsupported` entry that depresses verification rate).

### Two-pronged fix

**Prong 1: Tighten the prompt to prefer shorter supportingPhrases.**

Current evidence-tagger prompt asks for "a literal substring of the segment text" with no length guidance. Codex picks long phrases that hit the truncation boundary.

New prompt addition:
```
# supportingPhrase length rule
Pick a 10-25 word substring. NOT the whole segment. NOT a single word.
The phrase should be the TIGHTEST verbatim chunk that supports the cited claim.
Avoid phrases ending mid-sentence — pick complete clauses where possible.

✓ GOOD: "the mistake I made was niching too early" (8 words, complete clause)
✓ GOOD: "we want to make sure that we're going for clients that are high demand" (14 words, complete clause)
✗ BAD: "we ran 100 prospects every single day for six weeks straight, and what we found was that the conversion rate" (26 words — too long)
✗ BAD: "the mistake" (2 words — not enough context)
```

**Prong 2: JSON repair parser.**

`packages/pipeline/src/scripts/util/json-repair.ts` — fallback for truncated Codex JSON. Strategy:

```ts
export function repairTruncatedJson(raw: string): unknown | null {
  // Try 1: full parse
  try { return JSON.parse(raw); } catch { /* fall through */ }

  // Try 2: trim trailing whitespace + dangling commas + reattempt
  let trimmed = raw.trim().replace(/,\s*$/, '');
  try { return JSON.parse(trimmed); } catch { /* fall through */ }

  // Try 3: locate last complete top-level object/array boundary, drop everything after
  // (use bracket counting to find the last closing brace/bracket that balances depth-0)
  const lastClose = findLastBalancedClose(trimmed);
  if (lastClose > 0) {
    try { return JSON.parse(trimmed.slice(0, lastClose + 1)); } catch { /* fall through */ }
  }

  // Try 4: drop the last entry of the outermost array/object and try again
  // (most useful when the truncation is mid-entry of an array of registry items)
  const droppedLast = dropLastTopLevelEntry(trimmed);
  if (droppedLast) {
    try { return JSON.parse(droppedLast); } catch { /* fall through */ }
  }

  return null;  // unrepairable; caller falls back to degraded registry
}
```

Evidence-tagger calls `repairTruncatedJson` BEFORE giving up. If repair succeeds, the registry has all entries except the truncated one (instead of all-degraded).

Combined effect: prompt prevents most truncations; repair recovers the rest's surviving entries. Expected verification rate lift: 87% → 94-96%.

---

## Body length floor lift — detailed approach

### Current `minWordCount()` per type (Phase 5/7)

```ts
function minWordCount(type: string): number {
  switch (type) {
    case 'definition': case 'aha_moment': case 'quote': return 200;
    case 'example': return 250;
    case 'lesson': case 'pattern': case 'tactic': return 350;
    case 'principle': case 'topic': return 400;
    case 'framework': return 500;
    case 'playbook': return 600;
    default: return 350;
  }
}
```

### Phase 8 lift

```ts
function minWordCount(type: string): number {
  switch (type) {
    case 'definition': case 'aha_moment': case 'quote': return 250;  // +50
    case 'example': return 350;                                        // +100
    case 'lesson': case 'pattern': case 'tactic': return 450;          // +100
    case 'principle': case 'topic': return 500;                        // +100
    case 'framework': return 700;                                      // +200
    case 'playbook': return 800;                                       // +200
    default: return 450;                                               // +100
  }
}
```

Body-writer prompt's "target length" line gets matching bumps:
- "400-1000 words" → "500-1200 words" for principle/topic
- "600-1200 words" → "700-1500 words" for framework
- "800-1500 words" → "1000-1800 words" for playbook
- etc.

The retry-on-failure path catches under-length output. Body writers already have this logic; only the floor numbers change.

### Synthesis bodies

Synthesis bodies stay at 400-1000 words floor (they're argument-thread bodies, not deep teaching content). Briefs likewise stay at 200-400w (intro framing, not page content).

Reader-journey phase bodies stay at 200-400w (phase intros).

Only canon body floors lift. The non-canon body floors are appropriate for their roles.

---

## Voice-mode validator (new file)

`packages/pipeline/src/scripts/check-voice-mode.ts`

Hard-fails:
- First-person markers (`\bI \b`, `\bmy\b`, `\bwe\b`) in body fields when voice mode is `third_person_editorial`
- Third-person attribution markers (`<creatorName> says`, `the creator argues`) in body fields when voice mode is `first_person`
- Mixed register (first AND third person markers in the same paragraph) when voice mode is anything other than `hybrid`

Soft warnings:
- Voice mode is `hybrid` but no first-person aphorism slots present (suggests the writer collapsed to pure third-person)
- Voice mode is `first_person` but `<creatorName>` appears as a noun referent in body (e.g., "Walker says..." inside a Walker first-person body — should be "I say...")

Output: `/tmp/voice-mode-<runId>.md` + non-zero exit on hard fail.

---

## Pipeline changes

### Stage 1: Channel profile (modified)

The channel-profile prompt now also outputs `_index_voice_mode`. Default rule:

```ts
function defaultVoiceMode(archetype: ArchetypeSlug): VoiceMode {
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
```

Operator can override via `--voice-mode first_person|third_person_editorial|hybrid` on `seed-audit-v2.ts`.

### Stage 5/6/7/8: Body writers (modified)

Each body writer reads `voiceMode` from the channel profile or from the regen flag. Prompt branches accordingly. Quality gates (third-person leak detector for `first_person`; first-person marker detector for `third_person_editorial`) run after each body persists.

### Stage 10: Evidence tagger (modified)

Tightened supportingPhrase prompt + json-repair parser fallback. No structural changes.

### Stage 11: Workshops (unchanged)

Workshop builder is not affected by voice mode (workshop clips have their own voice rules — instructional imperative, regardless of mode).

---

## Backfill plan

1. **Re-run Jordan / Walker / Hormozi** with new prompts (longer body floors + voice-mode-aware) on existing v2 audits. Walker is the highest-value re-run because his voice mode flips from first_person → third_person_editorial.
   - Command: `seed-audit-v2.ts <runId> --regen-channel --regen-bodies --regen-evidence`
   - Time: ~25-35 min per creator (existing channel/VICs reused; bodies + evidence re-generate)

2. **Onboard 4 new creators** via existing ingestion path:
   - Naval: pick 8 of his "How to Get Rich" series → ingest as channel
   - Nippard: pick 30 from his archive → ingest
   - Codie: pick 10 from her buying-businesses content → ingest
   - Veritasium: pick 10 of his most-viewed physics videos → ingest

3. **Run full v2 pipeline** on each of the 4 new creators with archetype-derived voice mode. Validate.

4. **Run all validators on all 7 creators**: citation chain, third-person leak, voice mode, evidence registry, workshops, completeness report.

5. **Final aggregate quality bar check**: all 7 creators hit bars 1-9 green.

---

## Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Codex CLI's truncation pattern is unfixable at the prompt level | Medium | json-repair parser is the safety net; even if prompt change fails, repair recovers most truncated responses |
| `third_person_editorial` mode produces stilted Wikipedia voice | Medium-High | Walker is the test case. If output reads bad, iterate the prompt with explicit examples of *good* third-person editorial (e.g., from Stripe Press, Patagonia content). May need 2-3 iterations. |
| Naval's content too thin for 800-word bodies | Medium | The body writer's retry-on-failure already absorbs this — if Codex can't produce 500w on a thin segment, the body type degrades (e.g., principle → aha_moment with lower min). Acceptable. |
| Nippard 30-video scale stress-tests cost exceeds Codex CLI rate limits | Low | Codex CLI runs against the user's ChatGPT plan; the bottleneck is wall-clock time (30 videos × ~30 min/video parallel = ~3-5 hours). Run as overnight batch. |
| New voice-mode validator hard-fails legitimate edge cases | Medium | Soft-warn first; review false positives; tighten patterns. Don't block backfill on validator output until tuned. |
| Existing v2 audits get partially-overwritten in regen and become inconsistent | Low | Database transactions are per-stage; a failed regen doesn't corrupt other stages. Idempotency keys prevent partial inserts. |

---

## Quality bar instrumentation

For Phase 8, expand `v2-completeness-report.ts` to also output per-creator + aggregate-across-7-creators quality bar status.

New CLI: `tsx ./src/scripts/v2-cohort-report.ts <runId-1> <runId-2> ... <runId-7>` → Markdown report comparing all 7 creators side-by-side with a "shipped quality" column (which bar grades each creator at).

Output goal: a single page that says "All 7 creators pass bars 1-10. Aggregate score 9.1/10. Ready for agency-premium pricing."

---

## Migration and backward compat

- `_index_voice_mode` is additive. Existing v2 audits without it default to `first_person` (Phase 5/7 behavior preserved).
- Body length floor lift is enforced only on **new** body generations. Existing bodies are not auto-regenerated.
- The `--regen-bodies` flag triggers full body regen with new floors; operators choose when to apply.
- Old prompts remain in commit history for reference; we don't keep dual prompt paths.

---

## What "9+/10" looks like at the end of Phase 8

- 7 creators × 10 quality bars × all green
- Verification rate: 95-98% across all creators (vs 84-90% Phase 7)
- Body lengths: median 800-1200w, thinnest ≥ 250w-800w by type
- Voice mode validator: 0 hard fails across 7 creators
- Cohort report: aggregate 9.1+/10
- Ready to charge agency-premium pricing on the audit-as-source-of-truth product

---

## Out of scope (deferred to Phase 9+)

- Reproducibility seeds (deterministic Codex output)
- Per-claim semantic verification ("does this clip teach this step?")
- Multi-language support
- Real-time hub generation (the audit is still a batch process)
- Builder service (the next product layer that consumes the JSON)
