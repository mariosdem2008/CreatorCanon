# Handoff: Author's Studio + Specialists — Codex Continuation

**Date written:** 2026-04-28 (during /loop session that ran out of context)
**Branch:** `main`
**Plan:** `docs/superpowers/plans/2026-04-28-authors-studio-with-specialists.md`
**Spec:** `docs/superpowers/specs/2026-04-28-authors-studio-with-specialists-design.md`
**Repo root:** `C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS`

---

## Status: 13 / 14 task batches complete

| # | Task batch | Status | Commits |
|---|---|---|---|
| 1 | A1 — Voice config UI + DB backfill | ✅ done | `1c4018a`, `7c03ff0` |
| 2 | A2 — Manifest schema (3 new block kinds) | ✅ done | `7bec723` |
| 3 | A3 — Author's Studio shared types | ✅ done | `3c6da5c` |
| 4 | B1–B3 — Renderer components (Diagram/Roadmap/HypotheticalExample) | ✅ done | `65bb33a`, `97226d0`, `3d8dd34` |
| 5 | B4 — Section dispatcher wiring | ✅ done | `59b66c7` |
| 6 | C1+C2 — Upstream prompt + Zod schema upgrades | ✅ done | `50a0b30`, `3333b1d` |
| 7 | D1–D9 — Register 7 agents + 7 prompts + 7 specialists | ✅ done | `04cc66e`–`5a61b4a` (9 commits) |
| 8 | E1+E2 — Helpers (mermaid-validate + grounding) | ✅ done | `5d43692`, `99d28e8`, `6a638ac` |
| 9 | E3+E4 — Strategist + 5 specialist runners | ✅ done | `9ef80cf`, `5dc7b20` |
| 10 | E5+E6 — Critic + revise pass | ✅ done | `bde86e8`, `9f25d9b` |
| 11 | E7 — assembleBlockTree | ✅ done | `c1ee252` |
| 12 | E8 — runPageCompositionStage rewrite | ✅ done | `f6a8236` |
| 13 | F1 — Adapter passthrough | ✅ done | `c8a77f5` |
| 14 | **G1 — End-to-end smoke verification** | 🟡 **in flight** | (no commits yet) |

**30 commits total** since the plan was committed (`72ee014..c8a77f5`). All `packages/pipeline` typecheck clean, 47/47 unit tests passing.

---

## What the new system does

This redesign replaces the hollow "page_writer → 3 generic stubs" path with a coordinated multi-agent **Author's Studio** that produces editorial-grade pages.

### Pipeline shape (canon_v1, post-redesign)
```
channel_profile → visual_context → video_intelligence → canon → page_briefs
  → page_composition (NEW Author's Studio) → page_quality → adapt
```

### Inside `page_composition` per page (the Author's Studio)
1. **Strategist** (`runStrategist`) — reads brief + canon nodes + sibling briefs + voiceMode → emits `PagePlan` (thesis + arc + voiceNotes + chosen artifact kinds + sibling references).
2. **Specialists in parallel** (`Promise.all`) — only the kinds the Strategist requested fire:
   - `runProseAuthor` → `cited_prose` (4–8 paragraphs, every paragraph cites segmentIds)
   - `runRoadmapAuthor` → `roadmap` (3–7 verifiable steps)
   - `runExampleAuthor` → `hypothetical_example` (named protagonist + steps + numeric outcome)
   - `runDiagramAuthor` → `diagram` (Mermaid src; server-validated; one auto-retry on parse fail; null on second fail)
   - `runMistakesAuthor` → `common_mistakes` (3–5 mistake/why/correction items)
