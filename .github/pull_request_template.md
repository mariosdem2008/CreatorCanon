<!--
  Thanks for opening a PR. Fill in the sections below. Delete whatever doesn't
  apply. Keep PRs narrow — one concern per PR merges faster and reverts cleaner.
-->

## Summary

<!-- 1-3 sentences: what changes, why now, which ticket this closes. -->

## Type of change

<!-- Pick one. -->

- [ ] feat — user-visible new capability
- [ ] fix — bug fix
- [ ] docs — documentation only
- [ ] refactor — no behavior change
- [ ] test — added or updated tests
- [ ] chore — tooling, deps, CI, build
- [ ] migration — schema / data migration (requires migration-safety checkbox below)

## Screenshots / recordings

<!-- For any UI change: before + after on desktop, and a mobile crop if relevant. -->

## Migration safety

- [ ] This PR does not change the DB schema, **or** if it does, the migration has been reviewed for:
  - [ ] backwards-compatible deploy order (expand → migrate → contract)
  - [ ] no table rewrites on hot paths
  - [ ] nullable / default added for new non-null columns on existing rows
  - [ ] generated SQL diff inspected in `packages/db/drizzle/out/`

## Design QA needed?

- [ ] Yes — this touches a creator-app surface, hub runtime, or marketing page and needs design sign-off before merge.
- [ ] No — purely internal / admin / non-visual.

## Pipeline cost impact

- [ ] No new provider calls, no prompt/token changes, no fan-out changes.
- [ ] Yes — estimated cost-per-run delta: `$_____`. Cost ledger updated. Per-run cap still respected.

## Test plan

<!--
  Concrete checklist the reviewer can walk through.
  Example:
    - [ ] `pnpm typecheck` green
    - [ ] Unit test added in `packages/pipeline/__tests__/...`
    - [ ] Manual: connect YouTube, confirm redirect lands on /onboard
-->

- [ ]
- [ ]
- [ ]
