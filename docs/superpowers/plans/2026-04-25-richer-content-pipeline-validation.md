# Richer-content pipeline validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run a real paid CreatorCanon end-to-end against 5 substantive videos (≥3 min each, not the 12 s `[ALPHA AUDIO SMOKE]` fixtures) from a channel the operator controls, and capture the cost-ledger writes that Task 1 of the closing sprint did not exercise.

**Architecture:** Reuse the already-validated webhook → Trigger.dev v4 worker → 6-stage pipeline chain. The operator picks a YouTube channel they own (or a podcast/audio they own), signs in via the existing Google OAuth, walks the same `/app` flow Task 1 used, pays with Stripe sandbox card `4242`, then we watch the run through the Trigger.dev Management API + Neon SQL. No new code — only operational steps that drive existing surfaces.

**Tech Stack:** Existing only. Next.js 14 web on Vercel prod (`creatorcanon-saas.vercel.app`), Trigger.dev v4.4.4 worker `v20260424.9` (medium-1x), Neon Postgres (`ep-muddy-union-amzm8n7t`), Stripe sandbox account `acct_1TOdd4PQQMTo0Wkr`, Resend, Chrome MCP for UI driving, the `tr_prod_*` secret key for Trigger Management API calls.

**Why this plan exists:**
The closing-sprint Task 1 validated the chain on `[ALPHA AUDIO SMOKE] fixture-1.m4a` (12 s, ~5 words). The pipeline short-circuited via artifact-reuse cache (3.4 s total, 0 cost-ledger rows). That proves the wiring but says nothing about **what a real creator's first run feels like** — Whisper transcription quality on 10 minutes of speech, gpt-4o-mini summarising substantive content, draft pages with multiple sections. This plan is the second proof point that the wiring also produces *good output on real input*.

**Scope guardrails (cut list — do NOT include):**
- Computer-upload feature (deferred per the 2026-04-25 conversation; comes after Task 10 of the closing sprint)
- Downloading any third-party creator's videos via yt-dlp (ToS line we drew)
- Any code changes to the pipeline, schema, dispatch, or stages
- Any Trigger.dev redeploy or Vercel redeploy

---

## File structure

This plan creates and modifies operational artifacts only. No code:

- **Create:** `docs/superpowers/plans/2026-04-25-richer-content-pipeline-validation.md` (this file)
- **Modify (Task 10 only):** `docs/superpowers/plans/2026-04-24-launch-readiness-closing-sprint.md` — append a "second proof block" inside the existing Task 1 record, or, if that grows unwieldy, append a fresh `Task 11 (post-sprint): Richer-content validation` section.

If the run reveals a real bug (something throws, content quality is unusable), stop and write a new plan for the fix. Do NOT scope-creep this one.

---

## Task 0: Pick the channel

**Purpose:** Lock the input before touching anything else. The cost of running this plan is bounded ($0.30–$1) but the cost of running it on the wrong content is wasted time. Decide which of three paths.

**Files:** none.

- [ ] **Step 1: Choose one of three paths**

Pick exactly one. Write the choice into your notes (or paste it into the chat) before continuing:

| Path | When to pick it | Channel/source |
| ---- | ---------------- | -------------- |
| **A — Operator's own YouTube channel** | The operator (you) already has a Google account with ≥5 public videos, each ≥3 min, on substantive material (talks, tutorials, interviews — not vlogs/shorts). | `mariosdemosthenous11@gmail.com`'s channel, or another personal account the operator owns. |
| **B — A friend's channel with explicit written consent** | The operator does NOT have own content but knows a creator who has given written consent (DM screenshot, signed email — keep it on file). | Friend's Google account they hand off for the test session. |
| **C — Seeded richer audio fixtures from operator-owned media** | Neither A nor B works (operator has no public archive, no consenting friend). | Operator-owned MP3/M4A files (own podcast episodes, conference talk recordings, owned interview audio). At least 5 files, each ≥3 min. |

If none of A/B/C apply, **stop and abandon this plan**. Returning to the closing-sprint plan and finishing Task 3 (allowlist seed) + Task 10 (Zoom invite) is the right move — the beta creators will provide their own channel.

- [ ] **Step 2: Confirm the channel meets the substance bar**

