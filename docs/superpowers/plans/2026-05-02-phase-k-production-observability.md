# Phase K — Production Observability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Operating CreatorCanon at scale without surprise outages. Sentry for errors, structured logging, alerting, runbook for top-3 failure modes, and an internal admin dashboard for our team.

**Owner:** Claude.

**Dependencies:** Phase F (deployed hubs to monitor).

**Estimated weeks:** 6 (weeks 18-24 of meta-timeline — runs in parallel with later product phases).

---

## File structure

```
packages/synthesis/src/observability/
  sentry-config.ts
  structured-logger.ts
  metric-emitter.ts
  alerts.ts                               ← alert-rule definitions

apps/web/src/lib/observability/
  client-sentry.ts                        ← browser-side Sentry init
  server-sentry.ts                        ← API-route Sentry init
  pipeline-sentry.ts                      ← batch pipeline scripts Sentry init

apps/web/src/app/(admin)/                 ← internal-only dashboard
  dashboard/page.tsx                      ← cross-creator metrics
  pipelines/page.tsx                      ← all in-flight pipelines
  errors/page.tsx                         ← Sentry digest
  cost/page.tsx                           ← Codex token spend per creator

docs/runbooks/
  codex-cli-rate-limit.md
  neon-suspended.md
  stripe-webhook-failure.md
  vercel-deployment-failure.md
  email-deliverability-failure.md
```

---

## Tasks

### K.1 — Sentry integration (3 contexts)

Sentry already exists in the codebase (Phase 8 added @sentry/node with PII-stripped transcript attachment for agent failures). Extend coverage:

- **Browser** (apps/web client): track UI errors, page-load issues
- **API routes** (Next.js server): track route handler exceptions
- **Pipeline + synthesis** (long-running scripts): structured exception capture with run context (runId, creator, stage, step)

Each context configures Sentry separately with appropriate sample rates (browser 100%, API 100%, pipeline 100% for now — these are low-volume).

### K.2 — Structured logging

Replace ad-hoc `console.log` with a structured logger that emits JSON-line logs with context tags. Compatible with Vercel logs + future log aggregation (Datadog / Logtail).

```ts
// structured-logger.ts
export const logger = {
  info: (msg: string, ctx: Record<string, unknown>) => console.log(JSON.stringify({ level: 'info', msg, ...ctx, ts: Date.now() })),
  warn: (msg: string, ctx: Record<string, unknown>) => console.warn(JSON.stringify({ level: 'warn', msg, ...ctx, ts: Date.now() })),
  error: (msg: string, ctx: Record<string, unknown>) => { console.error(JSON.stringify({ level: 'error', msg, ...ctx, ts: Date.now() })); Sentry.captureMessage(msg, { extra: ctx, level: 'error' }); },
};
```

Migrate the most operational scripts (seed-audit-v2, run-synthesis, all webhook handlers) to use the logger. Leave one-off operator scripts as-is.

### K.3 — Metric emitter

Lightweight metric emitter that pushes counters + gauges to a metrics endpoint. Phase F's analytics infrastructure can host these (just another event type with `kind: 'metric'`).

Metrics to emit:
- `pipeline.audit.started` (counter, per-creator)
- `pipeline.audit.completed` (counter)
- `pipeline.audit.failed` (counter, per-stage)
- `pipeline.synthesis.started` / `completed` / `failed`
- `pipeline.cost_cents` (gauge, per-run)
- `webhook.received` (counter, per-source)
- `auth.magic_link.issued` / `consumed`

### K.4 — Alert rules

Sentry-driven + log-based alerts. Top alert rules:
- Pipeline failed for 5+ creators in 1h → Slack alert
- Stripe webhook endpoint returning 5xx > 5min → Slack alert
- Neon DB connection error rate > 5% in 5min → Slack alert
- Codex CLI token spend > $X per hour (creator-level) → email alert
- Vercel deployment failures cascading → Slack alert

### K.5 — Top-3 runbooks

Markdown runbooks in `docs/runbooks/`. Each contains: symptom, diagnosis steps, fix, verification, escalation path.

Top-3 to write first:
1. **Codex CLI rate limit** — symptom: pipeline stalls at agent calls. Diagnosis: check `codex.log`. Fix: switch to `openai_api` provider (env flip) for affected runs.
2. **Neon serverless suspended** — symptom: ECONNRESET surge. Phase 9's `ensureDbHealthy` should handle most cases; if not, manual wake via Neon console.
3. **Stripe webhook failure** — symptom: customers paid but no access granted. Diagnosis: webhook event log + idempotency key. Fix: replay specific events from Stripe dashboard.

### K.6 — Internal admin dashboard

`(admin)/dashboard` — operator visibility:
- All creators (count + tier breakdown)
- All hubs (status: in_progress, live, failed)
- Active pipelines (which stage, how long)
- Cost ledger (per creator, per month, total)
- Error feed (last 50 from Sentry)

Locked behind a hard-coded admin email allowlist (Phase 12+ proper RBAC).

### K.7 — Cost tracking

Per-creator Codex token spend tracking. Phase 8 introduced `costCents` on `generationStageRun`; extend to `synthesisRun` (Phase A) + maintain a creator-aggregate. Surface in admin dashboard + warn creators approaching their tier limits.

### K.8 — Health check endpoint

`GET /api/health` — returns:
```json
{ "status": "healthy", "checks": { "db": "ok", "stripe": "ok", "codex_cli": "ok", "vercel": "ok" } }
```

Vercel pings this; alerts if 3 consecutive fails.

### K.9 — On-call rotation (initial: just Mario)

Document the call schedule + escalation contacts. Even with a 1-person rotation, having it written prevents confusion.

### K.10 — Testing + PR

Synthetic failure tests: trigger each runbook scenario in staging, verify alert fires, follow runbook to fix, time the recovery. Document MTTR.

PR title: "Phase K: production observability — Sentry, logging, alerts, runbooks, admin dashboard."

---

## Success criteria

- [ ] Sentry catches 100% of unhandled exceptions across browser + API + pipeline
- [ ] Structured logs queryable for the top 5 operational questions
- [ ] All 5 alert rules tested with synthetic triggers
- [ ] 3 runbooks complete and verified end-to-end
- [ ] Admin dashboard shows real-time pipeline status
- [ ] Health check endpoint integrated into Vercel monitoring

## Out of scope

- Datadog / Honeycomb / OpenTelemetry full integration (Sentry is sufficient v1)
- Multi-region failover (single-region v1)
- Customer-facing SLA dashboard (defer to v2)
- Automated rollback on deployment failure (manual rollback v1)
