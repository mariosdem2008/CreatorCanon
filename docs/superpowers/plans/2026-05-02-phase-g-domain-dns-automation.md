# Phase G — Domain + DNS Automation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Creator types their domain in onboarding step 11, gets shown the DNS records to add at their registrar, system automatically verifies + provisions SSL + deploys hub.

**Architecture:** Vercel API drives custom-domain attachment per creator. We create one Vercel Project per hub (clean isolation; per-creator branding can drift safely). Creator-facing UI shows DNS verification status. Auto-issued Let's Encrypt SSL.

**Owner:** Codex (Vercel API integration is mostly UI + minor backend glue).

**Dependencies:** Phase D (onboarding step 11), Phase C (a hub to deploy).

**Estimated weeks:** 6 (weeks 16-22 of meta-timeline).

---

## File structure

```
apps/web/src/lib/vercel/                            ← Codex
  client.ts                                         ← typed Vercel API wrapper
  domain-attach.ts                                  ← attach + verify + cert
  project-create.ts                                 ← per-hub Vercel project
  deploy-trigger.ts                                 ← trigger build

apps/web/src/components/onboarding/
  DomainConnector.tsx                               ← step 11 UI
  DnsRecordCard.tsx                                 ← shows the records to add
  VerificationStatus.tsx                            ← polls status

apps/web/src/app/api/domains/
  attach/route.ts                                   ← POST: start attach flow
  verify/[hubId]/route.ts                           ← GET: poll verify status
  ssl-status/[hubId]/route.ts                       ← GET: poll cert provisioning

apps/web/src/app/api/deploy/
  trigger/[hubId]/route.ts                          ← POST: trigger Vercel build

packages/db/src/schema/
  hosting.ts                                        ← deployment, domain rows
packages/db/drizzle/
  0022_phase_g_hosting.sql
```

---

## Tasks

### G.1 — DB schema

```ts
export const deployment = pgTable('deployment', {
  id: uuid('id').primaryKey().defaultRandom(),
  hubId: uuid('hub_id').notNull(),
  vercelProjectId: varchar('vercel_project_id', { length: 64 }),
  vercelDeploymentId: varchar('vercel_deployment_id', { length: 64 }),
  status: varchar('status', { length: 16 }),  // pending | building | live | failed
  liveUrl: text('live_url'),
  customDomain: varchar('custom_domain', { length: 255 }),
  domainVerified: boolean('domain_verified').default(false),
  sslReady: boolean('ssl_ready').default(false),
});
```

### G.2 — Vercel API client

Wrapper over `https://api.vercel.com/v9/projects` etc. Auth: VERCEL_TOKEN. Supports: create project, attach domain, list verifications, trigger deployment.

### G.3 — Per-hub project creation

When onboarding step 11 starts: create Vercel Project named `creator-canon-{hubSlug}`, framework=Next.js, root=apps/web (with environment variables for hubId so the build knows what to render). Persist `vercelProjectId` to `deployment`.

### G.4 — Domain attach flow (UI)

`DomainConnector.tsx`:
- Domain input field (validates format)
- On submit: call `/api/domains/attach` → backend creates Vercel domain attachment
- UI shows: "Add these DNS records at [registrar guess based on domain]" — A record + AAAA record OR CNAME
- "Verification status: pending..." → polls every 10s

### G.5 — Verification polling

`VerificationStatus.tsx`:
- Polls `/api/domains/verify/[hubId]`
- Backend asks Vercel: is the domain verified yet?
- Updates UI: pending → verified → SSL provisioning → live

Times out at 24h (DNS propagation can be slow). After timeout: "It's been 24h, here's how to debug" link + manual support escalation.

### G.6 — SSL ready polling

After domain verification: Vercel auto-issues Let's Encrypt cert. `ssl-status/[hubId]` polls cert state. Usually 30s-2min.

### G.7 — Deploy trigger

After domain + SSL ready: `POST /api/deploy/trigger/[hubId]` triggers Vercel build. Build pulls latest hub content from our DB (the build has `hubId` env var, fetches via internal API). Deploys to the attached domain.

### G.8 — Redeploy on edit (integration with Phase B)

When creator clicks "Save & Republish" in Phase B editor: backend updates DB + calls G.7 to trigger redeploy. Build picks up changes from DB. ~1-2 min from save → live.

### G.9 — Subdomain fallback

Free tier (no custom domain): hubs deploy to `creator-name.creatorcanon.app` automatically. Use Vercel's wildcard DNS. UI option: "I'll add my own domain later."

### G.10 — Testing + PR

Test flow: create test hub, attach `test.creatorcanon.app`, verify deploy works. Mock external DNS for unit tests. PR title: "Phase G: domain + DNS automation."

---

## Success criteria

- [ ] Creator can type a domain + see deployment go live within 30 minutes (most of which is DNS propagation)
- [ ] Subdomain fallback works for creators without custom domains
- [ ] Redeploy from Phase B editor save → live in < 2 minutes
- [ ] SSL automatically provisioned for all attached domains
- [ ] Failed deployments surface clear errors in UI

## Risk callouts

- **Vercel API rate limits** — bulk creator onboarding could throttle. Mitigation: queue project creations + retry with exponential backoff.
- **DNS propagation delays** — sometimes 24h+. Mitigation: clear UX about wait times, support escalation channel.
- **Vercel project quota** — free Vercel team has limited project count. Mitigation: per-project on Pro tier; multi-tenant routing for free tier creators (single Vercel project, hub routed by hostname).
- **Custom domain ownership disputes** — creator types a domain they don't own. Mitigation: Vercel's verification-record check enforces ownership.

## Out of scope

- Apex domain redirects (www → non-www) — minor UX defer
- Multi-domain per hub (defer to v2)
- Cloudflare-as-CDN integration (use Vercel's built-in CDN v1)
