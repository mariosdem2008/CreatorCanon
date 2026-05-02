# Phase C — Distribution Profiles (lead-magnet, paid, member, public, zip)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** A single hub generation produces ONE artifact that can be deployed in 5 distribution modes. Each mode = different access control + analytics + funnel UX, but the underlying content + components are identical.

**Architecture:** A `DistributionProfile` config attaches to a hub at deploy time. Middleware reads the profile + applies gating per route. Each profile has its own auth provider (none / email / Stripe / OAuth). Same hub generation, multiple profiles deployable in parallel (e.g., a free preview + paid full version from the same content).

**Owner:** Codex + Claude split.
- **Codex:** middleware logic, paywall page, email-capture overlay, share-card UI, frontend integration touchpoints
- **Claude:** ESP API integrations (ConvertKit, Beehiiv, Mailchimp, Klaviyo, generic webhook), profile-config schema + DB persistence, server-side gating decisions

**Dependencies:** None — can start day 1, uses existing Creator Manual hub for development. Phase A's bundle integrates later.

**Estimated weeks:** 8 (weeks 1-8 of meta-timeline).

---

## Profile types

| Profile | Auth | Backend integration | UI added |
|---|---|---|---|
| `public` | none | none | none |
| `lead_magnet` | email submit | ESP webhook (5 supported) | email capture overlay; "you're on the list" thank-you |
| `paid_product` | Stripe Checkout (Phase E) | Stripe Connect webhooks | paywall page; magic-link login |
| `member_library` | Discord/Circle OAuth | OAuth flow + role check | "members only" gate; SSO redirect |
| `zip_export` | none | static-site export only | none |

---

## File structure

```
packages/synthesis/src/distribution/                 ← Claude
  profiles.ts                                        ← DistributionProfile type + factory
  esp/
    convertkit.ts
    beehiiv.ts
    mailchimp.ts
    klaviyo.ts
    generic-webhook.ts
    index.ts                                         ← provider router
  oauth/
    discord.ts
    circle.ts
    index.ts
  exports/
    static-site-bundle.ts                            ← zip exporter

apps/web/src/lib/distribution/                       ← Codex
  profile-loader.ts                                  ← read profile from DB
  middleware-gate.ts                                 ← route-level access checks
apps/web/src/middleware.ts                           ← Codex extends to call middleware-gate

apps/web/src/components/distribution/                ← Codex
  EmailCaptureOverlay.tsx
  PaywallPage.tsx
  MagicLinkLoginPage.tsx
  MembersOnlyGate.tsx
  ShareCard.tsx                                      ← downloadable share artifact
  ThankYouPage.tsx

apps/web/src/app/api/distribution/
  email-capture/route.ts                             ← Claude — POST submit + ESP relay
  magic-link/[token]/route.ts                        ← Claude — GET verify + set cookie
  oauth-callback/route.ts                            ← Claude — OAuth code exchange
  zip-export/[runId]/route.ts                        ← Claude — POST trigger export

packages/db/src/schema/
  distribution.ts                                    ← Claude — profile config table
packages/db/drizzle/
  0018_phase_c_distribution.sql                      ← Claude
```

---

## Tasks

### C.1 — Distribution profile schema + types (Claude)

DB table: `distribution_profile` with fields runId, type, espConfig (encrypted JSON), gatingRules (JSONB array of `{routePattern, requirement}`), analyticsTags. Migration 0018.

### C.2 — ESP integrations (Claude)

5 adapters under `packages/synthesis/src/distribution/esp/`. Each exposes `submitLead({email, tags, listId})` and a `validateConfig(config)` for the onboarding wizard. Tests use mocked HTTP. Same shape as the Codex CLI provider pattern.

### C.3 — OAuth providers (Claude)

Discord + Circle. Each implements `getAuthUrl({redirectUri, state})`, `exchangeCode(code)` returning `{userId, email, roles}`, and `validateMembership(userId, requiredRole)`. Tests use mocked OAuth responses.

### C.4 — Static site exporter (Claude)

`bundle-static-site(runId): Promise<Buffer>` — renders the hub with all dynamic features as static HTML, includes all assets, dumps content as JSON, packages as zip. Excludes server-bound features (auth, calculators that need API). Adds a `manifest.json` describing what's included.

### C.5 — Profile loader middleware (Codex)

`apps/web/src/lib/distribution/middleware-gate.ts` — reads `distribution_profile` for the requested hub + applies per-route gating. Returns 401/302 to login or paywall as appropriate.

### C.6 — EmailCaptureOverlay component (Codex)

Modal that intercepts deep-page navigation when no email cookie present. Submits to `/api/distribution/email-capture`. On success: sets cookie + replays the navigation. Form has GDPR consent checkbox + privacy link.

### C.7 — PaywallPage + MagicLinkLogin (Codex)

For paid_product profile: paywall renders with bundle's funnel.paywall copy + Stripe Checkout button (links out to Stripe, returns via webhook in Phase E). MagicLinkLogin is a simple form: enter email → backend issues link → click link → set JWT cookie.

### C.8 — MembersOnlyGate (Codex)

For member_library profile: redirects to OAuth provider's auth page. Handles callback → validates membership → sets JWT cookie. Renders friendly message if not a member.

### C.9 — ShareCard (Codex)

Image-generation component. For each canon's strongest aphorism, generate a 1080x1080 social card with creator brand + quote + attribution. Use `@vercel/og` for runtime generation. Cards available for download from each canon page.

### C.10 — Onboarding hooks (split)

Codex: UI fragments in the wizard (Phase D) for selecting profile + entering ESP credentials.
Claude: validation logic for ESP credentials before persistence.

### C.11 — Testing + integration

Manual end-to-end test of each profile:
- Public: deploy a free hub, verify no gates
- Lead_magnet: deploy with ConvertKit, submit test email, verify it shows in CK
- Paid_product: deploy with Stripe test mode, complete checkout, verify magic link works
- Member_library: deploy with Discord, verify role check
- Zip_export: trigger export, unzip locally, verify portability

### C.12 — PR + docs

Single PR for the integration branch (sub-branches C-backend-claude + C-ui-codex merge in first). Documentation: per-profile setup guide for the operator (which env vars / API keys / OAuth apps are needed).

---

## Success criteria

- [ ] All 5 profile types deployable from the same hub generation
- [ ] Email capture works against all 5 ESPs (live test on at least 2)
- [ ] OAuth works against Discord (live test) + Circle (mocked acceptable)
- [ ] Static export produces a portable zip that runs in another hosting environment
- [ ] Middleware gating applied correctly per profile
- [ ] No regression on existing Creator Manual hub

## Risk callouts

- **Stripe Connect dependency** — paid_product profile partially depends on Phase E. Mitigation: build profile config + paywall UI in Phase C; wire actual Stripe webhooks in Phase E.
- **OAuth callback URL fragility** — each Discord/Circle app needs the exact callback URL whitelisted. Mitigation: per-creator OAuth app config; document setup as part of self-serve onboarding.
- **ESP rate limits** — high-volume creators hit ConvertKit/Beehiiv per-second limits. Mitigation: queue submissions + retry with backoff (similar to ensureDbHealthy).

## Out of scope

- Custom auth providers (Auth0, etc.) — defer to v2
- Member-tier-based gating (e.g., "premium-only canons") — defer to v2; v1 is binary access
- A/B testing of paywall copy — defer