3. **Critic** (`runCritic`) — emits revision notes (severity: critical | important | minor) with concrete prescriptions.
4. **Revise pass** (`runRevisePass`) — re-authors only artifacts with notes; single iteration; notes injected into `channelProfilePayload._revisionNotes` (the LLM picks them up because the user message embeds the channel profile JSON).
5. **Assembler** (`assembleBlockTree`) — deterministic stitching:
   - prose paragraph #1 → `overview` block
   - prose paragraphs #N>1 → `paragraph` blocks
   - roadmap → `roadmap` block
   - hypothetical_example → `hypothetical_example` block
   - diagram → `diagram` block
   - mistakes → `common_mistakes` block
   - drops citationIds that don't resolve to valid segments (per-block); drops the entire block if zero valid cites remain.
6. **Persist** — inserts `page` row + `pageVersion` row with `blockTreeJson`.

### Voice mode
- New project config field `voiceMode`: `'creator_first_person' | 'reader_second_person'` (default = reader_second_person, retroactively backfilled via `0010_voice_mode_backfill.sql`).
- Threaded into every Strategist/Specialist/Critic call via `PagePlan.voiceMode`.
- Surfaced as a radio in the configure page (uses existing `ChoiceGroup<V>` component for visual parity).

### Cost target
~$3.70 per 5h hub (vs $1.50 in the pre-redesign hollow output). The actual run is what G1 step 3 verifies.

### Quality preset routing (`PIPELINE_QUALITY_MODE`)
- `lean` — every Author's Studio agent stays Gemini (cheap)
- `production_economy` — strategist/prose/example/critic on `gpt-5.5`, diagram on `gpt-5.4`, roadmap/mistakes on `gemini-2.5-flash` (the recommended default for the canon_v1 project)
- `premium` — every author on `gpt-5.5`

---

## Key files for orientation

### New code (Author's Studio)
```
packages/pipeline/src/authors-studio/
  types.ts                          # PagePlan, ArtifactBundle, VoiceMode, etc.
  strategist.ts                     # runStrategist
  critic.ts                         # runCritic
  revise.ts                         # runRevisePass
  assembler.ts                      # assembleBlockTree (deterministic)
  mermaid-validate.ts               # regex-based syntactic sanity check (no DOM)
  grounding.ts                      # collectAllCitationIds, voiceConsistencyScore
  specialists/
    _runner.ts                      # shared SpecialistContext + runSpecialist helper
    prose.ts, roadmap.ts, example.ts, diagram.ts, mistakes.ts
  test/
    grounding.test.ts (4/4 pass)
    mermaid-validate.test.ts (4/4 pass)
    assembler.test.ts (3/3 pass)
```

### New prompts (in `packages/pipeline/src/agents/specialists/prompts.ts`)
`PAGE_STRATEGIST_PROMPT`, `PROSE_AUTHOR_PROMPT`, `ROADMAP_AUTHOR_PROMPT`, `EXAMPLE_AUTHOR_PROMPT`, `DIAGRAM_AUTHOR_PROMPT`, `MISTAKES_AUTHOR_PROMPT`, `CRITIC_PROMPT`. Plus extended `VIDEO_ANALYST_PROMPT` (mistakesToAvoid required + failureModes/counterCases) and extended `CANON_ARCHITECT_PROMPT` (editorial fields: whenToUse/whenNotToUse/commonMistake/successSignal/preconditions/failureModes/sequencingRationale on every canon node).

### Renderer (apps/web)
```
apps/web/src/components/hub/sections/
  DiagramBlock.tsx                  # client-only Mermaid renderer (dynamic import)
  HypotheticalExampleBlock.tsx      # amber "Worked example" callout
  RoadmapBlock.tsx                  # numbered vertical timeline
apps/web/src/components/hub/EditorialAtlas/blocks/
  SectionRenderer.tsx               # extended dispatcher with 3 new cases
apps/web/src/lib/hub/manifest/
  schema.ts                         # extended pageSectionSchema (3 new variants)
apps/web/src/app/app/configure/
  ConfigureClient.tsx               # added Voice ChoiceGroup
  actions.ts                        # narrows voiceMode + adds to hashConfig
```

### Stage rewrite
```
packages/pipeline/src/stages/page-composition.ts  # 697 → 228 lines, deterministic fallback removed
packages/pipeline/src/adapters/editorial-atlas/project-pages.ts  # 6 new passthrough cases
```

