# Meta — Phase A→K Execution Plan (Claude + Codex split)

> The umbrella document. Defines the 11 phases that take CreatorCanon from "Phase 11 audit pipeline complete" to "production-ready self-serve SaaS." Assigns owners, defines branch + commit + merge protocol, and prevents Claude/Codex from stepping on each other.

**Goal:** Reach production-ready, multi-archetype, self-serve SaaS in 22-26 weeks (5-6 months) from 2026-05-02.

**End state:** A creator can sign up, claim their YouTube channel, choose a product goal (lead-magnet / paid / member library / sales asset / public reference), confirm archetype + voice, watch the audit + synthesis run, edit any block before publish, deploy to their custom domain, and have analytics + member state + billing all working.

---

## Phase map

| Phase | Title | Owner | Depends on | Estimated weeks |
|---|---|---|---|---|
| **A** | Operator-coach product synthesis | Claude | main (Phase 11) | 1-12 |
| **B** | Creator editor UI + AI builder (conversational) | Codex + Claude | A (mock data ok wks 1-7) | 8-14 |
| **C** | Distribution profiles (lead-magnet, paid, member, public, zip) | Codex + Claude | main | 1-8 |
| **D** | Self-serve onboarding wizard | Codex | A, B, C | 12-20 |
| **E** | CreatorCanon SaaS subscription billing (3 tiers + addons + maintenance) | Codex + Claude | C, N | 6-12 |
| **F** | Analytics + creator dashboard | Codex + Claude | C (deployed hub) | 14-22 |
| **G** | Domain + DNS automation (per-creator Vercel projects) | Codex | C | 16-22 |
| **H** | Science-explainer product synthesis | Claude | A | 13-18 |
| **I** | Contemplative-thinker product synthesis | Claude | A | 16-20 |
| **J** | Instructional-craft product synthesis | Claude | A | 18-22 |
| **K** | Production observability | Claude | F (deployed hubs to monitor) | 18-24 |
| **L** | AI chat on hubs (RAG-grounded, audience-facing) | Claude + Codex | A, E, N, H | 16-21 |
| **N** | Usage metering + credit ledger (3-kind ledger) | Claude | — (parallel with E) | 6-9 |

**Critical path to PMF demo (one creator, lead-magnet only):** A → B → C → D — 20 weeks.

**Critical path to v1 production (all 4 archetypes, self-serve):** A → B → C → D → E + F + G + H + I + J + K — 26 weeks.

---

## Owner assignment rationale

The split rule: **Claude owns semantic backend (TypeScript pipeline + composer agents + DB + server logic). Codex owns frontend (Next.js apps, components, UI, marketing surfaces, hub-builder UX).**

This mirrors how the Phase 8 + Creator Manual integration worked: zero-overlap between Claude's pipeline work and Codex's hub template / handoff work. We continue that pattern.

| Phase | Owner | Why |
|---|---|---|
| A | Claude | Composer agents are pure pipeline TypeScript. Heavy semantic work over the audit substrate. Same shape as Phase 5/7/8 body writers. |
| B | Codex | Editor UI is Next.js + React. Inline edit + regenerate buttons + per-block API consumption. Codex authored the hub template — extending it to editable is the natural continuation. |
| C | Codex + Claude | Backend middleware + ESP integrations = Claude. Paywall pages + email-capture overlays + share-card UI = Codex. Clean API boundary between them. |
| D | Codex | 12-step wizard is pure UI. Calls existing pipeline APIs. |
| E | Codex + Claude | Stripe Connect webhooks + access-token issuance = Claude. Pricing-page UI + checkout-redirect + thank-you page = Codex. |
| F | Codex + Claude | Analytics ingestion + aggregation queries = Claude. Dashboard charts + creator-facing visualizations = Codex. |
| G | Codex | Vercel API + DNS verification UI. Mostly creator-config UX. |
| H, I, J | Claude | Same pattern as A — backend composer agents per archetype. |
| K | Claude | Sentry config, alerting, runbooks. Pure operations. |

---

## Branch strategy