For Path A or B, open the channel page in any browser and verify ALL of:
- ≥5 public, non-Short videos
- Each picked video ≥3 min (so Whisper has at least 3 min × $0.006/min = $0.018 of work to do per video)
- Videos have spoken English content (Whisper handles other langs but we have not validated quality on them)
- The Google account is the channel owner (Brand-account proxies and team-member access break OAuth scope flow)

If any of those fail, drop down to Path C.

For Path C, list the 5 audio file paths absolute on disk:

```
1. C:/path/to/episode-1.m4a   ~12 min
2. C:/path/to/episode-2.m4a   ~14 min
3. ...
```

Note Path C requires a one-line tweak to the existing seed script call (covered in Task 3).

- [ ] **Step 3: Record the choice**

Write the answer to all of these in a scratch note or directly in the chat:

```
PATH:               A | B | C
CHANNEL_OWNER:      <gmail address that will sign in>
VIDEO_COUNT_PLAN:   5
TOTAL_AUDIO_MIN:    <sum of video lengths in minutes>
EXPECTED_COST_USD:  $<TOTAL_AUDIO_MIN × 0.006 + ~$0.10 LLM> ≈ $0.30–1.00
CHANNEL_URL:        https://www.youtube.com/@... (or "n/a" for Path C)
CONSENT_ARTIFACT:   self | screenshot saved at <path> | "Path C — own audio"
```

This becomes part of the Task 10 evidence block.

---

## Task 1: Confirm prereqs are still live

**Purpose:** The closing sprint shipped 3 cascading fixes that depend on staying configured. Verify each before paying $29 — five minutes of checks beats a stuck run.

**Files:** none.

- [ ] **Step 1: Confirm Vercel prod has the right Trigger secret key**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('C:/Users/mario/AppData/Roaming/com.vercel.cli/Data/auth.json','utf8')).token)")
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.vercel.com/v9/projects/creatorcanon-saas/env?teamId=team_b4vLtcCD6ln0yxIkqF9WM4Zq" \
  | python -c "import sys,json;d=json.load(sys.stdin);print([(e['key'],e.get('type')) for e in d['envs'] if e['key']=='TRIGGER_SECRET_KEY' and 'production' in (e.get('target') or [])])"
```

Expected: a single tuple `('TRIGGER_SECRET_KEY', 'sensitive')`. The `sensitive` type means Vercel cannot decrypt-fetch it via the API — that's the indicator we wrote `tr_prod_*` in sprint Task 2 (sprint-time we couldn't read it back; that's working as intended).

If output is empty: the env var was wiped. Stop the plan and re-do sprint Task 2 step `Patch TRIGGER_SECRET_KEY via Vercel REST API` before continuing.

- [ ] **Step 2: Confirm Trigger.dev prod env still has DATABASE_URL**

```bash
curl -s -H "Authorization: Bearer tr_pat_jvjag49npzhy6y1wt4aosjxw2iskaubfc2feo5yp" \
  "https://api.trigger.dev/api/v1/projects/proj_yzrjadqegzegmkeernox/envvars/prod" \
  | python -c "import sys,json;rows=json.load(sys.stdin);keys=[r['name'] for r in rows];print('count='+str(len(keys)));print('has_DATABASE_URL='+str('DATABASE_URL' in keys));print('has_OPENAI_API_KEY='+str('OPENAI_API_KEY' in keys))"
```

Expected:
```
count=21
has_DATABASE_URL=True
has_OPENAI_API_KEY=True
```

If `count` is much lower or any of those keys are False: re-run the sprint Task 2 step that bulk-pushed env vars before continuing.

- [ ] **Step 3: Confirm worker is on v20260424.9 with medium-1x**

Open in browser:

```
https://cloud.trigger.dev/orgs/creatorcanon-92c0/projects/creatorcanon-TEUt/env/prod/deployments
```

Expected: the top row reads `Version 20260424.9` (or higher), status `Deployed`, `4 tasks detected`. Click into it and verify `run-pipeline` shows `Machine: medium-1x`.

If lower than 9, sprint Task 2 wasn't deployed — stop the plan and run `pnpm --filter @creatorcanon/worker trigger:deploy` first.

- [ ] **Step 4: Confirm the Stripe sandbox card path still works (read-only)**

Open a private window, navigate to `https://creatorcanon-saas.vercel.app/sign-in`. You should see a green "Continue with Google" button and the page should load without 500 errors. Just close the window — no action.

If the page 500s: Vercel deploy is broken. Stop, fix, then resume.

- [ ] **Step 5: Confirm the operator email is on the allowlist**

