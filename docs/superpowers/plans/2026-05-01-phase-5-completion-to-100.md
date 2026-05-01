# Phase 5 Completion Plan — Take v2 from 70% to 100%

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the v2 Hub Source Document so it has every layer needed for the builder to ship a real hub. Canon bodies are already paywall-grade; this plan adds synthesis (pillar pages), reader journey, and page briefs in the same v2 quality discipline, plus cross-archetype validation.

**Architecture:** Reuse the canon-body-writer infrastructure already built. Add three new body-writers (synthesis, journey-phase, brief) that follow the same shape: (1) generate shells via Codex JSON, (2) parallelize body writing with quality gates (min word count + citation density + retry-on-failure), (3) merge bodies into shells, (4) persist with `schemaVersion: 'v2'`. Hero quality re-pass + title-case enforcement land alongside.

**Tech Stack:** Existing — TypeScript pipeline, Codex CLI, Drizzle ORM with JSONB, Next.js audit page renderer.

**Where we're starting from (verified honest):**
- Canon node body quality: **94/100** (8 paywall-grade bodies, 100% citation resolution, 0 third-person leaks)
- Hero / hub_title / tagline: **90/100** (4/5 hero lines billboard-quality, 1 awkward)
- Hub Source Document COMPLETENESS: **40/100** (synthesis, journey, briefs missing)
- **Aggregate: ~70/100**

**Where we land at 100:**
- All 5 hub layers populated (channel profile, canon bodies, synthesis pillars, reader journey, page briefs)
- All v2 validators pass (third-person leak detector + citation density + completeness)
- Jordan Platten passes the user's three quality bars from the original report
- Walker (science-explainer) + Hormozi (operator-coach baseline) regen demonstrates cross-archetype portability
- Builder handoff documentation exists so when this becomes a SaaS, the builder team has a written contract

---

## File Structure

```
packages/pipeline/src/scripts/
  util/synthesis-body-writer.ts       ← NEW (Task 6.1)
  util/journey-body-writer.ts         ← NEW (Task 6.2)
  util/brief-body-writer.ts           ← NEW (Task 6.3)
  seed-audit-v2.ts                    ← extend (Task 6.5) — add synthesis + journey + briefs stages
  validate-citation-chain.ts          ← extend (Task 6.6) — v2 schema awareness
  check-voice-fingerprint.ts          ← extend (Task 6.6) — body-aware
  check-third-person-leak.ts          ← NEW (Task 6.6) — hard-fail validator

apps/web/src/components/audit/
  HubSourceV2View.tsx                 ← extend (Task 6.7) — render synthesis pillar pages, journey timeline, brief cards

docs/builder-handoff/
  hub-source-document-format.md       ← NEW (Task 6.8) — builder contract
```

---

## Quality bar (unchanged from Phase 5 plan)

Phase 5 is complete when, for a freshly-regenerated Jordan Platten audit:

1. **Read 3 random canon-node `body` fields aloud.** Sound like Jordan wrote a chapter. ✅ already passes for canon. After this plan: also passes for synthesis bodies + brief bodies + journey-phase bodies.
2. **All 5 `hero_candidates` billboard-worthy.** ✅ 4/5 already pass; one regen fixes the awkward one.
3. **Pick the thinnest renderable body and ask: would Jordan paywall this?** ✅ canon bodies already pass; after this plan: synthesis + journey + briefs also pass.

Plus a 4th completeness bar:
4. **Open the audit page. Does it look like a buildable hub source?** Hero + 5 hooks + ~3 pillars (synthesis) + 5-7 reader-journey phases + ~10-12 canon pages + ~10-12 page briefs framing them. Currently: hero + 8 canon bodies. After this plan: full document.

---

## Task 6.1: Synthesis body writer

**Files:**
- Create: `packages/pipeline/src/scripts/util/synthesis-body-writer.ts`

**Why:** Synthesis nodes connect 3+ existing canon nodes under a unifying meta-claim. Each gets a 400-1000 word first-person body that NAMES each child canon by title and weaves them into a single argument. Synthesis nodes render as pillar pages.

