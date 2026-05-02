# Phase F — Analytics + Creator Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Creator opens their dashboard and sees: which pages are read, by whom, conversion rates by funnel step, revenue (if paid), top-performing canons, drop-off points, completion rates per worksheet/calculator.

**Architecture:** Lightweight first-party analytics. Edge events POSTed to a single `/api/analytics/event` endpoint → buffered + batched → write to `analytics_event` table. Aggregations computed on read (cached for 1 hour). Dashboard UI consumes aggregation API. Optional: forward events to creator's preferred analytics tool (PostHog, Plausible, GA4) via webhook.

**Owner:** Codex + Claude split.
- **Claude:** event ingest + DB + aggregation queries + webhook forwarder
- **Codex:** event-firing client + dashboard UI components + cards + charts

**Dependencies:** Phase C (deployed hub to instrument), Phase B (editor mounts on dashboard for "edit live").

**Estimated weeks:** 8 (weeks 14-22 of meta-timeline).

---

## File structure

```
packages/synthesis/src/analytics/                   ← Claude
  event-schema.ts                                   ← Zod schemas for all event types
  ingest.ts                                         ← buffered batch insert
  aggregate.ts                                      ← cached aggregation queries
  webhook-forwarder.ts                              ← optional fan-out to external

apps/web/src/app/api/analytics/
  event/route.ts                                    ← POST single event
  batch/route.ts                                    ← POST batched events
  aggregate/[hubId]/route.ts                        ← GET aggregations

apps/web/src/lib/analytics/                         ← Codex
  client.ts                                         ← page-level event firing
  hooks.ts                                          ← useTrackPage(), useTrackEvent()

apps/web/src/components/dashboard/                  ← Codex
  OverviewCards.tsx                                 ← top-level metrics
  TrafficChart.tsx                                  ← daily/weekly visitors
  ConversionFunnel.tsx                              ← step-by-step
  TopPagesTable.tsx                                 ← which canons read most
  WorksheetCompletion.tsx                           ← per-worksheet completion %
  CalculatorUsage.tsx                               ← which calculators used
  RevenueTimeline.tsx                               ← Stripe data joined to events
  EngagementHeatmap.tsx                             ← time-on-page per canon
  ExportButton.tsx                                  ← CSV download

apps/web/src/app/(creator)/dashboard/[hubId]/page.tsx   ← main dashboard

packages/db/src/schema/
  analytics.ts                                      ← analytics_event, analytics_session
packages/db/drizzle/
  0021_phase_f_analytics.sql
```

---

## Tasks

### F.1 — Event schema (Claude)

10 core event types:
- `page_view`
- `click_cta`
- `email_capture_submit`
- `email_capture_success`
- `paywall_view`
- `checkout_start`
- `checkout_success`
- `worksheet_start`
- `worksheet_complete`
- `calculator_input_change`

Each event: `{eventType, hubId, sessionId, anonymousId, userId?, props, timestamp, path}`. Zod schema validates on ingest.

### F.2 — Ingest endpoint (Claude)

`POST /api/analytics/event` — single event. `POST /api/analytics/batch` — up to 50 events at once. Validates against schema. Inserts to `analytics_event`. Rate-limited to prevent abuse (100 req/min per hub IP).

### F.3 — Client SDK (Codex)

`apps/web/src/lib/analytics/client.ts`:
- `track(eventType, props)` — fires event via `navigator.sendBeacon` (non-blocking)
- `usePageView()` hook — auto-fires page_view on route change
- Anonymous ID: random UUID stored in localStorage

Wired into hub layouts so every page view + every CTA click fires automatically.

### F.4 — Aggregation queries (Claude)

`/api/analytics/aggregate/[hubId]` — returns:
- `daily_visitors[]` (last 30 days)
- `top_pages[]` (10 most-viewed)
- `conversion_funnel{}` (per-funnel-step rates)
- `worksheet_completion[]` (per-worksheet %)
- `calculator_usage[]` (per-calculator session count)

Each query cached in Redis (or in-memory LRU) for 1 hour. Cache invalidated on write.

### F.5 — Dashboard layout (Codex)

`(creator)/dashboard/[hubId]/page.tsx` — left nav (overview, traffic, conversions, content, revenue), main content card grid. Mobile-responsive.

### F.6 — OverviewCards + charts (Codex)

8 visual components (listed in file structure). Use Recharts or Tremor for charts. Skeleton loading states. Empty states for new hubs.

### F.7 — Revenue join (Codex + Claude)

`RevenueTimeline.tsx` joins Stripe charges (Phase E `access_grant`) with analytics conversion events to show: "127 visitors → 14 checkout starts → 8 purchases → $152 revenue."

Backend query joins `access_grant` + `analytics_event` by sessionId.

### F.8 — Webhook forwarder (Claude)

If creator configures a third-party analytics tool, fan out events to their webhook (in addition to our DB). Supports PostHog, Plausible, GA4 Measurement Protocol, generic webhook. Same adapter pattern as Phase C ESP integrations.

### F.9 — CSV export (Codex)

`ExportButton.tsx` — downloads filtered events as CSV. Useful for creators who want to do their own analysis.

### F.10 — Privacy + GDPR

- Anonymous ID-based tracking by default (no PII unless email captured)
- Cookie consent banner integrated with email capture overlay
- Data deletion endpoint: `DELETE /api/analytics/user/[anonymousId]`

### F.11 — Operator visibility (our internal admin)

Separate dashboard for CreatorCanon team showing: total creators, total hubs, total events, error rates, pipeline runs in flight, Codex token spend per creator. Same components, different scope.

### F.12 — Testing + PR

Synthetic event test: fire 100 events from a test hub, verify aggregations match. Visual regression on dashboard. PR title: "Phase F: analytics + creator dashboard."

---

## Success criteria

- [ ] Creator can see live traffic on their dashboard within 1-2 minutes of pageview
- [ ] Conversion funnel accurately reflects email-capture → magic-link flow
- [ ] Worksheet/calculator completion tracking shows real engagement signals
- [ ] Revenue dashboard reconciles to Stripe (within 1 hour cache delay)
- [ ] Operator dashboard surfaces stuck pipelines + cost alerts

## Risk callouts

- **Storage growth** — 1M events/month per active creator × 100 creators = 100M rows/year. Mitigation: monthly partitioning + downsampling rule (raw events 90 days, aggregated forever).
- **Bot traffic** — inflates metrics. Mitigation: User-Agent filtering + IP rate-limiting + visible "this looks like a bot, ignored" filter in dashboard.
- **Cache invalidation** — aggregations stale after edits. Mitigation: invalidate on republish; manual refresh button in UI.

## Out of scope

- Real-time live counter (defer)
- Cohort analysis (compare creators) — defer to Pro tier
- Funnel A/B testing — defer to Phase 12+