Open Neon SQL editor (`https://console.neon.tech/` → CreatorCanon project → SQL Editor) and run:

```sql
SELECT email, approved, approved_at, note
  FROM allowlist_email
 WHERE email = '<CHANNEL_OWNER from Task 0>';
```

Expected: 1 row with `approved = true`.

If 0 rows or `approved = false`, run this in the same SQL editor:

```sql
INSERT INTO allowlist_email (email, approved, approved_at, note)
VALUES ('<CHANNEL_OWNER>', true, NOW(), 'richer-content-validation operator')
ON CONFLICT (email) DO UPDATE SET
  approved    = true,
  approved_at = NOW(),
  note        = EXCLUDED.note;
```

Re-run the SELECT to confirm.

(Path B users — the friend's email — must be allowlisted before they can sign in. Path C users keep the operator's own email; the seed script writes directly to DB so OAuth sign-in is bypassed.)

---

## Task 2: Path A or B — sign in and seed the videoSet via OAuth

**Purpose:** Use the existing creator path. No code; just Chrome MCP automation through the same surfaces a real beta creator will hit.

**Skip this task entirely if you chose Path C.** Jump to Task 3.

**Files:** none.

- [ ] **Step 1: Open the prod sign-in flow in Chrome MCP**

```
mcp__Claude_in_Chrome__navigate({tabId: <TAB>, url: "https://creatorcanon-saas.vercel.app/sign-in"})
```

Expected: page renders, green "Continue with Google" button visible.

- [ ] **Step 2: User-driven Google OAuth**

Chrome MCP runs in `read` tier on browser tabs and **cannot** drive OAuth login pages (Google blocks automation in a way the extension respects). The operator manually completes:

1. Click "Continue with Google".
2. Pick the `<CHANNEL_OWNER>` account.
3. Approve the requested scopes (sign-in, `youtube.readonly`).
4. Wait for redirect back to `creatorcanon-saas.vercel.app/app`.

When the URL is back on `/app`, tell Claude "signed in".

- [ ] **Step 3: Drive to the new-project flow**

```
mcp__Claude_in_Chrome__navigate({tabId: <TAB>, url: "https://creatorcanon-saas.vercel.app/app/projects/new"})
```

Expected: a screen with the channel's video archive listed in card form, each card with title, duration, thumbnail, and a checkbox.

If the page shows "No channel detected" or "Connect YouTube": the OAuth scope was denied. Sign out and re-authorize with the `youtube.readonly` scope checked.

- [ ] **Step 4: Select 5 substantive videos**

For each of the 5 videos chosen in Task 0 Step 2:

```
mcp__Claude_in_Chrome__find({tabId: <TAB>, query: "checkbox for video titled <TITLE>"})
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "left_click", ref: "<ref returned by find>"})
```

After each click, verify the card visually shows a checked state. The "Build hub" button at bottom should show a counter `Build hub (5)` once all 5 are picked.

- [ ] **Step 5: Click "Build hub" and configure the project**

```
mcp__Claude_in_Chrome__find({tabId: <TAB>, query: "Build hub button"})
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "left_click", ref: "<ref>"})
```

On the configure form fill:
- Title: `Richer-content validation — <YYYY-MM-DD>`
- Audience: `pipeline validation on real long-form content`
- Tone: `Conversational`
- Length preset: `Standard`
- Template: `Editorial Atlas`

Submit.

- [ ] **Step 6: Land on /app/checkout**

After submit you should be redirected to `https://creatorcanon-saas.vercel.app/app/checkout?projectId=<NEW_UUID>`. Capture the projectId — every subsequent step references it.

```
PROJECT_ID = <NEW_UUID>
```

