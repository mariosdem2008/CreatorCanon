# Launch-Readiness Closing Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the gaps from the 2026-04-24 post-execution audit so 2 hand-picked beta creators can complete a real paid journey end-to-end on hosted prod, including validated trigger-dispatch chain, email delivery, CI gates, and fixed zombie packages.

**Architecture:** Verify-then-harden, not build-new. First task is a live paid-checkout validation of the Vercel webhook → Trigger.dev v4 worker → extract-run-audio → run-pipeline → awaiting_review → publish → email chain. Every downstream task assumes that validation passes; a failure forces a focused debug cycle on the Trigger.dev v4 task API. After validation, apply five targeted hardening changes (stalled-run detector, operator-notification email, CI gate expansion, migration committal, zombie package resolution, one new Playwright spec), then invite 2 creators on a Zoom call.

**Tech Stack:** TypeScript 5.6.2, Next.js 14.2, Drizzle ORM, Auth.js v5, Resend, Stripe test-mode, Trigger.dev SDK 4.4.4, Playwright 1.56.1, `node:test` (built-in), GitHub Actions.

**Repo root:** `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS`

**Remote:** `github.com/mariosdem2008/CreatorCanon` (branch `main`; all commits auto-deploy Vercel prod)

---

## Scope statement

### IN — what this plan ships
1. **Phase 0 (< 1 hour):** One validation paid checkout that proves the full trigger chain.
2. **Phase 1 — resolve on-validation-failure:** If and only if Phase 0's pipeline fails, diagnose Trigger.dev v4 task-API breakage. (Task 2 is conditional.)
3. **Phase 2 (2 days):** six hardening changes so a real creator can ship without hand-holding.
4. **Phase 3 (same day):** seed 2 real beta emails + invite.

### OUT — cut list (do NOT include)
- Rate limiter implementation (`createRateLimiter` stays throwing; post-MVP)
- Toast/notification system
- Cost ledger UI for admin (writes exist; UI is post-MVP)
- PII transcript scrubber
- Custom domains
- Chat-on-hubs
- Paywalled hubs / 15% commission
- YouTube channel incremental sync
- `sync-channel` Trigger.dev task wiring (registered but never dispatched — leave it)
- Any UI polish beyond what the stalled-run banner requires

---

## File structure

```
apps/web/
├── e2e/
│   ├── creator-journey.spec.ts       (existing; untouched)
│   └── edit-then-publish.spec.ts     (NEW — Task 9)
└── src/
    └── app/
        ├── app/
        │   └── projects/
        │       └── [id]/
        │           ├── page.tsx      (modify — Task 4 mount StalledRunBanner)
        │           └── StalledRunBanner.tsx  (NEW — Task 4)
        └── request-access/
            └── actions.ts            (modify — Task 5 fire operator email)

packages/
├── cost-ledger/
│   └── src/
│       └── index.ts                  (modify — Task 8 absorb writer)
└── pipeline/
    └── src/
        ├── cost-ledger-write.ts      (DELETE — Task 8 moved into @creatorcanon/cost-ledger)
        ├── cost-ledger-write.test.ts (DELETE — Task 8 moved)
        └── stages/
            ├── ensure-transcripts.ts      (modify — Task 8 new import)
            ├── synthesize-v0-review.ts    (modify — Task 8 new import)
            └── draft-pages-v0.ts          (modify — Task 8 new import)

.github/workflows/
├── ci.yml                             (modify — Task 6 add explicit node:test runs + e2e job)

.gitignore                             (modify — Task 7 remove `drizzle/out/`)
packages/db/drizzle/out/               (git add -f in Task 7 — 2 SQL files + meta)

docs/
└── operator-allowlist-cohort-1.sql    (existing; update with real emails in Task 3)
```

---

## Pre-flight — run before Task 1

Verify the tree, the deploy, and the dispatch plumbing state you're inheriting.

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"

git status --short
# Expected: only the known EvidenceChips.tsx WIP (or nothing).

git log --oneline -5
# Expected: 7675f60 most recent (docs: remove operator-oauth-scope-down.md).

pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
# Both must exit 0.

npx --yes vercel@latest env pull apps/web/.env.prod.tmp --environment=production --yes > /dev/null 2>&1 \
  && grep -E "^(PIPELINE_DISPATCH_MODE|TRIGGER_PROJECT_ID|RESEND_API_KEY|DEV_AUTH_BYPASS_ENABLED)=" apps/web/.env.prod.tmp | sed 's/=.*/=<redacted>/' \
  && rm -f apps/web/.env.prod.tmp
# Expected:
# PIPELINE_DISPATCH_MODE=<redacted>   # value "trigger"
# TRIGGER_PROJECT_ID=<redacted>       # value proj_yzrjadqegzegmkeernox
# RESEND_API_KEY=<redacted>
# (DEV_AUTH_BYPASS_ENABLED absent in prod)
```

If any of those fail, stop and resolve before starting Task 1.

---

# Phase 0 — Validation paid checkout (blocks everything)

---

### Task 1: Validate the full hosted chain on an audio-seeded fixture

**Purpose:** Prove that a real Stripe test-card payment triggers the Vercel webhook, which triggers the Trigger.dev v4 `extract-run-audio` task, which chains to `run-pipeline`, which completes all 6 pipeline stages and lands the run at `awaiting_review`. This has never been tested end-to-end on hosted.

**Files:** (none modified in this task — it's a verification run + a watch script to help the operator)
- Create: `packages/pipeline/src/.watch-project-run.ts` (scratch, deleted in Task 1 Step 9)

- [ ] **Step 1: Ensure the two audio-fixture videos are seeded**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/pipeline exec tsx ./src/seed-alpha-audio-videos.ts 2>&1 | tail -10
```

Expected: the two `[ALPHA AUDIO SMOKE]` videos exist in the hosted library. If the script reports "already seeded", that's fine.

- [ ] **Step 2: Open the hosted app in a browser**

Open `https://creatorcanon-saas.vercel.app/sign-in` in incognito, sign in as the operator (email must be `approved=true` in `allowlist_email`; if not, run the SQL from `docs/operator-allowlist-cohort-1.sql` with the operator email first).

- [ ] **Step 3: Create a validation project**

From the dashboard:
1. Click "Browse library".
2. Select **both** `[ALPHA AUDIO SMOKE]` videos.
3. Click "Build from 2 selected".
4. Configure:
   - Hub title: `Launch Validation — Fixture Chain`
   - Audience: `launch-readiness validation on trigger v4`
   - Tone: `Conversational`
   - Depth: `Standard`
   - Template: Editorial Atlas
5. Click "Continue to payment".
6. On Stripe Checkout, use:
   - Card: `4242 4242 4242 4242`
   - Expiry: `12/34`
   - CVC: `123`
   - Name: anything
7. Submit.

Note the `projectId` from the URL (`/app/projects/<projectId>`).

- [ ] **Step 4: Write the watch script**

Create `packages/pipeline/src/.watch-project-run.ts`:

