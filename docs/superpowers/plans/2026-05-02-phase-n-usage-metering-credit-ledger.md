# Phase N — Usage Metering + Credit Ledger

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Single source of truth for "how much of X has this creator used / does this creator have left." Tracks 3 credit kinds: **video generation hours**, **AI builder credits** (per Codex builder call), **AI chat credits** (per hub chat msg). Allocates tier credits at billing-period boundaries, debits on consumption, accepts addon top-ups (Phase E). Enforces limits via middleware. Surfaces in dashboard + onboarding.

**Architecture:** Append-only event ledger (`credit_event` table) with kind, sign (+ for grant, − for consume), amount, source (e.g., `tier_allocation:starter:2026-05-period`, `addon:hours:purch_xyz`, `audit_run:abc123`, `chat_msg:msg_xyz`). Materialized view `credit_balance` keeps current balance per (userId, kind) for O(1) reads. Recompute periodically + on demand.

This is the "trust me, I add up" system — every consumption decrements; every renewal/top-up increments; the math is auditable.

**Owner:** Claude (pure backend).

**Dependencies:** Phase E (subscription state machine writes tier-allocation events); composer-runner (Phase A) writes consumption events; AI builder API (Phase B) writes consumption events; AI chat API (Phase L) writes consumption events.

**Estimated weeks:** 3 (weeks 6-9 of meta-timeline — runs in parallel with E and unblocks E.8 entitlement gates).

---

## File structure

```
packages/synthesis/src/credits/
  ledger.ts                                           ← grant + consume event API
  balance.ts                                          ← compute current balance for (userId, kind)
  allocator.ts                                        ← tier-renewal allocation logic
  enforcer.ts                                         ← middleware: requireCredits(kind, amount)
  reconciler.ts                                       ← nightly: recompute materialized view
  index.ts

packages/synthesis/src/credits/test/
  ledger.test.ts
  balance.test.ts
  allocator.test.ts
  enforcer.test.ts

packages/db/src/schema/
  credits.ts                                          ← credit_event, credit_balance tables
packages/db/drizzle/
  0019_phase_n_credits.sql

apps/web/src/app/api/credits/
  balance/route.ts                                    ← GET: balances per kind
  events/route.ts                                     ← GET: paged history (for billing/history page)
```

---

## Tasks

### N.1 — DB schema

```ts
export const creditEvent = pgTable('credit_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  kind: varchar('kind', { length: 24 }).notNull(),                  // hours | builder_credits | chat_credits
  delta: integer('delta').notNull(),                                // + grants, - consumes
  source: varchar('source', { length: 96 }).notNull(),              // 'tier:pro:2026-05', 'addon:hours:c_xyz', 'audit:run_abc', 'chat:msg_xyz', etc.
  reference: varchar('reference', { length: 64 }),                  // foreign key text (subscription_id, run_id, msg_id)
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const creditBalance = pgTable('credit_balance', {
  userId: uuid('user_id').notNull(),
  kind: varchar('kind', { length: 24 }).notNull(),
  balance: integer('balance').notNull().default(0),                 // sum of all deltas
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.kind] }),
}));

// indexes: (userId, kind), (source) for idempotency lookup
```

Migration 0019 with constraint `UNIQUE(source, reference)` to enforce idempotent inserts.

### N.2 — Ledger API

```ts
// ledger.ts
export async function grant(args: { userId: string; kind: CreditKind; amount: number; source: string; reference?: string; }): Promise<CreditEvent>
export async function consume(args: { userId: string; kind: CreditKind; amount: number; source: string; reference?: string; }): Promise<CreditEvent>
```

Both insert one row. `consume` writes negative delta. Idempotency: `ON CONFLICT (source, reference) DO NOTHING`. After insert, atomically updates `credit_balance` via UPSERT. Wrapped in transaction.

Test surface: golden tests for: grant new user → balance = amount; consume → balance decrements; consume more than available → throws InsufficientCreditsError.

### N.3 — Balance API

```ts
// balance.ts
export async function getBalance(userId: string, kind?: CreditKind): Promise<Record<CreditKind, number>>
```

Reads from materialized `credit_balance` table. If kind unspecified, returns all 3 kinds.

### N.4 — Tier allocator

```ts
// allocator.ts
export async function allocateTierCredits(userId: string, tier: 'starter' | 'pro' | 'studio', periodStart: Date): Promise<void>
```

Maps tier → credit amounts (env-configured: `TIER_STARTER_HOURS=3`, `TIER_PRO_HOURS=12`, `TIER_STUDIO_HOURS=40`, etc.).

For each kind, calls `grant` with source = `tier:${tier}:${periodStart.toISOString()}`. Idempotent on source — if same period grant already exists, skip.