Skip Task 3 (it's the Path C alternative) and go directly to Task 4.

---

## Task 3: Path C — seed audio fixtures from operator-owned media

**Purpose:** Bypass YouTube OAuth entirely. The existing `seed:audio-fixtures` script writes `video` + `mediaAsset` rows directly so the create-project flow sees fixture videos as if they came from a YouTube channel.

**Skip this task entirely if you chose Path A or B.** You should already be at `/app/checkout?projectId=…` from Task 2 Step 6.

**Files:** modifies DB rows only via the existing seed script. No source files touched.

- [ ] **Step 1: Inspect the existing seed script's expected input shape**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
head -60 packages/pipeline/src/seed-audio-fixtures.ts
```

Expected: an array constant near the top declaring `FIXTURE_VIDEOS` with fields like `videoId`, `title`, `audioPath`, `durationSeconds`. Note the exact field names — Step 2 patches just that constant via env override (the script supports an `AUDIO_FIXTURES_JSON` env var; if it doesn't, you'll fall back to editing the array in place and reverting after the run).

- [ ] **Step 2: Build the JSON for your 5 audio files**

For each of the 5 audio files from Task 0 Step 2:

```bash
node -e '
const files = [
  { path: "C:/abs/path/episode-1.m4a", title: "Episode 1 — title", durationSeconds: 720 },
  { path: "C:/abs/path/episode-2.m4a", title: "Episode 2 — title", durationSeconds: 840 },
  // ... 5 entries total
];
console.log(JSON.stringify(files.map((f, i) => ({
  videoId: "owned-" + Date.now() + "-" + i,
  title: f.title,
  audioPath: f.path,
  durationSeconds: f.durationSeconds,
})), null, 2));
'
```

Save the printed JSON into `/tmp/audio-fixtures.json`.

- [ ] **Step 3: Run the seed**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
AUDIO_FIXTURES_JSON=/tmp/audio-fixtures.json \
  pnpm --filter @creatorcanon/pipeline seed:audio-fixtures 2>&1 | tail -20
```

Expected output (numbers vary):
```
[seed] inserted 5 video rows into "video"
[seed] inserted 5 mediaAsset rows (audio_m4a)
[seed] created videoSet xxxx-xxxx-xxxx-xxxx with 5 items
[seed] done
```

Capture the printed `videoSet` UUID — it's the input to the next step.

If the script does NOT support `AUDIO_FIXTURES_JSON`: open the file, replace the `FIXTURE_VIDEOS` constant with your 5 entries inline, run the script with no env var, then `git checkout -- packages/pipeline/src/seed-audio-fixtures.ts` after the seed completes. **Do NOT commit the inline edit.**

- [ ] **Step 4: Drive Chrome to the configure step pointing at the seeded videoSet**

```
mcp__Claude_in_Chrome__navigate({tabId: <TAB>, url: "https://creatorcanon-saas.vercel.app/app/projects/new?videoSetId=<SEEDED_UUID>"})
```

If the route doesn't accept `?videoSetId=` as a query param, instead navigate to `/app` and use the "Resume project" / "Pick from seeded library" surface — whichever exists in the current build. Then proceed with the configure form filling out exactly the same fields as Task 2 Step 5, ending up at `/app/checkout?projectId=<NEW_UUID>`.

```
PROJECT_ID = <NEW_UUID>
```

---

## Task 4: Real paid checkout (operator-only)

**Purpose:** Trigger the webhook, which dispatches to Trigger.dev prod, which the worker now consumes correctly thanks to sprint Task 2 fixes. This is the only step Claude cannot drive.

**Files:** none.

- [ ] **Step 1: Operator clicks "Pay to queue run"**

The Chrome tab is on `/app/checkout?projectId=<PROJECT_ID>`. Operator manually:

1. Click "Pay to queue run".
2. On Stripe Checkout, click "Pay without Link" if Link prompt appears.
3. Card: `4242 4242 4242 4242`
4. Expiry: `12 / 34`
5. CVC: `123`
6. Name: anything.
7. Click `Pay $29.00`.

Stripe redirects back to `/app/projects/<PROJECT_ID>`.

- [ ] **Step 2: Capture the payment intent**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
PROJECT_ID=<PROJECT_ID> pnpm --filter @creatorcanon/db exec tsx -e '
import { closeDb, desc, eq, getDb } from "@creatorcanon/db";
import { generationRun } from "@creatorcanon/db/schema";
import { loadDefaultEnvFiles } from "../pipeline/src/env-files";
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const rows = await db
    .select({ id: generationRun.id, status: generationRun.status, pi: generationRun.stripePaymentIntentId, createdAt: generationRun.createdAt })
    .from(generationRun)
    .where(eq(generationRun.projectId, process.env.PROJECT_ID!))
    .orderBy(desc(generationRun.createdAt))
    .limit(1);
  console.log(rows[0]);
  await closeDb();
})();
' 2>&1 | tail -3
```

Expected (within ~10 s of paying): a row with `status: "queued"` and `pi: "pi_3..."`. Capture both.

```
RUN_ID = <id>
PAYMENT_INTENT = pi_3...
```

If the `pi` column is still `null` after 30 s: the Stripe webhook didn't fire. Open Stripe dashboard → Developers → Webhooks → look for the latest event to `creatorcanon-saas.vercel.app/api/stripe/webhook`. Re-deliver it manually if needed.

---

## Task 5: Watch the run

**Purpose:** Confirm the dispatch happened, the worker accepted it, and stages are progressing. This time we expect Whisper + 2 OpenAI calls to actually fire (config_hash differs from any prior dev run, so artifact-reuse cache will miss).

**Files:** none.

- [ ] **Step 1: Poll DB-side run state (canonical pass condition)**

The DB tells us everything we need without depending on Trigger Management API endpoints whose existence we haven't smoke-tested:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
RUN_ID=<RUN_ID> until s=$(pnpm --filter @creatorcanon/db exec tsx -e '
import { closeDb, eq, getDb } from "@creatorcanon/db";
import { generationRun, generationStageRun } from "@creatorcanon/db/schema";
import { loadDefaultEnvFiles } from "../pipeline/src/env-files";
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const [run] = await db.select().from(generationRun).where(eq(generationRun.id, process.env.RUN_ID!)).limit(1);
  const stages = await db.select({ name: generationStageRun.stageName, status: generationStageRun.status })
    .from(generationStageRun).where(eq(generationStageRun.runId, process.env.RUN_ID!)).orderBy(generationStageRun.createdAt);
  const succ = stages.filter(s => s.status === "succeeded").length;
  const fail = stages.filter(s => s.status.startsWith("failed")).length;
  console.log(`status=${run.status} stages=${succ}/${stages.length}succ ${fail}fail`);
  await closeDb();
})();
' 2>&1 | tail -1); \
echo "$s"; \
case "$s" in *awaiting_review*|*failed*|*published*) break;; esac; \
sleep 10; done
```

