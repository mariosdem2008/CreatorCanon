# Phase E — CreatorCanon SaaS Subscription Billing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Creators pay CreatorCanon a monthly subscription. Three usage tiers (video generation hours + AI builder credits + AI chat credits). Optional addon credit packs for overages. Optional separate maintenance subscription for hosting + AI chat on the live hub. **CreatorCanon does NOT take any cut of creator revenue.** If a creator wants to sell their hub via Stripe Connect (paid_product distribution profile), it's their own Stripe account, their full revenue, our platform charges $0 platform fee.

**Architecture:** Stripe Billing (subscription products) for CreatorCanon's own SaaS pricing. Stripe Connect kept ONLY as a thin pass-through for creators who want to charge audience for their hub (paid_product profile) — but with `application_fee_amount = 0`. The interesting/critical work is our subscription tier model, the usage credit ledger (Phase N), and addon credit purchases.

**Owner:** Codex + Claude split.
- **Claude:** Stripe webhook handlers, subscription state machine, addon credit ledger entry on purchase, magic-link issuance for Connect-paid hubs (when used)
- **Codex:** Stripe Customer Portal embed, pricing page UI, upgrade/downgrade UX, addon credit purchase modal, billing history page, Connect onboarding UI (kept for paid_product creators)

**Dependencies:** Phase N (usage metering + credit ledger) is a hard prerequisite — Phase E enforces limits that Phase N tracks. Phase C (distribution profile abstraction) for the Connect-paid pass-through.

**Estimated weeks:** 6 (weeks 6-12 of meta-timeline).

---

## Pricing tiers (lock-in defaults — adjust prices via env)

| Tier | Monthly Price | Generation Hours | AI Builder Credits | AI Chat Credits | Hubs |
|---|---|---|---|---|---|
| **Starter** | $29 | 3 hours of source video | 100 builder calls | 0 (chat is addon/maintenance) | 1 active hub |
| **Pro** | $99 | 12 hours | 500 builder calls | 1,000 chat msgs | 3 active hubs |
| **Studio** | $299 | 40 hours | 2,000 builder calls | 5,000 chat msgs | unlimited |

**Maintenance Subscription** (separate, optional, per-hub): **$19/month per published hub** — covers hosting (Vercel project + custom domain SSL + R2 bandwidth) + ongoing AI chat at hub level (RAG-grounded answers for the audience). Without it, hubs go read-only after a 30-day grace period and AI chat is disabled.

**Addon credit packs:** purchasable any time, one-shot:
- +5 video hours: $39
- +500 builder credits: $19
- +2,000 chat credits: $19

Addon credits roll over forever; tier-included credits reset at billing period.

> Prices are configured in env vars (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_STUDIO`, `STRIPE_PRICE_MAINTENANCE`, `STRIPE_PRICE_ADDON_HOURS`, `STRIPE_PRICE_ADDON_BUILDER`, `STRIPE_PRICE_ADDON_CHAT`). Codex and Claude use these env keys; the actual Stripe price IDs land at deploy time.

---

## File structure

```
packages/synthesis/src/billing/                       ← Claude
  subscription-state.ts                               ← tier state machine + entitlements lookup
  webhook-handler.ts                                  ← Stripe webhook → DB updates + ledger inserts
  addon-credit.ts                                     ← addon-credit purchase → ledger entry
  connect-passthrough.ts                              ← Connect paid_product flow (application_fee_amount=0)
  magic-link.ts                                       ← buyer access for paid_product hubs
  entitlements.ts                                     ← reads tier+addon ledger; returns "can the creator do X right now?"

apps/web/src/app/api/billing/
  checkout/route.ts                                   ← Claude — POST: create Stripe Checkout session for tier or addon
  portal/route.ts                                     ← Claude — POST: returns Stripe Customer Portal URL
  webhook/route.ts                                    ← Claude — POST: stripe webhook entry (verify signature)
  entitlements/route.ts                               ← Claude — GET: current tier + remaining credits
  connect-onboard/route.ts                            ← Claude — POST: returns Connect onboarding URL (paid_product creators)

apps/web/src/app/(billing)/                           ← Codex
  pricing/page.tsx                                    ← public marketing pricing (3 tiers + maintenance)
  upgrade/page.tsx                                    ← in-app upgrade UX
  addons/page.tsx                                     ← addon credit purchase
  history/page.tsx                                    ← billing history
  thank-you/page.tsx                                  ← post-checkout

apps/web/src/components/billing/                      ← Codex
  TierCard.tsx                                        ← single tier card with CTA
  TierComparison.tsx                                  ← 3-tier comparison table
  AddonPurchaseModal.tsx                              ← buy more credits
  EntitlementsBadge.tsx                               ← header pill: "12 / 40 hours used this month"
  StripeCustomerPortalLink.tsx                        ← link to Stripe-hosted portal
  StripeConnectButton.tsx                             ← FOR PAID_PRODUCT CREATORS ONLY (no platform fee)

packages/db/src/schema/
  billing.ts                                          ← Claude — subscription, addon_purchase, stripe_account tables
packages/db/drizzle/
  0020_phase_e_billing.sql                            ← Claude
```

---

## Tasks

### E.1 — DB schema (Claude)

```ts
export const subscription = pgTable('subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  stripeCustomerId: varchar('stripe_customer_id', { length: 64 }).notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 64 }).notNull().unique(),
  tier: varchar('tier', { length: 16 }).notNull(),                      // starter | pro | studio
  status: varchar('status', { length: 24 }).notNull(),                  // active | past_due | canceled | paused | trialing
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const maintenanceSubscription = pgTable('maintenance_subscription', {
  id: uuid('id').primaryKey().defaultRandom(),
  hubId: uuid('hub_id').notNull(),
  userId: uuid('user_id').notNull(),
  stripeSubscriptionId: varchar('stripe_subscription_id', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 24 }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
});

export const addonPurchase = pgTable('addon_purchase', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  stripeChargeId: varchar('stripe_charge_id', { length: 128 }).notNull().unique(),
  kind: varchar('kind', { length: 32 }).notNull(),                      // hours | builder_credits | chat_credits
  amount: integer('amount').notNull(),                                  // hours, credits, msgs
  purchasedAt: timestamp('purchased_at', { withTimezone: true }).defaultNow(),
});

// stripe_account kept for paid_product creators (no platform fee taken)
export const stripeAccount = pgTable('stripe_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  stripeAccountId: varchar('stripe_account_id', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 16 }).notNull(),
  payoutsEnabled: boolean('payouts_enabled').default(false),
  chargesEnabled: boolean('charges_enabled').default(false),
});

