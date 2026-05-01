# Phase 7 — Evidence Registry + Workshop Pages Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-citation evidence-role overlay (`_index_evidence_registry`) to every body-bearing v2 entity, plus a new top-level `workshop_stages[]` entity that mirrors the reader journey with 2-4 timestamped instructional clips per stage.

**Architecture:** Reuse the canon-body-writer infrastructure pattern. Two new pipeline stages (10: evidence registry tagger, 11: workshop builder) run after the existing 9-stage v2 pipeline. The tagger overlays metadata on existing inline `[<UUID>]` citations without modifying body markdown. The workshop builder derives one stage per reader-journey phase, draws candidate clips from the phase's primary canons' evidence registries, and produces 2-4 clips per stage with optional tighter time bounds.

**Tech Stack:** Existing — TypeScript pipeline, Codex CLI, Drizzle ORM with JSONB, Next.js audit page renderer.

**Spec:** [`docs/superpowers/specs/2026-05-01-phase-7-evidence-and-workshops-design.md`](../specs/2026-05-01-phase-7-evidence-and-workshops-design.md)

**Where we're starting from (Phase 5 outcome):**
- v2 pipeline produces 4 body-bearing entity types (canon, synthesis, journey-phase, brief) with first-person bodies and inline `[<UUID>]` citations
- Jordan, Walker, Hormozi all have v2 audits with all 5 layers populated, 0 third-person leaks, 99-100% citation resolution
- Citations are positionally-correct (UUIDs resolve to real segments) but role-blind (no semantic role label, no relevance score, no `whyThisSegmentFits`)

**Where we land:**
- Every cited UUID across all 4 entity types has a structured `EvidenceEntry` describing its role, relevance, supportingPhrase, and reasoning trace
- `workshop_stages[]` exists as a new top-level entity with 3-5 stages mirroring journey, 2-4 clips per stage, all clips at relevanceScore ≥ 80 with type-aware tight time bounds
- New validators report orphan citations, unsupported entries, and rejected workshop clips
- Audit page renders citation chips (hover for role + supportingPhrase) and a workshop section with timeline + clip cards
- Builder handoff doc updated; backfill on Jordan / Walker / Hormozi takes ~10-15 min per creator

---

## File Structure

```
packages/db/src/schema/
  canon.ts                              ← extend (Task 7.1) — add workshop_stage table

packages/pipeline/src/scripts/
  util/evidence-tagger.ts               ← NEW (Task 7.2) — per-entity batched tagger
  util/workshop-builder.ts              ← NEW (Task 7.4) — stage shell + clip generator
  seed-audit-v2.ts                      ← extend (Task 7.3, 7.5) — wire stages 10-11
  validate-evidence-registry.ts         ← NEW (Task 7.6) — registry validator
  validate-workshops.ts                 ← NEW (Task 7.7) — workshop validator
  v2-completeness-report.ts             ← extend (Task 7.8) — bar 5-8 layers

apps/web/src/components/audit/
  EvidenceChip.tsx                      ← NEW (Task 7.9) — per-citation chip
  WorkshopStagesView.tsx                ← NEW (Task 7.10) — workshop timeline
  HubSourceV2View.tsx                   ← extend (Task 7.9, 7.10) — wire chips + workshop

apps/web/src/lib/audit/
  build-hub-source-doc.ts               ← extend (Task 7.11) — include workshop_stages
  types.ts                              ← extend (Task 7.11) — add workshop types
  get-run-audit.ts                      ← extend (Task 7.11) — fetch workshop_stage rows

docs/superpowers/specs/
  2026-05-01-hub-source-document-schema.md  ← extend (Task 7.12) — add evidence + workshop sections

docs/builder-handoff/
  hub-source-document-format.md         ← extend (Task 7.12) — rendering rules
```

---

## Quality bars (Phase 7-only)

Phase 5's 4 bars still apply. Phase 7 adds:

5. **Evidence verification rate ≥ 90%.** Across all body citations, ≥ 90% should be `verified`.
6. **Workshop clip relevance ≥ 80 average.** Hard gate is 80; production-grade hubs sit at 90+.
7. **Workshop clip duration in 30-180s window.** No clip < 30s (too short to teach) or > 180s (loses focus).
8. **Workshop completeness.** Every journey phase yields a stage; every stage yields ≥ 2 clips.

---

## Task 7.1: Workshop stage DB schema + migration

**Files:**
- Modify: `packages/db/src/schema/canon.ts`
- Generate: `packages/db/migrations/<timestamp>_workshop_stage.sql`

**Why:** Workshop stages are hub-level entities with shape distinct enough from canon/brief that they deserve their own table. Mirror the `pageBrief` table pattern.

- [ ] **Step 1: Add workshopStage table definition.** Add to `packages/db/src/schema/canon.ts` after the `pageBrief` table:

```ts
export const workshopStage = pgTable('workshop_stage', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runPositionIdx: index('workshop_stage_run_position_idx').on(t.runId, t.position),
}));

export type WorkshopStage = typeof workshopStage.$inferSelect;
```