Expected progression (~1–4 min wall time for 5×~10 min videos):
```
status=queued stages=0/0succ 0fail
status=queued stages=0/0succ 0fail
status=queued stages=1/1succ 0fail
status=queued stages=2/2succ 0fail
status=queued stages=4/4succ 0fail
status=awaiting_review stages=6/6succ 0fail
```

If the loop exits with `status=failed`: drop into the Trigger dashboard at `https://cloud.trigger.dev/orgs/creatorcanon-92c0/projects/creatorcanon-TEUt/env/prod/runs` (sorted by created-at) → click the most recent `run-pipeline` row → click the failed Pipeline span → read the `error` property. Common causes: OOM (raise to `large-1x`), missing env var (sprint Task 2 followup), or a stage-specific exception.

- [ ] **Step 2: (Optional) Capture the Trigger.dev run id for evidence**

For dashboard linking only — not required for the pass condition. Open `https://cloud.trigger.dev/orgs/creatorcanon-92c0/projects/creatorcanon-TEUt/env/prod/runs` in browser, find the row matching the timestamp of your run, copy the `run_cm...` URL fragment:

```
TRIGGER_RUN_ID = run_cm...
```

If you can't find it: skip this step. The DB-side proof in Step 1 is sufficient evidence.

- [ ] **Step 3: Confirm the DB row reached awaiting_review**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
RUN_ID=<RUN_ID> pnpm --filter @creatorcanon/db exec tsx -e '
import { closeDb, eq, getDb } from "@creatorcanon/db";
import { generationRun, generationStageRun } from "@creatorcanon/db/schema";
import { loadDefaultEnvFiles } from "../pipeline/src/env-files";
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const [run] = await db.select().from(generationRun).where(eq(generationRun.id, process.env.RUN_ID!)).limit(1);
  const stages = await db.select({ name: generationStageRun.stageName, status: generationStageRun.status, durationMs: generationStageRun.durationMs })
    .from(generationStageRun).where(eq(generationStageRun.runId, process.env.RUN_ID!)).orderBy(generationStageRun.createdAt);
  console.log("status="+run.status, "completedAt="+run.completedAt);
  for (const s of stages) console.log("  ", s.name, s.status, s.durationMs+"ms");
  await closeDb();
})();
' 2>&1 | tail -15
```

Expected:
```
status=awaiting_review completedAt=...
   import_selection_snapshot succeeded   ~50ms
   ensure_transcripts        succeeded   ~30000-180000ms   <-- should be >5s on real audio
   normalize_transcripts     succeeded   ~50ms
   segment_transcripts       succeeded   ~50ms
   synthesize_v0_review      succeeded   ~5000-30000ms
   draft_pages_v0            succeeded   ~5000-30000ms