### Migration
```
packages/db/drizzle/out/0010_voice_mode_backfill.sql
packages/db/drizzle/out/meta/_journal.json  # added idx 10
```

---

## Where G1 stopped

A live re-dispatch was started against run `97e8772c-07e3-4408-ba40-0a17450f33cf` (workspace `e1ad6446-d463-4ee9-9451-7be5ac76f187`, project `bd8dfb10-07cc-48a8-b7bc-63e38c6633b4`, hub `4f83bf07-2574-483b-a17e-882190d34339`, subdomain `ai-ultimate-knowledge-hub`).

**Reset already happened** — every stage from `video_intelligence` onward was deleted; run status set back to `queued`; dispatch started with `PIPELINE_QUALITY_MODE=production_economy`.

**Last observed pipeline state** (from `generation_stage_run` query at handoff time):
```
import_selection_snapshot   succeeded
ensure_transcripts          succeeded
normalize_transcripts       succeeded
segment_transcripts         succeeded
channel_profile             succeeded   0¢
visual_context              succeeded   ?
video_intelligence          succeeded   8.23¢
canon                       succeeded   20.01¢
page_briefs                 succeeded   0.22¢
page_composition            running     ?  ← Author's Studio is mid-run on first pages
```

**Author's Studio activity observed:** strategist + parallel specialists firing (mistakes_author, roadmap_author seen retrying-then-succeeding via Gemini→gpt-5.4 fallback).

**Background dispatch process:** the original `tsx ./src/dispatch-queued-run.ts` was started in foreground via Bash `run_in_background: true` (task ID `bu1lfgjbb`), output streaming to `/tmp/canon-studio.log`. The log monitor was stopped on handoff. **The dispatch process itself may still be running** — verify before re-dispatching.

---

## Codex: how to continue

### Step 1 — Check whether the original dispatch is still alive
```bash
ps aux | grep "dispatch-queued-run" | grep -v grep
tail -50 /tmp/canon-studio.log
```

If still running:
- Wait for completion. Tail `/tmp/canon-studio.log` for `[dispatch] complete` or any unhandled error.
- Move to Step 2 once `page_composition`, `page_quality`, and `adapt` all show `succeeded` in `generation_stage_run`.

If dead but partially complete:
- Check what's done:
  ```bash
  cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db" && node -e "
  const fs=require('node:fs');for(const f of['../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
  require('postgres')(process.env.DATABASE_URL)\`SELECT stage_name, status, output_json->>'costCents' AS c FROM generation_stage_run WHERE run_id = '97e8772c-07e3-4408-ba40-0a17450f33cf' ORDER BY started_at\`.then(r=>{for(const row of r){console.log(row.stage_name.padEnd(22)+(row.status||'?').padEnd(12)+(row.c||'?'))};process.exit(0)});
  "
  ```
- If `page_composition` got partway and crashed: the stage is idempotent (deletes `pageVersion` then `page` for the run on entry) but downstream stages depend on it completing. The simplest path is re-running the dispatch — it picks up from the `queued` stage forward.
- If you need to re-dispatch from scratch (rare; only if canon is corrupted):
  ```bash
  cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db" && node -e "..." # the reset script from G1 step 1 below
  ```