// access grants for paid_product hub buyers (audience side)
export const accessGrant = pgTable('access_grant', {
  id: uuid('id').primaryKey().defaultRandom(),
  hubId: uuid('hub_id').notNull(),
  buyerEmail: varchar('buyer_email', { length: 255 }).notNull(),
  stripeChargeId: varchar('stripe_charge_id', { length: 128 }),
  grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
});
```

Migration 0020.

### E.2 — Stripe products + prices bootstrap script (Claude)

`scripts/stripe-bootstrap.ts` — idempotently creates 3 tier products, 1 maintenance product, 3 addon products in Stripe (test + production via env). Outputs price IDs to `.env.example`. Run once per environment.

### E.3 — Subscription checkout (Claude + Codex)

**Claude:** `POST /api/billing/checkout` accepts `{tier: 'starter'|'pro'|'studio', returnUrl}` → creates Stripe Checkout session in subscription mode, returns URL.
**Codex:** `pricing/page.tsx` lists 3 tiers + maintenance card. Each "Subscribe" button POSTs to checkout API + redirects to Stripe.

### E.4 — Stripe Customer Portal (Claude + Codex)

Stripe-hosted portal handles upgrade/downgrade/cancel/payment-method. We don't reinvent this UX.
**Claude:** `POST /api/billing/portal` returns portal URL.
**Codex:** "Manage subscription" button on dashboard → calls API + redirects.

### E.5 — Webhook handler (Claude)

`POST /api/billing/webhook` — verifies Stripe signature. Events:
- `customer.subscription.created` / `updated` / `deleted` → update `subscription` row + reset usage period in credit ledger (Phase N hook)
- `invoice.payment_succeeded` (subscription) → mark active, allocate tier credits in ledger for the new period
- `invoice.payment_failed` → mark past_due; after 7 days, flip to canceled (DB-side)
- `checkout.session.completed` (one-shot mode = addon purchase) → insert `addon_purchase` row + credit ledger entry
- For paid_product hubs (Connect): `checkout.session.completed` → create `access_grant` + magic-link to buyer

Idempotency: `ON CONFLICT (stripe_subscription_id) DO UPDATE` for subs; `ON CONFLICT (stripe_charge_id) DO NOTHING` for addons.

### E.6 — Addon credit purchase flow (Claude + Codex)

**Codex:** `AddonPurchaseModal.tsx` — pick hours / builder / chat credit pack, calls checkout API in one-shot mode.
**Claude:** Webhook `checkout.session.completed` → calls Phase N's `creditLedger.add({userId, kind, amount, source: 'addon'})`.

### E.7 — Maintenance subscription (Claude + Codex)

**Claude:** Each hub publish prompts `POST /api/billing/checkout` with `kind: 'maintenance', hubId`. Webhook on `customer.subscription.created` → insert `maintenance_subscription` row.
**Codex:** Hub publish flow includes "Add maintenance ($19/mo) — required for live hosting + AI chat" with a checkbox. Without it, the hub deploys but has a 30-day grace banner ("Add maintenance to keep this hub live").

### E.8 — Entitlements API + middleware (Claude)

`GET /api/billing/entitlements` returns current tier + remaining credits per kind (queries Phase N ledger). Used by:
- Header badge ("12/40 hours used")
- Pre-flight gates: when creator triggers an audit, check `entitlements.canConsume({kind: 'hours', amount: estVideoHours})` → if false, prompt addon purchase

Middleware factor: `requireEntitlement(kind, amount)` wraps protected API routes (audit start, builder call, chat msg).

### E.9 — Connect onboarding (paid_product creators only — NO platform fee)

**Critical clarification:** Connect onboarding is **opt-in** for creators on the paid_product distribution profile. CreatorCanon takes **0%** application_fee_amount. The creator's full audience-payment goes to the creator's Stripe account.

**Claude:** `POST /api/billing/connect-onboard` creates Stripe Account Link → returns hosted onboarding URL. Stores `stripe_account` row.
**Codex:** `StripeConnectButton.tsx` lives inside the paid_product distribution config (Phase C); only shown for that profile.

When creating a Checkout session for an audience purchase of a paid_product hub:
```ts
stripe.checkout.sessions.create({
  payment_intent_data: {
    application_fee_amount: 0,                        // ← PLATFORM TAKES NOTHING
    transfer_data: { destination: creatorStripeAccountId },
  },
  // ...
});
```

### E.10 — Magic-link for paid_product buyers (Claude)

Buyer paid via creator's Connect account → webhook creates `access_grant` + sends magic-link email → consumer hits `/api/auth/magic/[token]` → cookie set → can read paid hub.

(Reuses existing Phase C member-area access infrastructure where possible.)

### E.11 — Pricing page UI (Codex)

`/pricing` public page:
- Hero: "From YouTube channel to a polished knowledge hub in hours."
- 3-column tier comparison
- Maintenance card below ("Hosting + AI chat $19/mo per hub")
- FAQ: "Do you take a cut of my hub revenue?" → "**No.** CreatorCanon's revenue comes only from your subscription. If you sell your hub through Stripe, 100% of your revenue goes to your Stripe account."

### E.12 — Billing history + dashboard (Codex)

`/dashboard/billing` shows:
- Current tier + next renewal
- Usage bars: "12 / 40 hours used this period"
- Addon credit balance
- Purchase history list (subscription invoices + addon purchases)
- "Manage subscription" → Stripe portal
- "Buy more credits" → addon modal

### E.13 — Trial period

14-day Stripe trial on Starter only. Pro and Studio require payment method up front. Webhook handles `customer.subscription.trial_will_end` for nudge email.

### E.14 — Testing

Stripe test mode end-to-end:
- Create Starter sub with test card 4242 → tier credits allocated in ledger
- Run audit consuming 1 hour → credits decrement
- Buy hours addon → credits increment
- Upgrade Starter → Pro via portal → tier credits reset to Pro level
- Cancel sub → status flips to canceled at period end
- Failed payment → subscription past_due → 7 days later auto-cancel
- Connect onboard a test creator → audience-buy a paid_product hub → access_grant created, NO platform fee retained

### E.15 — PR + ops docs

PR title: "Phase E: SaaS subscription billing (3 tiers + addons + maintenance + Connect pass-through)"

Ops doc: env vars, Stripe webhook endpoint setup, how to apply for Connect platform account (still needed even with 0% fee for compliance).

---

## Success criteria

- [ ] Test creator subscribes to Pro → tier credits allocated in Phase N ledger
- [ ] Addon purchase tops up credits in ledger
- [ ] Hub publish creates maintenance subscription
- [ ] Without maintenance, hub goes read-only after grace period
- [ ] Entitlement gates block actions when credits exhausted
- [ ] Stripe Customer Portal handles upgrade/cancel correctly
- [ ] Paid_product Connect flow charges audience with 0% platform fee
- [ ] Magic-link delivers to paid_product buyer

## Risk callouts

- **Connect KYC delay** — 1-3 weeks even with 0% fee (still need platform account for transfers). Apply early. Mitigation: Connect-only branch dev'd against test mode; production switchover later.
- **Webhook idempotency** — duplicate ledger entries if handler runs twice. Mitigation: `ON CONFLICT` constraints on `stripe_subscription_id` and `stripe_charge_id`.
- **Tier downgrade with overage** — creator on Studio (40h) downgrades to Starter (3h) mid-period after using 30h. Mitigation: pro-rate at downgrade time + zero out overage in ledger; surface clear UX about what they keep.
- **Maintenance lapse** — creator stops paying maintenance, hub goes dark, audience disrupted. Mitigation: 30-day grace + 3 reminder emails before read-only flip.
- **Trial abuse** — multiple Starter trials per email. Mitigation: Stripe Customer dedup by email; reject duplicate subscription creation.

## Out of scope

- Annual billing (monthly only v1)
- Coupons / promo codes (v2)
- Multi-currency (USD-only v1)
- Tax handling beyond Stripe Tax defaults (v2)
- Team plans / multiple seats per subscription (v2)
- Per-page micro-purchases on paid_product hubs (whole-hub only v1)
