# Phase 7 — Evidence Registry + Workshop Pages

**Status:** Design spec. Brainstormed 2026-05-01.
**Schema impact:** Extends Hub Source Document v2 (no v3 bump).
**Predecessor:** [`docs/superpowers/specs/2026-05-01-hub-source-document-schema.md`](2026-05-01-hub-source-document-schema.md) (the v2 contract).
**Trigger:** Codex feedback that v2 citations are "near the topic," not "exactly teaches this point" — and that production hubs need workshop pages with timestamped clips that teach specific steps.

---

## Goals

1. **Evidence-role overlay.** Every inline `[<UUID>]` citation in any rendered body field gains sidecar metadata describing what job that citation does (claim / framework_step / example / caveat / mistake / tool / story / proof), how confident we are, why this segment fits the surrounding prose, and a tighter `supportingPhrase` substring proving the citation is precise. Builders downstream can render citations as rich evidence pills, group them by role, or surface "see also" rails per role.

2. **Workshop pages.** A new hub-level entity. Each workshop is a sequence of stages mirroring the reader journey; each stage has 2-4 clips that teach a specific action with a tighter time-range view of an existing canonical segment. The reader gets a "watch + do" loop alongside the canon's "read + learn" loop.

Success means: (a) every citation in every rendered body has a verifiable evidence entry; (b) every workshop clip has `relevanceScore ≥ 80` and a tightly-bounded time range; (c) operators reviewing the audit can see at a glance which citations are weak and which workshop clips were rejected during validation.

---

## Non-goals

- Replacing inline `[<UUID>]` tokens. Body markdown stays exactly as the writer produced it. Evidence is overlay metadata, never a body rewrite.
- Re-segmenting transcripts. Workshop clips reference existing canonical segments and override only `startSeconds` / `endSeconds`. No new "workshop segment" primitive.
- Per-claim IDs inside body markdown. The body remains free-form prose. The `supports` field on each evidence entry holds a short prose summary of what it supports, not a structured ID.
- Schema version bump. v2 stays. New fields are additive.

---

## Field-naming conventions (recap)

Same three categories as v2:

- (no prefix) = rendered. Surfaced verbatim by the builder.
- `_internal_*` = planning. Operator-debug only.
- `_index_*` = indexing. IDs, cross-references, search aids.

Evidence registry fields are all `_index_*`. Workshop stages are top-level (rendered) but their internals follow the same prefix discipline.

---

## Schema additions

### `_index_evidence_registry` (per body-bearing entity)

Added to `CanonNode_v2`, `PageBrief_v2`, and `ReaderJourneyPhase_v2`. Maps each cited UUID in the entity's `body` field to a rich evidence entry.

```ts
interface EvidenceEntry {
  /** The canonical segment this entry references (key in segments[] table). */
  segmentId: string;

  /** Tighter substring of segment.text — the specific phrase that supports the
   *  surrounding claim. Validator hard-fails if this is not a literal substring
   *  of the source segment. Used by the builder for inline pull-quotes. */
  supportingPhrase: string;

  /** Role classification. Workshops have their own role enum on WorkshopClip
   *  (see below); 'workshop_instruction' deliberately NOT in this list. */
  evidenceType: 'claim' | 'framework_step' | 'example' | 'caveat'
              | 'mistake' | 'tool' | 'story' | 'proof';

  /** Short prose summary of what this evidence supports. NOT a structured ID
   *  — body markdown doesn't have per-claim IDs. Example: "I prospect daily
   *  because client acquisition cannot depend on motivation." */
  supports: string;

  /** 0-100. 0 = useless, 100 = exact match. Validator hard-fails clips whose
   *  segments score < 80; tagger may flag canon citations < 40 as unsupported. */
  relevanceScore: number;

  /** High = supports clearly contains the language; medium = paraphrase or
   *  inference; low = vague or only topically related. */
  confidence: 'high' | 'medium' | 'low';

  /** Reasoning trace explaining why this evidenceType was chosen. Operator can
   *  review without re-running. */
  roleEvidence: string;

  /** Why this segment supports the claim — short prose. */
  whyThisSegmentFits: string;

  /** Optional caveat — why this segment might NOT fit, if any concern. */
  whyThisSegmentMayNotFit?: string;

  /** Computed by validator (not Codex). Decision order:
   *  - 'unsupported' if supportingPhrase NOT a substring of segment.text OR score < 40
   *  - 'verified' if substring matches AND score ≥ 70 AND confidence ≠ 'low'
   *  - 'needs_review' otherwise (covers: 40 ≤ score < 70 with substring match,
   *    OR score ≥ 70 with confidence='low') */
  verificationStatus: 'verified' | 'needs_review' | 'unsupported';
}
```

