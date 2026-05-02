# Phase 10 Results - Brief Coverage, Citation Density, Workshops, Synthesis, Visual Moments

Date: 2026-05-02
Branch: `feat/phase-10-brief-coverage`

## Summary

Phase 10 is code-complete through Task 10.5. I did not run live `--regen-*`
commands in this pass because Claude's Phase 9 finish chain could not be
positively confirmed as complete from this environment, and the handoff
explicitly said not to start another live regen while that chain may be active.

The current DB is therefore not a clean Phase 10 cohort score. Read-only reports
show that four cohort creators still have zero body counts in the local DB view,
which means the Phase 9/10 regen/backfill state is stale for scoring.

## Commits

- `ee250b8` - Task 10.1: brief writer fallback for thin-content canons
- `24f2c80` - Task 10.2: citation density floor in canon body quality gate
- `53b9c0d` - Task 10.3: Stage 11 workshop yield threshold lowered
- `4e7f421` - Task 10.4: synthesis pillar quality gate and regen fast path
- `f6be556` - Task 10.5: render visual moments inline in audit bodies

## Task 10.4 - Synthesis Pillar Quality

Implemented:

- Primary synthesis prompt now demands cross-canon weaving with one `##` section
  per child canon, explicit child titles, and `[cn_xxx]` cross-links.
- Synthesis quality gate now reuses `detectRefusalPattern`, `countCitations`,
  and `citationFloor`.
- Added synthesis link counting for both UUID segment citations and `[cn_xxx]`
  canon cross-links.
- Added fallback synthesis prompt for thin-source cases. Fallback drops UUID
  citation requirements and persists `_degraded` markers instead of silently
  skipping empty bodies.
- Added `--regen-synthesis-only` fast path in `seed-audit-v2.ts`.

Tests:

- Added `synthesis-body-writer.test.ts`.
- Focused synthesis test: 35 pass, 0 fail.
- Pipeline utility batch: 111 tests, 105 pass, 6 todo, 0 fail.
- `npx tsc --noEmit` in `packages/pipeline`: passed.

## Task 10.5 - Visual Moment Rendering

Implemented:

- Audit body renderer now detects `[VM:vm_xxx]` and `[vm_xxx]` visual-moment
  markers alongside existing UUID segment citations.
- Inline visual moment card renders timestamp, type, description, thumbnail or
  frame image when R2 public URL is available, and a YouTube deep link when the
  run has a YouTube ID.
- `getRunAudit` now exposes visual moment frame/thumbnail public URLs using
  `R2_PUBLIC_BASE_URL`.
- `HubSourceV2View` passes visual moments to canon, brief, and reader-journey
  body renderers.

Tests:

- Added `body-references.test.ts`.
- Web visual/audit tests: 17 pass, 0 fail.
- `pnpm --filter @creatorcanon/web typecheck`: passed.
- `pnpm --filter @creatorcanon/web build`: passed with the existing
  Sentry/OpenTelemetry static-analysis warnings.

## Read-Only Cohort Snapshot

`v2-cohort-report.ts` was run on all 7 cohort run IDs. Because live regens were
not run, the aggregate is not a Phase 10 score:

| Creator | Layers | Verification | Workshop Avg | Leaks | Voice Violations |
|---|---:|---:|---:|---:|---:|
| Jordan Platten | 6/7 | 86% | 95.6 | 0 | 0 |
| Matt Walker | 6/7 | 82% | 94.9 | 0 | 18 |
| Alex Hormozi | 7/7 | 92% | 95.6 | 0 | 0 |
| Derek Sivers | 2/7 | 0% | 0.0 | 0 | 0 |
| Jay Clouse | 3/7 | 0% | 0.0 | 6 | 2 |
| Nick Huber | 2/7 | 0% | 0.0 | 0 | 0 |
| Dr. Layne Norton | 3/7 | 0% | 0.0 | 0 | 4 |

`cohort-stats.ts` confirms the stale body state:

| Creator | Voice mode | Canon | Bodies | Bodies > 200w | Briefs |
|---|---|---:|---:|---:|---:|
| Jordan Platten | first_person | 11 | 11 | 11 | 11 |
| Matt Walker | third_person_editorial | 36 | 22 | 22 | 24 |
| Alex Hormozi | first_person | 58 | 22 | 22 | 35 |
| Derek Sivers | hybrid | 22 | 0 | 0 | 9 |
| Jay Clouse | first_person | 22 | 0 | 0 | 2 |
| Nick Huber | first_person | 22 | 0 | 0 | 12 |
| Layne Norton | third_person_editorial | 22 | 0 | 0 | 10 |

## Visual Moment Snapshot

Read-only check on sampled runs:

| Run | Visual moments | Canon VM markers | Brief VM markers |
|---|---:|---:|---:|
| Jordan Platten | 1 | 0 | 0 |
| Matt Walker | 37 | 0 | 0 |
| Alex Hormozi | 17 | 0 | 0 |

The renderer is ready for `[VM:...]` tokens, but the current persisted bodies do
not yet include visual moment markers. The next regen/design pass should emit
those markers where visual evidence fits.

## Deferred Verification

After Claude confirms the Phase 9 finish chain is complete, run:

```bash
cd packages/pipeline

PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce --regen-synthesis-only --voice-mode third_person_editorial
PIPELINE_QUALITY_MODE=codex_dev npx tsx ./src/scripts/seed-audit-v2.ts 037458ae-1439-4e56-a8da-aa967f2f5e1b --regen-synthesis-only --voice-mode first_person

pnpm exec tsx ./src/scripts/v2-cohort-report.ts \
  a8a05629-d400-4f71-a231-99614615521c \
  cf6ee665-e7a8-48dd-bf1b-2b045bbc2fce \
  037458ae-1439-4e56-a8da-aa967f2f5e1b \
  ad22df26-2b7f-4387-bcb3-19f0d9a06246 \
  a9c221d4-a482-4bc3-8e63-3aca0af05a5b \
  10c7b35f-7f57-43ed-ae70-fac3e5cd4581 \
  febba548-0056-412f-a3de-e100a7795aba

pnpm exec tsx ./src/scripts/cohort-stats.ts
```

The handoff requested `audit-the-audit.ts`, but that script is not present on
this branch. The available read-only validators are `v2-cohort-report.ts`,
`cohort-stats.ts`, `v2-completeness-report.ts`, `check-voice-mode.ts`,
`check-third-person-leak.ts`, and `validate-workshops.ts`.