- [ ] **Step 2: Re-export from schema index.** Verify `packages/db/src/schema/index.ts` (or wherever the package's barrel exports live) re-exports `workshopStage` and `WorkshopStage`. If it uses a wildcard re-export from `canon.ts`, no change needed.

- [ ] **Step 3: Generate migration.**

```bash
cd packages/db && pnpm drizzle-kit generate
```

Expected: a new SQL file in `packages/db/migrations/` containing `CREATE TABLE workshop_stage`.

- [ ] **Step 4: Apply migration to dev DB.**

```bash
cd packages/db && pnpm drizzle-kit migrate
```

Expected: confirmation that migration applied; no errors.

- [ ] **Step 5: Typecheck + commit.**

```bash
cd packages/db && pnpm typecheck
cd ../.. && git add packages/db/src/schema/canon.ts packages/db/migrations/
git commit -m "feat(db): workshop_stage table for Phase 7 hub-level workshops"
```

---

## Task 7.2: Evidence tagger module

**Files:**
- Create: `packages/pipeline/src/scripts/util/evidence-tagger.ts`

**Why:** The tagger reads each body field's inline `[<UUID>]` citations and produces an `EvidenceEntry` per UUID. Per-entity batched (one Codex call per canon/synthesis/journey-phase/brief), concurrency 3, ~30s/entity.

The tagger is THE most important new prompt in Phase 7. It must produce role labels that hold up to operator review, supportingPhrases that are literal substrings of source segments, and confidence values that correctly correlate with relevance scores.

- [ ] **Step 1: Type definitions.** Define and export:

```ts
export type EvidenceType =
  | 'claim' | 'framework_step' | 'example' | 'caveat'
  | 'mistake' | 'tool' | 'story' | 'proof';

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
```

- [ ] **Step 2: verificationStatus calculator.** Pure function:

```ts
export function computeVerificationStatus(
  entry: EvidenceEntry,
  segmentText: string,
): EvidenceEntry['verificationStatus'] {
  if (!segmentText.includes(entry.supportingPhrase)) return 'unsupported';
  if (entry.relevanceScore < 40) return 'unsupported';
  if (entry.relevanceScore >= 70 && entry.confidence !== 'low') return 'verified';
  return 'needs_review';
}
```

- [ ] **Step 3: Prompt builder.** Build a Codex prompt that:
  1. Names the entity and its body
  2. Lists every cited UUID and the full segment text for that UUID
  3. Instructs Codex to produce `{registry: {<UUID>: EvidenceEntry, ...}}` for every UUID
  4. Specifies the 8-value evidenceType enum with examples per type
  5. Specifies that `supportingPhrase` MUST be a literal substring of the source segment text
  6. Specifies relevanceScore 0-100 with rubric (90+: exact match, 70-89: clear support, 40-69: partial, <40: unsupported)
  7. Specifies confidence rubric (high: explicit support; medium: paraphrase; low: inference only)
  8. Asks for `roleEvidence` and `whyThisSegmentFits` per entry

Use the canon-body-writer's `buildBodyPrompt` as the structural reference.

- [ ] **Step 4: Parser + quality gates.** Single-entity tagger function:

```ts
export async function tagEntityEvidence(
  input: EvidenceTaggerInput,
  options: { timeoutMs?: number } = {},
): Promise<EvidenceTaggerResult> {
  // ... runCodex(prompt, ...) → extractJsonFromCodexOutput → JSON.parse
  // For each cited UUID in body:
  //   - hard-fail if not in returned registry
  //   - hard-fail if supportingPhrase not in segmentTextById[UUID]
  //   - hard-fail if evidenceType not in canonical enum
  //   - hard-fail if relevanceScore not in [0, 100]
  //   - compute verificationStatus
  // Return registry.
}
```

Quality gates throw to trigger retry-on-failure.

- [ ] **Step 5: Parallel orchestrator.**

```ts
export async function tagAllEntities(
  inputs: EvidenceTaggerInput[],
  options: { concurrency?: number; timeoutMs?: number; maxRetries?: number } = {},
): Promise<Map<string, EvidenceTaggerResult>>
```

Same shape as `writeCanonBodiesParallel`. Concurrency 3, max 2 retries, exponential backoff.

- [ ] **Step 6: Typecheck + commit.**

```bash
cd packages/pipeline && pnpm typecheck
cd ../.. && git add packages/pipeline/src/scripts/util/evidence-tagger.ts
git commit -m "feat(v2/phase-7): evidence-tagger module — per-entity citation role + relevance overlay"
```

---

## Task 7.3: Wire evidence tagger into seed-audit-v2 (Stage 10)

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-v2.ts`

**Why:** Stage 10 runs after Stage 9 (hero). It tags every body-bearing entity (canon, synthesis, journey-phase, brief) and merges the registry into each entity's payload.

- [ ] **Step 1: Add `--regen-evidence` flag.** In the flags block at the top of `main()`:

```ts
const regenEvidence = process.argv.includes('--regen-evidence');
```

- [ ] **Step 2: Add Stage 10 block.** After the hero block (currently ends ~line 1070):

```ts
// ── Stage 10: Evidence registry tagger ─────────────────────
console.info(`[v2] Stage 10: evidence registry tagger`);

// Reload all v2 body-bearing entities.
const allCanonForEvidence = await db.select({ id: canonNode.id, payload: canonNode.payload })
  .from(canonNode).where(eq(canonNode.runId, runId));
const v2EntitiesForEvidence: Array<{ kind: 'canon' | 'brief'; id: string; payload: any; bodyField: 'body' }> = [];
// ... build list of entities to tag (skip those whose payload already has _index_evidence_registry unless regenEvidence)
// ... for each, build EvidenceTaggerInput
// ... call tagAllEntities
// ... merge registry back into each entity's payload, persist via db.update(canonNode|pageBrief)
```

For journey-phase, the registry attaches to each phase object inside `_index_phases[]`, NOT to the journey canon node's top level.

For synthesis nodes, treat the same as standard canon (they're CanonNode_v2 with kind='synthesis').

- [ ] **Step 3: Idempotency.** An entity is skipped if `payload._index_evidence_registry` exists AND `Object.keys(registry).length === <count of UUIDs in body>` UNLESS `regenEvidence === true`.

- [ ] **Step 4: Update final DONE log.** Append `evidence=<count>` to the existing `[v2] DONE` line.

- [ ] **Step 5: Typecheck + dry-run.**

```bash
cd packages/pipeline && pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add packages/pipeline/src/scripts/seed-audit-v2.ts
git commit -m "feat(v2/phase-7): wire evidence tagger as Stage 10 + --regen-evidence flag"
```

---

## Task 7.4: Workshop builder module

**Files:**
- Create: `packages/pipeline/src/scripts/util/workshop-builder.ts`

**Why:** Generate one workshop stage per reader-journey phase. Each stage's clips are drawn from the phase's primary canon nodes' evidence registries (filtered to high-relevance high-confidence entries with workshop-shaped roles).

- [ ] **Step 1: Type definitions.**

```ts
export type ClipRole = 'framework_step' | 'tool' | 'example' | 'mistake';

export interface WorkshopClip {
  id: string;
  segmentId: string;
  title: string;
  instruction: string;
  brief: string;
  action: string;
  startSeconds?: number;
  endSeconds?: number;
  _index_relevance_score: number;
  _index_confidence: 'high' | 'medium';
  _index_why_this_clip_teaches_this_step: string;
  _index_related_canon_node_ids: string[];
}

export interface WorkshopStage {
  id: string;
  slug: string;
  route: string;
  order: number;
  eyebrow: string;
  title: string;
  promise: string;
  brief: string;
  outcome: string;
  clips: WorkshopClip[];
  _index_related_node_ids: string[];
  _index_source_phase_number: number;
}

/** Candidate clip pulled from an evidence registry — input to the per-stage builder. */
export interface ClipCandidate {
  segmentId: string;
  segmentText: string;
  segmentStartSec: number;
  segmentEndSec: number;
  videoId: string;
  evidenceType: ClipRole;
  supportingPhrase: string;
  whyThisSegmentFits: string;
  relevanceScore: number;
  confidence: 'high' | 'medium' | 'low';
  sourceCanonNodeId: string;
  sourceCanonTitle: string;
}

export interface WorkshopStageInput {
  /** Phase metadata. */
  phaseNumber: number;
  phaseTitle: string;
  phaseHook: string;
  phaseReaderState: string;
  phaseNextStepWhen: string;
  /** Primary canon node IDs for this phase. */
  primaryCanonNodeIds: string[];
  /** Filtered candidate clips for this phase. */
  candidates: ClipCandidate[];
  /** Voice context. */
  creatorName: string;
  archetype: string;
  voiceFingerprint: { profanityAllowed: boolean; tonePreset: string; preserveTerms: string[] };
  /** Total phase count (so the prompt can frame "Phase N of M"). */
  totalPhases: number;
}
```

- [ ] **Step 2: Candidate filtering helper.** Pure function that takes a journey phase + canon-node payloads (with their `_index_evidence_registry`) + segments table → returns `ClipCandidate[]`:

```ts
export function filterCandidates(
  phase: ReaderJourneyPhase,
  canonByCanonId: Map<string, CanonNode_v2>,
  segmentById: Map<string, { id: string; videoId: string; startMs: number; endMs: number; text: string }>,
): ClipCandidate[] {
  const out: ClipCandidate[] = [];
  for (const cid of phase._index_primary_canon_node_ids) {
    const canon = canonByCanonId.get(cid);
    if (!canon || !canon._index_evidence_registry) continue;
    for (const [segId, entry] of Object.entries(canon._index_evidence_registry)) {
      const e = entry as EvidenceEntry;
      if (!['framework_step', 'tool', 'example', 'mistake'].includes(e.evidenceType)) continue;
      if (e.confidence !== 'high') continue;
      if (e.relevanceScore < 80) continue;
      if (e.verificationStatus !== 'verified') continue;
      const seg = segmentById.get(segId);
      if (!seg) continue;
      out.push({
        segmentId: segId,
        segmentText: seg.text,
        segmentStartSec: seg.startMs / 1000,
        segmentEndSec: seg.endMs / 1000,
        videoId: seg.videoId,
        evidenceType: e.evidenceType as ClipRole,
        supportingPhrase: e.supportingPhrase,
        whyThisSegmentFits: e.whyThisSegmentFits,
        relevanceScore: e.relevanceScore,
        confidence: e.confidence as 'high' | 'medium',
        sourceCanonNodeId: cid,
        sourceCanonTitle: canon.title,
      });
    }
  }
  return out;
}
```

- [ ] **Step 3: Per-stage prompt builder.** Codex prompt that:
  1. Frames as "you are <creatorName>, designing workshop stage N of M"
  2. States the phase's reader state and next-step-when
  3. Lists all candidate clips (segmentId, segmentText, evidenceType, supportingPhrase, sourceCanonTitle)
  4. Instructs Codex to pick 2-4 clips and write per-clip: title, instruction (1-sentence first-person), brief (30-60 words), action (imperative bullet), startSeconds (within segment bounds), endSeconds (≤ startSeconds + 180), why-teaches-this-step
  5. Requires stage shell: eyebrow ("Phase N · <theme>"), title (2-6 words), promise (1-sentence first-person), brief (50-100 words), outcome (1-sentence behavioral)
  6. Voice rules: first-person, never "the creator" / "<creatorName>" / "she/he says"

Reuse archetype HUB_SOURCE_VOICE loader from canon-body-writer.

- [ ] **Step 4: Per-stage builder function.**

```ts
export async function buildWorkshopStage(
  input: WorkshopStageInput,
  options: { timeoutMs?: number } = {},
): Promise<WorkshopStage>
```

Quality gates throw to trigger retry-on-failure:
- ≥ 2 clips
- Every clip's segmentId is in the candidates list
- Every clip's startSeconds/endSeconds within source segment span (with 5s buffer)
- Every clip's duration ≤ 180s
- No third-person markers in stage rendered fields (eyebrow, title, promise, brief, outcome) or clip rendered fields (title, instruction, brief, action)

- [ ] **Step 5: Parallel orchestrator.**

```ts
export async function buildAllWorkshopStages(
  inputs: WorkshopStageInput[],
  options: { concurrency?: number; timeoutMs?: number; maxRetries?: number } = {},
): Promise<Map<number, WorkshopStage>>  // keyed by phaseNumber
```

Concurrency 2 (workshops are large context). Max 2 retries.

- [ ] **Step 6: Typecheck + commit.**

```bash
cd packages/pipeline && pnpm typecheck
cd ../.. && git add packages/pipeline/src/scripts/util/workshop-builder.ts
git commit -m "feat(v2/phase-7): workshop-builder module — stage shell + clip generator from evidence pool"
```

---

## Task 7.5: Wire workshop builder into seed-audit-v2 (Stage 11)

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-v2.ts`

**Why:** Stage 11 generates one workshop stage per journey phase, persists to `workshop_stage` table.

- [ ] **Step 1: Add `--regen-workshops` flag.**

```ts
const regenWorkshops = process.argv.includes('--regen-workshops');
```

- [ ] **Step 2: Add Stage 11 block** after Stage 10:

```ts
// ── Stage 11: Workshop stages ─────────────────────────────
const journeyForWorkshop = v2RefreshedRows.find((c) => (c.payload as { kind?: string }).kind === 'reader_journey');
if (!journeyForWorkshop) {
  console.info(`[v2] Stage 11: skipped — no reader journey exists`);
} else {
  // Fetch existing workshop_stage rows
  const existingWorkshops = await db.select({ id: workshopStage.id, payload: workshopStage.payload })
    .from(workshopStage).where(eq(workshopStage.runId, runId));

  if (regenWorkshops && existingWorkshops.length > 0) {
    await db.delete(workshopStage).where(eq(workshopStage.runId, runId));
    existingWorkshops.length = 0;
  }

  if (existingWorkshops.length === 0) {
    // Build inputs from journey phases + filtered candidates
    // For each phase, call filterCandidates(phase, canonMap, segmentMap)
    // If candidates < 2 for a phase, skip that phase (log)
    // Otherwise build WorkshopStageInput and add to inputs[]
    // Call buildAllWorkshopStages(inputs, { concurrency: 2 })
    // For each result, persist via db.insert(workshopStage).values(...)
  } else {
    console.info(`[v2] Stage 11: workshops resumed (${existingWorkshops.length})`);
  }
}
```

- [ ] **Step 3: Update DONE log.** Append `workshops=<count>` to the `[v2] DONE` line.

- [ ] **Step 4: Update file header.** Add the two new flags + their descriptions to the header docblock comment so the help text stays in sync.

- [ ] **Step 5: Typecheck.**

```bash
cd packages/pipeline && pnpm typecheck
```

- [ ] **Step 6: Commit.**

```bash
git add packages/pipeline/src/scripts/seed-audit-v2.ts
git commit -m "feat(v2/phase-7): wire workshop builder as Stage 11 + --regen-workshops flag"
```

---

## Task 7.6: Evidence registry validator

**Files:**
- Create: `packages/pipeline/src/scripts/validate-evidence-registry.ts`

**Why:** Catches registry drift / stale entries / orphan UUIDs / unsupported entries. Hard-fails on any structural issue, soft-warns on quality issues.

- [ ] **Step 1: Module skeleton.** Mirror `check-third-person-leak.ts` shape:

```ts
async function main() {
  const runId = process.argv[2];
  const db = getDb();

  // Fetch all v2 body-bearing entities + the segments table.
  // For each entity:
  //   - parse body for [<UUID>] tokens
  //   - look up registry
  //   - hard-fail if any UUID in body has no registry entry → "orphan citation"
  //   - hard-fail if any registry entry's UUID is not in body → "stale entry"
  //   - hard-fail if supportingPhrase not in segments[<UUID>].text → "unsupported"
  //   - hard-fail if relevanceScore not in [0,100]
  //   - hard-fail if evidenceType not in canonical enum
  //   - count verified / needs_review / unsupported → aggregate stats
  // Render markdown report + non-zero exit on hard fails.
}
```

- [ ] **Step 2: Markdown report shape.** Match the third-person-leak report style:

```
# Evidence Registry Validation — <runId>

## Summary
- Entities scanned: N (canon: X, synthesis: Y, journey-phases: Z, briefs: W)
- Total UUID citations: M
- Verified:    A (P%)
- Needs review: B (Q%)
- Unsupported: C (R%)
- Hard-fail count: H

## Hard fails
| Entity | UUID | Issue |
|---|---|---|
| `cn_xxx` | `abc-...` | supportingPhrase not in segment text |

## Per-entity details
... (table per entity with verified/needs_review/unsupported counts)
```

- [ ] **Step 3: Output file location.** `/tmp/evidence-registry-<runId>.md` (use `process.env.TEMP || process.env.TMPDIR || '/tmp'` for Windows compat).

- [ ] **Step 4: Stdout summary.** Same shape as third-person-leak: brief lines + report path.

- [ ] **Step 5: Typecheck.**

```bash
cd packages/pipeline && pnpm typecheck
```

- [ ] **Step 6: Commit.**

```bash
git add packages/pipeline/src/scripts/validate-evidence-registry.ts
git commit -m "feat(v2/phase-7): evidence registry validator with markdown report"
```

---

## Task 7.7: Workshop validator

**Files:**
- Create: `packages/pipeline/src/scripts/validate-workshops.ts`

**Why:** Hard-fails on structural issues (unresolved segmentIds, score < 80, out-of-bounds timestamps); soft-warns on quality issues (clip count outside 2-4, duration > 180s).

- [ ] **Step 1: Module skeleton.**

```ts
async function main() {
  const runId = process.argv[2];
  const db = getDb();

  // Fetch all workshop_stage rows + segments table.
  // For each stage:
  //   For each clip:
  //     - hard-fail if segmentId not in segments table
  //     - hard-fail if _index_relevance_score < 80
  //     - hard-fail if startSeconds/endSeconds outside segment span (5s buffer)
  //     - soft-warn if endSeconds - startSeconds > 180
  //     - soft-warn if endSeconds - startSeconds < 30
  //   - soft-warn if clip count outside [2, 4]
  // Aggregate: stage count, total clips, average clips/stage, hard-fail count.
  // Render markdown + non-zero exit on hard fails.
}
```

- [ ] **Step 2: Markdown report shape.**

```
# Workshop Validation — <runId>

## Summary
- Stages: N (target 3-5)
- Total clips: M
- Average clips/stage: K
- Hard-fail count: H

## Hard fails
| Stage | Clip | Issue |

## Soft warns
| Stage | Clip | Issue (over duration / under duration / clip count out of range) |

## Per-stage details
| Stage | Phase # | Clip count | Avg score | Avg duration |
```

- [ ] **Step 3: Output file location.** `/tmp/workshops-<runId>.md`

- [ ] **Step 4: Typecheck.**

```bash
cd packages/pipeline && pnpm typecheck
```

- [ ] **Step 5: Commit.**

```bash
git add packages/pipeline/src/scripts/validate-workshops.ts
git commit -m "feat(v2/phase-7): workshop validator with markdown report"
```

---

## Task 7.8: Completeness report extension

**Files:**
- Modify: `packages/pipeline/src/scripts/v2-completeness-report.ts`

**Why:** Add evidence + workshop layers to bar 4. Add bars 5-8 (verification rate, clip relevance avg, clip duration window, workshop completeness).

- [ ] **Step 1: Fetch workshop_stage rows + evidence registries.** Add to the existing data-loading section:

```ts
const workshopRows = await db.select({ payload: workshopStage.payload })
  .from(workshopStage).where(eq(workshopStage.runId, runId));
```

- [ ] **Step 2: Compute evidence layer status.** Across all v2 body-bearing entities:

```ts
const totalCitations = /* count [<UUID>] tokens in all bodies */;
const totalEntries = /* sum of Object.keys(registry).length */;
const verifiedCount = /* count entries with verificationStatus === 'verified' */;
const verificationRate = totalCitations > 0 ? verifiedCount / totalCitations : 0;
const evidenceLayerOk = totalCitations > 0 && totalEntries === totalCitations && verificationRate >= 0.9;
```

- [ ] **Step 3: Compute workshop layer status.**

```ts
const workshopOk = (() => {
  if (workshopRows.length === 0) return false;
  if (workshopRows.length < 3) return false;
  for (const w of workshopRows) {
    const clipCount = (w.payload as WorkshopStage).clips.length;
    if (clipCount < 2) return false;
  }
  return true;
})();
```

- [ ] **Step 4: Add to bar 4 layers array.**

```ts
{
  name: 'Evidence registry',
  ok: evidenceLayerOk,
  detail: `${verifiedCount}/${totalCitations} verified (${Math.round(verificationRate*100)}%)`,
},
{
  name: 'Workshops',
  ok: workshopOk,
  detail: workshopRows.length === 0 ? 'Run --regen-workshops' : `${workshopRows.length} stages, avg ${avgClipsPerStage.toFixed(1)} clips`,
},
```

- [ ] **Step 5: Print bars 5-8.** New section after bar 4:

```ts
console.log(`▸ Quality bar 5: evidence verification rate ≥ 90%`);
console.log(`   ${verificationRate >= 0.9 ? '✓' : '✗'} ${Math.round(verificationRate*100)}% verified across ${totalCitations} citations`);
// bar 6: workshop avg clip relevance ≥ 90 (target above the 80 hard gate)
// bar 7: clip durations all in [30, 180]s
// bar 8: every journey phase yielded a stage; every stage has ≥2 clips
```

- [ ] **Step 6: Typecheck.**

```bash
cd packages/pipeline && pnpm typecheck
```

- [ ] **Step 7: Commit.**

```bash
git add packages/pipeline/src/scripts/v2-completeness-report.ts
git commit -m "feat(v2/phase-7): completeness report — evidence + workshop layers + bars 5-8"
```

---

## Task 7.9: Audit page — evidence chip rendering

**Files:**
- Create: `apps/web/src/components/audit/EvidenceChip.tsx`
- Modify: `apps/web/src/components/audit/HubSourceV2View.tsx`

**Why:** Replace the plain `[<UUID>]` token rendering with role-coded chips that expand on click to show role + score + supportingPhrase + whyThisSegmentFits.

- [ ] **Step 1: Create EvidenceChip component.** Renders a tiny pill with role abbreviation + relevance score; expands on click to a popover with full entry details:

```tsx
'use client';

interface EvidenceChipProps {
  segmentId: string;
  entry: EvidenceEntry;          // from canon's _index_evidence_registry[segmentId]
  segment: { videoId: string; startMs: number; text: string };
  youtubeId: string | null;
  debug: boolean;
}

export function EvidenceChip({ segmentId, entry, segment, youtubeId, debug }: EvidenceChipProps) {
  const [open, setOpen] = useState(false);
  const startSec = Math.floor(segment.startMs / 1000);
  const youtubeUrl = youtubeId ? `https://youtube.com/watch?v=${youtubeId}&t=${startSec}s` : null;

  const roleColor = roleColorMap[entry.evidenceType]; // small map: claim → blue, mistake → amber, etc.
  // Hide unsupported entries unless debug mode
  if (entry.verificationStatus === 'unsupported' && !debug) return null;

  return (
    <span className="relative inline-block align-baseline">
      <button onClick={() => setOpen(!open)} className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-1.5 py-0.5 ml-1 ${roleColor}`}>
        {entry.evidenceType.slice(0, 3)} {entry.relevanceScore}
      </button>
      {open ? (
        <div className="absolute z-20 ... popover content ...">
          <p className="text-[11px] font-semibold">{entry.evidenceType}</p>
          <p className="text-[12px] mt-1">"{entry.supportingPhrase}"</p>
          <p className="text-[11px] text-muted mt-2">{entry.whyThisSegmentFits}</p>
          {youtubeUrl ? <a href={youtubeUrl} target="_blank">Watch on YouTube</a> : null}
          {debug ? (
            <details className="mt-2">
              <summary>Operator detail</summary>
              <p>roleEvidence: {entry.roleEvidence}</p>
              {entry.whyThisSegmentMayNotFit ? <p>mayNotFit: {entry.whyThisSegmentMayNotFit}</p> : null}
              <p>verificationStatus: {entry.verificationStatus}</p>
            </details>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
```

- [ ] **Step 2: Body-with-chips renderer.** Helper that takes a body string + registry + segments + youtubeIds and returns React nodes:

```tsx
export function renderBodyWithChips({
  body,
  registry,
  segmentById,
  youtubeIdByVideoId,
  debug,
}: {
  body: string;
  registry: Record<string, EvidenceEntry>;
  segmentById: Map<string, Segment>;
  youtubeIdByVideoId: Record<string, string | null>;
  debug: boolean;
}): React.ReactNode[] {
  // Split body on UUID_REGEX, render each match as <EvidenceChip>, surround text as plain spans.
  // The body is markdown — we render it as-is + injected chips. Use a simple token-split approach
  // (not full MD parsing) for the chips; preserve the surrounding markdown for the wrapper to render.
}
```

- [ ] **Step 3: Wire into HubSourceV2View.** In the canon body display + brief body display + journey phase body display, replace the plain `<div className="prose">{p.body}</div>` with the chipped renderer. The wrapper still needs to render markdown — so the change is: split body around UUID tokens, render markdown for text segments, render chips at UUID positions.

Simpler: pre-process the body to inject chip-placeholder markup that the markdown renderer leaves alone, then post-process. Or: switch to a streaming renderer that can interleave React nodes with markdown chunks.

For Phase 7, use the simpler approach: render the body as plain text with chips inline (no markdown parsing). The audit page is operator-facing; the builder will do proper markdown rendering downstream.

- [ ] **Step 4: Typecheck web app.**

```bash
cd apps/web && pnpm typecheck
```

- [ ] **Step 5: Visual smoke test.** Open the dev server, load Jordan's audit page (after Phase 7 is run), confirm:
  - Inline chips appear after each citation
  - Chip click opens popover with role + supportingPhrase + whyThisSegmentFits
  - Chips for `unsupported` entries hidden unless `?debug=1`
  - YouTube link works

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/components/audit/EvidenceChip.tsx apps/web/src/components/audit/HubSourceV2View.tsx
git commit -m "feat(audit-page/phase-7): per-citation evidence chips with role + score + popover"
```

---

## Task 7.10: Audit page — workshop section

**Files:**
- Create: `apps/web/src/components/audit/WorkshopStagesView.tsx`
- Modify: `apps/web/src/components/audit/HubSourceV2View.tsx`

**Why:** New section after the reader journey timeline — renders workshop stages as a card row, expand a stage to see its clips.

- [ ] **Step 1: Create WorkshopStagesView component.** Renders the workshop_stages array:

```tsx
export function WorkshopStagesView({ stages, segmentById, youtubeIdByVideoId, debug }: {
  stages: WorkshopStage[];
  segmentById: Map<string, Segment>;
  youtubeIdByVideoId: Record<string, string | null>;
  debug: boolean;
}) {
  if (stages.length === 0) return null;
  return (
    <section>
      <h2>Workshop ({stages.length} stages, {totalClips} clips)</h2>
      <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {stages.sort((a,b) => a.order - b.order).map((stage) => (
          <WorkshopStageCard key={stage.id} stage={stage} segmentById={segmentById} youtubeIdByVideoId={youtubeIdByVideoId} debug={debug} />
        ))}
      </ol>
    </section>
  );
}

function WorkshopStageCard({ stage, segmentById, youtubeIdByVideoId, debug }) {
  return (
    <li className="rounded-[12px] border ...">
      <span className="eyebrow">{stage.eyebrow}</span>
      <h3>{stage.title}</h3>
      <p className="promise">{stage.promise}</p>
      <p className="brief">{stage.brief}</p>
      <p className="outcome">{stage.outcome}</p>
      <details>
        <summary>{stage.clips.length} clips</summary>
        {stage.clips.map((clip) => <WorkshopClipRow key={clip.id} clip={clip} ... />)}
      </details>
      {debug ? <details>...operator details: source phase number, related node ids...</details> : null}
    </li>
  );
}

function WorkshopClipRow({ clip, segmentById, youtubeIdByVideoId, debug }) {
  const seg = segmentById.get(clip.segmentId);
  const start = clip.startSeconds ?? (seg.startMs / 1000);
  const end = clip.endSeconds ?? (seg.endMs / 1000);
  const duration = end - start;
  const youtubeUrl = `https://youtube.com/watch?v=${youtubeIdByVideoId[seg.videoId]}&t=${Math.floor(start)}s`;
  return (
    <div>
      <p className="title">{clip.title} <span className="duration-pill">{formatTime(start)}-{formatTime(end)} ({Math.round(duration)}s)</span></p>
      <p className="instruction">{clip.instruction}</p>
      <p className="brief">{clip.brief}</p>
      <p className="action">{clip.action}</p>
      <a href={youtubeUrl}>Watch the clip</a>
      {debug ? <p className="why">{clip._index_why_this_clip_teaches_this_step}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Wire into HubSourceV2View.** After the ReaderJourneyTimeline section, add:

```tsx
{workshopStages.length > 0 ? (
  <WorkshopStagesView stages={workshopStages} segmentById={segmentById} youtubeIdByVideoId={youtubeIdByVideoId} debug={debug} />
) : null}
```

`workshopStages`, `segmentById`, `youtubeIdByVideoId` are passed as new props from the parent (page.tsx).

- [ ] **Step 3: Typecheck.**

```bash
cd apps/web && pnpm typecheck
```

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/components/audit/WorkshopStagesView.tsx apps/web/src/components/audit/HubSourceV2View.tsx
git commit -m "feat(audit-page/phase-7): workshop section — stage cards + clip rows + duration pills"
```

---

## Task 7.11: Builder handoff JSON includes workshops + types

**Files:**
- Modify: `apps/web/src/lib/audit/types.ts`
- Modify: `apps/web/src/lib/audit/get-run-audit.ts`
- Modify: `apps/web/src/lib/audit/build-hub-source-doc.ts`
- Modify: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/page.tsx`

**Why:** The "Copy Hub Source" button serializes the entire Hub Source Document. Workshops need to be fetched and added to the JSON.

- [ ] **Step 1: Add types.** In `apps/web/src/lib/audit/types.ts`:

```ts
export interface WorkshopStageView {
  id: string;
  payload: Record<string, unknown>;  // matches WorkshopStage shape from pipeline
  position: number;
}

// Add to RunAuditView
export interface RunAuditView {
  // ... existing fields
  workshopStages: WorkshopStageView[];
}
```

- [ ] **Step 2: Fetch workshops in `get-run-audit.ts`.** Query `workshop_stage` table where `run_id = runId`, order by `position`, return as `workshopStages` field on the view.

- [ ] **Step 3: Update `build-hub-source-doc.ts`.** Add `workshop_stages` to the output JSON:

```ts
const workshop_stages = view.workshopStages.map((w) => w.payload);
return {
  metadata: { ... },
  channelProfile: ...,
  canonNodes: ...,
  pageBriefs: ...,
  videos: ...,
  visualMoments: ...,
  segments: ...,
  workshop_stages,  // NEW
};
```

- [ ] **Step 4: Pass workshopStages into HubSourceV2View.** In `audit/page.tsx`, fetch + pass.

- [ ] **Step 5: Typecheck.**

```bash
cd apps/web && pnpm typecheck
```

- [ ] **Step 6: Commit.**

```bash
git add apps/web/src/lib/audit/types.ts apps/web/src/lib/audit/get-run-audit.ts apps/web/src/lib/audit/build-hub-source-doc.ts apps/web/src/app/app/projects/[id]/runs/[runId]/audit/page.tsx
git commit -m "feat(audit-page/phase-7): include workshop_stages in audit view + builder JSON"
```

---

## Task 7.12: Schema spec + builder handoff doc updates

**Files:**
- Modify: `docs/superpowers/specs/2026-05-01-hub-source-document-schema.md`
- Modify: `docs/builder-handoff/hub-source-document-format.md`

**Why:** The contract files for the Hub Source Document need the new sections so future work + the future builder team have a single source of truth.

- [ ] **Step 1: Add `_index_evidence_registry` to schema spec.** In `2026-05-01-hub-source-document-schema.md`, add a new section after the existing CanonNode_v2 definition:

```markdown
### `_index_evidence_registry` (Phase 7+)

Every body-bearing entity (CanonNode_v2, PageBrief_v2, ReaderJourneyPhase_v2) carries an evidence registry overlaying each inline `[<UUID>]` token in the body field.

(Full EvidenceEntry interface — copy from Phase 7 design spec)
```

- [ ] **Step 2: Add `workshop_stages` to schema spec.** New section after PageBrief_v2:

```markdown
## WorkshopStage (Phase 7+)

Hub-level entity. Workshops mirror the reader journey (one stage per phase, 3-5 stages per hub) and contain 2-4 clips per stage that reference canonical segments with optional tighter time bounds.

(Full WorkshopStage + WorkshopClip interfaces — copy from Phase 7 design spec)
```

- [ ] **Step 3: Update top-level envelope.** The top-level Hub Source Document gets `workshop_stages: WorkshopStage[]`.

- [ ] **Step 4: Builder handoff doc — evidence rendering.** Add new section to `docs/builder-handoff/hub-source-document-format.md`:

```markdown
## Citation rendering with evidence registry (Phase 7)

Every body field's inline `[<UUID>]` token resolves against the body's `_index_evidence_registry`. Render as a small role-coded pill (color by `evidenceType`); on hover/click, surface `supportingPhrase` as a pull-quote, `whyThisSegmentFits` as a short caption, `confidence` as a badge, and a YouTube link.

Citations with `verificationStatus === 'unsupported'` MUST be hidden from end users by default; surface only in operator/debug mode.
```

- [ ] **Step 5: Builder handoff doc — workshop rendering.** New section:

```markdown
## Workshop pages (Phase 7)

`workshop_stages[]` is a hub-level entity, sibling to `canonNodes` and `pageBriefs`. Render as a top-level navigation section. Each stage gets its own page at `route` (e.g., `/workshop/foundation-and-roadmap`).

(Stage page composition: eyebrow + title + promise above fold; brief; clips as horizontal cards with title, duration pill, instruction, brief, action, YouTube embed/link.)
```

- [ ] **Step 6: Commit.**

```bash
git add docs/superpowers/specs/2026-05-01-hub-source-document-schema.md docs/builder-handoff/hub-source-document-format.md
git commit -m "docs(phase-7): schema spec + builder handoff updated with evidence + workshop sections"
```

---

## Task 7.13: Backfill Jordan / Walker / Hormozi + cross-archetype validation

**Files:**
- (no files modified — running scripts)
- Create: `docs/superpowers/plans/2026-05-01-phase-7-results.md`

**Why:** Three existing v2 audits need the new entities backfilled. Then we run completeness + validators on each, confirm bars 5-8 pass cross-archetype.

- [ ] **Step 1: Run backfill on Jordan.**

```bash
cd packages/pipeline
npx tsx ./src/scripts/seed-audit-v2.ts a8a05629-d400-4f71-a231-99614615521c --regen-evidence --regen-workshops
```

Expected: ~10-15 min runtime; final log `[v2] DONE — schemaVersion=v2, canon=11, ..., evidence=11, workshops=3`.

- [ ] **Step 2: Run completeness + validators on Jordan.**

```bash
npx tsx ./src/scripts/v2-completeness-report.ts a8a05629-d400-4f71-a231-99614615521c
npx tsx ./src/scripts/validate-evidence-registry.ts a8a05629-d400-4f71-a231-99614615521c
npx tsx ./src/scripts/validate-workshops.ts a8a05629-d400-4f71-a231-99614615521c
```

Expected: bars 1-8 all green; 0 hard fails on validators; verification rate ≥ 90%; workshop avg relevance ≥ 90.

- [ ] **Step 3: Run backfill on Walker.**

```bash
npx tsx ./src/scripts/seed-audit-v2.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce --regen-evidence --regen-workshops
```

- [ ] **Step 4: Run completeness + validators on Walker.** Same as Step 2 with Walker's runId.

- [ ] **Step 5: Run backfill on Hormozi.**

```bash
npx tsx ./src/scripts/seed-audit-v2.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b --regen-evidence --regen-workshops
```

- [ ] **Step 6: Run completeness + validators on Hormozi.** Same as Step 2 with Hormozi's runId.

- [ ] **Step 7: Spot-check the audit pages.** For each creator, open the audit page in dev:
  - Click 2-3 evidence chips per page — confirm popover renders + YouTube link works
  - Open the workshop section — confirm stages render with eyebrow/title/promise/brief/outcome
  - Expand a stage — confirm clip rows show title + duration pill + instruction + action + YouTube link
  - Toggle `?debug=1` — confirm `roleEvidence` + `whyThisClipTeachesThisStep` appear

- [ ] **Step 8: Write Phase 7 results doc.** Mirror `docs/superpowers/plans/2026-05-01-phase-5-completion-results.md`:
  - Commit list (~13 commits)
  - Per-creator results table (verification rate, workshop stage count, clip count, average clip relevance, hard-fail counts)
  - Quality bar 5-8 pass evidence
  - Phase 7 closing summary

- [ ] **Step 9: Commit results doc.**

```bash
git add docs/superpowers/plans/2026-05-01-phase-7-results.md
git commit -m "docs(phase-7): backfill results + STOP gate"
```

---

## Self-review checklist (run after writing this plan)

1. **Spec coverage:** Every spec section has at least one task. Evidence registry → 7.2, 7.3. Workshops → 7.4, 7.5. Validators → 7.6, 7.7. Completeness → 7.8. Renderer → 7.9, 7.10. Builder JSON → 7.11. Spec docs → 7.12. Backfill → 7.13. Schema migration → 7.1. ✓
2. **Type consistency:** `EvidenceEntry`, `WorkshopStage`, `WorkshopClip`, `ClipCandidate`, `EvidenceTaggerInput`, `WorkshopStageInput` all introduced in 7.2 / 7.4 with consistent field names across later tasks. ✓
3. **Placeholder check:** No "TBD" / "TODO" / "implement later" in steps. Each step has either concrete code or specific commands. ✓
