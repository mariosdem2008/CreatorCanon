# Resume Handoff — Hub Editorial Polish (post quota block)

**One-click resume guide.** Everything you need to finish the editorial-polish plan
(`docs/superpowers/plans/2026-04-29-hub-editorial-polish.md`) once your API quotas
are restored. No assumed memory of the prior session.

---

## TL;DR

- **All upstream pipeline output is preserved in DB** (transcripts, channel_profile,
  VICs, canon_nodes, page_briefs). Only `page_composition + page_quality + adapt`
  need to re-run.
- **All editorial-polish code fixes shipped to git.** 7 commits between
  `1b57800` (plan committed) and `b98b057` (last fix). Branch
  `feat/hub-pipeline-workbench-v2` in worktree
  `C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2`.
- **What's blocking:** OpenAI tier (gpt-5.5 + gpt-5.4) AND Gemini free tier are
  ALL returning 429. Last 4 dispatch attempts failed at the page_composition
  stage on the very first Strategist call (or after 2-3 pages).
- **What you need to do:** Top up OpenAI billing (or wait for tier reset), wait
  for Gemini's daily quota window to roll over, then run the single command
  block below. ~25 min and you're done.

---

## Critical IDs (memorize these)

```
RUN          = 97e8772c-07e3-4408-ba40-0a17450f33cf
WORKSPACE    = e1ad6446-d463-4ee9-9451-7be5ac76f187
PROJECT      = bd8dfb10-07cc-48a8-b7bc-63e38c6633b4
HUB          = 4f83bf07-2574-483b-a17e-882190d34339
SUBDOMAIN    = ai-ultimate-knowledge-hub
WORKTREE     = C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2
BRANCH       = feat/hub-pipeline-workbench-v2
```

The 2 source videos for this run:

```
mu_9d970d091c38 — "Yo, yo, yo, what up, what up, what up"
mu_e0787f2f4a95 — "This is one of the most important automations you can have for your business"
```

---

## What's currently in DB (preserved through page_briefs stage)

| Stage | Output | Status | Re-run needed? |
|---|---|---|---|
| `import_selection_snapshot` | video_set frozen | ✅ done | NO (cache hits) |
| `ensure_transcripts` | transcripts written | ✅ done | NO |
| `normalize_transcripts` | cleanup applied | ✅ done | NO |
| `segment_transcripts` | 78 segments (45 + 33) | ✅ done | NO |
| `channel_profile` | 1 row, creatorName="Duncan" | ✅ done | NO |
| `visual_context` | 1 visual moment | ✅ done | NO |
| `video_intelligence` | 2 VICs (~13 mainIdeas, 6 frameworks, 12 lessons, 10 examples, 13 mistakes, 13 quotes total) | ✅ done | NO |
| `canon` | 12 nodes (3 frameworks, 2 principles, 2 lessons, 2 definitions, 1 playbook, 1 tactic, 1 quote) | ✅ done | NO |
| `page_briefs` | 8 briefs | ✅ done | NO |
| `page_composition` | 0 rows (cleared by reset) | **PENDING** | YES |
| `page_quality` | 0 rows | **PENDING** | YES |
| `adapt` | stale R2 manifest | **PENDING** | YES |

The hub at `http://localhost:3003/h/ai-ultimate-knowledge-hub` is currently
serving release `952cee5d-8b32-443e-8797-d9f81d116a87` from the audit session
(~12h ago). It does NOT yet show the editorial polish: "Chat2BT" still appears
in source moments, "Untitled" video labels, no internal source links, BPG has
no hypothetical_example.

---

## All commits since the editorial-polish plan was written

```
b98b057  fix(critic): degrade gracefully when output fails JSON/Zod parse
2ad6654  fix(strategist): drop invalid artifact kinds + sharpen prompt disambiguation
8730245  feat(prompts): require hypothetical_example on flagship build pages
5947ab2  feat(hub): source-moment cards link to internal source route when youtubeId is null
0f45cbb  feat(scripts): backfill null titles on manual-upload videos
675199a  feat(transcript): sanitize segment text at agent + citation read sites
e196825  feat(transcript): sanitizeTranscriptText helper for Whisper transcription errors
1b57800  docs(plan): hub editorial polish — close 4 gaps from dual-POV audit
```