```

The `ensure_transcripts` duration on real audio is the smoke test that says "we are no longer cache-hit". If that stage finishes in <500 ms again, the cache is still saving us — try a fresh run with a different config (different audience text, different length preset) to force a cache miss.

---

## Task 6: Verify cost-ledger rows

**Purpose:** Sprint Task 1 left this gap open ("0 rows for this runId, attributed to artifact-reuse cache"). Real content + cache miss should land ≥3 rows. If rows are still 0, the cost-ledger writer is broken.

**Files:** none.

- [ ] **Step 1: Read cost_ledger_entry**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
RUN_ID=<RUN_ID> pnpm --filter @creatorcanon/db exec tsx -e '
import { closeDb, desc, eq, getDb } from "@creatorcanon/db";
import { costLedgerEntry } from "@creatorcanon/db/schema";
import { loadDefaultEnvFiles } from "../pipeline/src/env-files";
loadDefaultEnvFiles();
(async () => {
  const db = getDb();
  const rows = await db.select().from(costLedgerEntry).where(eq(costLedgerEntry.runId, process.env.RUN_ID!)).orderBy(desc(costLedgerEntry.createdAt));
  console.log(`[cost-ledger] ${rows.length} rows for ${process.env.RUN_ID}`);
  let total = 0;
  for (const r of rows) {
    const cents = Number(r.costCents);
    total += cents;
    console.log(`  ${r.stageName} / ${r.provider} / ${r.model} costCents=${r.costCents} tokens=${r.inputTokens}/${r.outputTokens} videoSec=${r.inputSecondsVideo}`);
  }
  console.log(`[cost-ledger] total=$${(total/100).toFixed(4)}`);
  await closeDb();
})();
' 2>&1 | tail -20
```

Expected ≥3 rows, e.g.:
```
[cost-ledger] 3 rows for <RUN_ID>
  draft_pages_v0       / openai / gpt-4o-mini  costCents=0.0432  tokens=2400/600    videoSec=null
  synthesize_v0_review / openai / gpt-4o-mini  costCents=0.0825  tokens=4500/900    videoSec=null
  ensure_transcripts   / openai / whisper-1    costCents=18.0000 tokens=null/null   videoSec=3000
[cost-ledger] total=$0.1813
```

Gate criteria:
- **Pass:** `≥3 rows`, `total cost > $0` (typically $0.10–$1.00 for 5×~10-min videos), Whisper row's `inputSecondsVideo` matches the audio length you fed in.
- **Soft fail (cache hit):** `0 rows` AND stages all show ~50 ms durations from Task 5 Step 3 — means the artifact-reuse cache short-circuited again. Re-run with deliberately different config (different audience field) and recheck.
- **Hard fail:** `0 rows` AND stages took real time (Whisper >5 s) — means `recordCost()` is silently failing. Open `cost-ledger/src/index.ts` (per closing-sprint Task 8 commit `54ccd74`) and check the try/catch is logging. Investigate before continuing.

- [ ] **Step 2: Note the actual cost**

Add to your Task 0 evidence note:
```
ACTUAL_COST_USD: $0.18  # whatever total prints
COST_LEDGER_ROW_COUNT: 3
WHISPER_AUDIO_SECONDS: 3000
```

---

## Task 7: Eyeball the review draft + draft pages

**Purpose:** Numbers say "the chain runs." This step says "the output is good enough to show a real beta creator without embarrassment."

**Files:** none.

- [ ] **Step 1: Open the review artifact**

```
mcp__Claude_in_Chrome__navigate({tabId: <TAB>, url: "https://creatorcanon-saas.vercel.app/app/projects/<PROJECT_ID>/review"})
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "screenshot", save_to_disk: true})
```

Eyeball the screenshot for:
- Each video has a coherent summary paragraph (not gibberish, not just keywords).
- Per-video segments map to actual moments in the video (compare timestamps to the actual content if you have time).
- "Suggested page topics" reads like a knowledge-hub TOC (not a transcript dump).

**Quality gate:** if any of those three is missing, the synth prompt has degraded. Note it; do NOT block the plan, but write a followup.

- [ ] **Step 2: Open the draft pages**

```
mcp__Claude_in_Chrome__navigate({tabId: <TAB>, url: "https://creatorcanon-saas.vercel.app/app/projects/<PROJECT_ID>/pages"})
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "screenshot", save_to_disk: true})
```