**Field on entity:**

```ts
_index_evidence_registry: Record<string /* segmentId UUID */, EvidenceEntry>;
```

**Synthesis nodes** (CanonNode_v2 with `kind: 'synthesis'`) get a registry too — their bodies cite UUIDs from child canon bodies, so the same shape applies.

### `workshop_stages` (top-level on HubSourceDocument)

A new sibling to `canonNodes`, `pageBriefs`, `videos`, `visualMoments`, `segments`.

```ts
interface HubSourceDocument {
  // ...existing v2 fields...

  /** Hub-level workshop. Empty array if the hub has no journey (workshops
   *  derive from journey phases — no journey, no workshop). */
  workshop_stages: WorkshopStage[];
}
```

```ts
interface WorkshopStage {
  /** Stable ID, format: wks_<12-char hex>. */
  id: string;

  // ── RENDERED ──────────────────────────────────────────
  /** Kebab-case slug derived from title. */
  slug: string;
  /** Public route. Builder uses verbatim. e.g. "/workshop/foundation-and-roadmap". */
  route: string;
  /** 1-based ordinal — mirrors the corresponding journey phase number. */
  order: number;
  /** Short eyebrow above the title. e.g. "Phase 1 · Foundation". */
  eyebrow: string;
  /** 2-6 word title. First-person feel. */
  title: string;
  /** 1-sentence first-person promise. e.g. "I'll show you how to install
   *  the daily prospecting habit before you touch your offer." */
  promise: string;
  /** 50-100 word framing — what the reader does in this stage. First-person. */
  brief: string;
  /** 1-sentence behavioral outcome. e.g. "You can identify 10-20 suitable
   *  businesses per day and tell which markets respond." */
  outcome: string;
  /** 2-4 clips. */
  clips: WorkshopClip[];

  // ── _INDEX ────────────────────────────────────────────
  /** Canon node IDs this stage references — for cross-linking. */
  _index_related_node_ids: string[];
  /** Reader-journey phase this stage mirrors. */
  _index_source_phase_number: number;
}
```

```ts
interface WorkshopClip {
  /** Stable ID, format: wkc_<12-char hex>. */
  id: string;

  // ── RENDERED ──────────────────────────────────────────
  /** Reference to canonical segment. Resolved against segments[] table. */
  segmentId: string;
  /** 2-6 word clip title. */
  title: string;
  /** 1-sentence first-person what-to-do. e.g. "I block 90 minutes daily for
   *  prospecting before I touch sales calls." */
  instruction: string;
  /** 30-60 word context for the action. First-person. */
  brief: string;
  /** Imperative verb-led action. e.g. "Block 90 daily minutes; identify 10
   *  businesses; send your hook." */
  action: string;
  /** Tighter time range. Defaults to segment.startMs/1000 if omitted. */
  startSeconds?: number;
  /** Defaults to segment.endMs/1000 if omitted. Validator caps duration at 180s. */
  endSeconds?: number;

  // ── _INDEX ────────────────────────────────────────────
  /** 0-100. Workshop validator hard-fails clips with score < 80. */
  _index_relevance_score: number;
  /** Workshop clips never carry 'low' — only 'high' or 'medium'. */
  _index_confidence: 'high' | 'medium';
  /** Why this clip teaches this exact step (Codex's reasoning trace). */
  _index_why_this_clip_teaches_this_step: string;
  /** 1-3 canon node IDs this clip relates to. */
  _index_related_canon_node_ids: string[];
}
```

---

## Pipeline changes

The 9-stage v2 pipeline becomes 11 stages. Existing 1-9 unchanged.