(Plan baseline = `1b57800`. Range to review: `git log 1b57800..HEAD`.)

DB-side work that already landed:
- The 2 manual-upload videos now have non-null `title` columns (Task 3 ran with `--apply`).

---

## What's blocking

```
gpt-5.5         → 429 You exceeded your current quota
gpt-5.4         → 429 You exceeded your current quota   (fallback for gpt-5.5)
gemini-2.5-pro  → 429 quota: 0                          (last fallback)
gemini-2.5-flash→ rate-limited intermittently (already promoting to gpt-5.4 successfully)
```

**Order to fix:**
1. **OpenAI billing** — log in to <https://platform.openai.com/account/billing>
   and either (a) top up credits or (b) confirm a paid plan is active. The
   429 message says "exceeded your current quota" which usually means the
   monthly cap on a tier or a usage-limit you set on the dashboard.
2. **Gemini** — daily free-tier quota typically resets ~24h from when it was
   first hit. If you have a paid Gemini API key, switch the env var. Otherwise
   just wait. We don't strictly need Gemini if OpenAI is healthy (premium mode
   below uses zero Gemini calls).
3. **Optional: Neon DB connectivity** — earlier this session, port 5432 to Neon
   was being blocked by an active VPN. If you see CONNECT_TIMEOUT errors:
   deactivate the VPN, the DB stays online.

---

## ONE-CLICK RESUME — copy this entire block when quotas are restored

This block does: confirm DB connectivity → reset only the 3 downstream stages
→ re-dispatch in **production_economy** mode (Gemini + OpenAI mix; cheaper) →
re-publish → run all 4 acceptance checks → tag if pass.

If OpenAI quota is fine but Gemini is still down, change
`PIPELINE_QUALITY_MODE=production_economy` to `PIPELINE_QUALITY_MODE=premium`
in the dispatch step (every author on gpt-5.5 only, ~3× cost, no Gemini).