```typescript
/**
 * Scratch tool for Task 1: watches the latest run on a projectId and prints
 * one event per status transition / stage completion. Exits when the run
 * hits a terminal state (awaiting_review | published | failed).
 *
 * Usage: PROJECT_ID=<id> npx tsx packages/pipeline/src/.watch-project-run.ts
 */
import { closeDb, desc, eq, getDb } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
} from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from './env-files';

const PROJECT_ID = process.env.PROJECT_ID;
if (!PROJECT_ID) throw new Error('Set PROJECT_ID env var to the project being validated.');

const TERMINAL = new Set(['awaiting_review', 'published', 'failed']);

async function snapshot() {
  const db = getDb();
  const runs = await db
    .select({
      runId: generationRun.id,
      status: generationRun.status,
      pi: generationRun.stripePaymentIntentId,
      startedAt: generationRun.startedAt,
      completedAt: generationRun.completedAt,
    })
    .from(generationRun)
    .where(eq(generationRun.projectId, PROJECT_ID!))
    .orderBy(desc(generationRun.createdAt))
    .limit(1);
  const run = runs[0];
  if (!run) return { status: 'no-run' as const };

  const stages = await db
    .select({
      stageName: generationStageRun.stageName,
      status: generationStageRun.status,
      errorJson: generationStageRun.errorJson,
    })
    .from(generationStageRun)
    .where(eq(generationStageRun.runId, run.runId))
    .orderBy(generationStageRun.createdAt);

  return { status: 'ok' as const, run, stages };
}

async function main() {
  loadDefaultEnvFiles();
  const startedAt = Date.now();
  const MAX_MS = 15 * 60 * 1000;
  let lastLine = '';
  while (Date.now() - startedAt < MAX_MS) {
    const snap = await snapshot();
    if (snap.status === 'no-run') {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsed === 0 || elapsed % 30 === 0) console.log(`[t=${elapsed}s] no run yet`);
    } else {
      const { run, stages } = snap;
      const stageLine = stages
        .map((s) => `${s.stageName}=${s.status}${s.errorJson?.message ? `(${s.errorJson.message})` : ''}`)
        .join(' | ');
      const line = `status=${run.status} pi=${run.pi ?? 'none'} stages=[${stageLine}]`;
      if (line !== lastLine) {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        console.log(`[t=${elapsed}s] ${line}`);
        lastLine = line;
      }
      if (TERMINAL.has(run.status)) {
        console.log(`\n[watch] terminal: ${run.status}`);
        break;
      }
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  await closeDb();
}

main().catch((err) => {
  console.error('[watch] failed:', err);
  process.exit(1);
});
```

- [ ] **Step 5: Run the watch script in a separate terminal**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/pipeline"
PROJECT_ID="<projectId from Step 3>" npx tsx ./src/.watch-project-run.ts
```

Expected sequence (over ~2–6 min):
```
[t=0s] no run yet                          -- before the row exists
[t=5s] status=awaiting_payment pi=none ...  -- row created by configure
[t=~10s] status=queued pi=pi_... stages=[]  -- webhook delivered, run queued
[t=~15s] status=running pi=pi_... stages=[import_selection_snapshot=succeeded]
[t=~30s] ... stages=[... | ensure_transcripts=running]
[t=~90s] ... stages=[... | ensure_transcripts=succeeded]
[t=~95s] ... stages=[... | normalize_transcripts=succeeded]
[t=~100s] ... stages=[... | segment_transcripts=succeeded]
[t=~120s] ... stages=[... | synthesize_v0_review=succeeded]
[t=~180s] ... stages=[... | draft_pages_v0=succeeded]
[t=~185s] status=awaiting_review
[watch] terminal: awaiting_review
```

**If watch emits `status=queued` for more than 60 seconds without progressing:** the webhook succeeded but the `extract-run-audio` Trigger.dev task never picked up the work. Go to Task 2 (conditional).

**If watch emits a `stageName=failed` entry:** note the `errorJson.message`. Go to Task 2 (conditional).

**If watch reaches `status=awaiting_review`:** you've proven the chain. Continue.

- [ ] **Step 6: Manually review + publish the run**

In the browser (while the watch keeps running is fine, since it exits on `awaiting_review`):
1. Refresh `/app/projects/<projectId>` — it should now show "Open draft pages".
2. Click into draft pages, eyeball the prose (should be 1 page with multiple LLM-generated sections citing the two audio fixtures).
3. Click **Publish preview now**.
4. Wait for redirect → `/app/projects/<projectId>` with "published" state.
5. Note the hub URL (`/h/<subdomain>`) and confirm it loads publicly with LLM content.

- [ ] **Step 7: Confirm the publish email arrived**

Check the operator's Gmail inbox for an email from `noreply@creatorcanon.app` (or wherever `RESEND_API_KEY`'s verified domain sends from) with subject `Launch Validation — Fixture Chain is live on CreatorCanon`. Open it — the CTA link should point to the published hub URL.

If no email:
- Check Vercel prod logs for `[publish] email send failed (non-blocking)` — diagnose the specific Resend error.
- If the error is "Missing API key" or "Sending to unverified domain", that's a Resend config issue (the code is working, the account isn't). Note it and move on; Task 5 will re-test operator-side delivery.
- If the Vercel log shows no email-send attempt at all, `RESEND_API_KEY` is probably unset on prod; check `npx vercel env ls production | grep RESEND`.

- [ ] **Step 8: Confirm cost-ledger rows were written**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db"
cat > src/.check-cost.ts <<'EOF'
import { closeDb, desc, eq, getDb } from '.';
import { costLedgerEntry } from './schema';
import { loadDefaultEnvFiles } from '@creatorcanon/pipeline/env-files';

const RUN_ID = process.env.RUN_ID;
if (!RUN_ID) throw new Error('Set RUN_ID to the validation run id.');

async function main() {
  loadDefaultEnvFiles();
  const db = getDb();
  const rows = await db
    .select({
      stageName: costLedgerEntry.stageName,
      provider: costLedgerEntry.provider,
      model: costLedgerEntry.model,
      costCents: costLedgerEntry.costCents,
    })
    .from(costLedgerEntry)
    .where(eq(costLedgerEntry.runId, RUN_ID))
    .orderBy(desc(costLedgerEntry.createdAt));
  console.log(`[cost-check] ${rows.length} rows for run ${RUN_ID}:`);
  for (const r of rows) console.log('  ', r);
  await closeDb();
}
main().catch((e) => { console.error(e); process.exit(1); });
EOF
RUN_ID="<runId from watch>" npx tsx ./src/.check-cost.ts
rm -f ./src/.check-cost.ts
```

Expected output: **at least 3 rows** — one `whisper-1` from `ensure_transcripts` (with the whisper cost), one `gpt-4o-mini` from `synthesize_v0_review`, one `gpt-4o-mini` from `draft_pages_v0`.

If zero rows: the cost-ledger-write helper isn't being called. Diagnose before moving to Task 8 (which depends on the writes working today).

