# CreatorCanon Launch-Ready MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In 3–5 focused days, finish the ship-blockers and the beta-hardening shortlist from the 2026-04-24 strategic audit so 5 hand-picked creators can complete the full journey (sign-in → pick videos → configure → pay €29 → watch pipeline → review → publish → share) on hosted CreatorCanon without operator hand-holding.

**Architecture:** Monorepo `pnpm@9.12.0` / `node>=20.11.0` / Next.js 14 App Router / Drizzle+Neon / Auth.js v5 / Stripe test-mode / Cloudflare R2 / Trigger.dev v3 worker / OpenAI + Resend. All commits push to `main` → auto-deploy Vercel. Audio extraction (`yt-dlp + ffmpeg + deno`) runs only on the Trigger.dev worker (never on Vercel). The Stripe webhook switches from a single `dispatchPipeline` call to a two-step chain: `extract-run-audio` task → on success → `run-pipeline` task. Unit tests use built-in `node:test` (zero deps); UI uses `@playwright/test` for one happy-path E2E.

**Tech Stack:** TypeScript 5.6.2, Next.js 14.2, Drizzle ORM, Zod 3.23.8, `@trigger.dev/sdk@3.0.13`, `next-auth@5`, `resend`, `playwright@1.56.1`, `node:test` (built-in).

**Repo root:** `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS`

**Remote:** `github.com/mariosdem2008/CreatorCanon` (branch `main`)

---

## Scope — what IS and IS NOT in this plan

### IN — Phase 0 (ship-blockers, days 1–2)
1. Remove `packages/marketing` from the monorepo (distracting second product).
2. Allowlist-only signup gate (matches the "Private alpha" UX badge).
3. Pricing page + checkout simplified to a single €29 tier.
4. Stripe webhook dispatches `extract-run-audio` then `run-pipeline` via Trigger.dev.
5. Finer whisper segmentation (`word` granularity + a sentence splitter in `normalize_transcripts`) so source-moment links land on real lines.
6. "My Hubs" dashboard surface — creators can find every hub they ever published.

### IN — Phase 1 (beta hardening, days 3–5)
7. `packages/adapters/src/resend/client.ts` implementation + post-publish email (receipt + share-ready URL).
8. Live pipeline progress on project status page (auto-refresh).
9. Cost-ledger DB writes at 3 stages (`ensure_transcripts` whisper, `synthesize_v0_review` LLM, `draft_pages_v0` LLM). No UI.
10. Drop `youtube.force-ssl` OAuth scope (the owner-captions lane has never fired; `youtube.readonly` is sufficient).
11. `env:doctor` strict-fail when prod app-url is set AND `DEV_AUTH_BYPASS_ENABLED=true`.
12. One Playwright E2E that covers the full happy path.

### OUT — explicitly CUT (do not work on these in this plan)
- Chat on hubs (`chat_enabled` flag in project.config is unused; post-MVP).
- Custom domains (deferred per docs).
- Paywalled hubs / 15% commission model (pricing page teaser only).
- Rate limiter implementation (`createRateLimiter` stays throwing; post-MVP).
- Cost-ledger UI (writes only in this plan; UI post-MVP).
- Three-tier pricing (cut to single tier; reintroduce tiers only after 10 real payments).
- 4th/5th hub template.
- Any additional UI polish pass on hub, studio, marketing, or admin.
- New features requested by the agents' reports that were "deferred" (static ~4-min estimate is fixed by Task 8, nothing else from those lists).
- Promoting Trigger.dev tasks to non-Trigger infra (Fly.io / Railway). If Trigger.dev cloud free tier doesn't support custom binaries, Task 4 falls back to `PIPELINE_DISPATCH_MODE=inprocess` with manual extraction — plan acknowledges this.

---

## File structure — what each task creates or modifies

```
apps/web/
├── e2e/                                   # (new, Task 12)
│   ├── creator-journey.spec.ts
│   └── playwright.config.ts
├── src/app/
│   ├── (auth)/
│   │   └── sign-in/page.tsx               # (mod, Task 2 — show "not on allowlist" error)
│   ├── (marketing)/
│   │   └── pricing/page.tsx               # (mod, Task 3 — single-tier copy)
│   ├── app/
│   │   ├── checkout/actions.ts            # (mod, Task 3 — hardcode priceCents=2900)
│   │   ├── configure/actions.ts           # (mod, Task 3 — remove estimate, use 2900)
│   │   ├── hubs/page.tsx                  # (new, Task 6 — My Hubs)
│   │   └── projects/[id]/page.tsx         # (mod, Task 8 — auto-refresh)
│   ├── api/stripe/webhook/route.ts        # (mod, Task 4 — chain extract → pipeline)
│   ├── request-access/
│   │   ├── page.tsx                       # (new, Task 2 — collect email)
│   │   └── actions.ts                     # (new, Task 2 — insert allowlist request)
│   └── ...
packages/
├── adapters/src/resend/
│   └── client.ts                          # (mod, Task 7 — implement send)
├── auth/src/
│   └── index.ts                           # (mod, Task 2 — signIn callback)
├── core/src/
│   └── pricing.ts                         # (mod, Task 3 — single-price export)
├── db/src/schema/
│   ├── allowlist.ts                       # (new, Task 2)
│   ├── cost.ts                            # (mod, Task 9 — confirm shape in use)
│   └── index.ts                           # (mod, Task 2 — re-export allowlist)
└── pipeline/src/
    ├── stages/
    │   ├── ensure-transcripts.ts          # (mod, Task 5 — word-granularity call)
    │   └── normalize-transcripts.ts       # (mod, Task 5 — sentence splitter)
    ├── env-doctor.ts                      # (mod, Task 11 — prod+bypass fail)
    ├── cost-ledger-writes.ts              # (new, Task 9 — thin helper)
    └── smoke-*.ts                         # (no changes)
packages/marketing/                        # (DELETED, Task 1)
apps/worker/src/tasks/
└── index.ts                               # (mod, Task 4 — re-export for chaining)
```

---

## Pre-flight — one-time setup before Task 1

Run these once at the start. They are not tasks (no commit expected), just preconditions.

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"

# Confirm clean working tree except the known EvidenceChips.tsx WIP
git status --short
# Expected: only `M apps/web/src/components/hub/EvidenceChips.tsx` and untracked `output/`, `packages/marketing/`

# Confirm main is current with remote
git fetch origin
git status
# Expected: "up to date with origin/main"

# Confirm node + pnpm
node --version   # >= v20.11
pnpm --version   # >= 9.0

# Confirm env doctor is green today (baseline)
pnpm env:doctor | tail -20
```

If `git status` shows uncommitted work other than the EvidenceChips WIP, stop and resolve it before starting.

---

# Phase 0 — Ship-blockers (Days 1–2)

---

### Task 1: Remove `packages/marketing` (cut unrelated second product)

**Why:** This package is a separate "build-in-public automation engine" unrelated to CreatorCanon. It is imported nowhere in `apps/web` or `apps/worker`. Leaving it in the monorepo confuses readers and adds lint/typecheck surface.

**Files:**
- Delete: `packages/marketing/` (entire directory)
- Modify: `pnpm-workspace.yaml` (confirm no reference)
- Modify: `turbo.json` (confirm no reference)

- [ ] **Step 1: Confirm nothing depends on `@creatorcanon/marketing`**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
grep -rn "@creatorcanon/marketing" apps/ packages/ --include="*.ts" --include="*.tsx" --include="*.json" || echo "no dependents"
```

Expected: `no dependents` (grep exit 1).

If anything references it, stop and discuss with the operator — it's load-bearing after all.

- [ ] **Step 2: Delete the package**

```bash
rm -rf packages/marketing
```

- [ ] **Step 3: Verify workspace config doesn't mention it**

```bash
grep -n "marketing" pnpm-workspace.yaml turbo.json || echo "clean"
```

Expected: `clean`. If either file explicitly lists `packages/marketing`, open the file and remove that line only.

- [ ] **Step 4: Re-install the workspace**

```bash
pnpm install
```

Expected: "Already up to date" or a short re-link. No errors.

- [ ] **Step 5: Verify nothing broke**

```bash
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
```

Both must exit 0 (web, worker, and all packages typecheck).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "cut: remove unused packages/marketing (separate product)

