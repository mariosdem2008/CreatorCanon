# Channel Atlas — SaaS monorepo

Creator archive productization SaaS. YouTube channel → Hosted Knowledge Hub with
grounded citations and chat. Hybrid text + visual pipeline (OpenAI + Gemini).

See `../plan/` for the full implementation plan.

## Layout

```
SaaS/
├── apps/
│   ├── web/          # Next.js 14 — marketing, creator app, hub runtime, admin
│   └── worker/       # Trigger.dev worker — hosts the 16-stage pipeline
└── packages/
    ├── auth/         # Auth.js v5 config + Google OAuth
    ├── config/       # shared tsconfig + eslint presets
    ├── core/         # shared types, zod env schema, ids, pipeline stage registry
    ├── cost-ledger/  # per-stage cost accounting (OpenAI, Gemini, R2, …)
    ├── db/           # Drizzle schema + client (Postgres + pgvector)
    ├── pipeline/     # stage contracts, idempotency keys
    └── ui/           # shared primitives (Logo, Thumb, …) + design tokens
```

## Tooling

- pnpm 9 workspaces + Turborepo pipelines
- Node 20.11+
- TypeScript 5.6 strict
- Next.js 14 (App Router)
- Tailwind 3 (tokens ported from `../prototype/styles.css` in ticket 0.3)

## Getting started (after ticket 0.1 — current)

```bash
pnpm install
pnpm dev      # runs web (:3000) and the worker dev-server in parallel
```

Neither real auth nor the DB is wired yet — that comes in tickets 0.5 / 0.7.
See `../plan/08-build-order-and-milestones.md` for the exact sequence.

## Scripts (root)

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | `turbo run dev --parallel` (web + worker)        |
| `pnpm build`        | `turbo run build`                                |
| `pnpm lint`         | `turbo run lint`                                 |
| `pnpm typecheck`    | `turbo run typecheck`                            |
| `pnpm test`         | `turbo run test`                                 |
| `pnpm db:migrate`   | apply Drizzle migrations (lands in ticket 0.5)   |
| `pnpm db:studio`    | Drizzle Studio                                   |
| `pnpm format`       | Prettier write                                   |

## Environment

Copy `.env.example` → `.env` and fill in the dev values. The schema is
validated by `@atlas/core/env` (see `packages/core/src/env.ts`).

## Deployment

- **Web (`apps/web`) → Vercel.** Framework preset `nextjs`; install and build commands pnpm-filtered from the repo root (see `apps/web/vercel.json`).
- **Worker (`apps/worker`) → Railway.** Multi-stage Dockerfile; deploys are triggered by `.github/workflows/deploy-worker.yml` on pushes to `main` that touch worker or shared package code.
- **Trigger.dev** project is managed separately via the Trigger.dev dashboard and the `trigger:deploy` script in `apps/worker/package.json`; task code lives under `apps/worker/src/tasks/`.
