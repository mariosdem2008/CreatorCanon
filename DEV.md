# Local development

## Prereqs

1. **Node 20.11+ + pnpm 9+**.
2. **Postgres** running (use `pnpm dev:db:up` for the docker-compose dev DB, or point `DATABASE_URL` at your own).
3. **`.env` or `.env.local`** at the repo root with:
   ```
   DATABASE_URL=postgres://...
   OPENAI_API_KEY=sk-...
   GEMINI_API_KEY=...
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=...
   R2_PUBLIC_BASE_URL=...
   AUTH_SECRET=...                 # any 32+ char string for local
   AUTH_GOOGLE_ID=...
   AUTH_GOOGLE_SECRET=...
   YOUTUBE_OAUTH_CLIENT_ID=...
   YOUTUBE_OAUTH_CLIENT_SECRET=...
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   NEXT_PUBLIC_HUB_ROOT_DOMAIN=localhost:3000
   TRIGGER_SECRET_KEY=tr_dev_...   # from Trigger.dev dashboard, OR see "Trigger.dev setup" below
   ```

## One-time setup

```bash
pnpm install
pnpm db:migrate
```

## Run everything

```bash
pnpm dev
```

This spins up three parallel processes via Turbo + concurrently:

| Label | What | Port |
|---|---|---|
| `web` | Next.js dev server (the SaaS app) | 3000 |
| `queue` | Worker queue runner (in-process pipeline executor) | — |
| `trigger` | Trigger.dev local dev runtime (handles upload-transcription tasks) | — |

Open `http://localhost:3000` and click through the flow:

1. **`/sign-in`** → log in (Google OAuth)
2. **`/app/uploads`** → drag a small `.mp3` or `.mp4` (under 25 MB; chunking not yet implemented). Watch progress: `uploading → uploaded → transcribing → ready`
3. **`/app/library`** → your upload appears with the "Uploaded" badge
4. **`/app/projects/new`** → create a project, pick your uploads as sources
5. Click "Generate" → watch the `queue` and `trigger` terminals scroll as `discovery → synthesis → verify → merge → adapt` runs
6. **`/h/<hubSlug>`** → the rendered hub (loads `editorial_atlas_v1` manifest from R2)

Inspect what landed for any run:
```bash
pnpm inspect:run --runId <runId>
```

## Trigger.dev setup (first time)

Manual upload transcription requires Trigger.dev. If you don't have an account:
1. Sign up at https://trigger.dev (free tier)
2. Create a project
3. Copy `TRIGGER_SECRET_KEY` (and `TRIGGER_PROJECT_ID` if shown) into your `.env`

Without this env var, the `trigger` process will fail at startup. The `queue` process keeps running independently — but `/api/upload/complete` will return 502 because it can't enqueue the transcription task. So uploads are blocked until Trigger.dev is set up.

## Single-process variants

If Trigger.dev isn't set up and you only want the pipeline-side dev loop:

```bash
# Just web + queue (no upload transcription)
pnpm -C apps/web dev   # in one terminal
pnpm -C apps/worker dev:queue  # in another
```

If you only want the web UI (mockManifest fallback for renderer testing):
```bash
pnpm -C apps/web dev
```

## Common one-offs

| What | Command |
|---|---|
| Reset the dev DB | `pnpm dev:db:reset` |
| Apply pending migrations | `pnpm db:migrate` |
| Seed local fixtures | `pnpm dev:seed` |
| Repo-wide typecheck | `pnpm typecheck` |
| Repo-wide tests | `pnpm test` (DB + API integration tests skip without `DATABASE_URL`; Gemini stage tests skip without `GEMINI_API_KEY`) |
| Format | `pnpm format` |
| Inspect any run's findings + cost | `pnpm inspect:run --runId <id>` |

## Gotchas

- **Files >25 MB** throw a clear error in the transcribe job. Whisper chunking is not yet implemented — use shorter clips for now.
- **Cost cap** is $25 per pipeline run; the run aborts cleanly if `archive_finding.cost_cents` sum hits it.
- **PowerShell users**: don't use `&&` to chain commands in PowerShell 5.x. Use `;` or `-and`-style. Example: `pnpm install; pnpm db:migrate`.
- **Windows + tsx watch**: `tsx watch` works but cold restarts can take 5–10 seconds. Hot reload is via Next.js's HMR for `apps/web`; the worker queue restarts on file save.
