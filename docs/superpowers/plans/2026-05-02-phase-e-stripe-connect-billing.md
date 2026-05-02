# Phase E — Stripe Connect Billing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Creators sell their hub with their own Stripe account, CreatorCanon takes a platform fee. Audience purchases give them durable access (magic-link login).

**Architecture:** Stripe Connect Standard. Each creator connects their existing Stripe account via OAuth. CreatorCanon is the platform; charges are made to the creator's account with `application_fee_amount` for our cut. Webhooks land on our infrastructure → issue access tokens → magic-link email to buyer.

**Owner:** Codex + Claude split.
- **Claude:** Stripe webhook handlers, access-token issuance + verification, magic-link generation, DB schema for access grants
- **Codex:** Stripe Connect onboarding UI, pricing-page builder, checkout-redirect, thank-you page, magic-link login UI

**Dependencies:** Phase C (distribution profile abstraction must exist; paid_product profile uses Stripe).

**Estimated weeks:** 6 (weeks 6-12 of meta-timeline).

---

## File structure

```
packages/synthesis/src/distribution/stripe/         ← Claude
  connect-onboarding.ts                             ← creates Connect account link
  webhook-handler.ts                                ← processes payment events
  access-token.ts                                   ← JWT issuance + verification
  magic-link.ts                                     ← issue + consume

apps/web/src/app/api/stripe/
  connect-onboard/route.ts                          ← Claude — POST: returns Stripe onboarding URL
  webhook/route.ts                                  ← Claude — POST: stripe webhook entry
  magic-link/[token]/route.ts                       ← Claude — GET: verify + set cookie

apps/web/src/app/(billing)/                         ← Codex
  pricing/[hubId]/page.tsx                          ← public-facing pricing page
  checkout/[hubId]/page.tsx                         ← Stripe Checkout redirect
  thank-you/page.tsx                                ← post-purchase
  login/page.tsx                                    ← magic-link request

apps/web/src/components/billing/                    ← Codex
  StripeConnectButton.tsx
  PricingCardEditor.tsx                             ← creator dashboard component for editing price
  CheckoutRedirect.tsx
  ThankYouCelebrate.tsx                             ← confetti + magic-link sent message

packages/db/src/schema/
  billing.ts                                        ← Claude — stripe_account, access_grant tables
packages/db/drizzle/
  0020_phase_e_billing.sql                          ← Claude
```

---

## Tasks

### E.1 — DB schema (Claude)

```ts
export const stripeAccount = pgTable('stripe_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  stripeAccountId: varchar('stripe_account_id', { length: 64 }).notNull().unique(),
  status: varchar('status', { length: 16 }).notNull(),  // pending | active | restricted
  payoutsEnabled: boolean('payouts_enabled').default(false),
  chargesEnabled: boolean('charges_enabled').default(false),
});

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

### E.2 — Stripe Connect onboarding (Claude + Codex)

**Claude:** API route `POST /api/stripe/connect-onboard` — creates Stripe Account Link, returns hosted onboarding URL.
**Codex:** `StripeConnectButton.tsx` — calls API, redirects to Stripe-hosted form, handles return URL (success/refresh).

### E.3 — Pricing page builder (Codex)

`PricingCardEditor.tsx` lets creator set: price (one-time vs subscription), trial period, refund policy text, custom thank-you message. Persists to `distribution_profile.config.pricing`.

### E.4 — Checkout redirect (Codex)

When buyer hits `pricing/[hubId]/page.tsx` and clicks "Buy," redirect to Stripe-hosted Checkout (using creator's Connect account + our `application_fee_amount`). Pass success/cancel URLs back to our domain.

### E.5 — Stripe webhook handler (Claude)

`POST /api/stripe/webhook` — verifies Stripe signature, processes events:
- `checkout.session.completed` → create `access_grant`, send magic-link email to buyer
- `account.updated` → update `stripe_account.status` (Connect KYC progress)
- `charge.refunded` → revoke access_grant
- `customer.subscription.deleted` (subscriptions) → revoke

Idempotency: keys based on event ID; insert-or-skip pattern.

### E.6 — Magic-link issuance + verification (Claude)

`packages/synthesis/src/distribution/stripe/magic-link.ts`:
- `issue(buyerEmail, hubId)` — creates short-lived (24h) signed JWT, sends via email
- `verify(token)` — checks signature + expiry + creates session JWT cookie

Email delivery via existing transactional email provider (Resend / Postmark / etc. — pick whichever Codex's existing app already uses, otherwise Resend default).

### E.7 — Magic-link login UI (Codex)

`/login` page: email input + "Send me the link" button. On submit, posts to `/api/stripe/magic-link/issue`. Shows confirmation. When user clicks link in email, lands on `/api/stripe/magic-link/[token]` which sets cookie + redirects to hub.

### E.8 — Application fee (platform cut)

In Stripe Checkout creation, set `application_fee_amount` based on creator tier:
- Starter: 10% of charge
- Pro: 5% of charge
- Custom: negotiated

Tier persists on `user`. Stripe handles the rest — fee lands in our connected platform account.

### E.9 — Refund flow (Claude)

Stripe webhook `charge.refunded` revokes access_grant. Email buyer "Your access has been revoked." If creator initiates refund from their own Stripe dashboard, our system reacts via webhook.

### E.10 — Subscription support (optional v1)

If price is recurring, treat differently: access_grant persists as long as subscription is active. `customer.subscription.deleted` revokes. `customer.subscription.updated` (e.g., upgrade) syncs.

### E.11 — Testing

Stripe test mode end-to-end:
- Create test creator, run Connect onboarding
- Set price ($19 one-time)
- Buy with test card 4242
- Verify access_grant created + magic-link delivered
- Verify deep page accessible with cookie
- Verify refund revokes access

### E.12 — PR + ops docs

PR title: "Phase E: Stripe Connect billing (paid_product distribution profile)"

Operations doc: how to apply for Stripe Connect platform account (1-3 week KYC), required env vars (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_CONNECT_CLIENT_ID), webhook endpoint URL setup.

---

## Success criteria

- [ ] Test creator completes Stripe Connect onboarding
- [ ] Buyer completes purchase in Stripe test mode
- [ ] Magic-link delivered + access_grant created
- [ ] Cookie-based access works on deep hub pages
- [ ] Refund webhook revokes access correctly
- [ ] Application fee deducts correctly (test mode shows expected amounts)

## Risk callouts

- **Stripe Connect KYC delay** — 1-3 weeks for our platform account. Apply early. Mitigation: Phase E development uses Stripe Connect test account; production switchover is a config flip.
- **Webhook idempotency bugs** — duplicate access grants if webhook handler isn't idempotent. Mitigation: insert-with-`ON CONFLICT (stripe_charge_id) DO NOTHING`.
- **Magic-link email deliverability** — Gmail's spam filter can flag transactional from new domains. Mitigation: SPF/DKIM/DMARC setup early, use established provider.
- **Subscription state sync** — Stripe is source of truth, but our DB caches. Drift causes incorrect access. Mitigation: nightly reconciliation job + admin tools for force-sync.

## Out of scope

- Tax handling (Stripe Tax integration deferred to v2)
- Multi-currency (USD-only v1)
- Coupons / promo codes (v2)
- Per-page micro-purchases (whole-hub purchases v1)