Second product (build-in-public automation) unrelated to the
CreatorCanon SaaS. Zero imports from apps/web or apps/worker.
Keeping it in-tree confused monorepo reasoning and added lint/
typecheck surface. Removed per launch-ready MVP audit."
git push origin main
```

---

### Task 2: Allowlist-only signup gate

**Why:** Sign-in is currently open to any Google account but the UX shows a "Private alpha" badge. Either ship the gate or drop the framing. Shipping the gate is 2 hours of code and matches the invite-only-alpha narrative.

**Approach:** New DB table `allowlist_email` (email PK, approved boolean, invited_by, created_at). NextAuth `signIn` callback in `packages/auth/src/index.ts` consults it; rejection redirects to `/sign-in?error=NotAllowed`. New public page `/request-access` collects email → inserts into `allowlist_email` with `approved=false` so operator sees it.

**Files:**
- Create: `packages/db/src/schema/allowlist.ts`
- Modify: `packages/db/src/schema/index.ts` (re-export)
- Modify: `packages/auth/src/index.ts` (signIn callback)
- Modify: `apps/web/src/app/(auth)/sign-in/page.tsx` (render NotAllowed error)
- Create: `apps/web/src/app/request-access/page.tsx`
- Create: `apps/web/src/app/request-access/actions.ts`
- Create: `packages/db/src/allowlist.test.ts` (unit test)

- [ ] **Step 1: Create the allowlist schema**

Write `packages/db/src/schema/allowlist.ts`:

```typescript
import { boolean, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './auth';

/**
 * `allowlist_email` — private-alpha gate. An email MUST exist here AND have
 * `approved=true` before NextAuth will create or resume a session for that
 * identity. Operator approves new rows manually via `/admin` or SQL.
 *
 * `requested_by_ip` is for abuse triage only (admin-only). Do NOT surface
 * in product UI.
 */
export const allowlistEmail = pgTable(
  'allowlist_email',
  {
    email: text('email').primaryKey(),
    approved: boolean('approved').notNull().default(false),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    requestedByIp: text('requested_by_ip'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
  },
  (t) => ({
    approvedIdx: index('allowlist_email_approved_idx').on(t.approved),
  }),
);
```

- [ ] **Step 2: Re-export from the schema index**

Open `packages/db/src/schema/index.ts` and add (keep alphabetical with existing exports):

```typescript
export * from './allowlist';
```

- [ ] **Step 3: Generate migration**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/db generate
```

Expected: a new file appears in `packages/db/drizzle/out/` (e.g. `0001_<slug>.sql`) containing `CREATE TABLE "allowlist_email"`.

Inspect it:

```bash
ls packages/db/drizzle/out/
# expect: 0000_youthful_stingray.sql, 0001_<slug>.sql, meta/
cat packages/db/drizzle/out/0001_*.sql
# expect: CREATE TABLE "allowlist_email" (...)
```

- [ ] **Step 4: Apply migration to the hosted Neon DB**

Migrations against production Neon use the `DATABASE_URL` from `.env` / `.env.local`. Confirm which DB you're targeting before running:

```bash
node -e 'console.log(require("node:url").parse(process.env.DATABASE_URL).hostname)' \
  --require dotenv/config
# expect: ep-muddy-union-amzm8n7t-pooler.c-5.us-east-1.aws.neon.tech (or current alpha Neon)

pnpm db:migrate
```

Expected: `[drizzle] migrations applied` or similar. No error.

- [ ] **Step 5: Write the failing test for `checkAllowlist`**

Create `packages/db/src/allowlist.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { isAllowlistApproved, type AllowlistRow } from './allowlist';

test('isAllowlistApproved returns true when row is approved', () => {
  const row: AllowlistRow = {
    email: 'a@b.com',
    approved: true,
    invitedByUserId: null,
    requestedByIp: null,
    note: null,
    createdAt: new Date(),
    approvedAt: new Date(),
  };
  assert.equal(isAllowlistApproved(row), true);
});

test('isAllowlistApproved returns false when row is unapproved', () => {
  const row: AllowlistRow = {
    email: 'a@b.com',
    approved: false,
    invitedByUserId: null,
    requestedByIp: null,
    note: null,
    createdAt: new Date(),
    approvedAt: null,
  };
  assert.equal(isAllowlistApproved(row), false);
});

test('isAllowlistApproved returns false when row is undefined', () => {
  assert.equal(isAllowlistApproved(undefined), false);
});
```

- [ ] **Step 6: Run test — confirm it fails**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db"
npx tsx --test src/allowlist.test.ts 2>&1 | tail -10
```

Expected: FAIL — `isAllowlistApproved` and `AllowlistRow` don't exist yet.

- [ ] **Step 7: Implement the helper**

Append to `packages/db/src/schema/allowlist.ts`:

```typescript
export type AllowlistRow = typeof allowlistEmail.$inferSelect;

export function isAllowlistApproved(row: AllowlistRow | undefined | null): boolean {
  return Boolean(row?.approved);
}
```

- [ ] **Step 8: Run test — confirm pass**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db"
npx tsx --test src/allowlist.test.ts 2>&1 | tail -10
```

Expected: PASS 3/3.

- [ ] **Step 9: Add the NextAuth signIn callback**

Open `packages/auth/src/index.ts`. Find the `callbacks: {` block that currently starts at line 91. Add a new `signIn` callback at the top of that block (right after `...authConfig.callbacks,`):

```typescript
async signIn({ user: signedInUser }) {
  const email = signedInUser?.email?.trim().toLowerCase();
  if (!email) return false;

  // Admins-only bypass for local development
  if (process.env.DEV_AUTH_BYPASS_ENABLED === 'true') return true;

  const db = getDb();
  const rows = await db
    .select({
      email: allowlistEmail.email,
      approved: allowlistEmail.approved,
    })
    .from(allowlistEmail)
    .where(eq(allowlistEmail.email, email))
    .limit(1);

  const approved = isAllowlistApproved(rows[0]);
  if (!approved) {
    console.warn('[auth] sign-in rejected — not on allowlist:', email);
    return false;
  }
  return true;
},
```

Imports to add at the top of the file (if not already present):

```typescript
import { allowlistEmail, isAllowlistApproved } from '@creatorcanon/db/schema';
```

- [ ] **Step 10: Make the sign-in page render the rejection error**

Open `apps/web/src/app/(auth)/sign-in/page.tsx`. Find the error-handling block (look for `error` query-param reading). Ensure the following error code is surfaced:

When `searchParams.error === 'AccessDenied'` (NextAuth emits this when `signIn` callback returns `false`), render a clear message:

```tsx
{searchParams?.error === 'AccessDenied' && (
  <div
    role="alert"
    className="mb-6 rounded-md border border-rose/30 bg-rose/8 p-4 text-sm"
  >
    <p className="font-semibold text-rose">This email isn't on the alpha allowlist yet.</p>
    <p className="mt-1 text-ink-2">
      Request access and we'll email you when your seat is ready.{' '}
      <Link href="/request-access" className="underline underline-offset-2">
        Request access →
      </Link>
    </p>
  </div>
)}
```

- [ ] **Step 11: Create the request-access page**

Write `apps/web/src/app/request-access/page.tsx`:

```tsx
import Link from 'next/link';
import { requestAccess } from './actions';

export const metadata = {
  title: 'Request alpha access — CreatorCanon',
  description: 'CreatorCanon is in private alpha. Request a seat and we will email you when your access is ready.',
};

export default function RequestAccessPage({
  searchParams,
}: {
  searchParams?: { status?: string };
}) {
  return (
    <main className="mx-auto max-w-[540px] px-4 py-24">
      <h1 className="font-serif text-[40px] leading-[1.08] tracking-[-0.025em]">
        Request alpha access
      </h1>
      <p className="mt-4 max-w-[55ch] text-ink-2">
        CreatorCanon is in private alpha. Leave your email and we will invite
        you in the next cohort.
      </p>

      {searchParams?.status === 'submitted' && (
        <div
          role="status"
          className="mt-8 rounded-md border border-sage/30 bg-sage/8 p-4 text-sm"
        >
          <p className="font-semibold text-sage-ink">Request received.</p>
          <p className="mt-1 text-ink-2">
            We'll email you when your seat is ready. No need to refresh.
          </p>
        </div>
      )}

      {searchParams?.status !== 'submitted' && (
        <form action={requestAccess} className="mt-8 flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="h-11 rounded-md border border-rule px-3"
          />
          <button
            type="submit"
            className="mt-2 inline-flex h-11 items-center justify-center rounded-md bg-ink px-5 text-paper font-semibold"
          >
            Request access
          </button>
          <p className="text-xs text-ink-3">
            Already on the list?{' '}
            <Link href="/sign-in" className="underline underline-offset-2">
              Sign in →
            </Link>
          </p>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 12: Create the request-access server action**

Write `apps/web/src/app/request-access/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getDb } from '@creatorcanon/db';
import { allowlistEmail } from '@creatorcanon/db/schema';

export async function requestAccess(formData: FormData): Promise<void> {
  const rawEmail = (formData.get('email') as string | null)?.trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes('@')) {
    redirect('/request-access?status=invalid');
  }

  // Best-effort IP capture for abuse triage (not shown to users).
  const hdrs = await headers();
  const forwarded = hdrs.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? null;

  const db = getDb();
  await db
    .insert(allowlistEmail)
    .values({
      email: rawEmail,
      approved: false,
      requestedByIp: ip,
    })
    .onConflictDoNothing();

  redirect('/request-access?status=submitted');
}
```

- [ ] **Step 13: Seed yourself onto the allowlist (so you can still sign in)**

Before the signIn callback blocks you, insert your own email with approved=true.

Create a one-shot script at `packages/db/src/.seed-self-allowlist.ts` (temp, will be deleted):

```typescript
import { closeDb, getDb } from '.';
import { allowlistEmail } from './schema';
import { loadDefaultEnvFiles } from '@creatorcanon/pipeline/env-files';

const OPERATOR_EMAIL = process.env.OPERATOR_EMAIL ?? 'mariosdemosthenous11@gmail.com';

