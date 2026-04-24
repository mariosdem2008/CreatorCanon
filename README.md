# CreatorCanon SaaS Monorepo

Creator archive productization SaaS: YouTube channel to hosted knowledge hub
with grounded citations, draft pages, source evidence, Stripe-gated runs, local
fallback execution, admin rescue, and public hub publishing.

## Layout

```text
SaaS/
  apps/
    web/          Next.js app: marketing, creator app, public hubs, admin
    worker/       Trigger.dev worker wrapper around the shared pipeline
  packages/
    auth/         Auth.js v5 config and Google OAuth
    config/       shared TypeScript and lint config
    core/         shared env, pricing, ids, pipeline stage registry
    cost-ledger/  cost accounting primitives
    db/           Drizzle schema and Postgres client
    pipeline/     pipeline runner, stage contracts, publish helpers, smoke checks
    ui/           shared primitives and design tokens
```

## Local Alpha Smoke

```bash
pnpm install
pnpm dev:db:reset
pnpm smoke:local
pnpm smoke:browser:local
pnpm --filter @creatorcanon/web dev
```

Local smoke uses Docker Postgres with pgvector, local filesystem artifacts,
seeded creator data, dev-only auth bypass, the shared pipeline runner, draft
page generation, source evidence, publish-to-hub, and public hub rendering.
Open `http://localhost:3000/sign-in` and use the local dev sign-in button.

`pnpm smoke:browser:local` is the deterministic browser pass for the visible
MVP surfaces. It uses the local dev auth bypass, never touches Google OAuth,
Stripe, R2, Trigger, or live provider services, and writes Playwright snapshots
under ignored `.local/browser-smoke/`. It verifies the creator app, project
review/pages, admin run rescue routes, the public hub, the public page, and all
three hub templates by switching only the seeded local hub theme.

To prove the transcription fallback without scraping YouTube audio, place short
`.m4a` files under `.local/audio-fixtures/` and run
`pnpm dev:seed:audio-fixtures`. By default, sorted files map to
`local-smoke-video-1..3`; optionally add `.local/audio-fixtures/manifest.json`
with `videoId`, `filename`, and optional `durationSeconds` fields.
Then run `pnpm smoke:audio-fixtures` to force one audio-backed video through
transcription, normalization, segmentation, and source-ready transcript storage.

To turn a real selected alpha run into an audio-backed run, use:

```powershell
$env:ALPHA_AUDIO_EXTRACT_CONFIRM="true"
pnpm extract:alpha-audio --run "<paid-or-review-ready-run-id>"
```

This is an operator-owned alpha lane. It downloads selected YouTube audio with
`yt-dlp`, normalizes it to `.m4a`, uploads it to artifact storage, and writes
`media_asset(type='audio_m4a')` rows so the existing transcript pipeline can
continue through the OpenAI transcription path. Add `--dispatch` only when you
want the command to hand off to the shared pipeline immediately after
extraction. `env:doctor` checks `yt-dlp`, `ffmpeg`, and the challenge runtime
(`deno` by default) before you rely on this path.

For hosted self-serve real-video runs, set `PIPELINE_DISPATCH_MODE=worker` and
run the containerized worker. In worker mode, paid runs stay `queued` after the
webhook, the hosted worker claims them, and `ensure_transcripts` will
automatically extract YouTube audio when captions are unavailable and no
`audio_m4a` asset exists yet.

## Private-Alpha Smoke

Use this after real test/preview env keys are configured:

```powershell
pnpm env:doctor
$env:ALPHA_SMOKE_RUN_ID="<existing-paid-or-review-ready-run-id>"
pnpm smoke:alpha
```

`env:doctor` is read-only. `smoke:alpha` is intentionally side-effectful: it
runs migrations, verifies R2 put/get/delete, creates a Stripe test Checkout
session, runs the selected generation run if it is not already published,
publishes the hub, and verifies the release manifest includes source refs.

For an operator-owned seeded demo that avoids Google login, use:

```powershell
$env:ALPHA_E2E_CONFIRM="true"
pnpm alpha:e2e
```

`alpha:e2e` writes fixed alpha seed rows and artifacts. It refuses to run
against a non-local database or R2 bucket unless `ALPHA_E2E_CONFIRM=true`.

### Deferred YouTube Caption Proof

