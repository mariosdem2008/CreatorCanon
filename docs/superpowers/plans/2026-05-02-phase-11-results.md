# Phase 11 Results: Agency Polish

Date: 2026-05-02
Branch: `feat/phase-11-agency-polish`
Base: stacked on `feat/phase-10-brief-coverage` because Phase 9/10 PRs are still draft and not merged to `main`.

## Scope Completed

1. Task 11.1 — `cdf2e4f` — deterministic editorial polish pass.
   - Added `editorial-polish.ts` pure transforms for dash normalization, quote normalization, Oxford comma cleanup, and cadence analysis.
   - Added cohort dry-run script with `ensureDbHealthy()`.
   - Dry-run only: `bodies=244 changed=82 cadenceFlags=1`.

2. Task 11.2 — `cc5ead8` — multi-pass hero critique and rewrite.
   - Kept the existing awkward-line rewrite pass.
   - Added critique and rewrite-from-critique prompts for the final five hero candidates.
   - No live hero regen was run.

3. Task 11.3 — `fcf644d` — voice fingerprint scoring gate.
   - Added embedding-based `voice-fingerprint-score.ts` with injectable embedder and OpenAI `text-embedding-3-small` provider.
   - Wired optional voice drift retry guidance into canon body writing.
   - No live embedding cohort score was run because `OPENAI_API_KEY` was not present in the shell environment.

4. Task 11.4 — `64cd835` — manual paragraph review surface.
   - Added audit-page paragraph rewrite UI for canon bodies.
   - Added authenticated `POST /api/runs/[runId]/canon/[canonId]/rewrite-paragraph`.
   - Route updates the canon payload body and records `_manual_review` metadata.
   - Codex CLI rewrite is gated behind Codex CLI env (`PIPELINE_OPENAI_PROVIDER=codex_cli` or `CODEX_CLI_MODEL`).

5. Task 11.5 — `670ba42` — SEO and cluster-role completeness.
   - Added `brief-completeness.ts`.
   - Validates and fills `tier`, `_internal_seo.primaryKeyword`, and `cta.primary`.
   - Brief body results now carry completed brief shells into persistence.

## Read-Only Cohort Snapshot

No `--regen-*` runs were started in this phase. The database still reflects the pre-Phase-11 persisted cohort, so the cohort score is not expected to move until Phase 9/10/11 branches are merged and the cohort is regenerated.

`cohort-stats.ts`:

| Creator | Voice mode | Canon | Bodies | Bodies >200w | Briefs |
|---|---:|---:|---:|---:|---:|
| Jordan Platten | first_person | 11 | 11 | 11 | 11 |
| Matt Walker | third_person_editorial | 36 | 22 | 22 | 24 |
| Alex Hormozi | first_person | 58 | 22 | 22 | 35 |
| Derek Sivers | hybrid | 22 | 0 | 0 | 9 |
| Jay Clouse | first_person | 22 | 0 | 0 | 2 |
| Nick Huber | first_person | 22 | 0 | 0 | 12 |
| Dr. Layne Norton | third_person_editorial | 22 | 0 | 0 | 10 |

`v2-cohort-report.ts`:

| Creator | Layers | Verification | Workshop avg | 3P leaks | Voice viols |
|---|---:|---:|---:|---:|---:|
| Jordan Platten | 6/7 | 86% | 95.6 | 0 | 0 |
| Matt Walker | 6/7 | 82% | 94.9 | 0 | 18 |
| Alex Hormozi | 7/7 | 92% | 95.6 | 0 | 0 |
| Derek Sivers | 2/7 | 0% | 0.0 | 0 | 0 |
| Jay Clouse | 3/7 | 0% | 0.0 | 6 | 2 |
| Nick Huber | 2/7 | 0% | 0.0 | 0 | 0 |
| Dr. Layne Norton | 3/7 | 0% | 0.0 | 0 | 4 |

Aggregate verification: 37.1%. This is stale-data status, not a Phase 11 code-quality result.

Heuristic `check-voice-fingerprint.ts` brief scores:

| Creator | Briefs | Avg overall | Preserve terms | Tone score | Profanity violations |
|---|---:|---:|---:|---:|---:|
| Jordan Platten | 11 | 93/100 | 92% | 88/100 | 0 |
| Matt Walker | 24 | 82/100 | 89% | 56/100 | 0 |
| Alex Hormozi | 35 | 74/100 | 45% | 77/100 | 0 |
| Derek Sivers | 9 | 55/100 | 9% | 58/100 | 0 |
| Jay Clouse | 2 | 92/100 | 91% | 85/100 | 0 |
| Nick Huber | 12 | 86/100 | 78% | 80/100 | 0 |
| Dr. Layne Norton | 10 | 71/100 | 43% | 69/100 | 0 |

## Validation

- Pipeline typecheck: passed.
- Pipeline utility batch: 132 tests, 126 pass, 6 todo, 0 fail.
- Web audit/manual-review tests: 23 pass, 0 fail.
- Web typecheck: passed.
- Web production build: passed.
- DB smoke: `peek-canon-body.ts a8a05629-d400-4f71-a231-99614615521c 0` returned Jordan's 818-word first body.

## Remaining Phase 12 / Post-Merge Work

1. Merge Phase 9, Phase 10, and this Phase 11 branch in order.
2. Run the full cohort regeneration after the Phase 9 background chain is confirmed complete.
3. Run embedding-based voice fingerprint scoring with `OPENAI_API_KEY` available.
4. Visit one audit page in the browser and execute a manual paragraph rewrite with Codex CLI env configured.
5. Re-run `v2-cohort-report.ts` and update the target 9.5+/10 score from fresh regenerated data.