- [ ] **Step 9: Clean up scratch files**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
rm -f packages/pipeline/src/.watch-project-run.ts packages/db/src/.check-cost.ts
git status --short
# Expected: nothing new (scratch files were never committed).
```

- [ ] **Step 10: Record the validation evidence**

No commit. Paste this into a personal note (or Linear/Notion):
- `validationProjectId`: ...
- `validationRunId`: ...
- `paymentIntentId`: `pi_...`
- `hubSubdomain`: ...
- `emailArrived`: yes / no / "skipped because ..."
- `costLedgerRowCount`: N
- `totalDurationFromPaymentToAwaitingReview`: M:SS

That record is the only artifact of Task 1. It's the "we shipped end-to-end once" marker.

---

### Task 2 (CONDITIONAL): Diagnose Trigger.dev v4 task-API breakage

**SKIP THIS TASK IF TASK 1 PASSED.**

**Purpose:** If the validation run stalled at `queued` or a task failed with a v4-specific error, fix the one task that broke. Do not attempt to "modernize" any other code.

**Files:** depends on what broke. Most likely culprits, in order:
- `apps/worker/src/tasks/run-pipeline.ts` (if it crashed on invocation)
- `apps/worker/src/tasks/extract-run-audio.ts` (if the chain never fired)
- `apps/worker/src/tasks/hello.ts` (for comparison — known-working reference)
- Modify: `apps/worker/src/tasks/<broken-task>.ts`
- Modify: `apps/web/src/app/api/stripe/webhook/route.ts` (only if the webhook-side SDK import broke)

- [ ] **Step 1: Pull the Trigger.dev dashboard run log**

Open `https://cloud.trigger.dev/projects/v3/proj_yzrjadqegzegmkeernox/runs` → find the run matching your validation `runId` → open it → copy the full error trace into your notes.

- [ ] **Step 2: Classify the failure**

Three common v3→v4 API changes to check:

**Class A — `logger.info` signature changed.** v3 took `(message, context)`, v4 takes the same shape but the `context` object must be JSON-serializable at the top level. Look for passing non-serializable values (Dates, Errors, Maps, Sets) directly as context. Fix by pre-serializing.

**Class B — `task()` return type requirement.** v4 may require tasks to return JSON-serializable output. Our `runGenerationPipeline` returns an object with date fields — probably fine, but if the error mentions "unable to serialize output", wrap the return in `JSON.parse(JSON.stringify(result))`.

**Class C — `tasks.trigger()` from the webhook breaks.** v4 SDK may have changed the `tasks.trigger<T>()` generic signature. If Vercel build logs show a TypeScript error in `apps/web/src/app/api/stripe/webhook/route.ts`, align the import style.

- [ ] **Step 3: Check the Trigger.dev v4 migration notes**

Read https://trigger.dev/docs/upgrade-to-v4 (fetch it in browser; do not paraphrase from memory). Match the error class to a documented change.

- [ ] **Step 4: Apply the minimal patch**

Write the smallest code change that resolves the specific error. Do NOT refactor other tasks in sympathy.

- [ ] **Step 5: Run typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
```
Both must exit 0.

- [ ] **Step 6: Redeploy worker**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/worker"
node_modules/.bin/trigger deploy 2>&1 | tail -10
```
Expected: `Successfully deployed version 20260424.N` with 4 tasks detected.

- [ ] **Step 7: Re-run the validation paid checkout**

Go back to Task 1 Step 3 and start over with a fresh project (cannot reuse the failed one — the stage-run rows would collide). Use a new project title like `Launch Validation — Retry After Fix 1`.

- [ ] **Step 8: Commit the fix**

Once Task 1 reaches `awaiting_review`:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git add -A apps/worker/src apps/web/src/app/api/stripe/webhook
git commit -m "fix(trigger): align <task-id> to Trigger.dev v4 API

Worker deploy 20260424.8 failed at runtime with:
  <paste the exact error>

Root cause: <class A/B/C from Step 2>.
Minimal fix: <what changed>.
Re-validated end-to-end on validation run <validationRunId>."
git push origin main
```

If Step 7 fails a second time with a different error, loop back to Step 2 with the new trace. If you loop more than 3 times, escalate to the human operator.

---

# Phase 2 — Hardening (2 days)

### Task 3: Seed 2 real beta creator emails on the allowlist

**Purpose:** Put the allowlist gate into "real alpha" state. You already have the template committed; this task is filling in the emails and running it.

**Files:**
- Modify: `docs/operator-allowlist-cohort-1.sql`

- [ ] **Step 1: Get the two real creator emails from the operator**

If the operator hasn't supplied them, stop and ask. Do not invent placeholders.

- [ ] **Step 2: Update the SQL template**

Replace the two `TODO-creator-N@example.com` lines in `docs/operator-allowlist-cohort-1.sql` with the real emails. Keep them lowercase.

Example final lines:

```sql
INSERT INTO allowlist_email (email, approved, approved_at, note)
VALUES
  ('realcreator1@gmail.com', true, NOW(), 'cohort-1 alpha'),
  ('realcreator2@proton.me', true, NOW(), 'cohort-1 alpha')
ON CONFLICT (email)
DO UPDATE SET
  approved    = true,
  approved_at = NOW(),
  note        = EXCLUDED.note;
```

- [ ] **Step 3: Apply the SQL**

Option A (preferred — works even under the known postgres-wire ECONNRESET):
1. Open `https://console.neon.tech/` → select the CreatorCanon project.
2. SQL Editor → paste the committed SQL (not the TODO-template version; the one with real emails).
3. Run. Expected: `INSERT 0 2` or similar.

Option B (if VPN is off and the wire works):
```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
cat docs/operator-allowlist-cohort-1.sql | pnpm --filter @creatorcanon/db exec tsx -e '
import { closeDb, getDb } from "./src/client";
import { loadDefaultEnvFiles } from "../pipeline/src/env-files";
import fs from "node:fs";
loadDefaultEnvFiles();
const sql = fs.readFileSync(0, "utf8");
(async () => {
  const db = getDb();
  await db.execute(sql);
  await closeDb();
  console.log("applied");
})().catch((e) => { console.error(e); process.exit(1); });
'
```

- [ ] **Step 4: Verify in the DB**

Neon Console SQL Editor:

```sql
SELECT email, approved, approved_at, note
FROM allowlist_email
WHERE note = 'cohort-1 alpha'
ORDER BY approved_at DESC;
```

Expected: 2 rows, both `approved=true`.

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git add docs/operator-allowlist-cohort-1.sql
git commit -m "ops: seed cohort-1 allowlist with 2 real beta creators

Template filled in with real creator emails and applied to hosted
Neon via console. allowlist_email table now has 2 approved=true
rows tagged 'cohort-1 alpha'. Ready for sign-in invites."
git push origin main
```

---

### Task 4: Stalled-run banner on project status page

**Purpose:** If a creator's run sits in `queued` or `running` with no stage progress for 3 minutes, show them a clear "Something may be wrong" message with a mailto link. Prevents silent failures from eroding trust.

**Files:**
- Create: `apps/web/src/app/app/projects/[id]/StalledRunBanner.tsx`
- Modify: `apps/web/src/app/app/projects/[id]/page.tsx`

- [ ] **Step 1: Write the StalledRunBanner client component**

Create `apps/web/src/app/app/projects/[id]/StalledRunBanner.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