- [ ] **Step 1: Build synthesis-shell generator** — Codex picks 3-5 META-CLAIMS that tie 3+ existing canon nodes together. Output: shells with title/lede/_internal_summary/_internal_unifying_thread/_index_cross_link_canon (3+ child IDs). NO body yet.

- [ ] **Step 2: Build synthesis-body writer** — for each shell, single Codex call: input = shell + each child canon's title+body+_internal_summary + voice fingerprint + archetype HUB_SOURCE_VOICE. Output = 400-1000 word first-person body that NAMES each child canon, weaves them into the unifying argument, and includes 4-10 inline `[<segmentId>]` citations on direct evidence claims. Reuse the same quality gates: throw if word count < 400 or citation count < 3 (retry).

- [ ] **Step 3: Parallel orchestrator** — same `mapWithConcurrency` pattern as canon-body-writer. Concurrency cap 2 (synthesis bodies are larger context).

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck
git add packages/pipeline/src/scripts/util/synthesis-body-writer.ts
git commit -m "feat(v2): synthesis-body-writer — meta-claim bodies that NAME children + weave argument"
```

---

## Task 6.2: Reader journey body writer

**Files:**
- Create: `packages/pipeline/src/scripts/util/journey-body-writer.ts`

**Why:** The reader journey is a single canon node (`type: 'playbook'`, `kind: 'reader_journey'`) whose `_index_phases` array carries 5-7 phases. Each phase has its own rendered body (200-400 words, first-person, sets up which canon nodes the phase introduces).

- [ ] **Step 1: Build journey-shell generator** — Codex takes all canon nodes + channel profile and produces a journey with 5-7 phases. Each phase shell: title (rendered), _internal_reader_state, _internal_next_step_when, _index_phase_number, _index_primary_canon_node_ids (which canon nodes this phase features). No body yet.

- [ ] **Step 2: Build phase-body writer** — for each phase shell, Codex call with: phase shell + the primary canon nodes' titles + ledes + voice fingerprint. Output = 200-400 word first-person body that introduces the phase, addresses the reader's current state, sets up which canon nodes the reader will encounter next. Quality gate: min 180 words.

- [ ] **Step 3: Parallel phase-body orchestrator** — concurrency cap 3.

- [ ] **Step 4: Typecheck + commit**

---

## Task 6.3: Page brief body writer

**Files:**
- Create: `packages/pipeline/src/scripts/util/brief-body-writer.ts`

**Why:** Page briefs are the FRAMING layer. Each canon node (and synthesis) gets a brief that tells the builder: pageTitle (statement, NOT question), hook (1 sentence first-person), lede (1-2 sentences), body (200-400 word first-person page intro that flows INTO the canon body), cta (first-person), plus full _internal_* and _index_* fields.

- [ ] **Step 1: Build brief-shell generator** — for each canon node, Codex pairs it with: pageTitle + hook + lede + _internal_persona + _internal_seo + _internal_audience_question + _internal_journey_phase + _index_slug + _index_page_type + _index_cluster_role + _index_voice_fingerprint. NO body yet. Cluster role determined by kind: synthesis → pillar; standard → spoke pointing to the closest synthesis (matching topic).

- [ ] **Step 2: Build brief-body writer** — for each shell + its primary canon body, Codex call: input = shell + primary canon's body + voice fingerprint. Output = 200-400 word first-person page intro that introduces (doesn't duplicate) the canon body. Quality gate: min 180 words, no third-person leak.

- [ ] **Step 3: Sibling reconciliation** — after all briefs written, group by parent_topic; set each spoke's sibling_slugs to the other spokes in the same cluster. Same logic as Phase 1.7 reconciler but on v2 data.

- [ ] **Step 4: Parallel brief-body orchestrator** — concurrency cap 3.

- [ ] **Step 5: Typecheck + commit**

---

## Task 6.4: Title-case enforcer + hero re-pass

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-v2.ts`

**Why:** Two cosmetic gaps surfaced by the audit-the-audit pass: one canon title was lowercase ("i go scattergun first" → "I Go Scattergun First"); one hero candidate has awkward repetition ("pre-10k a month revenue ... $10K months"). Both fixable inline.

- [ ] **Step 1: Title-case enforcer** — small TS helper that title-cases canon node titles after generation. Skip preserveTerm tokens that have intentional casing (e.g., "BYOA"). Apply to canon shells before persistence.