```
1. channel profile      [--regen-channel]
2. VICs                 [--regen-vic]
3. canon shells         [--regen-canon]
4. per-video weaving    (always runs)
5. canon bodies         [--regen-bodies]
6. synthesis nodes      [--regen-synthesis]
7. reader journey       [--regen-journey]
8. page briefs          [--regen-briefs]
9. hero candidates      [--regen-hero]
10. evidence registry   [--regen-evidence]   ← NEW
11. workshop stages     [--regen-workshops]  ← NEW
```

Both new stages are independently idempotent. Both are skipped on first-class resume (existing v2 entities reused unless their `--regen-*` flag is set).

### Stage 10: evidence registry tagger

**Inputs per entity (canon, synthesis, journey-phase, brief):**
- Entity's `body` markdown
- Every `[<UUID>]` token in body (parsed)
- For each cited UUID, the full segment text from `segments[]`
- The 8-type role enum + per-role criteria (in the prompt)
- Voice fingerprint context (informs how strict the tagger is about role attribution)

**Output:** `Record<UUID, EvidenceEntry>` for the entity's body.

**Implementation:**
- New module `packages/pipeline/src/scripts/util/evidence-tagger.ts`
- One Codex call per entity (per-canon batched). Concurrency 3, ~30s/entity.
- Quality gates throw to trigger retry-on-failure (max 2 retries):
  - Every UUID in body has an entry in returned registry
  - Every entry's `supportingPhrase` is a literal substring of source segment text
  - Every entry has `evidenceType` from canonical 8-value enum
  - Every entry has all required fields populated
- Retry strategy: re-prompt with explicit examples of the failed cases.

**verificationStatus computed in code, not by Codex:**
```ts
function computeVerificationStatus(e: EvidenceEntry, segText: string): EvidenceEntry['verificationStatus'] {
  if (!segText.includes(e.supportingPhrase)) return 'unsupported';
  if (e.relevanceScore < 40) return 'unsupported';
  if (e.relevanceScore >= 70 && e.confidence !== 'low') return 'verified';
  return 'needs_review';
}
```

**Tagger does NOT modify body markdown.** Low-confidence entries stay surfaced in the audit page with a warning chip; operator triages.

### Stage 11: workshop builder

**Prerequisites:** A reader journey exists. Without journey, workshop is skipped (logged, not an error).

**Per-stage flow:**
1. Read journey phase metadata (title, hook, _internal_reader_state, _internal_next_step_when, primary canon node IDs).
2. Pull candidate segments from those canon nodes' `_index_evidence_registry`. Filter to:
   - `evidenceType ∈ {framework_step, tool, example, mistake}`
   - `confidence === 'high'`
   - `relevanceScore ≥ 80`
   - `verificationStatus === 'verified'`
3. Codex call (one per stage, concurrent across stages with concurrency 2):
   - Input: phase metadata + filtered candidate segments (with full text + tighter `supportingPhrase`)
   - Output: stage shell (eyebrow, title, promise, brief, outcome) + 2-4 clips
4. Each clip output:
   - Codex picks `segmentId` from candidate pool
   - Codex writes title, instruction, brief, action, why-this-clip-teaches-this-step
   - Codex picks tighter `startSeconds` / `endSeconds` (within segment bounds; cap at 180s)
   - Codex assigns `_index_relevance_score` and `_index_confidence`
5. Validator runs after persistence:
   - Drop clips with score < 80 or unresolved segmentId
   - If a stage has < 2 clips after filtering, drop the stage and log
   - If < 3 stages survive overall, log warning (workshop is "skeleton")

**Module:** `packages/pipeline/src/scripts/util/workshop-builder.ts`

**No body-writer-style retry needed.** A workshop stage with bad clips just gets fewer or zero clips; the validator handles the prune.

---

## Validator additions

### `validate-evidence-registry.ts` (NEW)

Scans every `_index_evidence_registry` in the run. Reports:
- Orphan UUIDs in body markdown that have no registry entry → hard fail
- `supportingPhrase` not in segment text → hard fail
- `relevanceScore` outside [0, 100] → hard fail
- `evidenceType` outside the 8-value enum → hard fail
- Per-entity: count of `verified` / `needs_review` / `unsupported` entries → soft warning if any unsupported
- Aggregate: % of body citations that are `verified`, `needs_review`, or `unsupported`