/**
 * Shows a "something may be wrong" banner if no stage progress has happened
 * for `thresholdMs` after the run was queued. Hidden otherwise.
 *
 * Inputs:
 * - `runCreatedAtIso`: ISO string of when the run row was created. Used as
 *   the start-of-clock.
 * - `lastStageUpdateAtIso`: ISO string of the most recent `generation_stage_run.updated_at`.
 *   If no stages have started yet this is null — fall back to runCreatedAtIso.
 * - `runStatus`: 'queued' | 'running' — banner never shows for terminal states.
 * - `thresholdMs`: default 3 minutes.
 *
 * The component does its own setInterval so it updates even when the server
 * component (parent page) isn't re-rendered.
 */
export function StalledRunBanner({
  runCreatedAtIso,
  lastStageUpdateAtIso,
  runStatus,
  thresholdMs = 3 * 60 * 1000,
  supportMailto = 'mailto:support@creatorcanon.app?subject=Hub%20run%20stalled',
}: {
  runCreatedAtIso: string;
  lastStageUpdateAtIso: string | null;
  runStatus: 'queued' | 'running';
  thresholdMs?: number;
  supportMailto?: string;
}) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    function check() {
      const anchor = new Date(lastStageUpdateAtIso ?? runCreatedAtIso).getTime();
      const now = Date.now();
      setStalled(now - anchor > thresholdMs);
    }
    check();
    const id = setInterval(check, 15_000);
    return () => clearInterval(id);
  }, [runCreatedAtIso, lastStageUpdateAtIso, thresholdMs]);

  if (!stalled) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="mt-4 rounded-md border border-amber/40 bg-amber/8 p-4"
    >
      <p className="text-sm font-semibold text-ink">
        This is taking longer than expected.
      </p>
      <p className="mt-1 text-sm text-ink-2">
        Your run has been {runStatus} for over 3 minutes without stage progress.
        Most runs finish in under 5 minutes. If it hasn&apos;t progressed in
        another few minutes,{' '}
        <a
          href={supportMailto}
          className="underline underline-offset-2 font-medium"
        >
          email support
        </a>{' '}
        and we&apos;ll look into it.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Mount the banner in the project page**

Open `apps/web/src/app/app/projects/[id]/page.tsx`. Find the existing import block (around line 17–20) and add:

```tsx
import { StalledRunBanner } from './StalledRunBanner';
```

Find the existing `LiveRefresh` mount (line 188):

```tsx
{isActive && <LiveRefresh intervalMs={5000} />}
```

Immediately below it, add:

```tsx
{isActive && run && (
  <StalledRunBanner
    runCreatedAtIso={new Date(run.createdAt).toISOString()}
    lastStageUpdateAtIso={
      stageRuns.length > 0
        ? new Date(stageRuns[stageRuns.length - 1]!.updatedAt ?? stageRuns[stageRuns.length - 1]!.createdAt).toISOString()
        : null
    }
    runStatus={run.status === 'queued' ? 'queued' : 'running'}
  />
)}
```

(`run` and `stageRuns` are both already in scope per the existing page code; `stageRuns` is sorted ascending by `createdAt`, so the last entry is the most recent.)

- [ ] **Step 3: Typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/web lint 2>&1 | tail -3
```
Both must exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/app/projects/\[id\]/StalledRunBanner.tsx apps/web/src/app/app/projects/\[id\]/page.tsx
git commit -m "feat(app): stalled-run banner after 3 min of no stage progress

A queued/running run with no generation_stage_run activity for 3+
minutes is a sign the webhook dispatched but the worker never
picked up. Previously the creator saw unchanging 'queued' copy
indefinitely. The new StalledRunBanner mounts next to LiveRefresh
(which handles the happy-path 5s polling) and surfaces a
'something may be wrong' message with a support mailto link
when the threshold is crossed.

Client-only (useEffect + setInterval) so it updates without
requiring the server component to re-render. Uses
lastStageUpdateAtIso = last stage run's updatedAt, falling back
to runCreatedAtIso when no stages have started."
git push origin main
```

---

### Task 5: Operator notification email on /request-access submit

**Purpose:** Currently a creator submitting `/request-access` goes silently into `allowlist_email` with `approved=false`. The operator has to manually poll the table. A Resend email to the operator on each submission makes it a real queue.

**Files:**
- Modify: `apps/web/src/app/request-access/actions.ts`
- Create: `apps/web/src/emails/AccessRequestedEmail.tsx`

- [ ] **Step 1: Write the operator-notification email template**

Create `apps/web/src/emails/AccessRequestedEmail.tsx`:

```tsx
/**
 * Sent to the operator when someone submits /request-access. Minimal inline
 * styles because email clients mangle CSS-in-JS.
 */
export interface AccessRequestedEmailProps {
  email: string;
  ip: string | null;
  submittedAt: string;
}

const wrapStyle = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1a1a1a',
  maxWidth: 520,
  margin: '0 auto',
  padding: 24,
} as const;

const kvStyle = {
  fontSize: 14,
  lineHeight: 1.5,
  margin: '8px 0',
} as const;

export default function AccessRequestedEmail({
  email,
  ip,
  submittedAt,
}: AccessRequestedEmailProps) {
  return (
    <html>
      <body style={wrapStyle}>
        <h1 style={{ fontSize: 22, margin: 0, fontWeight: 600 }}>
          New alpha access request
        </h1>
        <p style={kvStyle}>
          <strong>Email:</strong> <code>{email}</code>
        </p>
        <p style={kvStyle}>
          <strong>IP:</strong> <code>{ip ?? '—'}</code>
        </p>
        <p style={kvStyle}>
          <strong>Submitted:</strong> {submittedAt}
        </p>
        <hr
          style={{
            marginTop: 24,
            border: 'none',
            borderTop: '1px solid #eee',
          }}
        />
        <p style={{ fontSize: 13, color: '#666', marginTop: 16 }}>
          To approve, run in Neon SQL Editor:
        </p>
        <pre
          style={{
            fontSize: 12,
            background: '#f5f5f5',
            padding: 12,
            borderRadius: 4,
            overflow: 'auto',
          }}
        >{`UPDATE allowlist_email
SET approved = true, approved_at = NOW()
WHERE email = '${email}';`}</pre>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Wire the email into the action**

Overwrite `apps/web/src/app/request-access/actions.ts`:

```typescript
'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { createResendClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { allowlistEmail } from '@creatorcanon/db/schema';

import AccessRequestedEmail from '@/emails/AccessRequestedEmail';

const OPERATOR_EMAIL =
  process.env.OPERATOR_ALERT_EMAIL ?? 'mariosdemosthenous11@gmail.com';