- [ ] **Step 2: Hero candidate re-pass on quality failure** — after generation, run a regex check: if any candidate has redundant token repetition (e.g., "pre-10k" + "$10K"), or is outside 6-14 word range, send a single re-pass Codex call asking to fix that specific line. Output replaces the bad candidate.

- [ ] **Step 3: Commit**

---

## Task 6.5: Wire synthesis + journey + briefs into seed-audit-v2.ts

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-v2.ts`

**Why:** seed-audit-v2.ts MVP currently runs through Stage 5 (canon body writing) + Stage 9 (hero candidates). Add Stages 6-8 between them: synthesis, reader journey, page briefs.

- [ ] **Step 1: Stage 6 — synthesis** — call synthesis-shell-generator with all canon nodes from Stage 5; for each shell, persist a canon_node row with kind='synthesis', then call synthesis-body-writer in parallel; persist bodies via UPDATE.

- [ ] **Step 2: Stage 7 — reader journey** — call journey-shell-generator; persist a single canon_node row with kind='reader_journey'; for each phase, call phase-body-writer in parallel; merge phase bodies into _index_phases array; UPDATE the journey canon_node payload.

- [ ] **Step 3: Stage 8 — page briefs** — call brief-shell-generator for each canon (including synthesis); persist page_brief rows; for each, call brief-body-writer in parallel; UPDATE briefs with bodies. Then sibling-slug reconciliation pass.

- [ ] **Step 4: Update DONE summary** — log canon=N, synthesis=M, journey-phases=P, briefs=B at end.

- [ ] **Step 5: Add `--regen-synthesis` / `--regen-journey` / `--regen-briefs` flags** — same idempotency pattern as canon body regen.

- [ ] **Step 6: Typecheck + commit**

---

## Task 6.6: v2 validators

**Files:**
- Modify: `packages/pipeline/src/scripts/validate-citation-chain.ts`
- Modify: `packages/pipeline/src/scripts/check-voice-fingerprint.ts`
- Create: `packages/pipeline/src/scripts/check-third-person-leak.ts`

**Why:** v2 has new validation surface area: bodies that should be first-person (citations live in body, not summaries), title-statement-not-question, woven-ID-not-in-brackets. The existing v1 validators don't recognize v2 fields.

- [ ] **Step 1: Citation validator extension** — when payload.schemaVersion === 'v2', count `[<UUID>]` tokens in canon `body`, brief `body`, synthesis `body`, journey `phase.body`. Per-body density gates: canon ≥5, synthesis ≥3, brief ≥1, journey-phase ≥1. Hard-fail any body with 0 citations when ≥3 source segments are available.

- [ ] **Step 2: Voice validator extension** — score `body` fields (not just hook). Detect third-person leak in any rendered field (canon body, brief body, synthesis body, journey-phase body, hub_title, hub_tagline, hero_candidates, cta.*). Patterns: "the creator", "the speaker", "<creatorName> says|argues|explains", "she says", "he says". Each match = hard-fail.

- [ ] **Step 3: New `check-third-person-leak.ts`** — standalone validator that loads all v2 rendered fields for a run and scans for leak patterns. Output: per-canon report + aggregate count. Hard-fail when count > 0.

- [ ] **Step 4: Hub-completeness validator** — small inline check inside check-citation-chain (or separate): verifies the run has channel_profile (v2) AND ≥3 canon nodes AND ≥1 synthesis AND ≥1 reader_journey AND ≥1 page_brief. Without all four, audit is "incomplete" and the Copy Hub Source button output's `metadata.quality.complete` flag is false.

- [ ] **Step 5: Typecheck + commit**

---

## Task 6.7: Audit page renderer extensions

**Files:**
- Modify: `apps/web/src/components/audit/HubSourceV2View.tsx`

**Why:** The current v2 renderer shows hero + canon bodies. After Tasks 6.1-6.5, there's also synthesis (pillar pages), reader journey (5-7 phase timeline), and page briefs (framing cards). All need to render. The renderer is already wired for these — but the conditional branches need to handle them being present.

- [ ] **Step 1: Pillar pages section** — synthesis canon nodes were already routed via `synthesisNodes` filter. Verify the section renders correctly when populated.

- [ ] **Step 2: Reader journey timeline** — render the journey canon node's `_index_phases` array as a horizontal timeline of 5-7 cards (each showing phase title + hook + body excerpt). Add this section between pillars and standard canon nodes.

- [ ] **Step 3: Page briefs section** — already routed via `v2Briefs`. Verify it renders correctly. Add cluster grouping (group spoke briefs under their parent pillar's slug).

- [ ] **Step 4: Quality flag banner** — at top of page, surface `metadata.quality.thirdPersonLeak` and `metadata.quality.complete` as visible banners. Red banner if leak detected. Yellow banner if incomplete. Green banner if both pass.

- [ ] **Step 5: Typecheck + commit**

---

## Task 6.8: Builder handoff documentation

**Files:**
- Create: `docs/builder-handoff/hub-source-document-format.md`

**Why:** When this becomes a SaaS, the builder team consumes the Hub Source Document JSON. Document the contract: which fields render, which inform writing, which are indexing.

- [ ] **Step 1: Write contract** — section per top-level entity (channel profile, canon, brief, journey), field-by-field rendering rules. Two big rules at the top: (a) render only fields without `_internal_*` or `_index_*` prefix; (b) any third-person language in rendered fields = hard fail, return the audit to source.

- [ ] **Step 2: Add the 4 quality bars** — read-aloud test, hero billboard test, paywall test, completeness test. The builder runs these against rendered output as smoke tests.

- [ ] **Step 3: Add migration note** — legacy v1 runs still exist (Hormozi, Walker, Jordan-pre-v2). Builder must check `schemaVersion`. v1 → render legacy fields with a "legacy audit" banner. v2 → render v2 fields per this contract.

- [ ] **Step 4: Commit**

---

## Task 6.9: Jordan v2 regen + iteration to 100% pass

**Files:** none (verification task)

**Why:** Jordan is the gold-standard test. Pass the four quality bars on a freshly regenerated Jordan v2 audit, OR iterate the relevant prompts until they pass.

- [ ] **Step 1: Reset Jordan v2 artifacts** — delete v2 channel_profile, canon_node, page_brief; keep video, segments, transcripts, VIC.

- [ ] **Step 2: Run new pipeline** — `seed-audit-v2.ts a8a05629... --per-video-canon`

- [ ] **Step 3: Quality bar 1 — read aloud** — pick 3 random canon bodies, 1 synthesis body, 1 journey phase body, 1 brief body. Read each aloud (operator). PASS = sounds like Jordan; FAIL = third-person attribution or summary-shape.

- [ ] **Step 4: Quality bar 2 — hero candidates** — all 5 billboard. Re-pass any awkward ones via Task 6.4 step 2.

- [ ] **Step 5: Quality bar 3 — paywall test** — pick the thinnest of: any canon, any synthesis, any brief body. Would Jordan paywall it? FAIL = body too summary-shaped; iterate the relevant body-writer prompt.

- [ ] **Step 6: Quality bar 4 — completeness** — channel + ≥3 canon + ≥1 synthesis + ≥1 reader_journey + ≥1 brief = green banner.

- [ ] **Step 7: Run validators** — citation chain + voice fingerprint + third-person leak. All must pass.

- [ ] **Step 8: Test Copy Hub Source** — paste output into a fresh document; verify all four sections present (channelProfile, canonNodes with bodies, pageBriefs with bodies, journey via canonNodes-with-kind-reader_journey).

- [ ] **Step 9: Iteration if needed** — for each failing bar, identify the relevant body-writer prompt and tighten. Common fixes: increase min word count, add explicit "do NOT summarize" instructions, add example excerpts in OUTPUT_FORMAT, raise citation density floor.

- [ ] **Step 10: Commit any prompt tightening done during iteration.**

---

## Task 6.10: Cross-archetype validation

**Files:** none (verification task)

**Why:** Same v2 pipeline must work on science-explainer (Walker) and operator-coach baseline (Hormozi). Both already have v1 audit data — regenerate both as v2 and verify.

- [ ] **Step 1: Walker v2 regen** — reset, run, quality-bar-check. Walker is science-explainer; expect analytical-detached tone, mechanism-first bodies, hedged claims, evidence ladders. Synthesis nodes should weave Walker's actual concepts (QQRT, two-process model, sleep architecture).

- [ ] **Step 2: Hormozi v2 regen** — reset, run, quality-bar-check. Operator-coach baseline; expect blunt-tactical tone, money-math anchors, contrarian inversions. Synthesis: existing Hormozi syntheses ("AI Is Leverage After Judgment" et al) should regenerate at v2 quality.

- [ ] **Step 3: Side-by-side compare** — read 1 canon body each from Jordan (operator-coach), Walker (science-explainer), Hormozi (operator-coach baseline). Voice should be distinctly different per archetype while all are first-person. PASS = a blind reader could tell which is which.

---

## Task 6.11: Final STOP gate

- [ ] **Step 1: Demo all three v2 audits side-by-side** in operator-debug + creator-preview modes.
- [ ] **Step 2: Test Copy Hub Source on all three** — paste each into a fresh document, verify completeness.
- [ ] **Step 3: User reviews + signs off** on the schema, voice, body quality, citation density, hero candidates, completeness banner.
- [ ] **Step 4: Tag the commit** as `phase-5-complete-v2-100`. Open PR.

---

## Self-Review

**Spec coverage** (cross-checking against the audit-the-audit findings):

| Gap surfaced in audit-the-audit | Phase 6 task |
|---|---|
| 0 synthesis nodes (no pillar pages) | 6.1 + 6.5 stage 6 |
| Reader journey not generated | 6.2 + 6.5 stage 7 |
| 0 page briefs (framing layer missing) | 6.3 + 6.5 stage 8 |
| One canon title lowercase | 6.4 step 1 |
| One hero candidate awkward | 6.4 step 2 |
| No v2-aware validators | 6.6 |
| Audit page renderer doesn't render synthesis/journey/briefs sections | 6.7 |
| Builder team has no written contract | 6.8 |
| Cross-archetype not validated | 6.10 |

All audit-the-audit findings have a specific task. The four quality bars are encoded in 6.9.

**Placeholder scan:** None. Every step has a concrete action. The three new body-writers (6.1-6.3) reuse the canon-body-writer pattern — no new architecture. The validator extensions (6.6) extend existing scripts. The renderer (6.7) extends the v2 component already shipped.

**Type consistency:** `SynthesisShell`, `ReaderJourneyShell`, `PageBriefShell` types share the discriminated-union pattern with `CanonShell_v2`. All three body-writers return `{ body, used_*_ids }` so the orchestrators are uniform. Schema spec doc (`docs/superpowers/specs/2026-05-01-hub-source-document-schema.md`) defines all field shapes — no inline duplication.

**Idempotency:** All v2 stages reuse the same pattern: existing `schemaVersion === 'v2'` rows are reused unless `--regen-*` flag set. Legacy v1 rows are ignored (won't be reused). Sibling reconciliation runs after all briefs persisted (idempotent — re-running gives same result).

**Risks:**
- Synthesis prompts have higher context (3+ child canon bodies + voice fingerprint + archetype voice). May exceed Codex CLI prompt limits on creators with 30+ canon nodes. Mitigation: cap input at top 10 most-page-worthy canons.
- Brief-body writer is the largest count (1 brief per canon = 8-12 bodies). Concurrency 3 = ~5 min total. Acceptable.
- Sibling reconciliation depends on cluster_role being set correctly during shell generation. If pillar slugs don't resolve, normalize-cluster-parents helper reused (already exists from Phase 1.7).

**Quality gates:** Same pattern as canon-body-writer. Min word count + min citation count + retry-on-failure. The orchestrator throws after max retries; failed bodies get empty payloads so the run completes (operator review picks up).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-phase-5-completion-to-100.md`.

**Decision: inline execution.** Same reasoning as the original Phase 5 plan — body-writer iteration benefits from being in this session. I'll commit each task as I go and not stop until Jordan v2 passes all four quality bars (Task 6.9).

Standards I'm holding:
- Every commit typechecks + (where applicable) tests pass
- No `_internal_*` or `_index_*` fields appear in default audit view
- The four quality bars are the only acceptance criteria
- The user reviews at Task 6.11 (STOP gate)