**Single rule: each phase gets its own feature branch off `main`.**

```
main
├── feat/phase-a-operator-coach-synthesis     (Claude)
├── feat/phase-b-editor-ui                    (Codex)
├── feat/phase-c-distribution-profiles        (Codex + Claude — see sub-branching below)
├── feat/phase-d-onboarding-wizard            (Codex)
├── feat/phase-e-stripe-connect               (Codex + Claude)
├── feat/phase-f-analytics-dashboard          (Codex + Claude)
├── feat/phase-g-domain-automation            (Codex)
├── feat/phase-h-science-synthesis            (Claude)
├── feat/phase-i-contemplative-synthesis      (Claude)
├── feat/phase-j-instructional-synthesis      (Claude)
└── feat/phase-k-observability                (Claude)
```

For shared phases (C, E, F), use sub-branches that merge into the phase branch:

```
feat/phase-c-distribution-profiles  (the integration branch — Claude maintains)
├── feat/phase-c-backend-claude     (Claude pushes here, opens PR into integration)
└── feat/phase-c-ui-codex            (Codex pushes here, opens PR into integration)
```

The integration branch only merges to main after BOTH sub-branches merge into it AND validation passes.

---

## Directory ownership (the most important rule for conflict prevention)

The original Phase 8 ↔ Codex Creator Manual integration worked because of zero file overlap. We maintain that:

### Claude owns

```
packages/synthesis-*/                          (NEW — all synthesis composer packages)
packages/pipeline/src/scripts/composer-*.ts    (NEW — composer agents in pipeline)
packages/pipeline/src/scripts/util/composer-*.ts
packages/pipeline/src/scripts/util/intent-*.ts
packages/pipeline/src/scripts/util/diagnostic-*.ts
packages/pipeline/src/scripts/util/action-plan-*.ts
packages/pipeline/src/scripts/util/worksheet-*.ts
packages/pipeline/src/scripts/util/calculator-*.ts
packages/pipeline/src/scripts/util/card-*.ts
packages/pipeline/src/scripts/util/reference-*.ts
packages/pipeline/src/scripts/util/lesson-*.ts
packages/pipeline/src/scripts/util/funnel-*.ts
packages/pipeline/src/scripts/util/voice-fingerprint-*.ts
packages/db/src/schema/synthesis-*.ts          (NEW — synthesis output tables)
packages/db/drizzle/0017+ migrations           (next migration after Codex's 0014/0015/0016)
apps/web/src/app/api/runs/[runId]/synthesis/*  (NEW — synthesis API endpoints)
apps/web/src/app/api/runs/[runId]/canon/[canonId]/rewrite-paragraph/route.ts (existing, Phase 11)
apps/web/src/lib/db-monitoring.ts              (NEW — Sentry hooks, alerting)
```

### Codex owns

```
apps/web/src/app/(creator)/**                  (NEW — creator dashboard pages)
apps/web/src/app/(onboarding)/**               (NEW — wizard pages)
apps/web/src/app/(billing)/**                  (NEW — Stripe checkout pages)
apps/web/src/app/h/[hubSlug]/**                (existing — hub renderer; Codex extended for editor)
apps/web/src/components/editor/**              (NEW — inline editor components)
apps/web/src/components/onboarding/**          (NEW — wizard components)
apps/web/src/components/distribution/**        (NEW — paywall, lead-capture overlays)
apps/web/src/components/dashboard/**           (NEW — analytics dashboard components)
apps/web/src/components/hub/CreatorManual/**   (existing Codex template — extended)
apps/web/src/components/hub/shells/**          (NEW — per-archetype shells)
apps/web/src/lib/hub/**                        (existing — Codex's hub manifest layer)
apps/web/src/lib/distribution/**               (NEW — distribution profile config)
apps/web/src/middleware.ts                     (Codex extends for distribution gates)
```

### Shared (require coordination)