export async function requestAccess(formData: FormData): Promise<void> {
  const rawEmail = (formData.get('email') as string | null)?.trim().toLowerCase();
  if (!rawEmail || !rawEmail.includes('@') || rawEmail.length < 5) {
    redirect('/request-access?status=invalid');
  }

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

  // Best-effort operator notification. Never throw — the creator's submission
  // must succeed even if email delivery fails.
  try {
    const env = parseServerEnv(process.env);
    if (env.RESEND_API_KEY) {
      const resend = createResendClient(env);
      await resend.send({
        to: OPERATOR_EMAIL,
        subject: `Alpha access request — ${rawEmail}`,
        react: AccessRequestedEmail({
          email: rawEmail!,
          ip,
          submittedAt: new Date().toISOString(),
        }) as Parameters<typeof resend.send>[0]['react'],
      });
    }
  } catch (err) {
    console.error('[request-access] operator notify failed (non-blocking):', err);
  }

  redirect('/request-access?status=submitted');
}
```

- [ ] **Step 3: Typecheck + lint**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
pnpm --filter @creatorcanon/web lint 2>&1 | tail -3
```

- [ ] **Step 4: Live-test against prod**

Wait for Vercel auto-deploy of the previous commit to land (~2 min after push). Then:

```bash
curl -sS -X POST "https://creatorcanon-saas.vercel.app/request-access" \
  -d "email=$(printf 'alpha-test-%s@mailinator.com' "$(date +%s)")" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -o /dev/null -w "%{http_code}\n"
```

Expected: `303` (Next.js redirect after successful action).

Then check the operator Gmail for a new email with subject starting `Alpha access request —`. It should arrive within 30 seconds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/emails/AccessRequestedEmail.tsx apps/web/src/app/request-access/actions.ts
git commit -m "feat(access): operator notification email on /request-access submit

Fires a Resend email to OPERATOR_ALERT_EMAIL (default
mariosdemosthenous11@gmail.com) when a creator submits the
request-access form. Wrapped in try/catch so email failures
never block the creator's submission. The email body contains
the email, IP, timestamp, and a paste-ready SQL snippet to
approve the request.

Turns the allowlist queue from 'SQL poll' into 'inbox pings'."
git push origin main
```

---

### Task 6: Expand CI — wire real unit tests + Playwright

**Purpose:** The existing `.github/workflows/ci.yml` runs `pnpm test` which currently is `turbo run test` where every package's test script just `echo`s. Wire each package's `test` script to run its actual `node:test` files, and add a new Playwright job that runs the 2 prod-safe specs against preview deployments.

**Files:**
- Modify: `packages/core/package.json` — real test script
- Modify: `packages/db/package.json` — real test script
- Modify: `packages/pipeline/package.json` — real test script
- Modify: `packages/adapters/package.json` — real test script
- Modify: `apps/web/package.json` — real test script (currently `echo`)
- Modify: `.github/workflows/ci.yml` — add Playwright job

- [ ] **Step 1: Wire packages/core tests into its test script**

Open `packages/core/package.json`. Find the `"scripts"` block and change the `test` entry from `"echo 'core: no tests yet'"` (or whatever it currently says) to:

```json
"test": "node --import \"../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs\" --test src/*.test.ts"
```

Verify locally:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/core test 2>&1 | tail -5
```
Expected: `pass 4`, `fail 0`.

- [ ] **Step 2: Wire packages/db tests**

Same pattern. Open `packages/db/package.json`, change `test` to:

```json
"test": "node --import \"../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs\" --test src/*.test.ts"
```

Verify:

```bash
pnpm --filter @creatorcanon/db test 2>&1 | tail -5
```
Expected: `pass 4`, `fail 0`.

- [ ] **Step 3: Wire packages/pipeline tests**

Open `packages/pipeline/package.json`, change `test` to:

```json
"test": "node --import \"../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs\" --test src/*.test.ts"
```

Verify:

```bash
pnpm --filter @creatorcanon/pipeline test 2>&1 | tail -5
```
Expected: 2 test files (segment-splitter + cost-ledger-write), several passes, 0 fails.

- [ ] **Step 4: Wire packages/adapters tests**

Adapters tests live under `packages/adapters/src/**/*.test.ts` — one file at the `resend/` subfolder. Adjust the glob:

```json
"test": "node --import \"../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs\" --test \"src/**/*.test.ts\""
```

Verify:

```bash
pnpm --filter @creatorcanon/adapters test 2>&1 | tail -5
```
Expected: 3 passes from `resend/client.test.ts`, 0 fails.

- [ ] **Step 5: Wire apps/web tests**

The only test under `apps/web/src` right now is the webhook dispatch test at `apps/web/src/app/api/stripe/webhook/dispatch.test.ts`. Change the `test` script in `apps/web/package.json`:

```json
"test": "node --import \"../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs\" --test \"src/**/*.test.ts\""
```

Verify:

```bash
pnpm --filter @creatorcanon/web test 2>&1 | tail -5
```
Expected: 4 passes from dispatch.test.ts.

- [ ] **Step 6: Verify turbo test still runs every package**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm test 2>&1 | tail -15
```

Expected: turbo executes `test` across all 11 workspaces. The 5 packages with real tests should pass all assertions; the rest (`cost-ledger`, `ui`, `config`, etc.) should fall through with their existing `echo 'no tests yet'`.

- [ ] **Step 7: Add a Playwright job to ci.yml**

Open `.github/workflows/ci.yml`. Append this job at the end (as a sibling to `checks` and `build`):

```yaml
  e2e:
    name: e2e (prod smokes)
    needs: build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    defaults:
      run:
        working-directory: SaaS
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
          run_install: false

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
          cache-dependency-path: SaaS/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Install Playwright Chromium
        run: pnpm --filter @creatorcanon/web exec playwright install --with-deps chromium

      - name: Run prod-safe specs against creatorcanon-saas.vercel.app
        env:
          E2E_EXTERNAL: 'true'
          E2E_BASE_URL: 'https://creatorcanon-saas.vercel.app'
        run: |
          pnpm --filter @creatorcanon/web exec playwright test \
            --grep "Request access page accepts an email|Public /pricing renders single-tier copy"

      - name: Upload Playwright trace on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-traces
          path: SaaS/apps/web/test-results/
          retention-days: 7
```

**Rationale for the `--grep` filter:** the full `creator-journey.spec.ts` contains 4 specs; 2 require a running dev server with a local DB (dev-bypass sign-in + My Hubs). The CI job runs against prod which has neither, so we deliberately scope to the 2 prod-compatible specs. Task 9 adds a third prod-compatible spec.

- [ ] **Step 8: Push + watch the CI run**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git add \
  packages/core/package.json \
  packages/db/package.json \
  packages/pipeline/package.json \
  packages/adapters/package.json \
  apps/web/package.json \
  .github/workflows/ci.yml
git commit -m "ci: wire real node:test runs + Playwright prod-smoke job

Previously every package's test script was echo 'no tests yet',
so turbo run test was a no-op. This wires each package (core, db,
pipeline, adapters, web) to run its src/**/*.test.ts files through
node --test with the shared tsx loader from .pnpm store.

Adds a new ci.yml job 'e2e (prod smokes)' that installs Playwright
Chromium and runs the 2 prod-compatible creator-journey specs
against creatorcanon-saas.vercel.app after the build job succeeds.
Uploads test-results as an artifact on failure.

Expected gates on every PR + main push:
  checks (typecheck + lint + 11 unit tests)
    -> build (next build + worker build)
    -> e2e (2 Playwright specs vs prod)"
git push origin main
```