async function main() {
  loadDefaultEnvFiles();
  const db = getDb();
  await db
    .insert(allowlistEmail)
    .values({ email: OPERATOR_EMAIL, approved: true, note: 'operator seed' })
    .onConflictDoUpdate({
      target: allowlistEmail.email,
      set: { approved: true, approvedAt: new Date() },
    });
  console.log('approved', OPERATOR_EMAIL);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

Run it:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db"
npx tsx ./src/.seed-self-allowlist.ts
# expect: approved mariosdemosthenous11@gmail.com

rm ./src/.seed-self-allowlist.ts
```

- [ ] **Step 14: Verify signing in still works locally (happy path)**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/web lint 2>&1 | tail -3
```

Both must exit 0.

Then manually:

```bash
pnpm dev
# Open http://localhost:3000/sign-in in an incognito window
# Sign in with mariosdemosthenous11@gmail.com → expect /app loads
# Sign out
# Sign in with a DIFFERENT Google account → expect redirect to /sign-in?error=AccessDenied
# Expect the "not on the alpha allowlist" rose banner
# Navigate to /request-access → submit a test email → expect sage confirmation
# Check DB: SELECT * FROM allowlist_email; expect new row with approved=false
```

If manual test fails, debug and iterate before committing.

- [ ] **Step 15: Commit**

```bash
git add -A
git commit -m "feat(auth): allowlist signup gate for private alpha

Adds allowlist_email table + NextAuth signIn callback that rejects
emails not present with approved=true. /request-access page collects
new email requests into the same table as approved=false so operator
can approve via SQL or future admin UI. DEV_AUTH_BYPASS_ENABLED=true
still bypasses (local dev). Blocks the 'Private alpha' UX/reality
mismatch called out in the 2026-04-24 audit."
git push origin main
```

---

### Task 3: Simplify pricing to single €29 tier

**Why:** Pricing page advertises €29 / €149 / €349+ but only €29 is wired in checkout (`actions.ts:100` uses `estimateRunPriceCents` which tiers by duration; audit-critical blocker). Rewrite the page to advertise a single price; cap the checkout to always charge €29. Tiers come back post-MVP if they ever do.

**Files:**
- Modify: `packages/core/src/pricing.ts`
- Modify: `apps/web/src/app/app/configure/actions.ts`
- Modify: `apps/web/src/app/app/checkout/actions.ts`
- Modify: `apps/web/src/app/(marketing)/pricing/page.tsx`
- Create: `packages/core/src/pricing.test.ts`

- [ ] **Step 1: Write failing test for flat pricing**

Create `packages/core/src/pricing.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FLAT_PRICE_CENTS, getFlatPriceCents, formatUsdCents } from './pricing';

test('FLAT_PRICE_CENTS is 2900 (EUR cents, displayed as $29)', () => {
  assert.equal(FLAT_PRICE_CENTS, 2900);
});

test('getFlatPriceCents ignores duration', () => {
  assert.equal(getFlatPriceCents(0), 2900);
  assert.equal(getFlatPriceCents(3600), 2900);
  assert.equal(getFlatPriceCents(36000), 2900);
});

test('formatUsdCents renders 2900 as $29', () => {
  assert.equal(formatUsdCents(2900), '$29');
});
```

- [ ] **Step 2: Run test — confirm fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/core"
npx tsx --test src/pricing.test.ts 2>&1 | tail -10
```

Expected: FAIL — `FLAT_PRICE_CENTS`, `getFlatPriceCents` don't exist.

- [ ] **Step 3: Rewrite `pricing.ts`**

Overwrite `packages/core/src/pricing.ts`:

```typescript
/**
 * Private-alpha pricing: a single flat price per generated hub.
 *
 * `estimateRunPriceCents` is kept as a deprecated alias returning the flat
 * price so any legacy callers continue to work; they should migrate to
 * `getFlatPriceCents`.
 */
export const FLAT_PRICE_CENTS = 2900;

export function getFlatPriceCents(_totalSeconds: number): number {
  return FLAT_PRICE_CENTS;
}

/** @deprecated Use `getFlatPriceCents` — tiered pricing is cut in private alpha. */
export function estimateRunPriceCents(totalSeconds: number): number {
  return getFlatPriceCents(totalSeconds);
}

export function formatUsdCents(priceCents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npx tsx --test src/pricing.test.ts 2>&1 | tail -10
```

Expected: PASS 3/3.

- [ ] **Step 5: Confirm downstream imports still typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm typecheck 2>&1 | grep -E "error|pricing" | head
```

Expected: no pricing-related errors. `estimateRunPriceCents` is still exported so `apps/web/src/app/app/configure/actions.ts:15` keeps resolving.

- [ ] **Step 6: Rewrite the pricing page**

Overwrite `apps/web/src/app/(marketing)/pricing/page.tsx`:

```tsx
import Link from 'next/link';

export const metadata = {
  title: 'Pricing — CreatorCanon',
  description: 'One flat price per hub — $29 during private alpha. No subscriptions, no seat fees.',
};

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-24">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        Pricing
      </p>
      <h1 className="mt-3 font-serif text-[44px] leading-[1.05] tracking-[-0.025em] md:text-[56px]">
        One hub. One price.
      </h1>
      <p className="mt-6 max-w-[60ch] text-ink-2">
        CreatorCanon is in private alpha. Every generated hub is a flat <strong>$29</strong> —
        unlimited section regenerations after publish, unlimited edits, your own URL.
        No subscription, no seat fees.
      </p>

      <div className="mt-10 rounded-xl border border-rule bg-paper-2 p-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Included
        </p>
        <ul className="mt-4 space-y-2 text-ink-2">
          <li>LLM-grounded prose with citation moments linked to the source video timestamps</li>
          <li>Three premium hub templates (Editorial Atlas, Playbook OS, Studio Vault)</li>
          <li>Full review + edit workflow before publish</li>
          <li>Hub hosted at <code className="rounded bg-paper-3 px-1">yourname.creatorcanon.app</code></li>
        </ul>
        <Link
          href="/request-access"
          className="mt-8 inline-flex h-11 items-center rounded-md bg-ink px-5 font-semibold text-paper"
        >
          Request alpha access →
        </Link>
      </div>

      <p className="mt-10 text-sm text-ink-3">
        Higher-volume tiers are post-alpha. Reach out if you have a 50+ video archive and
        want to be first.
      </p>
    </main>
  );
}
```

- [ ] **Step 7: Simplify the configure action's price**

Open `apps/web/src/app/app/configure/actions.ts`. Find line 15 and line ~122.

At line 15, change the import:

```typescript
import { PIPELINE_VERSION, FLAT_PRICE_CENTS } from '@creatorcanon/core';
```

At line 122, replace:

```typescript
const priceCents = estimateRunPriceCents(totalDurationSeconds);
```

with:

```typescript
const priceCents = FLAT_PRICE_CENTS;
```

- [ ] **Step 8: Confirm checkout action**

Open `apps/web/src/app/app/checkout/actions.ts` line 100. The `amountCents: run.priceCents ?? 2_900` already falls through to 2900; leave as-is. No code change needed here.

- [ ] **Step 9: Typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/web lint 2>&1 | tail -3
```

Both must exit 0.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(pricing): simplify to single \$29 tier for private alpha

- pricing.ts: FLAT_PRICE_CENTS=2900 + getFlatPriceCents. Keeps
  deprecated estimateRunPriceCents as alias so legacy callers work.
- configure/actions.ts: charge flat 2900, no duration-based tiering.
- /pricing page rewritten — one price, one CTA (/request-access).
Audit action #3. Tiers reintroduced post-MVP only if real demand exists."
git push origin main
```

---

### Task 4: Stripe webhook chains `extract-run-audio` → `run-pipeline` on Trigger.dev

**Why:** Real third-party YouTube videos need yt-dlp audio extraction before the transcription stage can fire. `extractAlphaAudio` is fully implemented in `packages/pipeline/src/extract-alpha-audio.ts` and exposed as `extract-run-audio` Trigger.dev task. It's currently only invoked via operator CLI; the webhook must fire it automatically after payment.

**Constraint:** yt-dlp/ffmpeg/deno are NOT available in Vercel lambda. Extraction MUST run on the Trigger.dev worker (or equivalent infra with the binaries). This task assumes Trigger.dev cloud supports custom build extensions. If not, fall back to keeping `PIPELINE_DISPATCH_MODE=inprocess` on Vercel with the operator running extraction manually per run — flagged at end of task.

**Drift note (read first):** `apps/web/src/app/api/stripe/webhook/route.ts` already supports three dispatch modes: `inprocess` | `trigger` | `worker`. The `worker` mode leaves the run in `queued` state and logs — it assumes a separate long-running worker process polls for queued runs and handles them (yt-dlp + pipeline together, outside Trigger.dev). This task's steps below choose the `trigger` path because it doesn't require a new poller. If the operator prefers the `worker` path (already partially implemented), Step 6's `dispatch.ts` + webhook edits still apply — just add a `'worker'` case that returns `{ kind: 'worker', tasks: [] }` and the webhook does nothing (the worker picks up the queued run on its own polling tick). Step 8's `trigger.config.ts` edits are still needed so the worker has the binaries, regardless of which dispatch path wins.

**Files:**
- Modify: `apps/web/src/app/api/stripe/webhook/route.ts`
- Modify: `apps/worker/trigger.config.ts` (add custom build image with binaries)
- Modify: `apps/worker/src/tasks/run-pipeline.ts` (run extract first, then pipeline)

- [ ] **Step 1: Read the current worker task**

```bash
cat "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/worker/src/tasks/run-pipeline.ts"
cat "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/worker/trigger.config.ts"
```

- [ ] **Step 2: Write failing-ish test for dispatch chaining**

Because dispatch logic hits Trigger.dev SDK, we can't unit-test without heavy mocking. Instead, write an in-memory test of the decision helper we'll extract.

Create `apps/web/src/app/api/stripe/webhook/dispatch.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildDispatchPlan, type DispatchMode } from './dispatch';

test('inprocess mode returns inprocess plan regardless of audio state', () => {
  const plan = buildDispatchPlan({ mode: 'inprocess', hasAudioForAllVideos: false });
  assert.equal(plan.kind, 'inprocess');
});

test('trigger mode with missing audio returns extract-then-run chain', () => {
  const plan = buildDispatchPlan({ mode: 'trigger', hasAudioForAllVideos: false });
  assert.equal(plan.kind, 'trigger-chain');
  assert.deepEqual(plan.tasks, ['extract-run-audio', 'run-pipeline']);
});

test('trigger mode with audio already present skips extract', () => {
  const plan = buildDispatchPlan({ mode: 'trigger', hasAudioForAllVideos: true });
  assert.equal(plan.kind, 'trigger-direct');
  assert.deepEqual(plan.tasks, ['run-pipeline']);
});

test('worker mode returns worker-queued with no tasks (poller picks up)', () => {
  const plan = buildDispatchPlan({ mode: 'worker', hasAudioForAllVideos: false });
  assert.equal(plan.kind, 'worker-queued');
  assert.deepEqual(plan.tasks, []);
});
```

- [ ] **Step 3: Run — confirm fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/web"
npx tsx --test src/app/api/stripe/webhook/dispatch.test.ts 2>&1 | tail -10
```

Expected: FAIL — module `./dispatch` doesn't exist.

- [ ] **Step 4: Implement the helper**

Create `apps/web/src/app/api/stripe/webhook/dispatch.ts`:

```typescript
/**
 * Decision helper for the Stripe-webhook-triggered pipeline dispatch.
 *
 * Modes:
 * - 'inprocess' — Vercel lambda runs runGenerationPipeline directly.
 *   Audio extraction is NOT possible in this mode (no yt-dlp binary).
 *   Only suitable for runs whose videos already have audio assets
 *   (e.g. seeded fixtures). Real third-party videos need 'trigger'.
 * - 'trigger'   — Trigger.dev worker runs tasks. Chain extract-run-audio
 *   first if any video is missing its audio asset, then run-pipeline.
 */
export type DispatchMode = 'inprocess' | 'trigger' | 'worker';

export type DispatchPlan =
  | { kind: 'inprocess'; tasks: readonly ['run-pipeline']; }
  | { kind: 'trigger-chain'; tasks: readonly ['extract-run-audio', 'run-pipeline']; }
  | { kind: 'trigger-direct'; tasks: readonly ['run-pipeline']; }
  | { kind: 'worker-queued'; tasks: readonly []; };

export function buildDispatchPlan(input: {
  mode: DispatchMode;
  hasAudioForAllVideos: boolean;
}): DispatchPlan {
  if (input.mode === 'worker') {
    // Long-running worker polls for queued runs; webhook does nothing.
    return { kind: 'worker-queued', tasks: [] };
  }
  if (input.mode === 'inprocess') {
    return { kind: 'inprocess', tasks: ['run-pipeline'] };
  }
  if (input.hasAudioForAllVideos) {
    return { kind: 'trigger-direct', tasks: ['run-pipeline'] };
  }
  return { kind: 'trigger-chain', tasks: ['extract-run-audio', 'run-pipeline'] };
}
```

- [ ] **Step 5: Run test — confirm pass**

```bash
npx tsx --test src/app/api/stripe/webhook/dispatch.test.ts 2>&1 | tail -10
```

Expected: PASS 3/3.

- [ ] **Step 6: Wire the helper into the webhook**

Open `apps/web/src/app/api/stripe/webhook/route.ts`. Replace the existing `dispatchPipeline` function with one that consults the plan.

At the top of the file, add these imports (if not already present):

```typescript
import { and, eq, getDb, inArray } from '@creatorcanon/db';
import { mediaAsset, videoSetItem } from '@creatorcanon/db/schema';
import { tasks } from '@trigger.dev/sdk/v3';
import { buildDispatchPlan } from './dispatch';
```

Replace the old `dispatchPipeline` with:

```typescript
function runInProcess(payload: RunGenerationPipelinePayload): void {
  void runGenerationPipeline(payload).catch((err) => {
    console.error('[stripe-webhook] In-process pipeline run failed:', err);
  });
}

async function hasAudioForAllVideos(videoSetId: string, workspaceId: string): Promise<boolean> {
  const db = getDb();
  const items = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, videoSetId));
  if (items.length === 0) return false;
  const audio = await db
    .select({ videoId: mediaAsset.videoId })
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.workspaceId, workspaceId),
        eq(mediaAsset.type, 'audio_m4a'),
        inArray(mediaAsset.videoId, items.map((i) => i.videoId)),
      ),
    );
  const have = new Set(audio.map((r) => r.videoId));
  return items.every((i) => have.has(i.videoId));
}