Output: `/tmp/evidence-registry-<runId>.md` + non-zero exit on any hard fail.

### `validate-workshops.ts` (NEW)

Scans `workshop_stages`. Reports:
- Every clip's `segmentId` resolves → hard fail otherwise
- Every clip's `_index_relevance_score ≥ 80` → hard fail otherwise (clip should have been pruned in stage 11)
- Every clip's `startSeconds`/`endSeconds` within source segment bounds (with ≤ 5s buffer) → hard fail otherwise
- Every clip's duration ≤ 180s → soft warning if exceeded
- Stage count ∈ [3, 8] → soft warning if outside
- Clip count per stage ∈ [2, 4] → soft warning if outside
- Aggregate: total stages, total clips, average clips/stage, rejected-clip count

Output: `/tmp/workshops-<runId>.md` + non-zero exit on any hard fail.

### `v2-completeness-report.ts` extensions

Add two new layers to bar 4:

| Layer | Threshold |
|---|---|
| Evidence registry | Every body-bearing v2 entity has a registry; every body's UUIDs all map to entries |
| Workshop stages | If journey exists: workshop has ≥ 3 stages, every stage has ≥ 2 clips, no clip rejections |

These appear as new rows in the completeness banner, with `--regen-evidence` and `--regen-workshops` hints when amber.

---

## Audit page renderer extensions

### Per-citation evidence chip

In every rendered body (canon, synthesis, journey-phase, brief), parse `[<UUID>]` tokens and render them as small evidence pills with hover/click to expand:

```
[a1a6...]  →  ⓘ <chip showing role + relevance score>
```

Click expands to show:
- `evidenceType` (with role icon)
- `relevanceScore` (out of 100)
- `confidence` badge (high/medium/low)
- `supportingPhrase` (pull-quote)
- `whyThisSegmentFits`
- "Watch on YouTube" link (resolves segmentId → youtubeId + startSec)

`?debug=1` toggle reveals `roleEvidence` and `whyThisSegmentMayNotFit`.

### Workshop section

A new top-level section after the reader journey timeline. Layout:

- Section header: "{hub_title} workshop" + 1-line intro pulled from first stage's promise
- Horizontal stage timeline (mirrors journey timeline visually): each stage card shows `eyebrow`, `title`, `promise`, clip count
- Click into a stage → vertical clip list:
  - Title + duration pill (e.g., "0:42 — 2:18")
  - Instruction (bold)
  - Brief
  - Action (imperative bullet)
  - "Watch the clip" link
  - "Read the canon" link (cross-link to first `relatedCanonNodeIds[0]`)

Operator-debug mode reveals `_index_why_this_clip_teaches_this_step` and `_index_relevance_score` per clip.

### Completeness banner extension

Two new chips: "Evidence registry" and "Workshops". Same green/amber/red treatment as existing chips.

---

## Builder handoff updates

`docs/builder-handoff/hub-source-document-format.md` gets two new sections:

### Evidence registry rendering

> "Every body field's inline `[<UUID>]` token resolves against the body's `_index_evidence_registry`. Render as a small role-coded pill (color by `evidenceType`); on hover/click, surface `supportingPhrase` as a pull-quote, `whyThisSegmentFits` as a short caption, `confidence` as a badge, and a YouTube link constructed from `segmentId` → `videos[].youtubeId` + `startSeconds`. Citations with `verificationStatus === 'unsupported'` MUST be hidden from end users by default; surface only in operator/debug mode."

### Workshop rendering

> "Render `workshop_stages` as a top-level navigation section. Each stage gets its own page at `route` (e.g., `/workshop/foundation-and-roadmap`). Stage page composition: eyebrow + title + promise (above the fold), brief (introducing the work), then each clip as a horizontal card with `title`, duration pill (`startSeconds` to `endSeconds`), `instruction`, `brief`, `action`, and a YouTube embed/link constructed from `segmentId` + tighter timestamps. Cross-link `_index_related_node_ids` as 'Read the canon' links."

---

## Backfill for existing v2 audits

Jordan, Walker, Hormozi all have v2 audits but no evidence registry or workshops. Two new flags + idempotency rules:

