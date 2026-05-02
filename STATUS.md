# Phase G Status - 2026-05-02

## Branches and PRs

- Phase G branch: `feat/phase-g-domain-automation`
- Draft PR: https://github.com/mariosdem2008/CreatorCanon/pull/18
- Latest pushed commit: `9f60937 feat(phase-G.9): add creatorcanon subdomain fallback`

## Phase G - Domain + DNS Automation

Completed:

- G.1 DB schema and migrations for `deployment`, hosting state, DB triggers, and follow-up `last_error` migration.
- G.2 typed Vercel API client for projects, domains, verification, certificates, and deployments.
- G.3 per-hub Vercel project creation with `HUB_ID`, DB URL, app URL, and hub root domain env propagation.
- G.4 custom-domain attach API and onboarding UI with DNS record guidance.
- G.5 domain verification polling using Vercel project-domain verification.
- G.6 SSL readiness polling with managed cert issue/read support.
- G.7 deploy trigger API with alias readiness checks and persisted deployment errors.
- G.8 redeploy-on-edit integration from Save & Republish.
- G.9 CreatorCanon subdomain fallback using wildcard host routing, fallback public URL helpers, owned fallback-domain attachment, and dashboard copy/link updates.
- G.10 final validation and draft PR update.

Blockers:

- No implementation blockers remain.
- Live end-to-end DNS/Vercel verification still needs real Vercel credentials plus a test wildcard domain in Mario's environment.

Known notes:

- `pnpm --filter @creatorcanon/web build` passes, but Next emits existing Sentry/OpenTelemetry `require-in-the-middle` critical dependency warnings.
- Web package `pnpm test` is not used on Windows because the package script shells through `bash`; direct `node --import ... --test src/**/*.test.ts` passes.

Validation:

- `pnpm typecheck` passed.
- `pnpm --filter @creatorcanon/web build` passed.
- `pnpm --filter @creatorcanon/db test` passed.
- Direct web tests passed: `node --import "../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs" --test src/**/*.test.ts` from `apps/web` (251 passing).

## Phase C - Distribution Profiles UI

Not started. Phase G completed through G.10 within this branch, so Phase C should start from a separate worktree and branch only after Mario confirms priority or if continuing the autonomous run.
