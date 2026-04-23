# Vercel GitHub Setup

Use this for the GitHub-connected CreatorCanon SaaS web project.

## Project

- GitHub repository: `mariosdem2008/CreatorCanon`
- Vercel framework: Next.js
- Root directory: `apps/web`
- Install command: `cd ../.. && pnpm install --frozen-lockfile`
- Build command: `cd ../.. && pnpm --filter @creatorcanon/web build`
- Output directory: `.next`

The Vercel project is configured with `apps/web` as the Root Directory so Next.js is detected from the web app package. The app-level `apps/web/vercel.json` pins the monorepo install and build commands.

## Required Environment Variables

Set these in Vercel for Production, Preview, and Development as appropriate:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_HUB_ROOT_DOMAIN`
- `NEXT_PUBLIC_POSTHOG_HOST`
- `NEXT_PUBLIC_POSTHOG_KEY`
- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `DATABASE_CONNECT_TIMEOUT`
- `REDIS_URL`
- `ARTIFACT_STORAGE`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`
- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `DEV_AUTH_BYPASS_ENABLED`
- `YOUTUBE_OAUTH_CLIENT_ID`
- `YOUTUBE_OAUTH_CLIENT_SECRET`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_SUPPRESS_GLOBAL_ERROR_HANDLER_FILE_WARNING`
- `TRIGGER_SECRET_KEY`
- `TRIGGER_API_URL`

Do not set `DEV_AUTH_BYPASS_EMAIL` in production.

## GitHub Integration

In Vercel, import `mariosdem2008/CreatorCanon` from GitHub and set the root directory to `apps/web`. Vercel will read `apps/web/vercel.json` and run the pinned monorepo build.

After import, every push to the configured production branch deploys production, and pull requests create preview deployments.

## Routing Note

Hub subdomain routing, such as `sub.creatorcanon.com` to a workspace slug, should stay in application middleware because it needs database-backed published-hub state. Do not model that as static Vercel rewrites. Custom-domain attachment should be wired later through the Vercel Domains API from the admin console.