```
packages/db/src/schema/index.ts                (both packages add tables — sequential PRs only)
packages/db/drizzle/_journal.json              (both add migrations — number sequentially)
packages/adapters/**                           (R2, OpenAI, Codex CLI clients — sequential PRs only)
apps/web/package.json                          (both may add deps — pnpm-lock conflicts — coordinate)
```

**Coordination protocol for shared files:**
- Whoever needs to modify first opens a "shared change PR" referencing the phase
- The other waits for it to merge before starting their phase's PR
- If parallel changes are required, the second PR rebases on top of the first

---

## Commit + merge protocol

Mirroring Phase 9-11 patterns:

1. **Each task gets one commit.** Granular history. Reviewable.
2. **Commit messages follow conventional format:** `<type>(phase-X): <summary>` then body. Types: feat, fix, docs, plan, spec, test, refactor.
3. **Co-Author trailer:** `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` for Claude commits; Codex uses its own attribution per its convention.
4. **No force-pushes to feature branches** unless coordinating with the other agent.
5. **TDD: failing test → implementation → passing test → commit.** Standard for any code that has a test surface.
6. **Run `pnpm typecheck` + relevant unit tests before each commit.** Pre-existing errors are acceptable; introducing new errors requires fixing inline before commit.
7. **Push branches early for visibility,** even before PR is opened. Other agent + human can see what's in flight.

---

## PR + review protocol

1. **Each phase gets ONE PR** when the phase branch is feature-complete.
2. **PR body must include:**
   - Summary (1 paragraph)
   - List of commits with one-line description each
   - Test plan (checklist of what was validated)
   - Risk callouts (anything that might break adjacent phases)
   - Cross-references to dependent phases
3. **PR opens as DRAFT** during development. Marks ready when validation gauntlet passes.
4. **Each phase author runs targeted review on the OTHER author's PR** before merge — same pattern as Phase 8 ↔ Creator Manual integration where Claude reviewed PR #13.
5. **Validation gauntlet** (run before marking PR ready):
   - `pnpm install` succeeds (lockfile clean)
   - `pnpm typecheck` shows no NEW errors vs main
   - `pnpm --filter @creatorcanon/pipeline test` passes (where applicable)
   - `pnpm --filter @creatorcanon/web build` passes
   - Smoke: at least one happy-path end-to-end run
6. **Merge strategy: squash to main.** Keeps main history clean. Preserves PR title as the squash commit.
7. **Post-merge:** delete the feature branch + worktree. Other phase branches that need the new main rebase ASAP (`git pull --rebase origin main`).

---

## Conflict prevention (explicit)

**Predicted conflict surfaces** (based on Phase 8 ↔ Creator Manual experience):

1. **`packages/db/drizzle/_journal.json`** — both phases adding migrations. **Mitigation:** strict ordering. Whoever opens a migration PR first uses the next available number (0017), the other rebases + uses 0018+.
2. **`packages/db/src/schema/index.ts`** — both adding table exports. **Mitigation:** same as above; sequential merges.
3. **`packages/adapters/**`** — both adding new external service clients (Codex adds Stripe; Claude adds analytics ingest). **Mitigation:** new clients go in NEW files inside `packages/adapters/<service>/`. Don't modify existing clients in cross-phase ways.
4. **`pnpm-lock.yaml`** — every phase adds/updates deps. **Mitigation:** never accept auto-merge on lockfile. Always `pnpm install --frozen-lockfile=false` after merge to regenerate.
5. **`apps/web/package.json`** — both phases adding scripts/deps. **Mitigation:** alphabetical script ordering; deps inserted at the right alphabetical position. Conflicts in this file are textual not semantic.
6. **`apps/web/src/middleware.ts`** — Phase C (distribution gates) and Phase D (onboarding gates) both touch. **Mitigation:** Codex owns this file across C + D; Claude does not modify.

---

## Communication protocol (handoffs between Claude + Codex)

**When Claude finishes a phase + needs Codex to consume the API:**
1. Claude documents the API surface in `docs/api/` (route, request shape, response shape, error codes)
2. Claude opens PR with the API + a stub-data fixture for Codex to develop against
3. Claude pings the human to send a handoff prompt to Codex
4. Codex develops against the stubs; merges first against the API contract