**Reset semantics:** at period boundary, tier credits reset (not roll over). To handle: on allocation, also write a `consume` event for any leftover tier credits from the previous period (source: `tier_reset:${prevPeriodStart}`). This keeps the ledger truthful — addon credits (separate source) are NOT zeroed.

To distinguish addon vs tier in the ledger: source prefix `tier:` vs `addon:`. Reset only consumes balance attributable to `tier:*` events.

### N.5 — Enforcer middleware

```ts
// enforcer.ts
export async function requireCredits(userId: string, kind: CreditKind, amount: number): Promise<void>
```

Throws `InsufficientCreditsError` (402-status when surfaced via API) if balance < amount.

Wrapped into Next.js API route helpers. Phase A audit start → `requireCredits(userId, 'hours', estVideoHours)` before consuming. Phase B builder call → `requireCredits(userId, 'builder_credits', 1)`. Phase L chat → `requireCredits(hubOwnerUserId, 'chat_credits', 1)`.

### N.6 — Reconciler (nightly job)

`reconciler.ts`: cron-style script. For each user, recomputes balance from raw `credit_event` rows; compares to `credit_balance.balance`; alerts on mismatch (Sentry). Self-heals by overwriting balance row.

Run via Vercel Cron 03:00 UTC daily.

### N.7 — Stripe webhook integration (Phase E hook)

When Phase E's `customer.subscription.created` / `invoice.payment_succeeded` webhook fires:
- Compute new period start
- Call `allocateTierCredits(userId, tier, periodStart)`

When `addon_purchase` row inserted by Phase E webhook:
- Call `grant(userId, kind, amount, source: 'addon:${kind}:${stripeChargeId}')`

These are direct calls — no API hop. Implemented in Phase E's webhook handler but tests live with N.

### N.8 — Consumption integration

In each consumer:
- Phase A audit start: estimate video hours from source URLs; `requireCredits → grant work → on success, consume`
- Phase B builder API: per call, `consume('builder_credits', 1)`
- Phase L chat API: per response, `consume('chat_credits', 1)` AFTER stream completes

Pattern is "work first, debit on success." If work fails, no debit.

For Phase A specifically: estimate in advance; if real work consumes more (longer video found), consume the diff at end of run. Store estimate vs actual on `audit_run`.

### N.9 — APIs

`GET /api/credits/balance` → returns balances for current user.
`GET /api/credits/events?kind=hours&limit=50&cursor=...` → paged event history (used by billing/history UI in Phase E).

### N.10 — Dashboard surface (Codex-side hook)

Phase E's `EntitlementsBadge.tsx` reads from `/api/credits/balance` and shows:
- "Hours: 12 / 40 used"
- "Builder credits: 230 / 500"
- "Chat credits: 850 / 1,000"

When close to exhaustion (< 10%): show "Top up" link → opens addon purchase modal (Phase E).

### N.11 — Audit row → ledger reference

Add `audit_run.creditEventIds: jsonb` listing the ledger events tied to that run. Lets the dashboard show "this run cost X hours" precisely. Migration alters audit_run.

### N.12 — Testing + PR

- Unit: ledger atomicity, idempotency on duplicate source, balance reconciliation
- Property test: grant/consume sequences end with correct balance regardless of ordering
- Integration: simulate full month — Pro sub created → audit consumes 8h → addon purchase +5h → next period reset → balance correct
- Reconciler test: artificially desync balance row → reconciler detects + fixes
- PR title: "Phase N: usage metering + credit ledger (3-kind ledger, allocator, enforcer)"

---

## Success criteria

- [ ] Tier renewal allocates correct credits to ledger
- [ ] Addon purchase grants credits idempotently (duplicate webhook = single grant)
- [ ] Audit run consumes hours accurately (estimate + true-up)
- [ ] Builder + chat consumption decrements credits
- [ ] Insufficient credits returns 402 with clear addon CTA
- [ ] Reconciler self-heals balance drift
- [ ] Tier reset zeros tier credits but preserves addon credits

## Risk callouts

- **Race conditions on simultaneous consume** — two requests at once both pass `requireCredits` then both consume → negative balance. Mitigation: `consume` uses a transactional check-and-decrement (SELECT FOR UPDATE on credit_balance row + verify; insert event only if pass). Fall back to optimistic concurrency with retry on conflict.
- **Stripe webhook delays cause period rollover skew** — invoice.payment_succeeded arrives 5 min after `currentPeriodStart`. Mitigation: allocator is idempotent on source — if it fires twice (once optimistically at our scheduled rollover, once on webhook), only one grant lands.
- **Reconciler false alarms** — events written between snapshot and balance read look like drift. Mitigation: reconciler uses snapshot timestamp + only flags drift > 1 minute old.

## Out of scope

- Per-hub credit allocation (creator-level only v1)
- Sub-account credit sharing (single owner v1)
- Backdated credit grants (manual ops procedure v1)
- Multi-currency (USD-only v1; credits are dimensionless internally)