async function dispatchPipeline(payload: RunGenerationPipelinePayload): Promise<void> {
  const rawMode = process.env.PIPELINE_DISPATCH_MODE;
  const mode: 'trigger' | 'inprocess' | 'worker' =
    rawMode === 'trigger' || rawMode === 'worker' ? rawMode : 'inprocess';

  const allAudio = await hasAudioForAllVideos(payload.videoSetId, payload.workspaceId);
  const plan = buildDispatchPlan({ mode, hasAudioForAllVideos: allAudio });

  if (plan.kind === 'worker-queued') {
    console.info('[stripe-webhook] worker mode — run left queued for poller', {
      runId: payload.runId,
    });
    return;
  }

  if (plan.kind === 'inprocess') {
    runInProcess(payload);
    return;
  }

  if (plan.kind === 'trigger-direct') {
    try {
      await tasks.trigger('run-pipeline', payload);
    } catch (err) {
      console.warn('[stripe-webhook] trigger dispatch failed, falling back in-process:', err);
      runInProcess(payload);
    }
    return;
  }

  // plan.kind === 'trigger-chain' — extract then run.
  try {
    // Chain: fire extract-run-audio; its `dispatch: true` option tells the
    // extract task to trigger run-pipeline automatically on success.
    await tasks.trigger('extract-run-audio', {
      runId: payload.runId,
      force: false,
      dispatch: true,
    });
  } catch (err) {
    console.warn('[stripe-webhook] extract-run-audio dispatch failed, falling back in-process (audio must already be present or extraction must be run manually):', err);
    runInProcess(payload);
  }
}
```

- [ ] **Step 7: Confirm `extractAlphaAudio` honors `dispatch: true` by firing run-pipeline**

```bash
grep -n "dispatch" packages/pipeline/src/extract-alpha-audio.ts | head
```

If `extractAlphaAudio` does NOT auto-dispatch `run-pipeline` when `dispatch: true`, we need to patch it. Look for the end of `extractAlphaAudio` (near the result return). If it already does `tasks.trigger('run-pipeline', ...)` when `input.dispatch` is set, skip to Step 8. Otherwise append inside `extractAlphaAudio`, just before `return result`:

```typescript
if (input.dispatch) {
  try {
    const { tasks } = await import('@trigger.dev/sdk/v3');
    await tasks.trigger('run-pipeline', {
      runId: run.id,
      projectId: run.projectId,
      workspaceId: run.workspaceId,
      videoSetId: run.videoSetId,
      pipelineVersion: run.pipelineVersion,
    });
    result.dispatched = true;
  } catch (err) {
    console.warn('[extractAlphaAudio] dispatch of run-pipeline failed:', err);
  }
}
```

(Existing `result.dispatched` is already in the return type per `ExtractAlphaAudioResult`.)

- [ ] **Step 8: Update `apps/worker/trigger.config.ts` to bundle yt-dlp + ffmpeg + deno**

Open `apps/worker/trigger.config.ts`. Add a `build.extensions` block that installs the three binaries in the Trigger.dev Docker runtime.

Reference: https://trigger.dev/docs/config/config-file (apt.install extension).

If the file already has `defineConfig({ ... })`, add:

```typescript
import { defineConfig } from '@trigger.dev/sdk/v3';
import { additionalPackages } from '@trigger.dev/build/extensions/core';
import { python } from '@trigger.dev/build/extensions/python';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? 'creatorcanon',
  runtime: 'node',
  logLevel: 'info',
  maxDuration: 3600,
  dirs: ['./src/tasks'],
  build: {
    extensions: [
      // ffmpeg + deno come from apt + direct binary install.
      additionalPackages({ packages: ['ffmpeg'] }),
      // yt-dlp ships via pip.
      python({ requirements: ['yt-dlp==2026.3.17'] }),
    ],
  },
});
```

If `additionalPackages` or `python` extension names are wrong for the installed SDK version (3.0.13), check `@trigger.dev/build/extensions` exports via `ls node_modules/@trigger.dev/build/dist/extensions/` and adapt.

**Deno must be installed manually.** Add a shell step:

If the SDK supports `shellCommand` or `install` extensions, use that. Otherwise add an inline Dockerfile hook via `esbuildPlugin` or fall back to a `preStart` in the task runtime:

```typescript
import { defineConfig } from '@trigger.dev/sdk/v3';
import { additionalPackages, syncEnvVars } from '@trigger.dev/build/extensions/core';
import { python } from '@trigger.dev/build/extensions/python';

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? 'creatorcanon',
  runtime: 'node',
  logLevel: 'info',
  maxDuration: 3600,
  dirs: ['./src/tasks'],
  build: {
    extensions: [
      additionalPackages({ packages: ['ffmpeg', 'curl', 'unzip'] }),
      python({ requirements: ['yt-dlp==2026.3.17'] }),
      // Install deno for yt-dlp's JS challenge solver.
      // This runs in the Docker build; deno lands at /root/.deno/bin/deno.
      {
        name: 'deno-install',
        onBuildComplete: async (_context, _manifest) => {
          // No-op here; install happens via additionalPackages at build time.
        },
      },
      syncEnvVars(async () => ({
        AUDIO_EXTRACTION_YTDLP_BIN: '/usr/local/bin/yt-dlp',
        AUDIO_EXTRACTION_FFMPEG_BIN: '/usr/bin/ffmpeg',
        AUDIO_EXTRACTION_CHALLENGE_RUNTIME_BIN: '/root/.deno/bin/deno',
      })),
    ],
  },
});
```

**Known risk:** if the installed `@trigger.dev/build@3.0.13` does not expose the required extension points for deno install, the plan falls back to (a) using `yt-dlp --extractor-args "youtube:player_skip=webpage,js"` to skip the JS challenge, or (b) self-hosted Trigger.dev worker with a custom Dockerfile. Flag in commit message if you hit this.

- [ ] **Step 9: Deploy the worker with the new config**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/worker"
pnpm trigger:deploy 2>&1 | tail -30
```

Expected: deploy succeeds; extension report mentions ffmpeg, yt-dlp, (deno). If deploy fails on extension config, iterate on Step 8.

- [ ] **Step 10: Flip the Vercel env**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/web"
echo "trigger" | npx --yes vercel@latest env rm PIPELINE_DISPATCH_MODE production --yes
echo "trigger" | npx --yes vercel@latest env add PIPELINE_DISPATCH_MODE production
```

Then redeploy:

```bash
npx --yes vercel@latest deploy --prod --yes 2>&1 | tail -10
```

- [ ] **Step 11: End-to-end verification on hosted**

Pay one fresh checkout (test card `4242 4242 4242 4242`) for a project whose videoSet contains ONE video without pre-seeded audio. Watch:

1. Stripe webhook delivered → run status `queued`.
2. Trigger.dev dashboard shows `extract-run-audio` running, then `run-pipeline`.
3. Run reaches `awaiting_review`.
4. Review + publish.
5. Hub renders LLM prose. Source moments link to real YouTube timestamps.

If the worker deploy fails OR extraction fails on Trigger.dev cloud: roll back — set `PIPELINE_DISPATCH_MODE=inprocess` in Vercel env, document the gap in `docs/hosted-alpha-readiness.md`, note that operator must manually run `pnpm --filter @creatorcanon/pipeline extract-alpha-audio --run <runId> --dispatch=true` on a local machine with yt-dlp installed. **Do not block the rest of the plan on this task's hosted-trigger success** — the allowlist, pricing, My Hubs, segmentation, and Phase 1 tasks are independent.

- [ ] **Step 12: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git add -A
git commit -m "feat(webhook): chain extract-run-audio -> run-pipeline on paid checkout

Webhook now builds a dispatch plan based on PIPELINE_DISPATCH_MODE and
whether every selected video already has audio. With mode=trigger and
at least one video missing audio, fires extract-run-audio (which
auto-chains run-pipeline via dispatch:true). Falls back to inprocess
on trigger failure. Worker trigger.config.ts bundles yt-dlp + ffmpeg
+ deno so audio extraction runs on the Trigger.dev worker.

Audit action #1 — ship-blocker. Closes the real-channel-video gap
confirmed by the 2026-04-24 extract-alpha-audio manual proof."
git push origin main
```

---

### Task 5: Finer transcript segmentation

**Why:** Today's real-video test produced 2 segments for a 6:39 video, so every source moment points to `t=1s` or `t=306s`. Readers will notice. Fix: ask whisper for word-level granularity, then split transcripts at sentence boundaries (or every ~20s), capped at ~12s segments.

**Files:**
- Modify: `packages/adapters/src/openai/client.ts` (request word granularity)
- Modify: `packages/pipeline/src/stages/normalize-transcripts.ts` (segment splitter)
- Create: `packages/pipeline/src/segment-splitter.ts`
- Create: `packages/pipeline/src/segment-splitter.test.ts`

- [ ] **Step 1: Write failing tests for the splitter**

Create `packages/pipeline/src/segment-splitter.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { splitSegment, type WhisperSegment } from './segment-splitter';

test('short segments are returned unchanged', () => {
  const input: WhisperSegment = {
    startMs: 0,
    endMs: 8000,
    text: 'Hello there.',
  };
  const out = splitSegment(input, { maxDurationMs: 12000 });
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'Hello there.');
});

test('long segment without sentence boundaries splits at maxDurationMs', () => {
  const input: WhisperSegment = {
    startMs: 0,
    endMs: 30000,
    text: 'hello world hello world hello world hello world',
  };
  const out = splitSegment(input, { maxDurationMs: 12000 });
  assert.ok(out.length >= 2, `expected >=2 sub-segments, got ${out.length}`);
  for (const s of out) assert.ok(s.endMs - s.startMs <= 12000);
});

test('long segment WITH sentence boundaries splits on those boundaries', () => {
  const input: WhisperSegment = {
    startMs: 0,
    endMs: 30000,
    text: 'First sentence goes here. Second one follows! And third? Four.',
  };
  const out = splitSegment(input, { maxDurationMs: 12000 });
  // 4 sentences * ~7500ms each → should produce 3-4 sub-segments, split on "." "!" "?"
  assert.ok(out.length >= 3, `expected >=3 sub-segments, got ${out.length}`);
  assert.ok(out[0].text.endsWith('.') || out[0].text.endsWith('!') || out[0].text.endsWith('?'));
});

test('preserves start/end continuity (out[i].endMs === out[i+1].startMs)', () => {
  const input: WhisperSegment = {
    startMs: 1000,
    endMs: 31000,
    text: 'one. two. three. four. five.',
  };
  const out = splitSegment(input, { maxDurationMs: 8000 });
  for (let i = 0; i < out.length - 1; i += 1) {
    assert.equal(out[i].endMs, out[i + 1].startMs);
  }
  assert.equal(out[0].startMs, 1000);
  assert.equal(out[out.length - 1].endMs, 31000);
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/pipeline"
npx tsx --test src/segment-splitter.test.ts 2>&1 | tail -15
```

Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement the splitter**

