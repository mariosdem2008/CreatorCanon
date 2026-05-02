# Phase A — Operator-Coach Product Synthesis: Results

**Branch:** `feat/phase-a-operator-coach-synthesis`
**Run:** autonomous Claude Opus 4.7 (1M ctx) executor session, 2026-05-02
**Plan:** `PHASE_A_PLAN.md` (12 tasks A.1–A.12)
**Worktree:** `SaaS/.worktrees/phase-a-execute`

---

## What shipped

A complete product-synthesis layer that converts a creator's audit substrate
(ChannelProfile_v2 + CanonNode + EvidenceRegistry) into a typed
ProductBundle and renders it as the first archetype shell.

### Code

- `packages/synthesis/` — new workspace package
  - 5 composer agents: ActionPlan, Worksheet Forge, Calculator Forge,
    Diagnostic, Funnel
  - Composer router (archetype → component set)
  - Synthesis runner (orchestrator)
  - Smoke-fixture test (cohort smoke deferred per directive)
- `packages/db/src/schema/synthesis.ts` + migration `0017_phase_a_synthesis_tables.sql`
  - `synthesis_run` (status, costs, errors)
  - `product_bundle` (jsonb payload + schema_version)
- `apps/web/src/app/api/runs/[runId]/synthesize/route.ts` — POST trigger
- `apps/web/src/app/api/runs/[runId]/synthesis/route.ts` — GET retrieval
- `packages/pipeline/src/scripts/run-synthesis.ts` — CLI runner for
  operator-driven cohort runs
- `packages/pipeline/src/scripts/peek-product-bundle.ts` — qualitative
  inspector
- `packages/pipeline/src/scripts/inspect-synthesis-state.ts` — operator
  diagnostic
- `apps/web/src/components/hub/shells/operator-coach/` — first archetype
  shell + data adapter

### Architecture

```
CanonNode/ChannelProfile (audit substrate)
        |
        v
+------------------------------+
|  packages/synthesis          |
|  - composers/                |
|    - action-plan-composer    |  -> ActionPlanComponent
|    - worksheet-forge         |  -> WorksheetComponent[]
|    - calculator-forge        |  -> CalculatorComponent[]
|    - diagnostic-composer     |  -> DiagnosticComponent
|    - funnel-composer         |  -> FunnelComponent
|  - runner.ts                 |  Promise.all over composers
|  - composers/router.ts       |  archetype -> component set
+------------------------------+
        |
        v
ProductBundle (typed, schema_version: 'product_bundle_v1')
        |
        +--> POST /api/runs/[runId]/synthesize  (persists product_bundle)
        +--> GET  /api/runs/[runId]/synthesis    (returns latest bundle)
        +--> CLI  tsx run-synthesis.ts <runId>   (operator-driven runs)
        |
        v
adaptBundleForOperatorCoach(bundle) -> OperatorCoachShellProps
        |
        v
HomePage / ActionPlanPage / WorksheetPage / CalculatorPage / LibraryPage
```

---

## Tasks completed

| Task | Title                                                         | Commit SHA |
|------|---------------------------------------------------------------|------------|
| A.1  | Synthesis package scaffold + ProductBundle types              | `c1d21b4`  |
| A.2  | ActionPlan composer                                           | `f645395`  |
| A.3  | Worksheet Forge                                               | `021352f`  |
| A.4  | Calculator Forge                                              | `7840c83`  |
| A.5  | Diagnostic composer                                           | `73ad3b7` (+ `16b1988` fix) |
| A.6  | Funnel composer                                               | `14fd569`  |
| A.7  | Composer Router + Synthesis Runner                            | `2410e45`  |
| A.8  | DB schema synthesis_run + product_bundle (migration 0017)     | `d7dae7e`  |
| A.9  | Synthesis API endpoints (POST /synthesize, GET /synthesis)    | `ec5b11a`  |
| A.10 | CLI runner + fixture-only cohort smoke                        | `408e326`  |
| A.11 | Operator-coach shell + data adapter                           | `09f8e0e`  |
| A.12 | Results doc + draft PR                                        | (this commit) |

Plus `9c727db` fix for the synthesis→pipeline workspace cycle that turbo
detected at root typecheck.

---

## Tasks deferred (with reason)

### Live cohort smoke run (per Phase A directive)

The plan calls for live synthesis runs against the 4 operator-coach cohort
creators (Hormozi, Huber, Clouse, Jordan). Per the autonomous-executor
directive, this was explicitly NOT done in-session (cost / time
prohibitive in agent-only context).

What was done instead:
- `packages/synthesis/src/smoke-fixture.test.ts`: end-to-end runSynthesis
  against a fabricated Hormozi-style operator-coach substrate (~10 canon
  nodes spanning all 4 phases + 3 aphorisms + audience jobs). Asserts
  full bundle shape including 4 action plan phases, ≥1 calculator, ≥1
  worksheet per eligible canon, diagnostic with scoring, lead_magnet
  funnel shape.
- `packages/pipeline/src/scripts/run-synthesis.ts` + `peek-product-bundle.ts`
  + `inspect-synthesis-state.ts` are ready for operator-driven runs.

To trigger a live run (for Mario):
```bash
cd packages/pipeline
PIPELINE_OPENAI_PROVIDER=codex_cli npx tsx ./src/scripts/run-synthesis.ts \
  037458ae-1439-4e56-a8da-aa967f2f5e1b --goal lead_magnet
npx tsx ./src/scripts/peek-product-bundle.ts \
  037458ae-1439-4e56-a8da-aa967f2f5e1b
```