Open `https://github.com/mariosdem2008/CreatorCanon/actions` and watch the new workflow run. Expected: `checks` green in ~3 min, `build` green in ~4 min, `e2e` green in ~3 min.

If `checks` fails on a test the package hasn't wired yet, re-examine the grep — it should only try to run tests the package has. If `e2e` fails, retry once; if it still fails, the Playwright selectors in the existing spec don't match current prod DOM — fix the spec, not the workflow.

---

### Task 7: Commit drizzle migrations

**Purpose:** `packages/db/drizzle/out/` is gitignored but the existing `drizzle-check.yml` CI workflow explicitly checks that migrations are committed (runs `git diff --exit-code packages/db/drizzle/out`). That's a contradiction — the gitignore makes the check a no-op. Remove the ignore, commit the 2 existing migrations, let the check enforce going forward.

**Files:**
- Modify: `.gitignore`
- Add: `packages/db/drizzle/out/0000_youthful_stingray.sql` (existing on disk, add via `git add -f`)
- Add: `packages/db/drizzle/out/0001_broken_ego.sql` (existing on disk, add via `git add -f`)
- Add: `packages/db/drizzle/out/meta/*` (existing on disk, add via `git add -f`)

- [ ] **Step 1: Remove the gitignore rule**

Open `.gitignore`. Find line 53:

```
drizzle/out/
```

Delete that line. Save.

- [ ] **Step 2: Force-add the existing migration files**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git add -f packages/db/drizzle/out/
git status --short | head
# Expected new files:
#   A  packages/db/drizzle/out/0000_youthful_stingray.sql
#   A  packages/db/drizzle/out/0001_broken_ego.sql
#   A  packages/db/drizzle/out/meta/_journal.json
#   A  packages/db/drizzle/out/meta/0000_snapshot.json
#   A  packages/db/drizzle/out/meta/0001_snapshot.json
#   M  .gitignore
```

If any expected file is missing, stop — it means the operator never actually applied migration 0001 locally. Go to Neon console and verify the `allowlist_email` table exists first.

- [ ] **Step 3: Verify drizzle-kit agrees these are the current schema**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/db exec drizzle-kit generate --name=preflight_check 2>&1 | tail -6
```

Expected output line: `No schema changes, nothing to migrate` (or equivalent). If it generates a new file `0002_*.sql`, it means the schema drifted against the committed migrations — DO NOT commit the `0002` file; investigate the drift first (`git diff packages/db/src/schema/`).

Delete any extraneous preflight_check file it created:
```bash
ls packages/db/drizzle/out/ | grep preflight_check && rm -f packages/db/drizzle/out/*preflight_check* packages/db/drizzle/out/meta/*preflight_check*
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git add .gitignore packages/db/drizzle/out/
git commit -m "chore(db): commit drizzle migrations + unignore drizzle/out

drizzle-check.yml CI workflow runs 'git diff --exit-code
packages/db/drizzle/out' on every schema PR, intending to fail
when a schema change lands without its migration. With
drizzle/out/ gitignored, that check passed even on drifts because
generated files landed in a gitignored dir. Fixing the
contradiction by removing line 53 from .gitignore and force-adding
the 2 existing migrations + meta snapshots.

Migrations committed:
  0000_youthful_stingray.sql  (initial schema)
  0001_broken_ego.sql         (allowlist_email table)

Hosted Neon has both applied already; the check-migrations CI
step now matches the deployed state."
git push origin main
```

- [ ] **Step 5: Verify drizzle-check CI still passes**

The push will trigger `drizzle-check` (only runs on PRs with schema changes per its path filter, but will also run on the main push). Watch `https://github.com/mariosdem2008/CreatorCanon/actions`. The check should pass cleanly since the committed migrations match the schema.

---

### Task 8: Resolve packages/cost-ledger zombie

**Purpose:** `packages/cost-ledger` advertises cost-tracking types but writes nothing; `packages/pipeline/src/cost-ledger-write.ts` does the writes but isn't re-exported. Consolidate: move the writer into the cost-ledger package and have pipeline stages import from `@creatorcanon/cost-ledger`. Kill the misleading `ledgerPlaceholder = true` flag.

**Files:**
- Modify: `packages/cost-ledger/src/index.ts` — absorb the writer
- Modify: `packages/cost-ledger/package.json` — add `@creatorcanon/db` dep (needed for `getDb` + `costLedgerEntry`)
- Modify: `packages/pipeline/package.json` — add `@creatorcanon/cost-ledger` dep
- Delete: `packages/pipeline/src/cost-ledger-write.ts`
- Delete: `packages/pipeline/src/cost-ledger-write.test.ts`
- Add: `packages/cost-ledger/src/write.test.ts` — migrated test
- Modify: `packages/pipeline/src/stages/ensure-transcripts.ts` — update import
- Modify: `packages/pipeline/src/stages/synthesize-v0-review.ts` — update import
- Modify: `packages/pipeline/src/stages/draft-pages-v0.ts` — update import

- [ ] **Step 1: Overwrite cost-ledger/src/index.ts with the absorbed writer**

Overwrite `packages/cost-ledger/src/index.ts`:

```typescript
import { getDb } from '@creatorcanon/db';
import { costLedgerEntry } from '@creatorcanon/db/schema';

/**
 * Cost-ledger provider enum. Mirrors the `cost_provider` PG enum defined in
 * packages/db/src/schema/enums.ts. Keep in sync if that enum changes.
 */
export type CostProvider =
  | 'openai'
  | 'gemini'
  | 'youtube'
  | 'resend'
  | 'stripe'
  | 'r2';

export interface CostRowInput {
  runId: string;
  workspaceId: string;
  stageName: string;
  provider: CostProvider;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  inputSecondsVideo?: number | null;
  costCents: number;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Build the insert row (pure, testable without a DB).
 */
export function buildCostRow(input: CostRowInput) {
  return {
    id: crypto.randomUUID(),
    workspaceId: input.workspaceId,
    runId: input.runId,
    stageName: input.stageName,
    userInteraction: 'pipeline' as const,
    provider: input.provider,
    model: input.model ?? null,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    inputSecondsVideo: input.inputSecondsVideo ?? null,
    inputFrames: null,
    durationMs: input.durationMs ?? null,
    costCents: round4(input.costCents).toString(),
    metadata: (input.metadata ?? null) as unknown,
    createdAt: new Date(),
  };
}

/**
 * Best-effort write to `cost_ledger_entry`. Never throws — a failed cost
 * log must not block a successful pipeline stage.
 */
export async function recordCost(input: CostRowInput): Promise<void> {
  try {
    const row = buildCostRow(input);
    const db = getDb();
    await db.insert(costLedgerEntry).values(row);
  } catch (err) {
    console.warn(
      '[cost-ledger] write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}
```

