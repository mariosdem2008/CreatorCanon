# Phase D — Self-Serve Onboarding Wizard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** A non-engineer creator can sign up, claim their YouTube channel, run the full audit + synthesis pipeline, edit their hub, and publish to a custom domain — all without operator intervention. End-to-end completable in < 30 minutes (excluding pipeline wait time).

**Architecture:** 12-step wizard. Each step is a Next.js page under `(onboarding)` group. State persists in DB (`onboarding_session` table) so users can resume. Each step calls a backend API (existing or to-be-built). Pipeline waits show realtime status (websocket or polling).

**Owner:** Codex (frontend wizard).

**Dependencies:** A (synthesis must work for the chosen archetype) + B (editor UI for step 9-10) + C (distribution profile selection at step 7).

**Estimated weeks:** 8 (weeks 12-20 of meta-timeline).

---

## File structure

```
apps/web/src/app/(onboarding)/
  layout.tsx                                ← wizard chrome (progress bar, save/exit)
  step-1-signup/page.tsx
  step-2-plan/page.tsx
  step-3-source/page.tsx                    ← YouTube channel paste / MP4 upload
  step-4-transcribe-wait/page.tsx           ← polls transcription status
  step-5-audit-wait/page.tsx                ← polls audit status
  step-6-archetype-confirm/page.tsx         ← shows detected archetype, sample bodies
  step-7-goal/page.tsx                      ← lead_magnet/paid/member/sales_asset/public
  step-8-voice-confirm/page.tsx             ← shows detected voice mode, sample
  step-9-synthesis-wait/page.tsx            ← polls synthesis status
  step-10-preview-edit/page.tsx             ← mounts Phase B editor
  step-11-brand-domain/page.tsx             ← logo, colors, custom domain
  step-12-publish/page.tsx                  ← deploy + analytics on

apps/web/src/components/onboarding/
  WizardChrome.tsx                          ← progress bar, step nav
  StepFooter.tsx                            ← Back / Continue / Save & Exit
  PipelineStatusPoller.tsx                  ← shared component for waits
  ArchetypePreview.tsx
  VoiceModePreview.tsx
  GoalSelector.tsx
  BrandKitForm.tsx
  DomainConnector.tsx                       ← ties to Phase G

packages/db/src/schema/
  onboarding.ts                             ← onboarding_session table
packages/db/drizzle/
  0019_phase_d_onboarding.sql

apps/web/src/app/api/onboarding/
  session/route.ts                          ← create/resume session
  step/[stepNumber]/route.ts                ← per-step state persist
```

---

## Tasks

### D.1 — onboarding_session schema + persistence

DB table: `onboarding_session(id, userId, currentStep, sessionState JSONB, createdAt, completedAt)`. Migration 0019. State is a discriminated union per step (e.g., `{step: 3, channelHandle, videoIds, ...}`).

### D.2 — Wizard chrome + step navigation

`(onboarding)/layout.tsx` renders top bar with 12 dots (current step highlighted), bottom bar with Back/Continue/Save & Exit. `StepFooter` validates current step's state before allowing forward nav.

### D.3 — Steps 1-2: signup + plan

Reuse existing auth (Phase 8 / Creator Manual already has user/workspace). Plan selector: free trial / starter / pro tiers. Tier limits (videos, profile types, custom domains) persisted to user.

### D.4 — Step 3: source ingestion

Two input modes:
- YouTube channel handle (e.g., `@huber`) — backend fetches video list via YouTube Data API (key in env), creator selects which videos
- MP4 upload — drag-drop multiple files; uploads via existing R2 upload route from Creator Manual handoff

Submits to existing `seed-creator-batch` (extended for self-serve — wraps `seed-hormozi-and-dispatch.ts`).

### D.5 — Steps 4-5: transcribe + audit waits

Polling component checks `/api/runs/[runId]/status` every 5s. Shows current stage (Stage 1: channel profile, Stage 5: bodies, etc.) + estimated time remaining + cost ledger.

If stage fails: render error + "retry" button + escalation link to support.

### D.6 — Step 6: archetype confirmation

Backend already detected archetype (Phase 8 archetype-detector). UI shows the detected archetype + 2-3 sample canon bodies. Buttons: "Looks right, continue" / "Override → [dropdown]" / "Re-run channel profile."

### D.7 — Step 7: goal selection

Renders 5 goal cards (lead_magnet / paid / member / sales_asset / public). Each card includes:
- Headline ("Free lead magnet for your email list")
- Bullet list of what it requires (ESP API key for lead_magnet, Stripe Connect for paid, etc.)
- Estimated 1-time setup time
- Per-goal screenshot of the resulting hub UX

Selection persists to `distribution_profile.type` (Phase C).

### D.8 — Step 7b (sub-step): goal config

Conditional on goal:
- lead_magnet: ESP picker + API key input + list ID
- paid_product: Stripe Connect onboarding link (Phase E)
- member_library: OAuth provider picker + auth setup
- sales_asset: link to existing course / community
- public: nothing (no config)
- zip_export: nothing (no config; just deploys static)

Each ESP/OAuth config is validated server-side against the credentials before allowing forward nav.

### D.9 — Step 8: voice mode confirmation

Shows detected voice mode + sample body excerpt. Override dropdown if creator disagrees. Persists to `_index_voice_mode` on channelProfile.

### D.10 — Step 9: synthesis wait

Same pattern as steps 4-5. Status polled. Shows "Generating action plan... 7 of 25 worksheets..." progress.

### D.11 — Step 10: preview + edit

Mounts the Phase B editor on top of the rendered hub. Creator can review every block. Step is not "completable" — explicit "I've reviewed everything, continue" button.

### D.12 — Step 11: brand + domain

`BrandKitForm`: logo upload, primary color picker (default from archetype palette), favicon, social card preview.
`DomainConnector` (Phase G): custom domain input + DNS verification status.

### D.13 — Step 12: publish + done

Click "Publish" → backend triggers Vercel deploy (Phase G) + flips distribution profile from `draft` to `live` + analytics (Phase F) starts collecting. Success page: "Your hub is live at [URL]. Here's what to do next..."

### D.14 — Resume + abandon flow

If creator leaves mid-wizard, session persists. Returning sends them to last saved step. Email reminder after 24h of inactivity (low-priority — defer to v2 if time-pressed).

### D.15 — Onboarding completion analytics

Event tracking: which step has highest drop-off rate? Persist to analytics (Phase F) for our own dashboards.

### D.16 — Testing + PR

End-to-end test: create test user, walk through all 12 steps with Hormozi-style fixtures, verify deployed hub at the end.

---

## Success criteria

- [ ] Brand new creator can sign up + reach Step 12 in < 30 min (excluding pipeline wait)
- [ ] All 12 steps validate correctly + persist resume state
- [ ] At least 2 distribution profiles tested live (lead_magnet + zip_export minimum)
- [ ] Archetype + voice mode confirmation steps allow override
- [ ] Pipeline failure modes (e.g., transcribe fails) have clear recovery paths

## Risk callouts

- **Pipeline wait time UX** — total transcribe + audit + synthesis can be 2-4 hours. Wizard must let user leave + return. Mitigation: "We'll email you when ready" pattern + persistent session.
- **Goal-config validation latency** — validating Stripe Connect / OAuth credentials may require redirect. Mitigation: redirect-aware step transition + return-URL handling.
- **YouTube channel rate limits** — large channels hit YouTube Data API quota. Mitigation: chunk requests + cache video metadata aggressively.

## Out of scope

- Multi-creator team accounts (single-creator-per-account v1)
- Bulk operations (re-running 10 audits at once)
- Anonymous trials (must sign up to use)