- `--regen-evidence` → drops all `_index_evidence_registry` from existing v2 entities, re-runs Stage 10
- `--regen-workshops` → drops `workshop_stages`, re-runs Stage 11

Running `seed-audit-v2.ts <runId> --regen-evidence --regen-workshops` on each of the 3 existing v2 runs backfills both new entities without re-touching canon bodies / synthesis / journey / briefs / hero. Time estimate per creator: ~10-15 min (most of which is evidence tagger; workshops are 1-2 min).

---

## Implementation surface (for the writing-plans pass)

Files to add:
- `packages/pipeline/src/scripts/util/evidence-tagger.ts` (~400 LOC — prompt + parser + verification status)
- `packages/pipeline/src/scripts/util/workshop-builder.ts` (~500 LOC — shell + clip generator)
- `packages/pipeline/src/scripts/validate-evidence-registry.ts` (~200 LOC)
- `packages/pipeline/src/scripts/validate-workshops.ts` (~200 LOC)

Files to modify:
- `packages/pipeline/src/scripts/seed-audit-v2.ts` (add stages 10-11; add `--regen-*` flags)
- `packages/pipeline/src/scripts/v2-completeness-report.ts` (extend with evidence + workshop layers)
- `apps/web/src/components/audit/HubSourceV2View.tsx` (citation chips; workshop timeline)
- `apps/web/src/lib/audit/build-hub-source-doc.ts` (include evidence_registry + workshop_stages in JSON output)
- `docs/superpowers/specs/2026-05-01-hub-source-document-schema.md` (add evidence registry + workshop sections)
- `docs/builder-handoff/hub-source-document-format.md` (add evidence + workshop rendering rules)

---

## Quality bars (Phase 7)

In addition to Phase 5's 4 bars (which still apply), Phase 7 adds:

5. **Evidence verification rate ≥ 90%.** Across all body citations, ≥ 90% should be `verified`. Below 80% means the tagger or body-writer needs review.
6. **Workshop clip relevance ≥ 80 average.** Every clip is hard-gated at 80, but the average should sit higher (90+) for production-grade hubs.
7. **Workshop clip duration in 30-180s window.** No clip is shorter than 30s (not enough to teach anything) or longer than 180s (loses focus).
8. **Workshop completeness.** Every journey phase yields a workshop stage; every stage yields ≥ 2 clips. If any phase yields 0 clips, that's a tagger-quality regression to investigate.

The completeness report bakes 5 + 8 into the banner; 6 + 7 surface in the validator output.

---

## Out of scope (deferred)

- **Per-claim IDs in body markdown.** The body stays free-form. If we ever need finer-grained `supports` references, that's a future spec.
- **A new `claim-extraction-rubric` skill.** The body writer's existing prompt is fine; the tagger does the role labeling separately.
- **Workshop clip embeds with custom video player.** The builder handles playback; the audit only provides timing metadata.
- **Multi-language workshops.** Out of scope; if added later, the workshop builder gets a `language` parameter passed through from the channel profile.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tagger hallucinates `supportingPhrase` substrings that aren't in segment text | Validator hard-fails; quality gate in tagger throws to trigger retry |
| Codex returns inconsistent `evidenceType` across runs | `roleEvidence` field makes inconsistencies auditable; operator can re-run targeted entities |
| Workshop stage with 0 valid clips after filtering | Stage gets dropped with log; if < 3 stages survive, audit logs "skeleton workshop" warning but doesn't fail |
| Existing canon bodies have citations that fail tagger verification | Surfaced as `unsupported` in registry; body markdown is NOT modified; operator triages whether to regen the body |
| Workshop pages look generic across creators | The journey-derived structure provides creator-specific anchoring; clip-instruction prompts include archetype HUB_SOURCE_VOICE |

---

## Migration

- New v2 audits (post-Phase 7) include both `_index_evidence_registry` and `workshop_stages` natively.
- Existing v2 audits (Jordan, Walker, Hormozi) backfill via `--regen-evidence --regen-workshops`.
- v1 audits remain unchanged; the audit page renderer's v1-fallback path is untouched.
- The `Copy Hub Source` button output gains two new top-level fields (`workshop_stages`) and per-entity sidecars (`_index_evidence_registry`). Builder handoff doc explicitly notes these are additive — old builders that don't read them still work.