Expected: ≥1 `<article data-testid="page-version-block">` (added in closing-sprint Task 9 commit `6cb5800`). Each card has title, summary, sections list with source-moment counts.

**Quality gate:** `pages.length >= 1` is the bar set by sprint Task 1. For 5 substantive videos, expect 1–3 pages; if 0, the `draft_pages_v0` stage's output didn't pass `draftPagesV0StageOutputSchema.safeParse()`. Drop into Trigger dashboard run logs.

- [ ] **Step 3: Read the on-screen text and capture 2 quotes**

For the Task 10 evidence:

```
SAMPLE_PAGE_TITLE:    "<actual title from the first card>"
SAMPLE_SECTION_TITLE: "<actual section title from inside that card>"
PAGES_COUNT:          <number of cards>
APPROVED_COUNT:       <number with "Ready" badge — usually 0 on first run>
```

---

## Task 8: Make one real edit

**Purpose:** Sprint Task 9 wrote a Playwright spec for this but skipped CI execution (needs dev DB). Driving it manually proves the same path works on real content.

**Files:** none.

- [ ] **Step 1: Pick a page card, edit the title**

```
mcp__Claude_in_Chrome__find({tabId: <TAB>, query: "first page version block"})
```

Inside the returned ref, find the title input and "Save title" button. Drive:

```
mcp__Claude_in_Chrome__form_input({tabId: <TAB>, ref: "<title input ref>", value: "Richer-content edit smoke 2026-04-25"})
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "left_click", ref: "<save-title button ref>"})
```

- [ ] **Step 2: Hard reload + verify persistence**

```
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "wait", duration: 2})
mcp__Claude_in_Chrome__navigate({tabId: <TAB>, url: "https://creatorcanon-saas.vercel.app/app/projects/<PROJECT_ID>/pages"})
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "wait", duration: 2})
mcp__Claude_in_Chrome__find({tabId: <TAB>, query: "title input value Richer-content edit smoke"})
```

Expected: the input value matches `Richer-content edit smoke 2026-04-25` after the reload (not optimistic UI — actual DB persistence).

- [ ] **Step 3: Restore original title**

(Idempotency hygiene — the same project might be reused.) Reopen the input and `form_input` it back to the original from Task 7 Step 3. Save again.

---

## Task 9 (OPTIONAL): Publish the hub

**Purpose:** Captures the public hub URL + the Resend "hub published" email so we have proof the publish-side surface works on real content. Skip if you don't want a public preview live.

**Files:** none.

- [ ] **Step 1: Click "Publish preview now"**

```
mcp__Claude_in_Chrome__navigate({tabId: <TAB>, url: "https://creatorcanon-saas.vercel.app/app/projects/<PROJECT_ID>"})
mcp__Claude_in_Chrome__find({tabId: <TAB>, query: "Publish preview now button"})
mcp__Claude_in_Chrome__computer({tabId: <TAB>, action: "left_click", ref: "<button ref>"})
```

Wait ~5 s. Page should refresh with an "Open hub" button.

- [ ] **Step 2: Capture the public hub URL**

```
mcp__Claude_in_Chrome__find({tabId: <TAB>, query: "Open hub link"})
```

The href looks like `/h/<subdomain>`. The full public URL is `https://creatorcanon-saas.vercel.app/h/<subdomain>`. Capture:

```
PUBLIC_HUB_URL: https://creatorcanon-saas.vercel.app/h/<subdomain>
```

- [ ] **Step 3: Visit the public hub anonymously**

```
mcp__Claude_in_Chrome__tabs_create_mcp({})
# in the new tab:
mcp__Claude_in_Chrome__navigate({tabId: <NEW_TAB>, url: "<PUBLIC_HUB_URL>"})
mcp__Claude_in_Chrome__computer({tabId: <NEW_TAB>, action: "screenshot", save_to_disk: true})
```