The owner OAuth `captions.download` lane is wired and the alpha account has
granted the required `youtube.force-ssl` scope. The current alpha channel videos
authoritatively report no caption tracks, so a full source-positive
`youtube_captions` proof is deferred until at least one selected channel video
has captions enabled in YouTube Studio. This is not blocking the current MVP
build because the safe audio-asset transcription lane already proves
source-positive hub publishing.

## Scripts

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Runs web and worker dev processes in parallel    |
| `pnpm build`        | Builds the workspace                             |
| `pnpm lint`         | Runs lint across packages                        |
| `pnpm typecheck`    | Runs TypeScript checks across packages           |
| `pnpm test`         | Runs package tests                               |
| `pnpm db:migrate`   | Applies Drizzle migrations                       |
| `pnpm db:studio`    | Opens Drizzle Studio                             |
| `pnpm dev:db:reset` | Resets local Docker Postgres and writes envs     |
| `pnpm smoke:local`  | Deterministic local end-to-end smoke             |
| `pnpm smoke:browser:local` | Deterministic local browser smoke for MVP routes |
| `pnpm smoke:all:local` | Resets DB, runs local pipeline smoke, then browser smoke |
| `pnpm dev:seed:audio-fixtures` | Seeds local `.m4a` fixtures as reusable audio assets |
| `pnpm smoke:audio-fixtures` | Verifies audio fixture transcription reaches segments |
| `pnpm extract:alpha-audio` | Operator extraction lane for real selected alpha videos |
| `pnpm inspect:alpha-run` | Read-only operator diagnostics for one alpha run |
| `pnpm inspect:alpha-content` | Read-only content-quality summary for one alpha run |
| `pnpm rescue:alpha-run` | Audited operator rescue for one paid stuck alpha run |
| `pnpm smoke:trigger-dispatch` | Dispatches one paid queued alpha run through Trigger and waits for draft readiness |
| `pnpm env:doctor`   | Read-only alpha environment readiness check      |
| `pnpm smoke:alpha`  | Real-service alpha smoke for a selected run      |
| `pnpm alpha:e2e`    | Seeded alpha demo against explicit target env    |
| `pnpm format`       | Formats the workspace                            |

## Environment

Copy `.env.example` to `.env` for real preview/test environments. Local smoke
writes `.env.local` and `apps/web/.env.local` automatically.

Required local mode defaults are generated by `pnpm dev:db:reset`.

Required private-alpha/test mode values:

- `DATABASE_URL` for Neon/Postgres.
- `ARTIFACT_STORAGE=r2` plus `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, and `R2_PUBLIC_BASE_URL`.
- `AUTH_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.
- `YOUTUBE_OAUTH_CLIENT_ID` and `YOUTUBE_OAUTH_CLIENT_SECRET`.
- `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_WEBHOOK_SECRET=whsec_...`.
- Optional `TRIGGER_SECRET_KEY` and `TRIGGER_PROJECT_ID` if you still want the
  Trigger task path available. The hosted binary-capable worker path does not
  require Trigger.
- Optional extraction overrides: `AUDIO_EXTRACTION_YTDLP_BIN`,
  `AUDIO_EXTRACTION_FFMPEG_BIN`, and
  `AUDIO_EXTRACTION_CHALLENGE_RUNTIME_BIN`. If omitted, the operator extraction
  lane uses `yt-dlp`, `ffmpeg`, and `deno` from `PATH`.
- `ALPHA_AUDIO_EXTRACT_CONFIRM=true` when running the extraction lane against a
  non-local environment.
- `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_HUB_ROOT_DOMAIN`.

Production uses the same keys, but Stripe must move from test mode to live mode
only after the private-alpha smoke passes.

## Deployment

- Web deploys to Vercel from `apps/web`.
- Binary-capable hosted worker deploys from `apps/worker` using the provided
  Dockerfile and Railway config. It installs `yt-dlp`, `ffmpeg`, and `deno`,
  claims queued runs when `PIPELINE_DISPATCH_MODE=worker`, and executes the
  shared pipeline end to end.
- Trigger.dev remains available for task-driven fallback and operator smokes,
  but worker mode is the durable hosted path for real-video runs.
- Hosted private-alpha readiness is tracked in `docs/hosted-alpha-readiness.md`.