- [ ] **Step 2: Update packages/cost-ledger/package.json to declare deps**

Open `packages/cost-ledger/package.json`. In the `dependencies` block, make sure `@creatorcanon/db` is listed (it already is per prior audits, but verify):

```json
"dependencies": {
  "@creatorcanon/core": "workspace:*",
  "@creatorcanon/db": "workspace:*"
}
```

- [ ] **Step 3: Migrate the test**

Move the existing test. Create `packages/cost-ledger/src/write.test.ts`:

```typescript
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildCostRow } from './index';

test('buildCostRow populates required fields', () => {
  const row = buildCostRow({
    runId: 'run-1',
    workspaceId: 'ws-1',
    stageName: 'synthesize_v0_review',
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputTokens: 1200,
    outputTokens: 300,
    costCents: 0.08,
  });
  assert.equal(row.runId, 'run-1');
  assert.equal(row.workspaceId, 'ws-1');
  assert.equal(row.stageName, 'synthesize_v0_review');
  assert.equal(row.provider, 'openai');
  assert.equal(row.model, 'gpt-4o-mini');
  assert.equal(row.inputTokens, 1200);
  assert.equal(row.outputTokens, 300);
  assert.equal(row.userInteraction, 'pipeline');
  assert.ok(row.id);
});

test('buildCostRow rounds costCents to 4 decimals and stringifies for numeric()', () => {
  const row = buildCostRow({
    runId: 'run-1',
    workspaceId: 'ws-1',
    stageName: 'ensure_transcripts',
    provider: 'openai',
    model: 'whisper-1',
    costCents: 0.12345678,
  });
  assert.equal(typeof row.costCents, 'string');
  assert.equal(Number(row.costCents), 0.1235);
});

test('buildCostRow null defaults for optional fields', () => {
  const row = buildCostRow({
    runId: 'run-1',
    workspaceId: 'ws-1',
    stageName: 'draft_pages_v0',
    provider: 'openai',
    costCents: 0,
  });
  assert.equal(row.model, null);
  assert.equal(row.inputTokens, null);
  assert.equal(row.outputTokens, null);
  assert.equal(row.inputSecondsVideo, null);
  assert.equal(row.durationMs, null);
});
```

Update `packages/cost-ledger/package.json` `test` script to match Task 6's pattern:

```json
"test": "node --import \"../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs\" --test src/*.test.ts"
```

- [ ] **Step 4: Add the new dep to pipeline**

Open `packages/pipeline/package.json`. In `dependencies`, add:

```json
"@creatorcanon/cost-ledger": "workspace:*",
```

(Keep alphabetical order among `@creatorcanon/*` entries.)

- [ ] **Step 5: Re-install the workspace**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm install 2>&1 | tail -5
```
Expected: brief link update, no errors.

- [ ] **Step 6: Update pipeline stage imports**

Replace the three import lines:

In `packages/pipeline/src/stages/ensure-transcripts.ts`, change:

```typescript
import { recordCost } from '../cost-ledger-write';
```

to:

```typescript
import { recordCost } from '@creatorcanon/cost-ledger';
```

In `packages/pipeline/src/stages/synthesize-v0-review.ts`, change:

```typescript
import { recordCost } from '../cost-ledger-write';
```

to:

```typescript
import { recordCost } from '@creatorcanon/cost-ledger';
```

In `packages/pipeline/src/stages/draft-pages-v0.ts`, change:

```typescript
import { recordCost } from '../cost-ledger-write';
```

to:

```typescript
import { recordCost } from '@creatorcanon/cost-ledger';
```

- [ ] **Step 7: Delete the old local files**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
rm packages/pipeline/src/cost-ledger-write.ts packages/pipeline/src/cost-ledger-write.test.ts
```

- [ ] **Step 8: Typecheck + lint + tests**

```bash
pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm --filter @creatorcanon/cost-ledger test 2>&1 | tail -5
```

Expected: typecheck clean (all three stage files now resolve `recordCost` from the new location); lint clean; 3 test passes in cost-ledger.

- [ ] **Step 9: Commit**

```bash
git add -A packages/cost-ledger packages/pipeline
git commit -m "refactor(cost-ledger): absorb recordCost helper into the package

The packages/cost-ledger package previously declared
\`ledgerPlaceholder = true\` and held only type definitions; the
actual writes happened via packages/pipeline/src/cost-ledger-write.ts.
That split existed because the writer was added incrementally during
a plan execution phase and landed in the closest-hand location.

Consolidation:
- cost-ledger/src/index.ts now owns CostProvider, CostRowInput,
  buildCostRow, and recordCost (no more placeholder flag).
- cost-ledger/src/write.test.ts migrated from pipeline.
- packages/pipeline depends on @creatorcanon/cost-ledger and imports
  recordCost from there (three stage files updated).
- packages/pipeline/src/cost-ledger-write.{ts,test.ts} deleted."
git push origin main
```

---

### Task 9: Playwright spec — edit-then-publish happy path

**Purpose:** Current Playwright coverage hits the pre-payment path and the post-publish surfaces. It does NOT exercise the review → edit → publish transition. Add one spec that does, using dev-bypass sign-in plus an already-`awaiting_review` run.

**Files:**
- Create: `apps/web/e2e/edit-then-publish.spec.ts`

- [ ] **Step 1: Identify an already-published run to re-target**

The already-published hub `/h/hosted-webhook-proof-hub` (from prior sessions) has an associated project whose run is in `published` state. The `publishRunAsHub` flow is idempotent on already-published runs (creates a new release). We can use this project for the test.

Open Neon SQL editor, run:

```sql
SELECT p.id AS project_id, r.id AS run_id
FROM project p
JOIN generation_run r ON r.project_id = p.id
WHERE p.title ILIKE 'hosted webhook proof%'
ORDER BY r.created_at DESC
LIMIT 1;
```

Note the `project_id` — you'll embed it as a default in the spec (overridable via env).

- [ ] **Step 2: Write the spec**