```bash
# 0. Sanity: are we on the right worktree + branch?
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git status --short
git rev-parse --abbrev-ref HEAD   # must say feat/hub-pipeline-workbench-v2
git log --oneline -1              # must end with b98b057 (or later if you committed more)

# 1. Sanity: DB reachable?
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db"
node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT status FROM generation_run WHERE id = '97e8772c-07e3-4408-ba40-0a17450f33cf'\`.then(r=>{console.log('OK, run status:',r[0].status);process.exit(0)}).catch(e=>{console.log('FAILED:',e.message);process.exit(1)});
"
# Expected: 'OK, run status: failed' (or 'queued' if you already reset)

# 2. Reset only downstream stages (page_composition, page_quality, adapt).
# Upstream stages are preserved and will cache-hit.
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db"
node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1});
(async()=>{
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`DELETE FROM page_quality_report WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page_version WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM generation_stage_run WHERE run_id = \${RUN} AND stage_name IN ('page_composition','page_quality','adapt')\`;
  await sql\`UPDATE generation_run SET status = 'queued', started_at = NULL, completed_at = NULL WHERE id = \${RUN}\`;
  console.log('reset complete');
  await sql.end();
})();
"
# Expected: 'reset complete'

# 3. Re-dispatch the 3 remaining stages. Roughly 25 min in production_economy.
# If Gemini quota still 0, change to PIPELINE_QUALITY_MODE=premium.
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline"
PIPELINE_CONTENT_ENGINE=canon_v1 PIPELINE_QUALITY_MODE=production_economy \
  ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts 97e8772c-07e3-4408-ba40-0a17450f33cf
# Expected (last lines):
#   [dispatch] complete {
#     runId: '97e8772c-07e3-4408-ba40-0a17450f33cf',
#     pageCount: 8,
#     manifestR2Key: 'workspaces/.../adapt/manifest.json'
#   }

# 4. Verify all 8 stages succeeded + see the cost.
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db"
node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1});
(async()=>{
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  const r=await sql\`SELECT status FROM generation_run WHERE id = \${RUN}\`;
  console.log('run status:', r[0].status);
  const sr=await sql\`SELECT stage_name, status, output_json->>'costCents' AS c FROM generation_stage_run WHERE run_id = \${RUN} ORDER BY started_at\`;
  let total=0;for(const row of sr){const c=Number(row.c||0);total+=c;console.log(String(row.stage_name).padEnd(22)+(row.status||'?').padEnd(11)+c.toFixed(2));}
  console.log('TOTAL '.padEnd(34)+total.toFixed(2)+' cents = $'+(total/100).toFixed(2));
  await sql.end();
})();
"
# Expected: 'run status: awaiting_review' and every stage 'succeeded'.

# 5. Wipe the stale release pointer + re-publish.
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db"
node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1});
(async()=>{
  const HUB='4f83bf07-2574-483b-a17e-882190d34339';
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`UPDATE hub SET live_release_id = NULL WHERE id = \${HUB}\`;
  await sql\`DELETE FROM release WHERE hub_id = \${HUB} AND run_id = \${RUN}\`;
  console.log('release cleared');
  await sql.end();
})();
"
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline"
./node_modules/.bin/tsx ./src/publish-now.ts 97e8772c-07e3-4408-ba40-0a17450f33cf
# Expected: '[publish] complete' with a new releaseId (call it $NEW_RELEASE_ID)

# 6. Acceptance check #1 — Chat2BT scrubbed from source moments.
# (Requires the dev server to be running; see "Dev server" section below.)
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub" --max-time 30 | grep -oE 'Chat2BT' | head -3
# Expected: NO matches.

# 7. Acceptance check #2 — Real video titles instead of "Source N".
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub" --max-time 30 | grep -oE 'class="line-clamp-1[^"]*">[^<]+' | head -8
# Expected: real titles like "This is one of the most important automations..."
# NOT "Source 1" / "Source 2" ordinals.

# 8. Acceptance check #3 — Internal source links for manual-upload videos.
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub" --max-time 30 | grep -oE 'href="/h/ai-ultimate-knowledge-hub/sources/mu_[^"]+"' | head -3
# Expected: at least 2 internal source links with ?t=<n> query param.

# 9. Acceptance check #4 — Hypothetical example on Business Proposal Generator.
curl -sS "http://localhost:3003/h/ai-ultimate-knowledge-hub/pages/pg-7d517d808e" --max-time 30 | grep -oE 'Worked example|Hypothetical example|hypothetical_example' | head -3
# Expected: at least one match.
# IF still missing AND the diagnose-hypothetical-example.ts script confirms the
# strategist still skipped HE for BPG, capture the finding and ship as-is.

# 10. If all 4 acceptance checks pass: tag.
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git tag canon-v1-authors-studio-shipped
git push origin canon-v1-authors-studio-shipped
```

---

## Dev server — how to bring it up

```bash
# The worktree's apps/web needs its own .env.local (Next.js loads it from
# apps/web/, not the workspace root). One-time setup, already done in the
# previous session — verify the file exists:
ls -la "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web/.env.local"
# If missing, copy from main:
# cp "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/apps/web/.env.local" \
#    "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web/.env.local"

# Make sure no other process is on port 3003.
# Then start the dev server in a separate terminal:
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web"
./node_modules/.bin/next dev --port 3003

# Wait for "Ready" log line. Hub URL: http://localhost:3003/h/ai-ultimate-knowledge-hub
```

The main workspace's dev server may also run on port 3000 or 3001. **Use 3003
specifically** to ensure you're testing the worktree's code (which has the
editorial-polish fixes). The main workspace doesn't have these fixes.

---

## If something fails during the resume

### Failure: `dispatch-queued-run` exits early with `DATABASE_URL is not set`

The worktree's `.env` file is missing. Fix:
```bash
cp "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.env" \
   "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/.env"
```

### Failure: dispatch dies with ZodError "kind: 'checklist'" or similar

You're not on the latest commit. Run:
```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git log --oneline -1   # should be b98b057 or later
```
If the last commit is older, this resume guide doesn't apply.

### Failure: dispatch dies with critic JSON parse error

Same as above — you need at least `b98b057` (the critic graceful-degradation
fix).

