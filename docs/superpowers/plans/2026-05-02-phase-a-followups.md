# Phase A — Code Review Follow-ups

> Captured 2026-05-02 from independent code review of PR #19.
> HIGH issues (security + API contract) fixed inline before merge.
> MEDIUM issues tracked here for Phase B integration sweep.

## Fixed in this PR (HIGH)

- **Prototype-pollution defense in calculator-forge.ts** — variable ids validated against an identifier regex; rejected if matching `__proto__` / `constructor` / `prototype`. Defaults map uses `Object.create(null)` for belt-and-braces. Two new tests cover both the dunder-name and the dotted-name attack vectors. Total tests: 52 → 54 passing.
- **GET /api/runs/[runId]/synthesis contract documented** — the route returns 200 with `bundle: null` when an attempt exists but no successful bundle yet. This intentionally diverges from the plan's "404 if not complete" so polling callers have one happy path. Header docstring on the route is now the source of truth.

## Tracked for Phase B (MEDIUM)

1. **Diagnostic scoring contract divergence.**
   `packages/synthesis/src/types.ts:164` says scoring is keyed by sorted answer-value joinKey ("a|b|c"). `diagnostic-composer.ts buildScoringRubric` keys by single `job.id`. Phase B's diagnostic UI must compute a composite key — fix the implementation OR adjust the type doc + Phase B reads single-job answers.

2. **Synchronous synthesis vs `maxDuration = 60`.**
   `apps/web/src/app/api/runs/[runId]/synthesize/route.ts:41` runs synthesis in-route. Hormozi-scale runs (~80 canons × ~1s/Codex call across sequential phases) will frequently exceed 60s and return 504. Phase B must move this to a background queue (Trigger.dev or a polling worker). Until then, Phase D onboarding cannot rely on this endpoint synchronously.

3. **Composer router does not incorporate `productGoal`.**
   Plan A.7 said "archetype × goal → composer list" but `router.ts` keys on archetype only. `productGoal === 'public_reference'` should probably exclude the funnel composer; for an operator-coach hub it currently always emits the full matrix. Phase D will hit this when goal-specific shells appear.

4. **ActionPlan composer fails the entire bundle on a single step parse error.**
   `action-plan-composer.ts:217` throws unconditionally on per-step parse failure inside a `Promise.all`. One bad LLM response kills a 60s run. Make per-step failures soft (skip step + log warning).

5. **`evaluateFormula` is not in the synthesis package barrel export.**
   `packages/synthesis/src/index.ts` exports `composeCalculators` but not `evaluateFormula`. The operator-coach `CalculatorPage` injects it as a prop — so Phase B's hub-route mount needs to deep-import from `@creatorcanon/synthesis/composers/calculator-forge` (allowed by the export map). Either add `evaluateFormula` to the barrel for ergonomics, or document the deep-import path in the shell's README.

6. **Unused `drizzle-orm` dependency on the synthesis package.**
   `packages/synthesis/package.json` declares `drizzle-orm` but synthesis source never imports it. Drop the dep or surface a real DB call.

## Tracked for Phase H/I/J tuning (LOW)

- **`topoSortCanons` "title-mention" heuristic is aggressive.** A canon titled "scale" or "team" can become a spurious prerequisite of any canon whose body mentions that word. Phase A is fine (operator-coach corpora are content-rich); Phase H + I + J should evaluate whether to tighten the substring match (require token boundaries + minimum-token-length).
- **Tests are happy-path-heavy.** Composer router doesn't have a test for malformed Codex JSON; runner doesn't have a test for one composer crashing while others succeed; data-adapter doesn't have a test for archetype-mismatch input. Phase B QA pass should add these.
- **Smoke fixture stub uses `prompt.includes('login')` for funnel routing.** Brittle to prompt rewording. When Phase H lands, refactor stub-codex into a proper test double with `prompt.match(/^...$/)` discriminators.

## Notes from review

- Codex-territory check: clean. No files at `apps/web/src/lib/vercel/`, `apps/web/src/components/onboarding/`, `apps/web/src/app/api/{domains,deploy}/`, `apps/web/src/lib/distribution/`. Only migration 0017 added; 0022+ untouched.
- Pipeline → synthesis dependency exists at the package.json level; synthesis source has no upward import (verified). Cycle break is real.
- Calculator formula evaluator is well-built: rejects `Math.X` access at tokenize, no `eval` / `Function`, identifiers are pure variable lookup. The new `__proto__` defense is on top of that.
- DB schema: FKs use `text` to match `generation_run.id` (not `uuid` per plan — agent flagged this). Cascades sensible. Indexes adequate for the polling pattern.