### Hub route mounting

Wiring the operator-coach shell into `apps/web/src/app/h/[hubSlug]/...`
route segments was deferred. Reason: that path is shared territory with
Codex's parallel Phase G distribution work; touching the route segment
risks a merge conflict. The shell is shipped as a self-contained library
(barrel `@/components/hub/shells/operator-coach`); mounting it lands as
a Phase B follow-up.

### Component editor surfaces

The plan's Phase B (editor UI for action plan steps, worksheet field
editing, calculator formula tweaking) is deliberately out of Phase A's
scope. Phase A produces the bundle; Phase B will let operators tune it.

---

## Test results

```
pnpm --filter @creatorcanon/synthesis test
  ▶ classifyCanonByPhase                  (5 tests)
  ▶ topoSortCanons                         (4 tests)
  ▶ composeActionPlan                      (3 tests)
  ▶ decomposeBodyToFields                  (3 tests)
  ▶ detectDecisionBranches                 (2 tests)
  ▶ composeWorksheets                      (2 tests)
  ▶ extractQuantifiedClaims                (5 tests)
  ▶ evaluateFormula                        (8 tests)
  ▶ composeCalculators                     (2 tests)
  ▶ extractAudienceJobs                    (3 tests)
  ▶ buildScoringRubric                     (2 tests)
  ▶ composeDiagnostic                      (1 test)
  ▶ pickShareCardCanons                    (2 tests)
  ▶ composeFunnel                          (3 tests)
  ▶ routeComposers                         (4 tests)
  ▶ runSynthesis                           (2 tests)
  ▶ Phase A cohort smoke (fixture)         (1 test)
  ───────────────────────────────────────────────
  Total: 52 tests, 17 suites, 52 pass, 0 fail
```

```
pnpm --filter @creatorcanon/web test     # data adapter
  ▶ adaptBundleForOperatorCoach            (4 tests)
  Total: 4 pass
```

```
pnpm typecheck    (turbo full graph)
  Tasks:    20 successful, 20 total
  Time:     ~15s (8 cached)
```

---

## Composer-call cost (estimated)

Per the plan target (<200 Codex calls per creator). With the fixture
substrate (10 canons, 3 audience jobs, lead_magnet goal):

- ActionPlan: 7 step calls + 2 prose (intro/outro) = 9
- Worksheets: 7 setup calls (one per playbook/framework canon)
- Calculators: 1–2 (only clusters meeting threshold of 3+ claims)
- Diagnostic: 2 (questions + intro)
- Funnel: 1 (lead capture) + 1 (inline CTAs) + 3 (share cards) = 5

**Total estimate: ~24–25 Codex calls** for a fixture-sized substrate.
Real cohort creators (Hormozi has ~80 canons) will scale roughly
linearly with the playbook/framework count, so expected range
**80–150 calls per real creator** — comfortably under the 200 budget.

---

## Phase B follow-ups

1. **Hub route mount** — wire `apps/web/src/app/h/[hubSlug]/` to mount the
   operator-coach shell when `channelProfile.archetype === 'operator-coach'`.
   Coordinate with Codex on Phase G to avoid path collisions.
2. **Live cohort smoke** — Mario triggers `run-synthesis.ts` for the 4
   operator-coach creators; spot-check via `peek-product-bundle.ts`;
   capture cost-per-creator + bundle quality notes here.
3. **Editor surfaces** — operators want to tune action plan step copy,
   add/remove steps, override calculator formulas, edit diagnostic
   questions. Build small per-component edit modals + an
   `update-product-bundle` mutation.
4. **localStorage progress** — action plan checkboxes + worksheet field
   values currently don't persist. Add per-hub `bundleProgress` localStorage
   slice.
5. **Calculator UX polish** — slider input on numeric fields; "this is
   what changes if you double X" sensitivity view.
6. **Worksheet decision-branch evaluation** — decision_branch fields
   currently render as static "if X: Y" callouts. Phase B turns them
   into interactive forks that reveal child fields when triggered.

---

## Cohort coverage (when smoke is run)

The four operator-coach cohort creators (run IDs from the plan):

| Creator        | Run ID                                   | Status |
|----------------|------------------------------------------|--------|
| Jordan Platten | a8a05629-d400-4f71-a231-99614615521c     | pending Mario trigger |
| Alex Hormozi   | 037458ae-1439-4e56-a8da-aa967f2f5e1b     | pending Mario trigger |
| Jay Clouse     | a9c221d4-a482-4bc3-8e63-3aca0af05a5b     | pending Mario trigger |
| Nick Huber     | 10c7b35f-7f57-43ed-ae70-fac3e5cd4581     | pending Mario trigger |

Mario can update this table after running the CLI smoke against each.

---

## Known issues / blockers

- **None blocking.** All composer signatures stable; ProductBundle schema
  versioned (`product_bundle_v1`); migration is reversible.
- **One assumption to validate live**: per-canon audience-job tagging
  (`_index_audience_job_tags`) is required by the diagnostic composer's
  scoring rubric for routing to work well. If real cohort canons don't
  carry this tag, the diagnostic still emits but routes only to the
  default action plan phase. Phase 11's tagging stage was supposed to
  populate this — verify on first cohort smoke and patch the audit
  pipeline if missing.
- **Synthesis runtime budget**: API route `maxDuration=60`. If a real
  creator's full synthesis takes longer than 60s (>~50 Codex calls at
  ~1s/call after parallelism), POST will time out before persisting.
  Mitigation: switch synthesize endpoint to enqueue + poll pattern via
  Trigger.dev. Out of Phase A scope.