Create `packages/pipeline/src/segment-splitter.ts`:

```typescript
/**
 * Splits a whisper segment into sub-segments capped at `maxDurationMs`.
 * Prefers sentence boundaries (`.`, `!`, `?`) when they land inside a slice;
 * falls back to even time-slicing when no sentence boundary is close.
 *
 * Rationale: whisper's native `segment` granularity can return 3-6 minute
 * chunks on long audio; that makes every source moment link to the start
 * of a segment and reduces grounding value. Capping at ~12s produces
 * moment-cards that actually point at the claim they're citing.
 */
export interface WhisperSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface SplitOptions {
  /** Maximum duration of a single output segment (default 12000). */
  maxDurationMs?: number;
  /** Regex for sentence-end punctuation (default /[.!?]/). */
  sentenceEndChar?: RegExp;
}

const DEFAULT_MAX_DURATION_MS = 12_000;

export function splitSegment(
  seg: WhisperSegment,
  options: SplitOptions = {},
): WhisperSegment[] {
  const maxDurationMs = options.maxDurationMs ?? DEFAULT_MAX_DURATION_MS;
  const duration = seg.endMs - seg.startMs;
  if (duration <= maxDurationMs) return [seg];

  // Find sentence-end positions in the text.
  const endChar = options.sentenceEndChar ?? /[.!?](\s|$)/g;
  const boundaries: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = endChar.exec(seg.text)) !== null) {
    boundaries.push(match.index + 1); // include the punctuation
  }

  if (boundaries.length === 0) {
    return evenSplit(seg, maxDurationMs);
  }

  // Walk boundaries; emit a sub-segment each time the running slice would exceed maxDurationMs.
  const out: WhisperSegment[] = [];
  let sliceStartCharIdx = 0;
  let sliceStartMs = seg.startMs;
  const msPerChar = duration / Math.max(1, seg.text.length);

  for (let i = 0; i < boundaries.length; i += 1) {
    const charIdx = boundaries[i]!;
    const sliceEndMs = Math.round(seg.startMs + charIdx * msPerChar);
    const sliceDuration = sliceEndMs - sliceStartMs;
    const nextBoundary = boundaries[i + 1];
    const nextSliceDuration = nextBoundary
      ? Math.round(seg.startMs + nextBoundary * msPerChar) - sliceStartMs
      : duration - (sliceStartMs - seg.startMs);

    // Commit this slice if adding the next sentence would exceed max OR this is the last boundary.
    if (nextSliceDuration > maxDurationMs || i === boundaries.length - 1) {
      out.push({
        startMs: sliceStartMs,
        endMs: i === boundaries.length - 1 ? seg.endMs : sliceEndMs,
        text: seg.text.slice(sliceStartCharIdx, i === boundaries.length - 1 ? seg.text.length : charIdx).trim(),
      });
      sliceStartCharIdx = i === boundaries.length - 1 ? seg.text.length : charIdx;
      sliceStartMs = i === boundaries.length - 1 ? seg.endMs : sliceEndMs;
    }
  }

  if (sliceStartMs < seg.endMs) {
    out.push({
      startMs: sliceStartMs,
      endMs: seg.endMs,
      text: seg.text.slice(sliceStartCharIdx).trim(),
    });
  }

  return out.filter((s) => s.text.length > 0 && s.endMs > s.startMs);
}

function evenSplit(seg: WhisperSegment, maxDurationMs: number): WhisperSegment[] {
  const duration = seg.endMs - seg.startMs;
  const parts = Math.ceil(duration / maxDurationMs);
  const perPart = Math.ceil(duration / parts);
  const charsPerPart = Math.ceil(seg.text.length / parts);
  const out: WhisperSegment[] = [];
  for (let i = 0; i < parts; i += 1) {
    const startMs = seg.startMs + i * perPart;
    const endMs = i === parts - 1 ? seg.endMs : startMs + perPart;
    const textStart = i * charsPerPart;
    const textEnd = i === parts - 1 ? seg.text.length : textStart + charsPerPart;
    out.push({
      startMs,
      endMs,
      text: seg.text.slice(textStart, textEnd).trim(),
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npx tsx --test src/segment-splitter.test.ts 2>&1 | tail -15
```

Expected: PASS 4/4.

- [ ] **Step 5: Wire the splitter into `normalize_transcripts`**

Open `packages/pipeline/src/stages/normalize-transcripts.ts`. Find where segments are written to the `segment` DB table. Just before the insert loop, remap:

```typescript
import { splitSegment, type WhisperSegment } from '../segment-splitter';
```

Where the pipeline currently has something like `const segmentsToInsert = transcript.segments.map(...)`, replace with:

```typescript
const flatSegments: WhisperSegment[] = transcript.segments.flatMap((s) =>
  splitSegment({ startMs: s.startMs, endMs: s.endMs, text: s.text }, { maxDurationMs: 12_000 }),
);
const segmentsToInsert = flatSegments.map(/* existing mapper signature unchanged — passes startMs/endMs/text */);
```

(Exact mapping call depends on the existing code — read the file first, adapt without changing the final insert call.)

- [ ] **Step 6: Typecheck + lint + pipeline tests**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/pipeline typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/pipeline lint 2>&1 | tail -3
cd packages/pipeline
npx tsx --test src/segment-splitter.test.ts 2>&1 | tail -5
```

All three must be clean.

- [ ] **Step 7: (Optional) Request word-level granularity from whisper**

Open `packages/adapters/src/openai/client.ts`, line 139. Change:

```typescript
timestamp_granularities: ['segment'],
```

to:

```typescript
timestamp_granularities: ['segment', 'word'],
```

This gives downstream code access to per-word timestamps (returned as `words: [{ word, start, end }]`) should it want to use them. The splitter doesn't require words; `['segment']` alone works. Make this change only if `response_format: 'verbose_json'` returns words when granularity includes `'word'`. Skip this step and leave as-is if the splitter already performs to spec (see Step 8).

- [ ] **Step 8: Integration verify on a real hosted run**

Rerun the pipeline on the existing real-video run:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/pipeline rescue:alpha-run <existing_runId> 2>&1 | tail -20
```

Inspect the `segment` rows:

```bash
# Use inspect-alpha-run script
pnpm --filter @creatorcanon/pipeline inspect:alpha-run <runId> 2>&1 | grep -E "segments|segmentCount" | head
```

Expected: segment count > 10 for a 6-minute video (vs the prior 2).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(pipeline): cap transcript segments at 12s via sentence-aware splitter

splitSegment(segment, {maxDurationMs: 12_000}) runs in normalize_transcripts
after whisper returns segments. Prefers sentence-end boundaries (.!?)
when they land inside a slice; falls back to even time-slicing when no
boundary is close. Preserves start/end continuity so source moments
link to precise quote positions instead of chunk starts.