Create `apps/web/e2e/edit-then-publish.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

/**
 * Edit-then-publish happy path.
 *
 * Uses dev-bypass sign-in (requires webServer with DEV_AUTH_BYPASS_ENABLED=true)
 * and an existing project whose run is in 'awaiting_review' or 'published'
 * state. The test exercises the review page, applies a single page-title edit
 * through the UI, and asserts the edit persists.
 *
 * The publish click itself isn't triggered here because publish is
 * irreversible (creates a real new release); the prior creator-journey.spec
 * already covers the configure → checkout → page assertion. This spec fills
 * the gap between "run finished" and "creator publishes" with a single
 * edit-save-verify assertion.
 *
 * Project id defaulted to a known prior proof run; override via
 * E2E_EDIT_PROJECT_ID for repeatability.
 */

const PROJECT_ID_DEFAULT = 'df018f46-66b4-4199-9b05-a5653742cadd';

test.skip(
  !process.env.E2E_EDIT_ENABLED,
  'Set E2E_EDIT_ENABLED=true to run (requires a pre-existing awaiting_review/published project).',
);

test.describe('Edit-then-publish happy path (dev bypass)', () => {
  test('creator edits a page title and save persists', async ({ page }) => {
    const projectId = process.env.E2E_EDIT_PROJECT_ID ?? PROJECT_ID_DEFAULT;

    await page.goto('/sign-in');
    await page
      .getByRole('button', { name: /continue as local dev user|dev bypass/i })
      .click();
    await page.waitForURL(/\/app(\/|$)/);

    await page.goto(`/app/projects/${projectId}/pages`);

    const pageSection = page.locator('[data-testid="page-version-block"]').first();
    await expect(pageSection).toBeVisible({ timeout: 10_000 });

    const titleInput = pageSection.locator('input[name="title"]');
    const initialTitle = await titleInput.inputValue();
    const newTitle = `E2E edit ${Date.now().toString(36)}`;
    await titleInput.fill(newTitle);
    await pageSection.getByRole('button', { name: /save title/i }).click();

    await page.waitForTimeout(1500);
    await page.reload();
    await expect(pageSection.locator('input[name="title"]')).toHaveValue(newTitle);

    // Restore the original title so repeated runs stay idempotent.
    await pageSection.locator('input[name="title"]').fill(initialTitle);
    await pageSection.getByRole('button', { name: /save title/i }).click();
  });
});
```

- [ ] **Step 3: Add data-testid hooks to the draft-pages page**

The spec selects a page-version block via `[data-testid="page-version-block"]`. Grep first:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
grep -n "data-testid=\"page-version-block\"" apps/web/src/app/app/projects/\[id\]/pages/page.tsx
```

If no match, the attribute is missing. Open `apps/web/src/app/app/projects/[id]/pages/page.tsx`, find the outer wrapper of each page-version card (search for "Save title" to orient — the wrapper is the `<article>`, `<section>`, or `<div>` that contains that button and the title `<input>`). Add `data-testid="page-version-block"` to that wrapping element.

If the grep already finds the attribute, skip this step.

- [ ] **Step 4: Verify locally with a running dev server**

This requires a local dev stack. If you don't have it, skip Step 4 and commit — CI won't run this spec (it's skipped unless `E2E_EDIT_ENABLED=true`).

If you have docker + DB:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm dev:db:up
pnpm dev:seed
# In a second terminal:
pnpm dev &
# In a third terminal, wait for dev server ready, then:
cd apps/web
E2E_EDIT_ENABLED=true DEV_AUTH_BYPASS_ENABLED=true E2E_EDIT_PROJECT_ID=<your test project id> pnpm e2e --grep "edits a page title"
```

Expected: 1 test, pass.

- [ ] **Step 5: Typecheck + commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
pnpm --filter @creatorcanon/web typecheck 2>&1 | tail -3
git add apps/web/e2e/edit-then-publish.spec.ts apps/web/src/app/app/projects/\[id\]/pages/page.tsx
git commit -m "test(e2e): edit-then-publish happy path via dev bypass

Single spec covering the review \u2192 edit \u2192 save \u2192 verify flow
that neither the existing creator-journey specs nor the prod
smoke nail down. Uses dev-bypass sign-in + a pre-existing
awaiting_review/published project (env var overridable).

Skipped by default; set E2E_EDIT_ENABLED=true to run. CI leaves
it off because the flow requires a local DB + dev server.
Operators with a local stack can flip the flag and repro the
full creator journey in under 30s.

Adds data-testid=\"page-version-block\" to the page card wrapper
to give the spec a stable selector."
git push origin main
```

---

# Phase 3 — Invite

### Task 10: Invite 2 creators on a scheduled Zoom

**Purpose:** The whole point of the plan. Get real creators through the flow while you can watch where they hesitate.

- [ ] **Step 1: Schedule the call**

Pick a 60-minute slot with the 2 allowlisted creators. One call, both on, optional hand-off. Time it after Task 7 (migrations committed) so any hotfixes that break don't block the invite.

- [ ] **Step 2: Send the invite email**

Minimal, warm, no boilerplate. Example:

> Subject: CreatorCanon alpha — 60 min this Thursday
>
> Hey [name] — we've turned your YouTube archive into a hosted knowledge hub with every claim linked to the exact second in the source video. You're in the first cohort of 2. Pricing is one flat $29 (test-mode card for alpha). Here's a Zoom link: [link]. Bring a browser signed into the Google account [email] — that's the one approved. I'll watch you go through it and take notes on anything unclear. No prep needed.

- [ ] **Step 3: During the call — watch, don't coach**

- Share your screen in parallel with Neon SQL Editor + Trigger.dev dashboard + Vercel logs.
- When the creator hesitates, **count to 15 before saying anything**. If they figure it out in 10, you've learned nothing. If they still can't move at 15, help.
- Note every single moment of friction. Even "what does 'draft' mean" is a real signal.
- If the run stalls (`StalledRunBanner` shows), pause the call for 1 min — if no progress, diagnose Trigger.dev live, share your screen. That's also data.

- [ ] **Step 4: Post-call — the only artifact**

Write one paragraph: "the thing I'd change tomorrow based on what I just saw". Don't pick 5 things. Pick 1. That's your next plan's first task.

This step has no commit. The artifact is knowledge about what to build next. **The whole plan is subordinate to this step.**

---

## Final verification checkpoint

After Tasks 1–10 are committed + pushed:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git log --oneline -11
# Expect: up to 9 new commits (Task 1 has no commit, Task 2 is conditional,
# Task 10 has no commit) since the validation run started.

pnpm typecheck 2>&1 | tail -3
pnpm lint 2>&1 | tail -3
pnpm test 2>&1 | tail -5
# All green.

# Manual checks:
# - https://creatorcanon-saas.vercel.app/h/<validation-hub>  renders LLM content
# - Inbox: publish email arrived
# - Inbox: new-access-request email arrives when someone hits /request-access
# - Neon: allowlist_email has 2 'cohort-1 alpha' rows approved=true
# - https://github.com/mariosdem2008/CreatorCanon/actions  last push is green on checks + build + e2e
# - packages/db/drizzle/out/*.sql committed in HEAD
# - packages/cost-ledger/src/index.ts exports recordCost; packages/pipeline/src/cost-ledger-write.ts gone
```

Plan complete when all those assertions hold AND Task 10 Step 4's one-paragraph artifact exists.

---

## Explicit OUT-OF-SCOPE — do NOT touch in this plan

- Rate limiter (`createRateLimiter` still throws — intentional)
- Toast/notification system
- Cost-ledger admin UI (writes exist, UI post-MVP)
- PII transcript scrubber before LLM
- Custom domains
- Chat-on-hubs
- Paywalled hubs + commission
- YouTube channel incremental sync
- `sync-channel` Trigger.dev task wiring
- Additional marketing-site / hub / studio UI polish beyond the stalled-run banner
- Adding Playwright mobile viewports
- Replacing Trigger.dev with Railway-hosted `queue-runner.ts` (Dockerfile exists but switching modes post-validation is premature)
- Upgrading any package beyond what Task 2 (conditional) requires