### Failure: re-publish complains "manifest schema editorial_atlas_v1 not v2"

The `adapt` stage didn't actually run. Check `generation_stage_run` — if `adapt`
status is not `succeeded`, the dispatch was killed before it finished. Re-run
the dispatch step.

### Failure: hub URL serves a 500

Check the dev server log; the most common cause is a missing `.env.local` or
a DATABASE_URL the server can't reach.

### Failure: hub still shows "Chat2BT" after re-publish

The Phase A sanitization in commit `675199a` cleans at READ time (segment
projection into agent prompts + citation excerpts). For the existing run,
the only place a leak survives is if you re-published the OLD release. Confirm
the new release ID is what `hub.live_release_id` points to:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db"
node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT subdomain, live_release_id FROM hub WHERE id = '4f83bf07-2574-483b-a17e-882190d34339'\`.then(r=>{console.log(r);process.exit(0)});
"
```

If the live_release_id is `952cee5d-...` (the old audit-era release), the new
publish didn't run or didn't promote. Re-run step 5 above.

### Failure: Neon DB CONNECT_TIMEOUT on port 5432

VPN is blocking the port. Deactivate VPN. (HTTPS to Neon API works; only
Postgres protocol port is blocked when VPN is on.)

---

## What's deferred

These are NOT in the editorial polish plan and don't block tagging:

1. **R2 client typecheck errors** in `packages/adapters/src/r2/client.ts` —
   Buffer/Uint8Array variance from a `@types/node` upgrade. Pre-existing on
   `main`. Side-tracked earlier this session.
2. **`@sentry/utils` missing on the studio route** — `apps/web/src/app/app/...`
   throws at runtime in the worktree because pnpm install didn't pull
   `@sentry/utils`. Doesn't affect hub routes (`/h/...`). Run
   `pnpm install` in the worktree to fix.
3. **Workbench artifact bodies sometimes duplicate the page roadmap** —
   surfaced in the editorial audit but deferred. Not in the plan.
4. **No clickable timestamp link from inline citations to source moments** —
   surfaced in the audit but deferred. The `safeCitationHref` path in
   `_SectionCitationFooter` etc. could be plumbed through `resolveSourceMomentHref`,
   but the v2 fallback in this plan only fixed the Source Moments cards section,
   not inline citations.

---

## Plan + audit references (reading order if you forgot context)

1. `docs/superpowers/specs/2026-04-28-authors-studio-with-specialists-design.md`
   — original Author's Studio design (way back).
2. `docs/superpowers/plans/2026-04-28-authors-studio-with-specialists.md`
   — original Author's Studio implementation plan (28 tasks, all shipped).
3. `docs/superpowers/HANDOFF-2026-04-28-authors-studio-codex.md`
   — Claude→Codex handoff after the original Author's Studio work.
4. `docs/superpowers/plans/2026-04-28-hub-template-transformation.md`
   — template transformation plan (executed in main workspace by Codex).
5. `docs/superpowers/plans/2026-04-28-hub-pipeline-workbench-transformation.md`
   — pipeline transformation plan that built v2 (executed in this worktree by Codex,
     ending at `844eb86`).
6. `docs/superpowers/plans/2026-04-29-hub-editorial-polish.md` — **this plan**,
   surfaced by the dual-POV audit and currently 5/6 tasks done; Task 6 is what
   you're resuming.

---

## Final checklist before you stop reading

- [ ] OpenAI billing top-up confirmed
- [ ] Gemini quota window confirmed (or accept premium-mode cost)
- [ ] VPN off (or confirmed not blocking port 5432)
- [ ] `cd .worktrees/hub-pipeline-workbench-v2` and `git log -1` shows `b98b057` or later
- [ ] Dev server on 3003 is running (or you're OK to skip browser acceptance and just verify via SQL)
- [ ] Run the One-Click block above

After tag pushed, this worktree is "done" for the editorial polish work. Open
a PR from `feat/hub-pipeline-workbench-v2` into `main` (or whatever your
base branch is). The two regression fixes — `2ad6654` and `b98b057` — are
hardening that should land regardless of acceptance.
