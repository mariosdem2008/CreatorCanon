# Hosted Private-Alpha Readiness

Use this checklist when moving CreatorCanon from local proof to hosted private
alpha. The goal is to prove the existing creator loop on hosted infrastructure,
not to add product scope.

## Deployment Surfaces

### Vercel Web App

- Root directory: `apps/web`.
- Install command: `cd ../.. && pnpm install --frozen-lockfile --prod=false`.
- Build command: `cd ../.. && pnpm --filter @creatorcanon/web build`.
- Output directory: `.next`.
- Required app URL: `NEXT_PUBLIC_APP_URL=https://<hosted-app-domain>`.
- Dev auth bypass must be disabled in hosted alpha.

### Worker / Trigger

- Trigger remains the preferred hosted async runner.
- The worker must have the same provider envs as the web app for pipeline access:
  Neon/Postgres, R2, OpenAI, Google/YouTube where needed, and Trigger secrets.
- App-side fallback should remain available for alpha recovery, but hosted alpha
  readiness treats a missing `TRIGGER_SECRET_KEY` as a blocker.

### Provider Consoles

- Google OAuth redirect URI must include:
  `https://<hosted-app-domain>/api/auth/callback/google`.
- Stripe test webhook endpoint must point to:
  `https://<hosted-app-domain>/api/stripe/webhook`.
- Stripe must remain in test mode for private alpha.
- R2 bucket and access keys must match the same bucket verified by `env:doctor`.
- Neon compute must be awake/reachable and the URL must be the current password.

## Required Hosted Env Groups

Set these in Vercel for the web app and in the worker/Trigger environment where
pipeline code executes:

- App: `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_HUB_ROOT_DOMAIN`.
- Database: `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_CONNECT_TIMEOUT`.
- Artifacts: `ARTIFACT_STORAGE=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`.
- Auth: `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
- YouTube: `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`.
- AI: `OPENAI_API_KEY`, `GEMINI_API_KEY`.
- Billing: `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`.
- Runner: `TRIGGER_SECRET_KEY`, optional `TRIGGER_API_URL`.
- Observability if used: Sentry/PostHog keys.

Do not set `DEV_AUTH_BYPASS_ENABLED=true` or `DEV_AUTH_BYPASS_EMAIL` in hosted
alpha.

## Readiness Commands

Run locally against the same env values before deploying or inviting testers:

```powershell
$env:ALPHA_ENV_DOCTOR_STRICT="true"
$env:ALPHA_HOSTED_URL_CHECK="true"
pnpm env:doctor
Remove-Item Env:ALPHA_HOSTED_URL_CHECK
```

The hosted URL check calls `NEXT_PUBLIC_APP_URL/healthcheck`. If the hosted app
is not deployed yet, omit `ALPHA_HOSTED_URL_CHECK=true` and treat the warning as
expected until deploy time.

Run local regression coverage:

```powershell
pnpm -r --filter="!@creatorcanon/marketing" typecheck
pnpm lint
pnpm -r --filter="!@creatorcanon/marketing" build
pnpm smoke:review-edit
pnpm smoke:audio-publish
```

Run provider smoke on known alpha runs:

```powershell
$env:ALPHA_SMOKE_RUN_ID="3587be79-903f-4cb5-a1eb-dd0c1fc3b1e5"
pnpm smoke:alpha

$env:ALPHA_SMOKE_RUN_ID="ae73b5f9-ce56-476a-b4b1-5738c25139a9"
pnpm smoke:alpha
Remove-Item Env:ALPHA_SMOKE_RUN_ID
```

## Hosted Browser Proof

After deploy, prove the full loop on the hosted URL:

1. Open hosted `/sign-in` and sign in with Google.
2. Confirm `/app` and `/app/library` load under the intended account.
3. Select audio-backed seeded alpha videos or caption-ready videos.
4. Configure a project and choose a template.
5. Complete Stripe test Checkout.
6. Confirm Stripe webhook processes and the run queues.
7. Confirm pipeline reaches draft pages.
8. Edit title, summary, and one section.
9. Mark reviewed and approved.
10. Publish the hub.
11. Edit again and publish updated hub.
12. Open public `/h/<subdomain>` and `/h/<subdomain>/overview` unauthenticated.
13. Confirm source evidence renders for source-positive runs.
14. Confirm `/admin/runs` is admin-only and shows the hosted run.

## Deferred

The YouTube owner-caption lane is wired, including `captions.download` and
`youtube.force-ssl`, but the current alpha channel videos have no caption
tracks. Full `youtube_captions` source-positive proof remains deferred until a
channel video has captions enabled in YouTube Studio.