**When Codex finishes a phase + needs Claude to consume UI events / produce data:**
1. Codex documents the event/data contract in `docs/api/`
2. Codex opens PR with stub event handlers
3. Codex pings the human
4. Claude implements the backend handlers against the stubs

**When phases run in parallel (e.g., A and C):**
- Each agent works on its phase branch independently
- No cross-branch dependencies — both rebase on main weekly
- If a phase change breaks the other phase's assumptions, the breaker patches the broken side

**Stop-and-coordinate triggers:**
- Either agent finds they need to modify a SHARED directory (see above)
- Either agent discovers a cross-phase architectural decision the other should weigh in on
- Either agent's phase is blocked waiting on the other's deliverable

The human (Mario) is the tie-breaker on architectural decisions. Both agents should surface decisions clearly + recommend, not assume.

---

## Phase-by-phase plan references

Each phase has its own detailed plan at:

| Phase | Plan file |
|---|---|
| A | `docs/superpowers/plans/2026-05-02-phase-a-operator-coach-product-synthesis.md` |
| B | `docs/superpowers/plans/2026-05-02-phase-b-creator-editor-ui.md` |
| C | `docs/superpowers/plans/2026-05-02-phase-c-distribution-profiles.md` |
| D | `docs/superpowers/plans/2026-05-02-phase-d-self-serve-onboarding.md` |
| E | `docs/superpowers/plans/2026-05-02-phase-e-stripe-connect-billing.md` |
| F | `docs/superpowers/plans/2026-05-02-phase-f-analytics-creator-dashboard.md` |
| G | `docs/superpowers/plans/2026-05-02-phase-g-domain-dns-automation.md` |
| H | `docs/superpowers/plans/2026-05-02-phase-h-science-explainer-synthesis.md` |
| I | `docs/superpowers/plans/2026-05-02-phase-i-contemplative-thinker-synthesis.md` |
| J | `docs/superpowers/plans/2026-05-02-phase-j-instructional-craft-synthesis.md` |
| K | `docs/superpowers/plans/2026-05-02-phase-k-production-observability.md` |
| L | `docs/superpowers/plans/2026-05-02-phase-l-ai-chat-on-hubs.md` |
| N | `docs/superpowers/plans/2026-05-02-phase-n-usage-metering-credit-ledger.md` |

Each plan is self-contained: tasks, files to create/modify, success criteria, exit criteria.

---

## Production-readiness checklist

Before declaring "production ready" (after all 11 phases ship):

**Engineering**
- [ ] All 11 phases merged to main
- [ ] All phase tests pass (cumulative)
- [ ] Pre-existing typecheck error count NOT increased
- [ ] At least 4 creators (1 per archetype) audited end-to-end with synthesis layer
- [ ] At least 1 creator deployed to a custom domain
- [ ] Lead-magnet + paid + zip-export distribution profiles all tested live
- [ ] Sentry capturing errors from production hubs
- [ ] Analytics dashboard shows real data for at least 1 deployed creator

**Product**
- [ ] At least 1 creator (preferably 2-3) actively using their hub
- [ ] At least one creator paying for the platform OR using lead-magnet with measurable opt-in rate
- [ ] Onboarding wizard completable end-to-end by a non-engineer in < 30 min
- [ ] Editor UI usable for inline edits without losing work

**Documentation**
- [ ] Per-archetype "what to expect" docs in the dashboard
- [ ] API docs for any public/3rd-party integrations
- [ ] Runbook for common incidents (Codex CLI rate limit, Neon suspend, Stripe webhook failure)
- [ ] Operator dashboard for our own visibility (which creators are running pipelines, which are stuck, error rates)

---

## Timeline visualization