### Step 2 — Verify the new pages are well-authored
After the run completes, confirm Author's Studio actually produced editorial blocks (not stubs):

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql = require('postgres')(process.env.DATABASE_URL);
(async()=>{
  const RUN = '97e8772c-07e3-4408-ba40-0a17450f33cf';
  const rows = await sql\`SELECT pv.title, jsonb_array_length(pv.block_tree_json->'blocks') AS bc, (SELECT count(*) FROM jsonb_array_elements(pv.block_tree_json->'blocks') b WHERE b->>'type' IN ('roadmap','diagram','hypothetical_example','common_mistakes')) AS rich FROM page_version pv WHERE pv.run_id = \${RUN} AND pv.is_current = true ORDER BY pv.title\`;
  for (const r of rows) console.log(\`\${r.bc} blocks (\${r.rich} rich) — \${r.title}\`);
  console.log('TOTAL pages:', rows.length);
  await sql.end();
})();
"
```
Expectation: every page has 3-7 blocks, at least one of `roadmap | diagram | hypothetical_example | common_mistakes` per page (the "rich" count), and titles are real (not "Untitled").

### Step 3 — Re-publish the hub
The existing release is stale. Wipe the live release pointer and the existing release row, then re-publish:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL);
(async()=>{
  const HUB='4f83bf07-2574-483b-a17e-882190d34339';
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`UPDATE hub SET live_release_id = NULL WHERE id = \${HUB}\`;
  await sql\`DELETE FROM release WHERE hub_id = \${HUB} AND run_id = \${RUN}\`;
  await sql.end();
})();
"

cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/packages/pipeline" && \
  ./node_modules/.bin/tsx ./src/publish-now.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tail -10
```

Expect `[publish] complete` and a new releaseId. The hub URL is `http://localhost:3000/h/ai-ultimate-knowledge-hub` (Next.js dev server must be running locally for QA).

### Step 4 — Manual QA (the smell test)
Open the hub URL. Click into 3 random pages. For each verify:
- ✓ Title is real (not "Untitled")
- ✓ Lead paragraph is teaching prose (not a stock summary)
- ✓ At least one rich block (roadmap, diagram, hypothetical_example, common_mistakes) appears
- ✓ Citations resolve in the right rail
- ✓ Voice is `reader_second_person` (you-pronoun)
- ✓ Passes "I'd be proud to publish this" smell test

If the pages still feel weak or generic:
- Inspect `generation_stage_run.output_json` for page_composition (revise iterations, critic note counts)
- Read agent transcripts at R2 path `workspaces/<ws>/runs/<run>/agents/<agent>/transcript.json`
- Re-run with `PIPELINE_QUALITY_MODE=premium` for ceiling test (every author on gpt-5.5)
- Check whether canon nodes actually have editorial fields populated (run `SELECT id, type, payload->>'whenToUse' AS w, payload->>'commonMistake' AS m FROM canon_node WHERE run_id = '...' LIMIT 10` — if `w` and `m` are NULL on most nodes, the canon_architect prompt extension didn't take effect and you'd need to re-dispatch from canon onward).

### Step 5 — Tag if QA passes
```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS"
git tag canon-v1-authors-studio-shipped
git push origin canon-v1-authors-studio-shipped
```

If QA fails: do not tag; capture specific failures in a follow-up plan at `docs/superpowers/plans/`.

---

## Things to know about the codebase

### Existing R2 typecheck noise
`packages/adapters/src/r2/client.ts` has 2 pre-existing typecheck errors (Buffer/Uint8Array variance, likely from a `@types/node` or AWS SDK upgrade). These were on `main` before this work and are unrelated. They pollute `apps/web && pnpm typecheck` but don't affect runtime. There's a spawned side-task `Fix R2 client typecheck errors` flagged for follow-up.

### Resilience pattern (don't be alarmed by Gemini errors)
The harness has a fallback chain (`packages/pipeline/src/agents/harness.ts`) that retries transient errors twice (2s, 4s) then promotes to the next entry in the agent's `fallbackChain`. Every Gemini transient error in the dispatch logs is expected — the run continues regardless. Only investigate if `[harness] X exhausted retries, no more fallbacks` appears.

### How critic notes flow into specialists during revise
The implementation injects revision notes into `channelProfilePayload._revisionNotes` before calling the specialist. The specialist's system prompt doesn't mention `_revisionNotes` by name, but the user-message template embeds the channel profile as JSON, so the LLM sees the notes and reasonably picks them up. **This is mildly hacky** — a cleaner approach would be a dedicated `# REVISION NOTES` block in the user message. If revise iterations don't visibly improve outputs, this is the place to look first.

### Diagram retry and drop semantics
`runDiagramAuthor` validates Mermaid syntax via the regex-based `validateMermaid`. On validation failure it retries once with the parse error fed back. On second failure it returns `null` and the diagram is silently dropped from the bundle (specialist runs but assembler skips the block). This is intentional — one bad diagram shouldn't fail a whole page. Watch the dispatch log for `[diagram_author] dropped after 2 parse failures` — those mean the diagram_author isn't capable of producing valid Mermaid for that canon material; consider whether the Strategist should have requested it.

### File map at a glance
- `apps/web/src/app/app/configure/ConfigureClient.tsx` — Voice radio (line ~100-141)
- `apps/web/src/lib/hub/manifest/schema.ts` — page section discriminated union (3 new variants at lines 32-56)
- `packages/pipeline/src/agents/specialists/prompts.ts` — all 7 new prompts at the bottom
- `packages/pipeline/src/agents/specialists/index.ts` — 7 new specialist registrations
- `packages/pipeline/src/agents/providers/selectModel.ts` — 7 new agents in REGISTRY + QUALITY_PRESETS
- `packages/pipeline/src/authors-studio/` — entire new subsystem
- `packages/pipeline/src/stages/page-composition.ts` — wholly rewritten (228 lines)
- `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts` — `mapComposerBlockToRendererSection` extended with 6 passthrough cases (lines ~150-210)

### Test commands
```bash
# All Author's Studio + selectModel + cost-tracking tests in one go
cd packages/pipeline && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test \
  src/agents/test/cost-tracking.test.ts \
  src/agents/providers/test/selectModel.test.ts \
  src/agents/providers/test/selectModel.modes.test.ts \
  src/agents/providers/test/selectModel.quality.test.ts \
  src/authors-studio/test/grounding.test.ts \
  src/authors-studio/test/mermaid-validate.test.ts \
  src/authors-studio/test/assembler.test.ts 2>&1 | tail -10
```
Expected: `pass 47 fail 0`.

### Working tree state
Clean except for an unrelated dirty file:
```
 M apps/web/src/styles/globals.css   # untouched by this work; predates the session
```

---

## Critical IDs (handy for queries)

```
RUN          = 97e8772c-07e3-4408-ba40-0a17450f33cf
WORKSPACE    = e1ad6446-d463-4ee9-9451-7be5ac76f187
PROJECT      = bd8dfb10-07cc-48a8-b7bc-63e38c6633b4
HUB          = 4f83bf07-2574-483b-a17e-882190d34339
SUBDOMAIN    = ai-ultimate-knowledge-hub
PLAN_BASE_SHA = 72ee014  (last commit before any of this work)
HEAD         = c8a77f5  (F1 — last work commit)
```

---

## Open known issues / follow-ups

1. **R2 client typecheck errors** (out of scope, pre-existing). Side-task spawned. Track separately.
2. **`hashConfig` was missing `voiceMode`** — fixed in commit `7c03ff0`. Verify no in-flight runs were created before that fix that need re-hashing.
3. **Revise pass note delivery is hacky** (`_revisionNotes` smuggled in channel profile). Works but worth refactoring if iteration quality is disappointing.
4. **Diagram syntax validator is regex-based, not full Mermaid parsing**. Catches most garbage but lets through diagrams that parse-OK structurally but render-fail. The client-side `DiagramBlock` has a fallback that shows the source as `<pre>` if rendering fails — so the user sees readable source instead of a broken UI.

---

## What "done" looks like

- All 14 task batches ✅ (currently 13 of 14)
- E2E re-run produces 11 editorial-grade pages (vs 11 hollow stubs before)
- Hub renders pages with rich blocks (diagrams, roadmaps, examples, mistakes)
- Total cost in $3-5 range
- Manual QA passes the smell test
- Tagged `canon-v1-authors-studio-shipped`