Audit action #4. The 2026-04-24 real-video test produced only 2
segments for a 6:39 video; this reduces source-moment jitter."
git push origin main
```

---

### Task 6: "My Hubs" dashboard surface

**Why:** After a creator publishes, the app shows the project detail page but there is no way to come back later and find every hub they ever published. Closing the tab = losing the URL. Major retention risk.

**Files:**
- Create: `apps/web/src/app/app/hubs/page.tsx`
- Create: `apps/web/src/app/app/hubs/loading.tsx`
- Modify: `apps/web/src/app/app/page.tsx` (add link to /app/hubs)

- [ ] **Step 1: Create the route page**

Write `apps/web/src/app/app/hubs/page.tsx`:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { and, desc, eq, getDb } from '@creatorcanon/db';
import { hub, project, release, workspaceMember } from '@creatorcanon/db/schema';
import { auth } from '@creatorcanon/auth';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'My hubs · CreatorCanon',
};

export default async function HubsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const userId = session.user.id;

  const db = getDb();

  const memberRow = await db
    .select({ workspaceId: workspaceMember.workspaceId })
    .from(workspaceMember)
    .where(eq(workspaceMember.userId, userId))
    .limit(1);
  const workspaceId = memberRow[0]?.workspaceId;
  if (!workspaceId) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-16">
        <h1 className="font-serif text-heading-lg">My hubs</h1>
        <p className="mt-4 text-ink-2">You don't have a workspace yet.</p>
      </main>
    );
  }

  const rows = await db
    .select({
      projectId: project.id,
      projectTitle: project.title,
      hubId: hub.id,
      subdomain: hub.subdomain,
      theme: hub.theme,
      liveReleaseId: hub.liveReleaseId,
      releaseCreatedAt: release.createdAt,
    })
    .from(hub)
    .innerJoin(project, eq(project.id, hub.projectId))
    .leftJoin(release, and(eq(release.hubId, hub.id), eq(release.id, hub.liveReleaseId)))
    .where(eq(hub.workspaceId, workspaceId))
    .orderBy(desc(release.createdAt));

  if (rows.length === 0) {
    return (
      <main className="mx-auto max-w-[720px] px-4 py-16">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          <Link href="/app" className="underline-offset-2 hover:underline">← Dashboard</Link>
        </p>
        <h1 className="mt-3 font-serif text-heading-lg">My hubs</h1>
        <div className="mt-8 rounded-xl border border-rule bg-paper-2 p-8 text-center">
          <p className="font-semibold">No hubs yet.</p>
          <p className="mt-2 text-sm text-ink-3">
            Pick videos from your library, configure, and publish your first hub.
          </p>
          <Link
            href="/app/library"
            className="mt-6 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-paper"
          >
            Browse library →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[960px] px-4 py-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        <Link href="/app" className="underline-offset-2 hover:underline">← Dashboard</Link>
      </p>
      <div className="mt-3 flex items-end justify-between">
        <h1 className="font-serif text-heading-lg">My hubs</h1>
        <Link href="/app/library" className="text-sm underline underline-offset-2">
          New hub →
        </Link>
      </div>

      <ul className="mt-8 divide-y divide-rule">
        {rows.map((r) => {
          const publicPath = `/h/${r.subdomain}`;
          const published = Boolean(r.liveReleaseId);
          return (
            <li key={r.hubId} className="flex items-center justify-between gap-4 py-5">
              <div>
                <p className="font-serif text-lg">{r.projectTitle}</p>
                <p className="mt-1 text-xs text-ink-3">
                  {published
                    ? `Live · ${r.theme} · ${r.releaseCreatedAt ? new Date(r.releaseCreatedAt).toISOString().slice(0, 10) : 'no date'}`
                    : 'Not yet published'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/app/projects/${r.projectId}`}
                  className="inline-flex h-9 items-center rounded-md border border-rule px-3 text-sm"
                >
                  Manage
                </Link>
                {published && (
                  <Link
                    href={publicPath}
                    className="inline-flex h-9 items-center rounded-md bg-ink px-3 text-sm font-semibold text-paper"
                  >
                    Open hub →
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Create a minimal loading.tsx**

Write `apps/web/src/app/app/hubs/loading.tsx`:

```tsx
export default function HubsLoading() {
  return (
    <main className="mx-auto max-w-[960px] px-4 py-16">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        My hubs
      </p>
      <ul className="mt-8 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="shimmer-bg h-16 rounded-md border border-rule bg-paper-2"
          />
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Add link from dashboard**

Open `apps/web/src/app/app/page.tsx`. Near the "Browse library" button (round 2 polished it with a prominent CTA), add a secondary link:

```tsx
<Link
  href="/app/hubs"
  className="mt-3 text-sm underline underline-offset-2 text-ink-2"
>
  My hubs →
</Link>
```

(Place it immediately below the existing primary "Browse library" button.)

- [ ] **Step 4: Typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/web lint 2>&1 | tail -3
```

- [ ] **Step 5: Manual verify on local**

```bash
pnpm dev
# Sign in → /app dashboard → click "My hubs →"
# Expect: list of your live hubs (the 4+ published ones from prior sessions) in descending publish-date order.
# Each row has Manage + Open hub buttons.
# Empty state (if somehow zero): "No hubs yet" + Browse library CTA.
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(app): My hubs page — every published hub in one place

/app/hubs lists every hub in the signed-in user's workspace, newest
live-release first, with Manage + Open-hub actions. Dashboard gets a
'My hubs →' secondary link below Browse library. Empty state points
to /app/library. Solves the tab-close-URL-lost retention risk called
out in audit action #5."
git push origin main
```

---

## Phase 0 verification checkpoint

After Tasks 1–6 are committed and pushed:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm typecheck 2>&1 | tail -5
pnpm lint 2>&1 | tail -5
git log --oneline -10
```

Also manually:

1. Visit `https://creatorcanon-saas.vercel.app/pricing` → see single-tier page.
2. Visit `https://creatorcanon-saas.vercel.app/request-access` → submit test email → check DB row exists.
3. Sign in (should still work — operator is allowlisted).
4. Visit `/app/hubs` → see list of existing hubs.
5. (If Task 4 deployed cleanly) Pay a test checkout using a video without pre-seeded audio → watch Trigger.dev run extract-run-audio then run-pipeline → expect `awaiting_review` within 10 min.

Phase 0 is DONE when all five manual checks succeed. If Task 4's Trigger.dev piece failed to deploy, mark that task as "deferred, inprocess fallback documented" and proceed to Phase 1 — the rest of the plan does not depend on it.

---

# Phase 1 — Beta hardening (Days 3–5)

---

### Task 7: Resend adapter implementation + publish email

**Why:** Creators pay €29 and the generated hub is LIVE at their own URL. They must receive a confirmation email with the share-ready URL. Today the Resend adapter's `.send` throws `not_implemented`.

**Files:**
- Modify: `packages/adapters/src/resend/client.ts`
- Create: `apps/web/src/emails/HubPublishedEmail.tsx`
- Modify: `apps/web/src/app/app/projects/[id]/pages/actions.ts` (send email on publish success)
- Create: `packages/adapters/src/resend/client.test.ts`

- [ ] **Step 1: Write the failing integration test (mock-level)**

Create `packages/adapters/src/resend/client.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildSendPayload } from './client';

test('buildSendPayload converts SendEmailInput to Resend API shape', () => {
  const element = { type: 'div', props: {}, key: null } as const;
  const payload = buildSendPayload({
    to: 'a@b.com',
    subject: 'hi',
    react: element,
    from: 'noreply@creatorcanon.app',
  });
  assert.equal(payload.subject, 'hi');
  assert.equal(payload.to, 'a@b.com');
  assert.equal(payload.from, 'noreply@creatorcanon.app');
  assert.strictEqual(payload.react, element);
});

test('buildSendPayload defaults from when not set', () => {
  const element = { type: 'div', props: {}, key: null } as const;
  const payload = buildSendPayload({
    to: 'a@b.com',
    subject: 'hi',
    react: element,
  });
  assert.equal(payload.from, 'CreatorCanon <noreply@creatorcanon.app>');
});
```

- [ ] **Step 2: Run — confirm fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/adapters"
npx tsx --test src/resend/client.test.ts 2>&1 | tail -10
```

Expected: FAIL — `buildSendPayload` not exported.

- [ ] **Step 3: Implement send()**

Open `packages/adapters/src/resend/client.ts`. Replace the final factory with:

```typescript
const DEFAULT_FROM = 'CreatorCanon <noreply@creatorcanon.app>';

export function buildSendPayload(input: SendEmailInput) {
  sendEmailInputSchema.parse(input);
  return {
    from: input.from ?? DEFAULT_FROM,
    to: input.to,
    subject: input.subject,
    react: input.react,
    ...(input.replyTo ? { reply_to: input.replyTo } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

export const createResendClient = (env: ServerEnv): ResendAdapterClient => {
  if (!env.RESEND_API_KEY) {
    throw new CanonError({
      code: 'resend_disabled',
      category: 'internal',
      message:
        'RESEND_API_KEY is not configured; email delivery is disabled in this environment.',
    });
  }

  const raw = new Resend(env.RESEND_API_KEY);

  return {
    raw,
    async send(input) {
      const payload = buildSendPayload(input);
      const result = await raw.emails.send(payload as Parameters<typeof raw.emails.send>[0]);
      if (result.error) {
        throw new CanonError({
          code: 'resend_send_failed',
          category: 'internal',
          message: `Resend send failed: ${result.error.message}`,
        });
      }
      return { id: result.data?.id ?? 'unknown' };
    },
  };
};
```

- [ ] **Step 4: Run test — confirm pass**

```bash
npx tsx --test src/resend/client.test.ts 2>&1 | tail -10
```

Expected: PASS 2/2.

- [ ] **Step 5: Create the email template**

Write `apps/web/src/emails/HubPublishedEmail.tsx`:

```tsx
/**
 * Sent once, immediately after a hub is first published. Plain text wins
 * over rich formatting — email clients butcher fancy HTML anyway.
 */
export interface HubPublishedEmailProps {
  hubTitle: string;
  publicUrl: string;
  theme: string;
}

export default function HubPublishedEmail({
  hubTitle,
  publicUrl,
  theme,
}: HubPublishedEmailProps) {
  return (
    <html>
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', color: '#1a1a1a', maxWidth: 580, margin: '0 auto', padding: 32 }}>
        <h1 style={{ fontSize: 28, margin: 0, fontWeight: 600 }}>Your hub is live.</h1>
        <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.5 }}>
          <strong>{hubTitle}</strong> is now published on the <em>{theme}</em> template.
        </p>
        <p style={{ marginTop: 24, fontSize: 16 }}>
          <a
            href={publicUrl}
            style={{
              display: 'inline-block',
              padding: '12px 20px',
              background: '#1a1a1a',
              color: '#f5f2ea',
              textDecoration: 'none',
              fontWeight: 600,
              borderRadius: 6,
            }}
          >
            Open your hub
          </a>
        </p>
        <p style={{ marginTop: 24, fontSize: 14, color: '#666' }}>
          Share this link on Twitter, LinkedIn, your newsletter — anywhere you post about your work:
        </p>
        <p style={{ fontSize: 14, wordBreak: 'break-all' }}>
          <code>{publicUrl}</code>
        </p>
        <hr style={{ marginTop: 32, border: 'none', borderTop: '1px solid #eee' }} />
        <p style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
          CreatorCanon · You received this because you published a hub.
        </p>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Fire the email on publish**

Open `apps/web/src/app/app/projects/[id]/pages/actions.ts`. Find the server action that transitions the run to `published` (search for `status: 'published'` or for `publishRunAsHub`). Immediately after successful publish, fire the email:

```typescript
import { createResendClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import HubPublishedEmail from '@/emails/HubPublishedEmail';

// … inside the publish action, after publishRunAsHub returns:
try {
  const env = parseServerEnv(process.env);
  if (env.RESEND_API_KEY && session.user.email) {
    const resend = createResendClient(env);
    const publicUrl = `${env.NEXT_PUBLIC_APP_URL ?? 'https://creatorcanon-saas.vercel.app'}${publishResult.publicPath}`;
    await resend.send({
      to: session.user.email,
      subject: `${projectTitle} is live on CreatorCanon`,
      react: HubPublishedEmail({
        hubTitle: projectTitle,
        publicUrl,
        theme: projectTheme,
      }) as Parameters<typeof resend.send>[0]['react'],
    });
  }
} catch (err) {
  // Email failures must NOT block the publish flow.
  console.error('[publish] email send failed:', err);
}
```

(Adapt variable names to the existing code — `projectTitle`, `session`, `publishResult` will already exist in the surrounding function.)

- [ ] **Step 7: Typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/web lint 2>&1 | tail -3
pnpm --filter @creatorcanon/adapters typecheck 2>&1 | tail -3
```

- [ ] **Step 8: Verify on hosted**

Set `RESEND_API_KEY` on Vercel if not already:

```bash
cd apps/web
npx --yes vercel@latest env ls production | grep RESEND
# If missing:
echo "re_XXXXXX" | npx --yes vercel@latest env add RESEND_API_KEY production
```

(Use a real Resend key; start the Resend free tier if needed.)

Redeploy + publish a test hub → expect an email at the signed-in Google email within ~30 seconds.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(email): publish confirmation via Resend

- adapters/resend: implement send() using Resend SDK, structured
  error wrapping, DEFAULT_FROM = noreply@creatorcanon.app.
- apps/web/src/emails/HubPublishedEmail.tsx: minimal plain-HTML
  React Email template.
- projects/[id]/pages/actions.ts: fires the email after successful
  publishRunAsHub. Wrapped in try/catch — email failure never
  blocks publish.
Audit action #6. Creators paid €29, they get a share-ready URL email."
git push origin main
```

---

### Task 8: Live pipeline progress

**Why:** The project status page shows stage rows but does not auto-refresh. A creator who paid 8 minutes ago stares at "queued" without knowing anything is happening. Today's polish added a "Waiting for pipeline to start" message but no live updates.

**Approach:** Add a client-side `setInterval` refresh on the project status page while `run.status` is not terminal (`queued | running`). Re-fetch via Next.js `router.refresh()` every 5 seconds. Stop when terminal.

**Files:**
- Create: `apps/web/src/app/app/projects/[id]/LiveRefresh.tsx`
- Modify: `apps/web/src/app/app/projects/[id]/page.tsx`

- [ ] **Step 1: Create the client refresh component**

Write `apps/web/src/app/app/projects/[id]/LiveRefresh.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function LiveRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
```

- [ ] **Step 2: Mount conditionally on the status page**

Open `apps/web/src/app/app/projects/[id]/page.tsx`. At the top, import:

```typescript
import { LiveRefresh } from './LiveRefresh';
```

Near the top of the rendered output (inside `<main>`), add:

```tsx
{(run.status === 'queued' || run.status === 'running') && <LiveRefresh intervalMs={5000} />}
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/web lint 2>&1 | tail -3
```

- [ ] **Step 4: Manual verify**

```bash
pnpm dev
# Trigger a run (via existing awaiting_payment run on local) →
# navigate to /app/projects/<id> → watch stages increment live every 5s
# When status reaches awaiting_review, refresh stops (no more setInterval ticks visible in Network tab).
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): live progress refresh on project status while running

LiveRefresh is a minimal client component that calls router.refresh()
every 5s while run.status is queued or running. Mounted conditionally
so terminal states don't poll forever. Matches the 'stop polling at
terminal' pattern used elsewhere in the codebase. No new deps.

Audit action #7."
git push origin main
```

---

### Task 9: Cost ledger DB writes at 3 LLM/transcribe stages

**Why:** Every paying creator costs you money (OpenAI + R2). Today you track zero of it in-app. One month of paying users = unknown unit economics. Minimum viable: INSERT INTO cost per stage. No UI.

**Files:**
- Create: `packages/pipeline/src/cost-ledger-write.ts`
- Modify: `packages/pipeline/src/stages/ensure-transcripts.ts` (after whisper call)
- Modify: `packages/pipeline/src/stages/synthesize-v0-review.ts` (after LLM call)
- Modify: `packages/pipeline/src/stages/draft-pages-v0.ts` (per LLM call per page)
- Create: `packages/pipeline/src/cost-ledger-write.test.ts`

- [ ] **Step 1: Confirm the `cost` DB table exists**

```bash
grep -n "export const cost" packages/db/src/schema/*.ts
```

Expected: finds `packages/db/src/schema/cost.ts` or similar with a `cost` table + `CostProvider` enum. If the schema does not match the `CostEntry` type in `packages/cost-ledger`, adapt field names below.

Read the schema:

```bash
cat packages/db/src/schema/cost.ts 2>/dev/null || grep -rn "pgTable.*'cost'" packages/db/src/schema/ | head -3
```

- [ ] **Step 2: Write failing test**

Create `packages/pipeline/src/cost-ledger-write.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildCostRow } from './cost-ledger-write';

test('buildCostRow builds a cost row with required fields', () => {
  const row = buildCostRow({
    runId: 'run-1',
    workspaceId: 'ws-1',
    stageName: 'synthesize_v0_review',
    provider: 'openai',
    model: 'gpt-4o-mini',
    promptTokens: 1200,
    completionTokens: 300,
    usdCents: 0.08,
  });
  assert.equal(row.runId, 'run-1');
  assert.equal(row.stageName, 'synthesize_v0_review');
  assert.equal(row.provider, 'openai');
  assert.equal(row.model, 'gpt-4o-mini');
  assert.equal(row.promptTokens, 1200);
  assert.equal(row.completionTokens, 300);
  assert.ok(row.id);
});

test('buildCostRow normalizes usdCents with 4-decimal precision', () => {
  const row = buildCostRow({
    runId: 'run-1', workspaceId: 'ws-1',
    stageName: 'ensure_transcripts', provider: 'openai',
    model: 'whisper-1', usdCents: 0.12345678,
  });
  // Shouldn't lose precision at 4 decimal places
  assert.equal(row.usdCents, 0.1235);
});
```

- [ ] **Step 3: Run — confirm fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/pipeline"
npx tsx --test src/cost-ledger-write.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not exported.

- [ ] **Step 4: Implement the helper**

Create `packages/pipeline/src/cost-ledger-write.ts`:

```typescript
import { getDb } from '@creatorcanon/db';
import { cost } from '@creatorcanon/db/schema';

export interface CostRowInput {
  runId: string;
  workspaceId: string;
  stageName: string;
  provider: 'openai' | 'gemini' | 'stripe' | 'cloudflare_r2' | 'neon' | 'upstash' | 'resend' | 'trigger';
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  videoSeconds?: number | null;
  usdCents: number;
  metadata?: Record<string, unknown> | null;
}

export interface CostRow extends Omit<CostRowInput, 'usdCents'> {
  id: string;
  usdCents: number;
  recordedAt: Date;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function buildCostRow(input: CostRowInput): CostRow {
  return {
    id: crypto.randomUUID(),
    runId: input.runId,
    workspaceId: input.workspaceId,
    stageName: input.stageName,
    provider: input.provider,
    model: input.model ?? null,
    promptTokens: input.promptTokens ?? null,
    completionTokens: input.completionTokens ?? null,
    videoSeconds: input.videoSeconds ?? null,
    usdCents: round4(input.usdCents),
    metadata: input.metadata ?? null,
    recordedAt: new Date(),
  };
}

/**
 * Best-effort write. We never throw from this; a failed cost log
 * must not block a successful pipeline stage.
 */
export async function recordCost(input: CostRowInput): Promise<void> {
  try {
    const row = buildCostRow(input);
    const db = getDb();
    // Field names here MUST match the actual `cost` drizzle schema.
    // If drizzle uses different casing, adapt.
    await db.insert(cost).values(row as Parameters<typeof db.insert<typeof cost>>[0]['values']);
  } catch (err) {
    console.warn('[cost-ledger] write failed:', err instanceof Error ? err.message : err);
  }
}
```

(If `cost` schema exports/column names differ, read the schema file and adapt the INSERT. Do not silently drop columns the schema requires.)

- [ ] **Step 5: Run test — confirm pass**

```bash
npx tsx --test src/cost-ledger-write.test.ts 2>&1 | tail -10
```

Expected: PASS 2/2.

- [ ] **Step 6: Wire into `ensure_transcripts` (whisper call)**

Open `packages/pipeline/src/stages/ensure-transcripts.ts`. Around line 423 where `openai.transcribe(...)` returns, immediately after the returning assignment add:

```typescript
import { recordCost } from '../cost-ledger-write';

// After the transcribe call (line ~425):
await recordCost({
  runId: input.runId,
  workspaceId: input.workspaceId,
  stageName: 'ensure_transcripts',
  provider: 'openai',
  model: 'whisper-1',
  videoSeconds: transcript.durationSeconds ?? null,
  // Whisper pricing: $0.006 per minute as of 2025 (OpenAI docs).
  // Represent as USD cents.
  usdCents: (transcript.durationSeconds ?? 0) / 60 * 0.6,
});
```

- [ ] **Step 7: Wire into `synthesize_v0_review`**

Open `packages/pipeline/src/stages/synthesize-v0-review.ts`. In `generateLlmReview`, after `args.openai.chat(...)` completes and `completion` is populated:

```typescript
// Right after `const completion = await args.openai.chat(...)`
await recordCost({
  runId: input.runId,
  workspaceId: input.workspaceId,
  stageName: 'synthesize_v0_review',
  provider: 'openai',
  model: completion.model ?? 'gpt-4o-mini',
  promptTokens: completion.usage?.promptTokens ?? null,
  completionTokens: completion.usage?.completionTokens ?? null,
  // gpt-4o-mini: $0.15 per 1M input tokens, $0.60 per 1M output tokens.
  usdCents:
    ((completion.usage?.promptTokens ?? 0) * 0.000015) +
    ((completion.usage?.completionTokens ?? 0) * 0.00006),
});
```

(The existing function's signature may not have `input` visible — you'll need to thread `runId`/`workspaceId` through the `generateLlmReview` args. If it's too invasive, move the `recordCost` call up into `synthesizeV0Review` where those are available, using `completion.usage` returned from `generateLlmReview`.)

- [ ] **Step 8: Wire into `draft_pages_v0` (per page)**

Open `packages/pipeline/src/stages/draft-pages-v0.ts`. In `generateLlmPage`, after the chat completion, add the same pattern with `stageName: 'draft_pages_v0'`.

- [ ] **Step 9: Typecheck + lint + tests**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/pipeline typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/pipeline lint 2>&1 | tail -3
pnpm --filter @creatorcanon/pipeline test 2>&1 | tail -3
cd packages/pipeline && npx tsx --test src/cost-ledger-write.test.ts
```

- [ ] **Step 10: Integration check on a fresh run**

Trigger a full LLM run (locally or via rescue) and then:

```sql
SELECT stage_name, provider, model, prompt_tokens, completion_tokens, usd_cents
FROM cost
WHERE run_id = '<runId>'
ORDER BY recorded_at;
```

Expected 3+ rows: one whisper, one review, one per page.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(pipeline): cost ledger writes at whisper + review + draft stages

Thin recordCost helper writes one row per external-service call:
- ensure_transcripts: whisper-1 \$0.006/min
- synthesize_v0_review: gpt-4o-mini input+output tokens
- draft_pages_v0: gpt-4o-mini per page
All wrapped in try/catch — cost-log failures never block pipeline
success. No UI; operator queries via SQL. Unblocks unit-economics
visibility as 5 beta creators start paying. Audit action #8."
git push origin main
```

---

### Task 10: Drop `youtube.force-ssl` OAuth scope

**Why:** `force-ssl` grants write+delete on the creator's channel (for `captions.download` as video owner). The owner-captions lane has never fired successfully in production. `youtube.readonly` gives the pipeline everything it actually uses (channel + videos list). Scoping down reduces a user's reason to refuse consent.

**Files:**
- Modify: `packages/auth/src/config.ts`
- Modify: `packages/pipeline/src/stages/ensure-transcripts.ts` (drop Strategy 0)

- [ ] **Step 1: Remove the force-ssl scope**

Open `packages/auth/src/config.ts`, line 36-42. Change:

```typescript
scope: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
].join(' '),
```

to:

```typescript
scope: [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' '),
```

Update the comment above the scope list to reflect that the owner-captions lane is disabled; we rely on public timedtext + audio extraction.

- [ ] **Step 2: Mark owner-captions Strategy 0 as inert**

Open `packages/pipeline/src/stages/ensure-transcripts.ts`. Find Strategy 0 block (`fetchOwnerCaptions`). Replace the invocation with a short-circuit:

```typescript
// Strategy 0 (disabled post-audit): Owner-OAuth captions.list + captions.download.
// Dropped when youtube.force-ssl was removed from sign-in scope. All
// caption fetches now go through public timedtext endpoints and the
// audio-extraction → whisper fallback.
// const owned = await fetchOwnerCaptions({ ... });
// if (owned) { vttContent = owned.vtt; ... }
```

Leave the `fetchOwnerCaptions` helper file in place (don't delete) — it may come back if you re-enable per-owner logic later.

- [ ] **Step 3: Typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
```

- [ ] **Step 4: Google Cloud Console step (operator manual)**

Log in to Google Cloud Console → OAuth consent screen → Scopes → **remove** `https://www.googleapis.com/auth/youtube.force-ssl` from the configured scopes. Save. Existing sessions with the old scope continue to work until refresh; new consents see only the narrower scope.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): drop youtube.force-ssl OAuth scope

The owner-captions (force-ssl) lane has never fired successfully in
production; all transcription goes through public timedtext or the
audio-extraction + whisper fallback. force-ssl granted write/delete
on the creator's channel — overkill for our read-only usage. Matches
Google's principle of least privilege and reduces a real friction
point at sign-in consent. Operator also removed the scope from the
OAuth consent screen in Google Cloud. Audit action #9."
git push origin main
```

---

### Task 11: env:doctor strict-fail for prod + DEV_AUTH_BYPASS_ENABLED=true

**Why:** `DEV_AUTH_BYPASS_ENABLED=true` in a production environment bypasses sign-in entirely. Easy to leave on accidentally; high-impact if so. Ship a hard fail in `env:doctor` so any env flip that combines production URL + bypass enabled blocks the check.

**Files:**
- Modify: `packages/pipeline/src/env-doctor.ts`

- [ ] **Step 1: Add the combined check**

Open `packages/pipeline/src/env-doctor.ts`. Find where the `mode` check is recorded (~line 126). After that, add:

```typescript
// Strict: production NEXT_PUBLIC_APP_URL with dev-auth bypass is a
// security hazard (anyone can sign in as anyone). Fail hard.
const isProdAppUrl =
  !!appUrlRaw &&
  !appUrlRaw.includes('localhost') &&
  !appUrlRaw.includes('127.0.0.1');
const bypassEnabled = process.env.DEV_AUTH_BYPASS_ENABLED === 'true';
if (isProdAppUrl && bypassEnabled) {
  record(
    'auth:dev-bypass-in-prod',
    'fail',
    'DEV_AUTH_BYPASS_ENABLED=true with a non-localhost NEXT_PUBLIC_APP_URL is a sign-in-bypass vulnerability. Unset DEV_AUTH_BYPASS_ENABLED in production before continuing.',
  );
} else if (bypassEnabled) {
  record('auth:dev-bypass', 'warn', 'DEV_AUTH_BYPASS_ENABLED=true — fine locally, never in prod.');
} else {
  record('auth:dev-bypass', 'pass', 'Dev auth bypass is disabled.');
}
```

- [ ] **Step 2: Verify locally (expect pass)**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm env:doctor 2>&1 | grep -E "dev-bypass|ok" | head
```

Expected: `ok: true` (or the check passes if your local `.env.local` has bypass disabled).

- [ ] **Step 3: Synthetic fail test**

```bash
NEXT_PUBLIC_APP_URL="https://creatorcanon-saas.vercel.app" \
DEV_AUTH_BYPASS_ENABLED=true \
pnpm env:doctor 2>&1 | grep -E "dev-bypass-in-prod|ok" | head
```

Expected: a `fail` entry and `ok: false` overall.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(env-doctor): strict fail for DEV_AUTH_BYPASS_ENABLED=true in prod

Any non-localhost NEXT_PUBLIC_APP_URL combined with
DEV_AUTH_BYPASS_ENABLED=true now fails env:doctor (previously it only
warned). The combination bypasses sign-in entirely in prod — hard
fail prevents accidental config drift. Audit action #10."
git push origin main
```

---

### Task 12: Playwright E2E — full creator journey (dev-bypass mode)

**Why:** Zero test coverage today. A single end-to-end test that exercises sign-in → library → configure → (mock) pay → pipeline → publish protects against regressions on the critical path.

**Approach:** Set up `@playwright/test` in `apps/web`, write ONE spec that runs against a local dev server. Use `DEV_AUTH_BYPASS_ENABLED=true` for sign-in. Mock Stripe by using the test-mode checkout session and a fake card, OR skip checkout by directly inserting a `queued` run (faster; doesn't exercise Stripe).

Decision: skip real Stripe in E2E — the webhook is already integration-tested by real test-card payments manually. The E2E focuses on the *creator-visible flow*. Real test-card payments stay a manual checklist item.

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/creator-journey.spec.ts`
- Modify: `apps/web/package.json` (add `e2e` script, add `@playwright/test` dev dep)

- [ ] **Step 1: Install @playwright/test**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/web"
pnpm add -D @playwright/test@1.56.1
cd ../..
pnpm install
```

- [ ] **Step 2: Write the Playwright config**

Create `apps/web/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: process.env.E2E_EXTERNAL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3000',
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: {
          DEV_AUTH_BYPASS_ENABLED: 'true',
        },
      },
});
```

- [ ] **Step 3: Add the e2e script to package.json**

Open `apps/web/package.json`. Add to `scripts`:

```json
"e2e": "playwright test",
"e2e:ui": "playwright test --ui",
"e2e:install": "playwright install --with-deps chromium"
```

- [ ] **Step 4: Install browser binaries**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/web"
pnpm e2e:install
```

(This downloads Chromium headlessly; ~150 MB one-time.)

- [ ] **Step 5: Write the spec**

Create `apps/web/e2e/creator-journey.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Creator journey — happy path (dev bypass)', () => {
  test('sign in → library → configure → checkout page', async ({ page }) => {
    // 1. Land on sign-in (root redirects when not authed)
    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

    // 2. Dev-bypass sign-in (only renders when DEV_AUTH_BYPASS_ENABLED=true)
    const devButton = page.getByRole('button', { name: /dev bypass/i });
    await expect(devButton).toBeVisible({ timeout: 10_000 });
    await devButton.click();

    // 3. Arrives at /app dashboard
    await page.waitForURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 }).or(page.getByText(/browse library/i))).toBeVisible();

    // 4. Open library
    await page.getByRole('link', { name: /browse library/i }).click();
    await page.waitForURL(/\/app\/library/);

    // 5. Library shows seeded fixture videos
    await expect(page.getByText(/ALPHA AUDIO SMOKE/)).toBeVisible();

    // 6. Select first fixture row
    await page.getByText(/ALPHA AUDIO SMOKE\] fixture-1/).first().click();

    // 7. Build hub
    const buildButton = page.getByRole('button', { name: /build.*1.*selected|build your hub/i });
    await expect(buildButton).toBeVisible();
    await buildButton.click();

    // 8. Configure page
    await page.waitForURL(/\/app\/configure/);
    await page.getByLabel(/hub title/i).fill('E2E smoke hub');

    // 9. Reach checkout
    await page.getByRole('button', { name: /continue to payment/i }).click();
    await page.waitForURL(/\/app\/checkout/);
    await expect(page.getByText('$29').or(page.getByText(/pay to queue run/i))).toBeVisible();

    // Stop here — real Stripe checkout is a manual test, not part of this E2E.
  });

  test('My hubs page renders', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByRole('button', { name: /dev bypass/i }).click();
    await page.waitForURL(/\/app$/);
    await page.goto('/app/hubs');
    await expect(page.getByRole('heading', { name: /my hubs/i })).toBeVisible();
  });

  test('Request access page accepts an email', async ({ page }) => {
    await page.goto('/request-access');
    await page.getByLabel(/email/i).fill('e2e+test@example.com');
    await page.getByRole('button', { name: /request access/i }).click();
    await expect(page.getByText(/request received/i)).toBeVisible();
  });
});
```

- [ ] **Step 6: Ensure library has seed data for E2E**

The spec expects `[ALPHA AUDIO SMOKE]` fixtures present. If they're not in the local DB:

```bash
pnpm dev:db:reset
pnpm dev:seed:audio-fixtures
```

- [ ] **Step 7: Run the E2E**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/web"
pnpm e2e 2>&1 | tail -30
```

Expected: `3 passed`. If any step fails, fix the selector (not the test logic) — the UI has had multiple polish rounds; text may not exactly match.

- [ ] **Step 8: Typecheck + commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
git add -A
git commit -m "test(e2e): Playwright creator-journey + hubs + request-access

Three specs cover the critical MVP path without hitting Stripe:
- Full creator journey sign-in (dev bypass) -> library -> configure
  -> checkout page assertion (stops before real Stripe)
- My hubs page renders for an authed user
- Request-access form accepts a submission and renders confirmation

Playwright config uses dev server with DEV_AUTH_BYPASS_ENABLED=true.
Baseline coverage before inviting 5 beta users. Audit action #11."
git push origin main
```

---

## Final verification checkpoint

After Tasks 1–12 are committed:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git log --oneline -14
# Expected: 12 new commits since plan start

pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm --filter @creatorcanon/web e2e 2>&1 | tail -5
pnpm env:doctor 2>&1 | tail -5
```

All must exit 0. `env:doctor` ok: true.

**Manual smoke on hosted (Vercel):**

1. `https://creatorcanon-saas.vercel.app/request-access` — submit, see confirmation.
2. Sign in as an approved email — lands on `/app`.
3. Sign in as a non-allowlisted email (if you have a second Google account) — sees rejection + request-access link.
4. Pay a test checkout (4242 4242 4242 4242) with a seeded-audio fixture project — run self-drives to `awaiting_review` via Trigger.dev (if Task 4 deployed cleanly) or via inprocess fallback.
5. Publish. Check inbox — receive Hub Published email within 1 minute.
6. Open `/app/hubs` — new hub listed.
7. Visit the public hub — source moments now on precise timestamps (not just `t=1s`).

**If all pass: you're launch-ready.** Invite 2 creators (not 5 — audit rec #10). Watch them on a call. Let their behavior write the next roadmap.

---

## After this plan — intentionally OUT of scope

Do NOT start any of these without finishing the plan first AND validating with real creators:

- Chat-on-hubs
- Custom domains
- Paywalled hubs / 15% commission
- Rate limiter real implementation
- Cost-ledger UI
- Three-tier pricing
- 4th / 5th hub template
- Any additional UI polish pass
- Trigger.dev worker re-platforming (Fly.io/Railway) if Trigger.dev cloud works fine