```
Wk:    1   3   5   7   9  11  13  15  17  19  21  23  25
       │───│───│───│───│───│───│───│───│───│───│───│───│
A:     ████████████                                              [Claude wks 1-12]
B:                  ████████████                                 [Codex wks 8-14]
C:     ████████████                                              [Codex+Claude wks 1-8]
E:                ████████████                                   [Codex+Claude wks 6-12]
D:                                ████████████                   [Codex wks 12-20]
F:                                  ████████████                 [Codex+Claude wks 14-22]
G:                                      ████████████             [Codex wks 16-22]
H:                              ████████████                     [Claude wks 13-18]
I:                                  ████████████                 [Claude wks 16-20]
J:                                      ████████████             [Claude wks 18-22]
K:                                      ████████████             [Claude wks 18-24]
       │───│───│───│───│───│───│───│───│───│───│───│───│
        PMF demo target ↑                Production ready ↑
        (week 12 — A done)               (week 24 — all merged)
```

Critical path: A → B → D → PMF demo at ~week 14. Production-ready at ~week 22-26.

---

## Risks + open questions

**Risks:**
1. **Codex CLI rate limits on synthesis composers** — synthesis adds ~60-150 Codex calls per creator. Combined with audit's ~200-500, a single onboarding could hit ChatGPT plan limits. **Mitigation:** add Codex CLI queue + retry-with-backoff at the runner level (deferred from Phase 9; should land in Phase A or K).
2. **Schema drift between phases** — synthesis output tables (Claude) + onboarding state tables (Codex) both grow the schema. **Mitigation:** schema PRs land in dedicated tiny PRs, sequentially, before phase work.
3. **Stripe Connect KYC delays** — onboarding a real Stripe Connect platform account takes 1-3 weeks of compliance review. **Mitigation:** start the Stripe application week 1; don't gate Phase E on it landing.
4. **Per-archetype shell rendering complexity** — building 4 different shells could blow out frontend timeline. **Mitigation:** ship operator-coach shell first; subsequent archetypes reuse 70%+ of components.
5. **Live data regen costs** — every phase that changes the audit substrate or synthesis logic needs a re-run on the cohort. Each re-run is ~3 hours of Codex per creator × 7 creators = ~21 hours per phase. **Mitigation:** only re-run when changes are user-facing material; small fixes can roll up.

**Decided (locked-in by Mario 2026-05-02):**
1. **PMF wedge creator: Hormozi first, then Clouse.** Phase A smoke-test runs against Hormozi's run; cohort smoke test extended to Clouse second.
2. **Platform fee: 0%.** CreatorCanon revenue comes ONLY from SaaS subscriptions (Phase E tiers + maintenance + addon credits). NO cut of creator revenue. Stripe Connect kept as opt-in pass-through for paid_product creators with `application_fee_amount=0`.
3. **Per-creator Vercel project.** Phase G locks per-creator project; multi-tenant shared deferred entirely.
4. **3-tier subscription model with usage credits:**
   - Starter $29/mo: 3h video gen + 100 builder credits + 0 chat (chat via maintenance/addon)
   - Pro $99/mo: 12h + 500 builder + 1k chat
   - Studio $299/mo: 40h + 2k builder + 5k chat
   - Maintenance $19/mo per published hub: hosting + AI chat at the hub
   - Addons: +5h ($39), +500 builder ($19), +2k chat ($19)
   - Free tier: 6 source videos OR a single trial-based first audit, capped to a single in-progress hub.
5. **Hubs include RAG-grounded AI chat (Phase L)** for the audience. Cost-counted against the creator's chat-credit balance (Phase N).

---

## Self-review

1. **Coverage:** all 11 phases have an entry, a plan file, an owner, dependencies, and an estimated timeline. ✓
2. **No placeholders:** every cell in the assignment table is filled. ✓
3. **Branch + merge protocol is explicit:** one branch per phase, sub-branches for shared phases, squash-merge to main, post-merge cleanup. ✓
4. **Conflict prevention is concrete:** directory ownership listed, shared files explicit, coordination protocol defined. ✓
5. **Critical path is identified:** A → B → D → PMF (~14 weeks). Production at ~22-26 weeks. ✓
6. **Risks + open questions surfaced:** 5 risks with mitigations, 4 open questions for Mario. ✓