Expected: the hub renders without a sign-in prompt (it's a public read-only page). Pages list visible. The screenshot is part of evidence.

- [ ] **Step 4: Confirm the Resend "hub published" email arrived**

Open `mariosdemosthenous11@gmail.com` (operator inbox). Look for an email from the Resend sender (sprint Task 5 + Task 9 wired this — `apps/web/src/app/app/projects/[id]/publish.ts:59`). Subject contains the hub title.

Capture:

```
PUBLISH_EMAIL_ARRIVED: yes | no | "skipped because Step 1 was skipped"
```

If "no": check Resend dashboard for failed deliveries. The publish action's email is wrapped in try/catch and won't block the publish itself, so the hub is still up.

---

## Task 10: Record the evidence

**Purpose:** Make this run discoverable from the closing-sprint plan so future operators see "MVP was validated on fixtures AND on real content." Plain-English block, paste-ready.

**Files:**
- Modify: `docs/superpowers/plans/2026-04-24-launch-readiness-closing-sprint.md` — append a new top-level section after Task 10 (so the sprint plan stays a coherent record).

- [ ] **Step 1: Open the closing-sprint plan**

Find the line that ends the file (after Task 10). Append the new section directly before the file ends.

- [ ] **Step 2: Append the evidence section**

Add exactly this block (filling in your captured values from Tasks 0, 4, 5, 6, 7, 9):

```markdown
---

## Task 11 (post-sprint): Richer-content validation ✅ DONE 2026-04-25

Second proof point alongside the fixture-based Task 1 record. Same chain,
real content, no code changes. Plan: `2026-04-25-richer-content-pipeline-validation.md`.

**Setup**
- `path`: A | B | C
- `channel_owner`: <gmail>
- `channel_url`: <url or "n/a">
- `consent_artifact`: self | screenshot at <path> | "Path C — own audio"
- `videos_count`: 5
- `total_audio_minutes`: <N>
- `expected_cost_usd`: $<estimate>

**Run identifiers**
- `validationProjectId`: <PROJECT_ID>
- `validationRunId`: <RUN_ID>
- `paymentIntentId`: <PAYMENT_INTENT>
- `triggerRunId`: <TRIGGER_RUN_ID> on worker `v20260424.9`

**Pipeline result**
- Final status: `awaiting_review`
- Stages: 6/6 succeeded
- `ensure_transcripts` durationMs: <N>  (sanity: should be > 5000 on real audio)
- Pipeline total durationMs (Trigger): <N>

**Cost-ledger** (the gap Task 1 left open)
- `cost_ledger_entry` rows for this runId: <N>
- Total recorded: $<N>
- `whisper_audio_seconds`: <N>

**Output quality**
- `pages_count`: <N>
- `approved_count`: <N>
- Sample page title: "<title>"
- Sample section title: "<title>"

**Edit-then-publish**
- Edit landed via /app/projects/.../pages: yes
- (Optional) Public hub: <PUBLIC_HUB_URL or "skipped">
- (Optional) Publish email arrived: yes | no | "skipped"

**Followups discovered (if any)**
- <only fill in if Task 7 quality gate or Task 6 hard-fail surfaced something. If clean, write "none">
```

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git add docs/superpowers/plans/2026-04-24-launch-readiness-closing-sprint.md
git commit -m "docs(plan): record richer-content validation (Task 11 post-sprint)

Second end-to-end proof point on the existing chain — real
long-form content, real Whisper + OpenAI calls, real cost-ledger
rows. Plan at 2026-04-25-richer-content-pipeline-validation.md.

triggerRunId <run_...> on worker v20260424.9, total cost $<...>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Sanity-check the closing-sprint table of contents**

```bash
grep -n "^## " docs/superpowers/plans/2026-04-24-launch-readiness-closing-sprint.md | tail -5
```

Expected: the new `Task 11 (post-sprint)` heading shows up.

---

## Self-review (run before declaring complete)

- [ ] **Q1:** Did `cost_ledger_entry` actually get rows for this run?
  - Yes → MVP cost-tracking is proven end-to-end on real content.
  - No → file a fix plan; do not invite beta creators yet.

- [ ] **Q2:** Did `ensure_transcripts` durationMs exceed ~5 s?
  - Yes → cache miss confirmed, real Whisper ran.
  - No → cache hit; rerun with a different config_hash before declaring done.

- [ ] **Q3:** Did the draft pages render readable, non-gibberish content?
  - Yes → quality bar met.
  - No → log a followup; don't invite beta creators on this output.

- [ ] **Q4:** If Task 9 was run, did the public hub render anonymously?
  - Yes → publish surface validated on real content.
  - No → rollback (delete the hub via `/app/admin/runs` if it's broken-looking) and log a followup.

If all four are green: this plan is done. Stop. Return to the closing-sprint plan and finish Task 3 + Task 10 with the beta creators.

---
