# Audit Checkpoint Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the canon_v1 generation pipeline at the natural research/build boundary so that after payment, the user gets an editorial **audit + build plan** to review (channel profile + per-video intelligence + canon graph + proposed page briefs) BEFORE the expensive page-composition stage runs. The user clicks "Generate Hub" to approve the audit and the second half of the pipeline (page_composition + page_quality + adapt) runs to produce the final hub.

**Architecture:** Add a new `audit_ready` value to `runStatusEnum`. Split `runGenerationPipeline()` into `runAuditPipeline()` (stages 1-9 of canon_v1: ingest + channel_profile + visual_context + video_intelligence + canon + page_briefs) and `runHubBuildPipeline()` (stages 10-12: page_composition + page_quality + adapt). The dispatch script routes based on current `generation_run.status`: `queued` → audit phase; a new `approved` flag set by the user's "Generate Hub" action transitions `audit_ready` → `queued` and dispatches the hub phase. A new `/app/projects/[id]/runs/[runId]/audit` page renders the audit data. Existing UI status-label sites get extended with the new state.

**Tech Stack:** Drizzle ORM, Postgres enum migrations, TypeScript, Next.js app router, server actions, existing harness `runStage()` + `transitionRun()` plumbing.

**Branch:** Continue work on `feat/hub-pipeline-workbench-v2` in worktree `C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2`. The work is additive and orthogonal to editorial polish.

**Hard constraints:**
- Do NOT modify `apps/web/src/styles/globals.css`.
- Do NOT touch the main workspace's working tree.
- The `findings_v1` content engine path is OUT OF SCOPE — the split applies only to `canon_v1` (which is the engine all real runs use). Findings_v1 runs through `runGenerationPipeline()` end-to-end exactly as today.
- No payment-flow redesign. Users pay once for the whole run; the audit checkpoint is a **review gate**, not a billing gate.

**What gets shown to the user in the audit:**
| Section | Source data | What it tells the user |
|---|---|---|
| Channel Profile | `channel_profile.payload` | "We identified the creator as Duncan, niche=AI automations, audience=automation builders, tone=practitioner, voice=…" |
| Visual Moments | `visual_moment` rows | "We pulled N on-screen demos / dashboards / charts that we'll cite" |
| Video Intelligence | `video_intelligence_card` rows | Per-video extraction summary: main ideas, frameworks, lessons, mistakes count |
| Knowledge Graph | `canon_node` rows | "We synthesized the source material into N curated nodes — frameworks, playbooks, lessons, principles, definitions" |
| Proposed Pages | `page_brief` rows | "We propose to build N pages: [titles]. Click Generate Hub to author them." |

**What's deferred to V2:**
- Editing the audit (renaming pages, removing canon nodes, reordering briefs).
- Splitting payment into "audit charge" vs "hub charge".
- Email/push notification when audit is ready (use existing in-app inbox + status indicator).
- Reject/cancel flow with refund — V1 has a "Discard run" link that just marks the run canceled without billing changes.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `packages/db/src/schema/enums.ts` | modify | Add `audit_ready` value to `runStatusEnum` |
| `packages/db/drizzle/out/0011_run_status_audit_ready.sql` | create | Migration: `ALTER TYPE run_status ADD VALUE 'audit_ready'` |
| `packages/db/drizzle/out/meta/_journal.json` | modify | Add idx 11 entry |
| `packages/pipeline/src/harness.ts` | modify | Extend `transitionRun()` `status` parameter type to include `'audit_ready'` |
| `packages/pipeline/src/run-generation-pipeline.ts` | rewrite (partial) | Split canon_v1 path: extract `runAuditPipeline()` (stages 1-9) + `runHubBuildPipeline()` (stages 10-12). The legacy `runGenerationPipeline()` stays as a back-compat wrapper for findings_v1 (unchanged) and as the dispatch entry point that routes between the two phases by current status. |
| `packages/pipeline/src/dispatch-queued-run.ts` | modify | Routing: read current `run.status` — if `queued`, run audit phase; if `audit_ready` AND `approved=true` flag set, run hub phase; otherwise refuse. |
| `apps/web/src/lib/audit/get-run-audit.ts` | create | Server-side data loader: takes `runId`, returns `RunAuditView` with all 5 sections (profile, visuals, vics, canon, briefs) shaped for rendering |
| `apps/web/src/lib/audit/types.ts` | create | Shared types for the audit view shape |
| `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/page.tsx` | create | Audit review page (server component); fetches via `getRunAudit`, renders 5 sections, has "Generate Hub" form posting to server action |
| `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/AuditClient.tsx` | create | Client component for the "Generate Hub" / "Discard" buttons (client interactivity for confirmation) |
| `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/actions.ts` | create | Server actions: `approveAuditAndStartHubBuild(runId)` and `discardRun(runId)` |
| `apps/web/src/components/audit/ChannelProfileCard.tsx` | create | Renders channel profile section |
| `apps/web/src/components/audit/VisualMomentsList.tsx` | create | Renders visual moments section |
| `apps/web/src/components/audit/VideoIntelligenceCardList.tsx` | create | Renders per-video VIC summary |
| `apps/web/src/components/audit/CanonGraphView.tsx` | create | Renders canon node listing grouped by type |
| `apps/web/src/components/audit/PageBriefsList.tsx` | create | Renders the proposed page briefs |
| `apps/web/src/app/app/projects/[id]/page.tsx` | modify | Add audit-ready CTA: when `run.status === 'audit_ready'`, show "Audit ready — review →" linking to the audit page |
| `apps/web/src/app/app/projects/page.tsx` | modify | Status label for `audit_ready` → "Audit ready for review" |
| `apps/web/src/app/app/projects/[id]/pages/page.tsx` | modify | Same status label addition |
| `apps/web/src/app/app/inbox/page.tsx` | modify | Add `'run_audit_ready'` event handling to the inbox notifier |
| `packages/db/src/schema/enums.ts` (notification kind enum) | modify | Add `'run_audit_ready'` to the inbox notification enum |
| `packages/pipeline/src/test/run-generation-pipeline.audit.test.ts` | create | Unit test that `runAuditPipeline()` transitions to `audit_ready` and stops before page_composition |
| `apps/web/src/lib/audit/test/get-run-audit.test.ts` | create | Unit test for the data loader |

---

## Phase A — DB + harness foundation

### Task 1: Add `audit_ready` to runStatusEnum + migration

**Files:**
- Modify: `packages/db/src/schema/enums.ts`
- Create: `packages/db/drizzle/out/0011_run_status_audit_ready.sql`
- Modify: `packages/db/drizzle/out/meta/_journal.json`
- Modify: `packages/pipeline/src/harness.ts`

The new enum value sits BETWEEN `running` and `awaiting_review` semantically (the pipeline ran the audit phase and is waiting for user review). Postgres enum value additions are a one-way migration — no rollback path needed.

- [ ] **Step 1: Modify `runStatusEnum` literal in the schema**

In `packages/db/src/schema/enums.ts`, find:

```typescript
export const runStatusEnum = pgEnum('run_status', [
  'draft',
  'awaiting_payment',
  'queued',
  'running',
  'awaiting_review',
  'published',
  'failed',
  'canceled',
]);
```

Replace with:

```typescript
export const runStatusEnum = pgEnum('run_status', [
  'draft',
  'awaiting_payment',
  'queued',
  'running',
  'audit_ready',
  'awaiting_review',
  'published',
  'failed',
  'canceled',
]);
```

(Inserted between `running` and `awaiting_review` so the order matches the natural state machine.)

- [ ] **Step 2: Write the migration**

Create `packages/db/drizzle/out/0011_run_status_audit_ready.sql`:

```sql
-- Add 'audit_ready' to run_status enum so the pipeline can park between
-- the audit phase (channel_profile..page_briefs) and the hub-build phase
-- (page_composition..adapt) for user review.
-- Order BEFORE awaiting_review so the natural state machine reads:
--   running -> audit_ready -> running -> awaiting_review
ALTER TYPE "run_status" ADD VALUE IF NOT EXISTS 'audit_ready' BEFORE 'awaiting_review';
```

(The `BEFORE 'awaiting_review'` clause keeps the on-disk enum order stable. `IF NOT EXISTS` makes the migration idempotent if someone runs it twice.)

- [ ] **Step 3: Append journal entry**

Edit `packages/db/drizzle/out/meta/_journal.json` to add idx 11 after the existing idx 10:

```json
    {
      "idx": 11,
      "version": "7",
      "when": 1777766400000,
      "tag": "0011_run_status_audit_ready",
      "breakpoints": true
    }
```

- [ ] **Step 4: Apply migration**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2" && pnpm db:migrate 2>&1 | tail -3
```

Expected: `[db] migrations applied`.

If the migration fails with `enum value "audit_ready" of "run_status" already exists`, the dev DB had a partial apply — use `BEGIN; ALTER TYPE ...; COMMIT;` manually or skip the migration locally.

- [ ] **Step 5: Verify the new value is present**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT enum_range(NULL::run_status) AS values\`.then(r=>{console.log(r[0].values);process.exit(0)});
" 2>&1 | tail -3
```

Expected output should include `audit_ready` in the list.

- [ ] **Step 6: Extend `transitionRun()` to accept the new status**

In `packages/pipeline/src/harness.ts`, find:

```typescript
export async function transitionRun(
  runId: string,
  status: 'running' | 'awaiting_review' | 'failed' | 'canceled',
  ...
```

Replace the type literal with:

```typescript
export async function transitionRun(
  runId: string,
  status: 'running' | 'audit_ready' | 'awaiting_review' | 'failed' | 'canceled',
  ...
```

(The function body uses `db.update(generationRun).set({ status })` — Drizzle types will pick up the new enum value automatically.)

- [ ] **Step 7: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -3
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && pnpm typecheck 2>&1 | tail -3
```

Expected: clean (only the pre-existing R2 client errors should remain in apps/web).

- [ ] **Step 8: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/db/src/schema/enums.ts packages/db/drizzle/out/0011_run_status_audit_ready.sql packages/db/drizzle/out/meta/_journal.json packages/pipeline/src/harness.ts
git commit -m "feat(db): add audit_ready to run_status enum + extend transitionRun"
```

---

## Phase B — Pipeline split

### Task 2: Extract `runAuditPipeline()` and `runHubBuildPipeline()` from canon_v1 path

**Files:**
- Modify: `packages/pipeline/src/run-generation-pipeline.ts`

Today the canon_v1 branch in `runGenerationPipeline()` runs all 12 stages sequentially and transitions to `awaiting_review` at the end. We extract two pure functions and keep the legacy wrapper as a router that dispatches based on current status.

The cut: between `page_briefs` (last research stage) and `page_composition` (first authoring stage).

The audit phase ends with `transitionRun(runId, 'audit_ready')`. The hub phase resumes from `page_composition`, ends with `awaiting_review`. Each phase calls `assertWithinRunBudget` at the start of every stage exactly as today.

- [ ] **Step 1: Read the existing canon_v1 block**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2" && sed -n '136,215p' packages/pipeline/src/run-generation-pipeline.ts
```

You'll see the existing 7 `runStage(...)` calls in canon_v1 path (lines ~140-211): `channel_profile`, `visual_context`, `video_intelligence`, `canon`, `page_briefs`, `page_composition`, `page_quality`, `adapt`. Note that the variables `vic`, `canon`, `briefs`, `composition`, `adapt` are captured by the existing code for the return shape.

- [ ] **Step 2: Add the two new exported functions**

Add these at the bottom of `packages/pipeline/src/run-generation-pipeline.ts` (after the existing default export of `runGenerationPipeline`):

```typescript
/**
 * Run the audit phase of canon_v1: ingest + channel_profile + visual_context
 * + video_intelligence + canon + page_briefs. Transitions the run to
 * 'audit_ready' so the user can review and click "Generate Hub" before the
 * expensive page-composition stage runs.
 *
 * Idempotent: each stage is gated by runStage's materialization check, so
 * re-running the audit phase after a partial completion only re-executes
 * stages whose downstream rows are missing.
 */
export async function runAuditPipeline(
  payload: RunGenerationPipelinePayload,
): Promise<{ runId: string; videoCount: number; transcriptsFetched: number; transcriptsSkipped: number; segmentsCreated: number; canonNodeCount: number; pageBriefCount: number }> {
  const ctx = {
    runId: payload.runId,
    workspaceId: payload.workspaceId,
    pipelineVersion: payload.pipelineVersion,
  };
  await transitionRun(payload.runId, 'running', { startedAt: new Date() });

  try {
    // Phase 0: shared ingestion stages (same as today's runGenerationPipeline).
    const snapshot = await runStage({
      ctx,
      stage: 'import_selection_snapshot',
      input: { runId: payload.runId, workspaceId: payload.workspaceId, videoSetId: payload.videoSetId, projectId: payload.projectId },
      run: async (i) => importSelectionSnapshot(i),
    });
    const transcriptsResult = await runStage({
      ctx,
      stage: 'ensure_transcripts',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => ensureTranscripts(i),
    });
    await runStage({
      ctx,
      stage: 'normalize_transcripts',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => normalizeTranscripts(i),
    });
    const segmentsResult = await runStage({
      ctx,
      stage: 'segment_transcripts',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => segmentTranscripts(i),
    });

    // canon_v1 audit stages.
    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'channel_profile',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runChannelProfileStage(i),
      validateMaterializedOutput: validateChannelProfileMaterialization,
    });

    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'visual_context',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runVisualContextStage(i),
      validateMaterializedOutput: validateVisualContextMaterialization,
    });

    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'video_intelligence',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runVideoIntelligenceStage(i),
      validateMaterializedOutput: validateVideoIntelligenceMaterialization,
    });

    await assertWithinRunBudget(payload.runId);
    const canon = await runStage({
      ctx,
      stage: 'canon',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runCanonStage(i),
      validateMaterializedOutput: validateCanonMaterialization,
    });

    await assertWithinRunBudget(payload.runId);
    const briefs = await runStage({
      ctx,
      stage: 'page_briefs',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runPageBriefsStage(i),
      validateMaterializedOutput: validatePageBriefsMaterialization,
    });

    await transitionRun(payload.runId, 'audit_ready');

    return {
      runId: payload.runId,
      videoCount: snapshot.videoCount,
      transcriptsFetched: transcriptsResult.fetchedCount,
      transcriptsSkipped: transcriptsResult.skippedCount,
      segmentsCreated: segmentsResult.segmentsCreated,
      canonNodeCount: canon.nodeCount,
      pageBriefCount: briefs.briefCount,
    };
  } catch (err) {
    await transitionRun(payload.runId, 'failed');
    throw err;
  }
}

/**
 * Run the hub-build phase of canon_v1: page_composition + page_quality + adapt.
 * Requires the audit phase to have completed (run is in 'audit_ready' or 'queued'
 * with audit stages already cached). Transitions the run to 'awaiting_review'
 * on success.
 */
export async function runHubBuildPipeline(
  payload: RunGenerationPipelinePayload,
): Promise<{ runId: string; pageCount: number; manifestR2Key: string }> {
  const ctx = {
    runId: payload.runId,
    workspaceId: payload.workspaceId,
    pipelineVersion: payload.pipelineVersion,
  };

  const db = getDb();
  const hubRow = await db
    .select({ id: hub.id })
    .from(hub)
    .where(eq(hub.projectId, payload.projectId))
    .limit(1)
    .then((rows) => rows[0]);
  if (!hubRow) {
    throw new Error(
      `Editorial Atlas pipeline requires a hub row for projectId='${payload.projectId}'`,
    );
  }

  await transitionRun(payload.runId, 'running');

  try {
    await assertWithinRunBudget(payload.runId);
    const composition = await runStage({
      ctx,
      stage: 'page_composition',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runPageCompositionStage(i),
      validateMaterializedOutput: validatePageCompositionMaterialization,
    });

    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'page_quality',
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runPageQualityStage(i),
      validateMaterializedOutput: validatePageQualityMaterialization,
    });

    await assertWithinRunBudget(payload.runId);
    const adapt = await runStage({
      ctx,
      stage: 'adapt',
      input: { runId: payload.runId, workspaceId: payload.workspaceId, hubId: hubRow.id },
      run: async (i) => runAdaptStage(i),
    });

    await transitionRun(payload.runId, 'awaiting_review', { completedAt: new Date() });

    return {
      runId: payload.runId,
      pageCount: composition.pageCount,
      manifestR2Key: adapt.manifestR2Key,
    };
  } catch (err) {
    await transitionRun(payload.runId, 'failed');
    throw err;
  }
}
```

(Note: this file already imports `getDb`, `eq`, `hub`, all stage functions, `runStage`, `transitionRun`, and `assertWithinRunBudget` for the existing `runGenerationPipeline`. No new imports needed.)

- [ ] **Step 3: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Run existing pipeline tests**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/test/cost-tracking.test.ts src/agents/providers/test/selectModel.test.ts src/agents/providers/test/selectModel.modes.test.ts src/agents/providers/test/selectModel.quality.test.ts 2>&1 | tail -10
```

Expected: all pass (we didn't change selector / cost behavior).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/run-generation-pipeline.ts
git commit -m "feat(pipeline): split canon_v1 into runAuditPipeline + runHubBuildPipeline"
```

---

### Task 3: Update dispatch-queued-run.ts to route by status

**Files:**
- Modify: `packages/pipeline/src/dispatch-queued-run.ts`

The dispatch script currently calls `runGenerationPipeline()` regardless of status. We change it to:

- If `status === 'queued'` and the run is `canon_v1`: call `runAuditPipeline()`. (Hub phase will be triggered later by the user's "Generate Hub" action.)
- If `status === 'audit_ready'`: refuse — user hasn't approved yet.
- If `status === 'queued'` AND the audit-phase output rows exist: call `runHubBuildPipeline()`. (This is the resumption case after user approval flips status back to `queued`.)
- If `status === 'failed'`: same routing as today (allow retry).
- If `findings_v1` engine: call legacy `runGenerationPipeline()` end-to-end (no split).

We detect "audit-phase output exists" by checking whether `page_brief` rows exist for the run.

- [ ] **Step 1: Read existing dispatch script**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2" && sed -n '40,90p' packages/pipeline/src/dispatch-queued-run.ts
```

You'll see the script: loads env, fetches the run row, checks status, calls `runGenerationPipeline`. Note the import of `runGenerationPipeline` — we'll add the two new functions alongside.

- [ ] **Step 2: Modify the dispatch script**

In `packages/pipeline/src/dispatch-queued-run.ts`, find the import block and add `runAuditPipeline, runHubBuildPipeline`:

```typescript
import { runGenerationPipeline, runAuditPipeline, runHubBuildPipeline } from './run-generation-pipeline';
```

Find the `runGenerationPipeline(payload)` call. Replace the surrounding logic with this routing block:

```typescript
  const engine = (process.env.PIPELINE_CONTENT_ENGINE ?? 'findings_v1').trim();

  // findings_v1: legacy single-shot path, no audit checkpoint.
  if (engine !== 'canon_v1') {
    try {
      const result = await runGenerationPipeline(payload);
      console.info(`[dispatch] complete`, result);
      process.exit(0);
    } catch (err) {
      console.error(`[dispatch] failed`, err);
      process.exit(4);
    }
  }

  // canon_v1: route by current status + presence of audit output.
  // Resumption rule: if page_brief rows exist for this run, the audit phase
  // already completed (this is a hub-build dispatch). Otherwise it's an
  // audit-phase dispatch.
  const briefRows = await db
    .select({ id: pageBrief.id })
    .from(pageBrief)
    .where(eq(pageBrief.runId, r.id))
    .limit(1);
  const auditOutputExists = briefRows.length > 0;

  try {
    if (!auditOutputExists) {
      const result = await runAuditPipeline(payload);
      console.info(`[dispatch] audit complete`, result);
      console.info(`[dispatch] run is now audit_ready — user must click "Generate Hub" to continue`);
      process.exit(0);
    } else {
      const result = await runHubBuildPipeline(payload);
      console.info(`[dispatch] hub build complete`, result);
      process.exit(0);
    }
  } catch (err) {
    console.error(`[dispatch] failed`, err);
    process.exit(4);
  }
```

Add the necessary imports at the top of the file (alongside existing ones):

```typescript
import { eq } from '@creatorcanon/db';
import { pageBrief } from '@creatorcanon/db/schema';
```

- [ ] **Step 3: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/dispatch-queued-run.ts
git commit -m "feat(pipeline): dispatch routes audit vs hub-build based on page_brief presence"
```

---

## Phase C — Audit data loader + types

### Task 4: `getRunAudit()` data loader + types + unit test

**Files:**
- Create: `apps/web/src/lib/audit/types.ts`
- Create: `apps/web/src/lib/audit/get-run-audit.ts`
- Create: `apps/web/src/lib/audit/test/get-run-audit.test.ts`

A pure server-side loader that takes `runId` and returns the audit view. The page renders this. Keeping it as a separate function (not inline in the page component) makes it testable.

- [ ] **Step 1: Define the audit view shape**

Create `apps/web/src/lib/audit/types.ts`:

```typescript
export interface RunAuditView {
  runId: string;
  projectId: string;
  status: 'audit_ready' | 'running' | 'awaiting_review' | 'published' | 'failed' | 'canceled' | 'queued' | 'awaiting_payment' | 'draft';
  channelProfile: ChannelProfileView | null;
  visualMoments: VisualMomentView[];
  videoIntelligenceCards: VideoIntelligenceCardView[];
  canonNodes: CanonNodeView[];
  pageBriefs: PageBriefView[];
  costCents: number;
}

export interface ChannelProfileView {
  creatorName: string | null;
  niche: string | null;
  audience: string | null;
  dominantTone: string | null;
  recurringPromise: string | null;
  positioningSummary: string | null;
  creatorTerminology: string[];
}

export interface VisualMomentView {
  id: string;
  videoId: string;
  videoTitle: string;
  timestampMs: number;
  type: string;
  description: string;
}

export interface VideoIntelligenceCardView {
  videoId: string;
  videoTitle: string;
  mainIdeaCount: number;
  frameworkCount: number;
  lessonCount: number;
  exampleCount: number;
  mistakeCount: number;
  quoteCount: number;
}

export interface CanonNodeView {
  id: string;
  type: string;       // e.g. "framework", "lesson", "playbook"
  title: string | null;
  whenToUse: string | null;
  pageWorthinessScore: number | null;
}

export interface PageBriefView {
  id: string;
  pageType: string;   // e.g. "framework", "playbook", "lesson"
  pageTitle: string;
  audienceQuestion: string | null;
  primaryCanonNodeIds: string[];
  position: number;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/src/lib/audit/test/get-run-audit.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shapeChannelProfile, shapeCanonNode, shapePageBrief } from '../get-run-audit';

describe('shapeChannelProfile', () => {
  it('extracts creator-facing fields from raw payload', () => {
    const view = shapeChannelProfile({
      creatorName: 'Duncan',
      niche: 'AI automations',
      audience: 'Builders',
      dominantTone: 'practitioner',
      recurringPromise: 'Faster proposals',
      positioningSummary: 'Make.com guides',
      creatorTerminology: ['blueprint', 'Make.com', 'Chat2BT'],
    });
    assert.equal(view?.creatorName, 'Duncan');
    assert.equal(view?.niche, 'AI automations');
    assert.deepEqual(view?.creatorTerminology, ['blueprint', 'Make.com', 'Chat2BT']);
  });

  it('handles missing fields gracefully', () => {
    const view = shapeChannelProfile({});
    assert.equal(view?.creatorName, null);
    assert.equal(view?.niche, null);
    assert.deepEqual(view?.creatorTerminology, []);
  });

  it('returns null for null input', () => {
    assert.equal(shapeChannelProfile(null), null);
  });
});

describe('shapeCanonNode', () => {
  it('extracts type, title, whenToUse, and pageWorthiness', () => {
    const view = shapeCanonNode({
      id: 'cn_abc',
      type: 'framework',
      payload: {
        title: 'Proposal Intake Framework',
        whenToUse: 'Use before generating any proposal.',
        pageWorthinessScore: 85,
      },
    });
    assert.equal(view.id, 'cn_abc');
    assert.equal(view.type, 'framework');
    assert.equal(view.title, 'Proposal Intake Framework');
    assert.equal(view.whenToUse, 'Use before generating any proposal.');
    assert.equal(view.pageWorthinessScore, 85);
  });

  it('handles missing payload fields', () => {
    const view = shapeCanonNode({ id: 'cn_x', type: 'lesson', payload: {} });
    assert.equal(view.title, null);
    assert.equal(view.whenToUse, null);
    assert.equal(view.pageWorthinessScore, null);
  });
});

describe('shapePageBrief', () => {
  it('extracts pageTitle, pageType, audienceQuestion, primaryCanonNodeIds', () => {
    const view = shapePageBrief({
      id: 'pb_1',
      position: 3,
      payload: {
        pageType: 'framework',
        pageTitle: 'Build the Proposal Generator',
        audienceQuestion: 'How do I close faster?',
        primaryCanonNodeIds: ['cn_a', 'cn_b'],
      },
    });
    assert.equal(view.pageType, 'framework');
    assert.equal(view.pageTitle, 'Build the Proposal Generator');
    assert.equal(view.audienceQuestion, 'How do I close faster?');
    assert.deepEqual(view.primaryCanonNodeIds, ['cn_a', 'cn_b']);
    assert.equal(view.position, 3);
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/lib/audit/test/get-run-audit.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../get-run-audit'`.

- [ ] **Step 4: Implement the loader**

Create `apps/web/src/lib/audit/get-run-audit.ts`:

```typescript
import { and, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  pageBrief,
  segment,
  video,
  videoIntelligenceCard,
  visualMoment,
} from '@creatorcanon/db/schema';
import type {
  CanonNodeView,
  ChannelProfileView,
  PageBriefView,
  RunAuditView,
  VideoIntelligenceCardView,
  VisualMomentView,
} from './types';

/**
 * Server-side loader for the run audit view. Aggregates channel_profile,
 * visual_moment, video_intelligence_card, canon_node, and page_brief rows
 * into a single shape ready for the audit page to render.
 *
 * Returns null when the run does not exist OR is not in a state that has
 * an audit to show (i.e. status is 'draft' / 'awaiting_payment' / 'queued'
 * with no upstream output yet).
 */
export async function getRunAudit(runId: string): Promise<RunAuditView | null> {
  const db = getDb();
  const runRows = await db
    .select({ id: generationRun.id, projectId: generationRun.projectId, status: generationRun.status })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = runRows[0];
  if (!run) return null;

  const cpRows = await db
    .select({ payload: channelProfile.payload })
    .from(channelProfile)
    .where(eq(channelProfile.runId, runId))
    .limit(1);
  const channelProfileView = shapeChannelProfile(cpRows[0]?.payload ?? null);

  const videoRows = await db
    .select({ id: video.id, title: video.title })
    .from(video)
    .where(eq(video.workspaceId, generationRun.workspaceId)); // (via prior subquery wiring; alternative: use video_set_item join)
  const titleByVideoId = new Map(videoRows.map((v) => [v.id, v.title ?? '(Untitled)']));

  const vmRows = await db
    .select({
      id: visualMoment.id,
      videoId: visualMoment.videoId,
      timestampMs: visualMoment.timestampMs,
      type: visualMoment.type,
      description: visualMoment.description,
    })
    .from(visualMoment)
    .where(eq(visualMoment.runId, runId));
  const visualMomentsView: VisualMomentView[] = vmRows.map((m) => ({
    id: m.id,
    videoId: m.videoId,
    videoTitle: titleByVideoId.get(m.videoId) ?? '(Untitled)',
    timestampMs: m.timestampMs,
    type: m.type,
    description: m.description,
  }));

  const vicRows = await db
    .select({
      videoId: videoIntelligenceCard.videoId,
      payload: videoIntelligenceCard.payload,
    })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));
  const vicView: VideoIntelligenceCardView[] = vicRows.map((row) => {
    const p = row.payload as Record<string, unknown>;
    const arr = (k: string) => Array.isArray(p[k]) ? (p[k] as unknown[]).length : 0;
    return {
      videoId: row.videoId,
      videoTitle: titleByVideoId.get(row.videoId) ?? '(Untitled)',
      mainIdeaCount: arr('mainIdeas'),
      frameworkCount: arr('frameworks'),
      lessonCount: arr('lessons'),
      exampleCount: arr('examples'),
      mistakeCount: arr('mistakesToAvoid'),
      quoteCount: arr('quotes'),
    };
  });

  const cnRows = await db
    .select({ id: canonNode.id, type: canonNode.type, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));
  const canonNodesView: CanonNodeView[] = cnRows.map(shapeCanonNode);

  const pbRows = await db
    .select({ id: pageBrief.id, position: pageBrief.position, payload: pageBrief.payload })
    .from(pageBrief)
    .where(eq(pageBrief.runId, runId))
    .orderBy(pageBrief.position);
  const pageBriefsView: PageBriefView[] = pbRows.map(shapePageBrief);

  // Sum stage costs for display.
  const stageRows = await db.execute<{ cost: number }>(
    `SELECT COALESCE(SUM(cost_cents), 0)::int AS cost FROM generation_stage_run WHERE run_id = '${runId.replace(/'/g, "''")}'` as never,
  );
  const costCents = stageRows[0]?.cost ?? 0;

  return {
    runId: run.id,
    projectId: run.projectId,
    status: run.status as RunAuditView['status'],
    channelProfile: channelProfileView,
    visualMoments: visualMomentsView,
    videoIntelligenceCards: vicView,
    canonNodes: canonNodesView,
    pageBriefs: pageBriefsView,
    costCents,
  };
}

export function shapeChannelProfile(payload: Record<string, unknown> | null): ChannelProfileView | null {
  if (!payload) return null;
  const get = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : null);
  const terminology = Array.isArray(payload.creatorTerminology)
    ? (payload.creatorTerminology as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return {
    creatorName: get('creatorName'),
    niche: get('niche'),
    audience: get('audience'),
    dominantTone: get('dominantTone'),
    recurringPromise: get('recurringPromise'),
    positioningSummary: get('positioningSummary'),
    creatorTerminology: terminology,
  };
}

export function shapeCanonNode(row: { id: string; type: string; payload: Record<string, unknown> }): CanonNodeView {
  const p = row.payload ?? {};
  const get = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const score = typeof p.pageWorthinessScore === 'number' ? (p.pageWorthinessScore as number) : null;
  return {
    id: row.id,
    type: row.type,
    title: get('title'),
    whenToUse: get('whenToUse'),
    pageWorthinessScore: score,
  };
}

export function shapePageBrief(row: { id: string; position: number; payload: Record<string, unknown> }): PageBriefView {
  const p = row.payload ?? {};
  const get = (k: string) => (typeof p[k] === 'string' ? (p[k] as string) : null);
  const ids = Array.isArray(p.primaryCanonNodeIds)
    ? (p.primaryCanonNodeIds as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return {
    id: row.id,
    pageType: get('pageType') ?? 'lesson',
    pageTitle: get('pageTitle') ?? '(Untitled)',
    audienceQuestion: get('audienceQuestion'),
    primaryCanonNodeIds: ids,
    position: row.position,
  };
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/lib/audit/test/get-run-audit.test.ts 2>&1 | tail -10
```

Expected: 7/7 PASS.

- [ ] **Step 6: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && pnpm typecheck 2>&1 | tail -5
```

Expected: clean (modulo pre-existing R2 client errors).

If you see an error about the `videoRows` query (the `eq(video.workspaceId, ...)` join is sketchy), replace that block with a direct join via `video_set_item` to fetch only this run's videos. The video-id-to-title map is the only thing you need from that subquery.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add apps/web/src/lib/audit/types.ts apps/web/src/lib/audit/get-run-audit.ts apps/web/src/lib/audit/test/get-run-audit.test.ts
git commit -m "feat(audit): server-side audit data loader + view types"
```

---

## Phase D — Audit page UI

### Task 5: Audit page route + section components + server action

**Files:**
- Create: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/page.tsx`
- Create: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/AuditClient.tsx`
- Create: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/actions.ts`
- Create: `apps/web/src/components/audit/ChannelProfileCard.tsx`
- Create: `apps/web/src/components/audit/VisualMomentsList.tsx`
- Create: `apps/web/src/components/audit/VideoIntelligenceCardList.tsx`
- Create: `apps/web/src/components/audit/CanonGraphView.tsx`
- Create: `apps/web/src/components/audit/PageBriefsList.tsx`

The page is a server component that calls `getRunAudit(runId)` and renders 5 sections. Each section component is presentational. The "Generate Hub" / "Discard" buttons are in `AuditClient.tsx` (client component) because they need form state for confirmation.

- [ ] **Step 1: Create the section components**

Create `apps/web/src/components/audit/ChannelProfileCard.tsx`:

```tsx
import type { ChannelProfileView } from '@/lib/audit/types';

export function ChannelProfileCard({ profile }: { profile: ChannelProfileView | null }) {
  if (!profile) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Channel profile not available yet.
      </div>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Channel profile</h2>
      <p className="mt-1 text-xs text-slate-500">Who we identified the creator as, and how we'll write in their voice.</p>
      <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {profile.creatorName ? <Field label="Creator">{profile.creatorName}</Field> : null}
        {profile.niche ? <Field label="Niche">{profile.niche}</Field> : null}
        {profile.dominantTone ? <Field label="Tone">{profile.dominantTone}</Field> : null}
        {profile.recurringPromise ? <Field label="Recurring promise">{profile.recurringPromise}</Field> : null}
      </dl>
      {profile.audience ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Audience</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{profile.audience}</p>
        </div>
      ) : null}
      {profile.creatorTerminology.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vocabulary we'll preserve</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {profile.creatorTerminology.map((term) => (
              <span key={term} className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">{term}</span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{children}</dd>
    </div>
  );
}
```

Create `apps/web/src/components/audit/VisualMomentsList.tsx`:

```tsx
import type { VisualMomentView } from '@/lib/audit/types';

function formatTs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function VisualMomentsList({ moments }: { moments: VisualMomentView[] }) {
  if (moments.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No visual moments extracted (videos lacked usable on-screen content, or were transcript-only).
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Visual moments ({moments.length})</h2>
      <p className="mt-1 text-xs text-slate-500">On-screen demos, dashboards, charts, and code samples we'll cite alongside transcript evidence.</p>
      <ul className="mt-4 space-y-3">
        {moments.map((m) => (
          <li key={m.id} className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold text-slate-700">{m.type}</span>
              <span className="text-xs tabular-nums text-slate-500">{formatTs(m.timestampMs)}</span>
              <span className="ml-auto truncate text-xs text-slate-500">{m.videoTitle}</span>
            </div>
            <p className="mt-1 text-sm text-slate-700">{m.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Create `apps/web/src/components/audit/VideoIntelligenceCardList.tsx`:

```tsx
import type { VideoIntelligenceCardView } from '@/lib/audit/types';

export function VideoIntelligenceCardList({ cards }: { cards: VideoIntelligenceCardView[] }) {
  if (cards.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No video intelligence extracted yet.
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Per-video intelligence ({cards.length})</h2>
      <p className="mt-1 text-xs text-slate-500">Counts of structured ideas extracted from each source video.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.videoId} className="rounded border border-slate-200 bg-slate-50 p-3">
            <p className="truncate text-sm font-medium text-slate-900">{c.videoTitle}</p>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <Stat label="Main ideas" value={c.mainIdeaCount} />
              <Stat label="Frameworks" value={c.frameworkCount} />
              <Stat label="Lessons" value={c.lessonCount} />
              <Stat label="Examples" value={c.exampleCount} />
              <Stat label="Mistakes" value={c.mistakeCount} />
              <Stat label="Quotes" value={c.quoteCount} />
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-base font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
```

Create `apps/web/src/components/audit/CanonGraphView.tsx`:

```tsx
import type { CanonNodeView } from '@/lib/audit/types';

export function CanonGraphView({ nodes }: { nodes: CanonNodeView[] }) {
  if (nodes.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No canon nodes synthesized yet.
      </section>
    );
  }
  const groups = new Map<string, CanonNodeView[]>();
  for (const node of nodes) {
    const arr = groups.get(node.type) ?? [];
    arr.push(node);
    groups.set(node.type, arr);
  }
  const order = ['playbook', 'framework', 'lesson', 'principle', 'definition', 'tactic', 'pattern', 'example', 'aha_moment', 'quote', 'topic'];
  const sortedTypes = order.filter((t) => groups.has(t)).concat(
    [...groups.keys()].filter((t) => !order.includes(t)),
  );
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Knowledge graph ({nodes.length} nodes)</h2>
      <p className="mt-1 text-xs text-slate-500">Curated synthesis of the source material. Each node is a candidate for a hub page or a citation anchor.</p>
      <div className="mt-4 space-y-4">
        {sortedTypes.map((t) => {
          const arr = groups.get(t)!;
          return (
            <div key={t}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t} ({arr.length})</p>
              <ul className="mt-2 space-y-1.5">
                {arr.map((n) => (
                  <li key={n.id} className="rounded border border-slate-200 bg-slate-50 p-2 text-sm">
                    <p className="font-medium text-slate-900">{n.title ?? '(Untitled)'}</p>
                    {n.whenToUse ? <p className="mt-0.5 text-xs text-slate-600">When to use: {n.whenToUse}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
```

Create `apps/web/src/components/audit/PageBriefsList.tsx`:

```tsx
import type { PageBriefView } from '@/lib/audit/types';

export function PageBriefsList({ briefs }: { briefs: PageBriefView[] }) {
  if (briefs.length === 0) {
    return (
      <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        No pages proposed yet.
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">Proposed hub pages ({briefs.length})</h2>
      <p className="mt-1 text-xs text-slate-500">When you click "Generate Hub", we'll write each of these pages in your hub.</p>
      <ol className="mt-4 space-y-2">
        {briefs.map((b) => (
          <li key={b.id} className="rounded border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{b.pageType}</span>
              <span className="text-xs tabular-nums text-slate-400">#{b.position + 1}</span>
              <span className="text-xs text-slate-400">· anchored by {b.primaryCanonNodeIds.length} canon node{b.primaryCanonNodeIds.length === 1 ? '' : 's'}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-slate-900">{b.pageTitle}</p>
            {b.audienceQuestion ? <p className="mt-1 text-xs italic text-slate-600">"{b.audienceQuestion}"</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 2: Create the server actions**

Create `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/actions.ts`:

```typescript
'use server';

import { redirect } from 'next/navigation';
import { eq, getDb } from '@creatorcanon/db';
import { generationRun } from '@creatorcanon/db/schema';
import { dispatchHubBuildRun } from '@/lib/runs/dispatch-hub-build';
import { revalidatePath } from 'next/cache';

/**
 * User clicked "Generate Hub" on the audit page. Flip status from
 * 'audit_ready' to 'queued', then dispatch the hub-build phase.
 */
export async function approveAuditAndStartHubBuild(formData: FormData) {
  const runId = formData.get('runId') as string;
  const projectId = formData.get('projectId') as string;
  if (!runId || !projectId) throw new Error('Missing runId/projectId');

  const db = getDb();
  const rows = await db
    .select({ id: generationRun.id, status: generationRun.status })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = rows[0];
  if (!run) throw new Error('Run not found');
  if (run.status !== 'audit_ready') {
    throw new Error(`Run is in status '${run.status}'; expected 'audit_ready'`);
  }

  // Flip to queued; dispatch picks it up.
  await db.update(generationRun).set({ status: 'queued' }).where(eq(generationRun.id, runId));

  // Trigger the dispatcher (async fire-and-forget; the dispatcher writes
  // status updates as it progresses, so the UI can poll/refresh).
  void dispatchHubBuildRun(runId).catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[approveAudit] dispatchHubBuildRun failed:', err);
  });

  revalidatePath(`/app/projects/${projectId}`);
  redirect(`/app/projects/${projectId}`);
}

/**
 * User clicked "Discard". Mark the run canceled. (No refund logic in V1.)
 */
export async function discardRun(formData: FormData) {
  const runId = formData.get('runId') as string;
  const projectId = formData.get('projectId') as string;
  if (!runId || !projectId) throw new Error('Missing runId/projectId');

  const db = getDb();
  await db.update(generationRun).set({ status: 'canceled' }).where(eq(generationRun.id, runId));
  revalidatePath(`/app/projects/${projectId}`);
  redirect(`/app/projects/${projectId}`);
}
```

`dispatchHubBuildRun(runId)` is a thin helper that posts to whatever job queue / runner the rest of the app uses. **Look at how the existing payment-completion flow dispatches the audit phase** (find it via `grep -rn "runGenerationPipeline\|dispatch-queued-run\|enqueueRun" apps/web/src --include="*.ts"`). Copy that pattern. If the existing dispatcher writes a row to `runs_to_dispatch` or similar, just replicate. If it spawns a child process, do the same. The plan does NOT prescribe this — adapt to the existing code.

If there's no existing programmatic dispatcher (e.g. the only path is a manually-run shell script), create a minimal one inline:

```typescript
// apps/web/src/lib/runs/dispatch-hub-build.ts (create this file if no existing dispatcher pattern)
import { spawn } from 'node:child_process';
import path from 'node:path';

export async function dispatchHubBuildRun(runId: string): Promise<void> {
  // Simplest viable: spawn the dispatch script as a detached subprocess.
  // The dispatch script's status routing (Task 3) sees 'queued' + existing
  // page_briefs and knows to run the hub phase.
  const cwd = path.resolve(process.cwd(), '../../packages/pipeline'); // adjust to actual path
  const child = spawn('node', ['./node_modules/.bin/tsx', './src/dispatch-queued-run.ts', runId], {
    cwd,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, PIPELINE_CONTENT_ENGINE: 'canon_v1' },
  });
  child.unref();
}
```

Note this is a minimal pattern; production should use a proper job queue. Document this in the V2 backlog.

- [ ] **Step 3: Create the page + client component**

Create `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/AuditClient.tsx`:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { approveAuditAndStartHubBuild, discardRun } from './actions';

export function AuditActions({ runId, projectId, isReady }: { runId: string; projectId: string; isReady: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <div className="sticky bottom-4 z-10 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-700">
        {isReady
          ? 'Audit complete. Generate the hub when you\'re happy with the plan, or discard to start over.'
          : 'Audit is still running…'}
      </p>
      <div className="flex gap-2">
        {!confirmDiscard ? (
          <button
            type="button"
            disabled={isPending || !isReady}
            onClick={() => setConfirmDiscard(true)}
            className="rounded border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Discard
          </button>
        ) : (
          <form action={(fd) => startTransition(() => discardRun(fd) as unknown as void)}>
            <input type="hidden" name="runId" value={runId} />
            <input type="hidden" name="projectId" value={projectId} />
            <button
              type="submit"
              disabled={isPending}
              className="rounded border border-red-600 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              Confirm discard
            </button>
          </form>
        )}
        <form action={(fd) => startTransition(() => approveAuditAndStartHubBuild(fd) as unknown as void)}>
          <input type="hidden" name="runId" value={runId} />
          <input type="hidden" name="projectId" value={projectId} />
          <button
            type="submit"
            disabled={isPending || !isReady}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isPending ? 'Starting…' : 'Generate Hub'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

Create `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { getRunAudit } from '@/lib/audit/get-run-audit';
import { ChannelProfileCard } from '@/components/audit/ChannelProfileCard';
import { VisualMomentsList } from '@/components/audit/VisualMomentsList';
import { VideoIntelligenceCardList } from '@/components/audit/VideoIntelligenceCardList';
import { CanonGraphView } from '@/components/audit/CanonGraphView';
import { PageBriefsList } from '@/components/audit/PageBriefsList';
import { AuditActions } from './AuditClient';

export default async function AuditPage({ params }: { params: { id: string; runId: string } }) {
  const audit = await getRunAudit(params.runId);
  if (!audit) notFound();
  if (audit.projectId !== params.id) notFound();

  const isReady = audit.status === 'audit_ready';
  const isRunning = audit.status === 'running' || audit.status === 'queued';

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Run audit</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {isReady ? 'Your audit is ready for review' : isRunning ? 'Auditing your videos…' : 'Audit'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          We've analyzed your source videos and produced a build plan. Review the plan below; click <strong>Generate Hub</strong> when you want us to author the pages.
        </p>
        <p className="mt-2 text-xs text-slate-500">Audit cost so far: ${(audit.costCents / 100).toFixed(2)}</p>
      </header>

      <ChannelProfileCard profile={audit.channelProfile} />
      <VisualMomentsList moments={audit.visualMoments} />
      <VideoIntelligenceCardList cards={audit.videoIntelligenceCards} />
      <CanonGraphView nodes={audit.canonNodes} />
      <PageBriefsList briefs={audit.pageBriefs} />

      <AuditActions runId={audit.runId} projectId={audit.projectId} isReady={isReady} />
    </main>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && pnpm typecheck 2>&1 | tail -10
```

Expected: clean (besides pre-existing R2 errors).

If `dispatchHubBuildRun` import path doesn't resolve, you didn't create the helper file — go back to Step 2's note and either match the existing dispatcher pattern or create the minimal `apps/web/src/lib/runs/dispatch-hub-build.ts` inline.

- [ ] **Step 5: Smoke test the route renders**

Start the dev server:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && ./node_modules/.bin/next dev --port 3003
```

In another shell:

```bash
curl -sS "http://localhost:3003/app/projects/bd8dfb10-07cc-48a8-b7bc-63e38c6633b4/runs/97e8772c-07e3-4408-ba40-0a17450f33cf/audit" --max-time 30 | head -50
```

Expected: HTML containing "Run audit" + section headings. Note: the existing fixture run is currently `failed` from the editorial polish blockage; status display will show that but the sections will still render because the audit-phase rows (channel_profile, vics, canon, briefs) are all present.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add apps/web/src/app/app/projects/[id]/runs/[runId]/audit apps/web/src/components/audit
git commit -m "feat(audit): review page renders 5 sections + Generate Hub server action"
```

---

## Phase E — UX integration

### Task 6: Project page + status labels + inbox event

**Files:**
- Modify: `apps/web/src/app/app/projects/[id]/page.tsx`
- Modify: `apps/web/src/app/app/projects/page.tsx`
- Modify: `apps/web/src/app/app/projects/[id]/pages/page.tsx`
- Modify: `apps/web/src/app/app/inbox/page.tsx`

Update the project detail page to surface the audit-ready CTA, add the new status label everywhere the existing labels live, and hook the inbox.

- [ ] **Step 1: Project detail page CTA**

In `apps/web/src/app/app/projects/[id]/page.tsx`, find where `run?.status === 'awaiting_review'` is checked (around line 238 per the existing search). Add an `audit_ready` branch right above it that shows the "Audit ready — review →" CTA linking to `/app/projects/${id}/runs/${run.id}/audit`.

The exact JSX shape depends on the existing component. Roughly:

```tsx
{run?.status === 'audit_ready' ? (
  <Link
    href={`/app/projects/${params.id}/runs/${run.id}/audit`}
    className="inline-flex items-center gap-2 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
  >
    Audit ready — review the plan →
  </Link>
) : draftPagesReady && run?.status === 'awaiting_review' ? (
  // ...existing awaiting_review block...
) : null}
```

Read the existing block and match the className conventions — the file uses CSS-variable tokens, mirror them.

- [ ] **Step 2: Status labels in project list**

In `apps/web/src/app/app/projects/page.tsx`, find the status-string mapping (around line 159 per the search). Add the `audit_ready` case:

```typescript
status === 'audit_ready' ? 'Audit ready'
: status === 'awaiting_review' ? 'Draft ready'
: ...
```

In `apps/web/src/app/app/projects/[id]/pages/page.tsx`, find the similar map (around line 64) and add the same key:

```typescript
const RUN_STATUS_LABEL: Record<string, string> = {
  // ...existing entries...
  audit_ready: 'Audit ready',
};
```

- [ ] **Step 3: Inbox event for audit_ready**

In `apps/web/src/app/app/inbox/page.tsx`, find the existing case `'run_awaiting_review'` (around line 277). Add a parallel case for `'run_audit_ready'`:

```typescript
case 'run_audit_ready':
  return (
    <InboxItemCard
      title="Audit ready for review"
      body={`Click to review the build plan for "${notification.projectTitle}" before we generate the hub.`}
      href={`/app/projects/${notification.projectId}/runs/${notification.runId}/audit`}
    />
  );
```

(Match the existing case's JSX shape — copy the awaiting_review branch and adjust title/body/href.)

- [ ] **Step 4: Add the inbox notification kind to the enum**

In `packages/db/src/schema/enums.ts`, find:

```typescript
'run_awaiting_review',
```

Add the new kind right above:

```typescript
'run_audit_ready',
'run_awaiting_review',
```

This is part of the `inbox_notification_kind` enum. Add a migration `0012_inbox_audit_ready.sql`:

```sql
ALTER TYPE "inbox_notification_kind" ADD VALUE IF NOT EXISTS 'run_audit_ready' BEFORE 'run_awaiting_review';
```

And the journal entry idx 12.

Apply:

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2" && pnpm db:migrate 2>&1 | tail -3
```

- [ ] **Step 5: Emit the notification when the audit phase completes**

Find where `run_awaiting_review` notifications are emitted (`grep -rn "run_awaiting_review" packages/pipeline`). The most likely location: at the end of `runGenerationPipeline()` in `run-generation-pipeline.ts`, OR a notification helper called from there.

In `runAuditPipeline()` (Task 2), right after `await transitionRun(payload.runId, 'audit_ready')`, call the notification helper with kind `'run_audit_ready'`. Match the existing emission pattern.

If the existing `awaiting_review` emission lives outside the pipeline (e.g. via DB trigger or webhook), confirm you do the same here — we want the notification to fire by the same mechanism.

- [ ] **Step 6: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/apps/web" && pnpm typecheck 2>&1 | tail -3
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add apps/web/src/app/app/projects apps/web/src/app/app/inbox/page.tsx packages/db/src/schema/enums.ts packages/db/drizzle/out/0012_inbox_audit_ready.sql packages/db/drizzle/out/meta/_journal.json packages/pipeline/src/run-generation-pipeline.ts
git commit -m "feat(ui): audit-ready CTA + status labels + inbox notification"
```

---

## Phase F — End-to-end verification

### Task 7: E2E smoke — audit phase + approval + hub phase

**Files:** N/A (verification only)

Walk the existing fixture run through the new flow, end to end. Assumes API quotas are available (Codex CLI provider from the other plan would also work for the hub phase if quotas are tight).

- [ ] **Step 1: Reset the fixture run to start of audit phase**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1});
(async()=>{
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`DELETE FROM page_quality_report WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page_version WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page_brief WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM canon_node WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM video_intelligence_card WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM generation_stage_run WHERE run_id = \${RUN} AND stage_name IN ('channel_profile','visual_context','video_intelligence','canon','page_briefs','page_composition','page_quality','adapt')\`;
  await sql\`UPDATE generation_run SET status = 'queued', started_at = NULL, completed_at = NULL WHERE id = \${RUN}\`;
  console.log('reset complete');
  await sql.end();
})();
" 2>&1 | tail -3
```

This deletes all canon_v1 outputs (more aggressive than the editorial polish reset; we want the audit phase to actually re-run from `channel_profile` onward).

- [ ] **Step 2: Dispatch (audit phase only)**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && PIPELINE_CONTENT_ENGINE=canon_v1 PIPELINE_QUALITY_MODE=production_economy ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tee /tmp/audit-smoke.log | tail -10
```

Expected: dispatch script logs `[dispatch] audit complete` and exits with code 0. No `page_composition` activity in the log. Total time ~10-15 min.

- [ ] **Step 3: Verify run is in `audit_ready`**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT status FROM generation_run WHERE id = '97e8772c-07e3-4408-ba40-0a17450f33cf'\`.then(r=>{console.log(r);process.exit(0)});
" 2>&1 | tail -3
```

Expected: `status: 'audit_ready'`.

- [ ] **Step 4: Visit the audit page**

Open `http://localhost:3003/app/projects/bd8dfb10-07cc-48a8-b7bc-63e38c6633b4/runs/97e8772c-07e3-4408-ba40-0a17450f33cf/audit`.

Verify the 5 sections render:
- Channel profile shows `creatorName: Duncan`, niche, audience, terminology
- Visual moments list (1 item from `mu_9d970d091c38` if data is consistent)
- 2 video intelligence cards with non-zero counts
- 12 canon nodes grouped by type
- 8 page briefs with titles like "Business Proposal Generator"
- Bottom: sticky bar with "Generate Hub" + "Discard" buttons

- [ ] **Step 5: Click "Generate Hub"**

Click the button. Expect:
- Redirect to `/app/projects/bd8dfb10.../...`
- DB: `generation_run.status` flips to `queued`
- A subprocess starts page_composition (if the dispatch helper is wired correctly)

- [ ] **Step 6: Wait for hub phase to complete + verify**

```bash
# Watch DB for status change to awaiting_review (~25 min for 8 pages)
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT status FROM generation_run WHERE id = '97e8772c-07e3-4408-ba40-0a17450f33cf'\`.then(r=>{console.log(r);process.exit(0)});
" 2>&1 | tail -3
```

Expected after ~25 min: `status: 'awaiting_review'`. Page rows persisted, manifest in R2.

- [ ] **Step 7: If everything works, commit notes**

If E2E passes, document the verified flow in `docs/superpowers/notes/2026-04-29-audit-checkpoint-shipped.md` and commit.

If the dispatch from the server action didn't fire correctly (e.g. subprocess didn't start, status stayed `queued` indefinitely), the issue is in `dispatchHubBuildRun()` — review the existing dispatcher pattern and reshape.

---

## Self-Review

**Spec coverage:**
- ✅ Pipeline split at page_briefs/page_composition boundary — Tasks 2, 3
- ✅ New status `audit_ready` — Task 1
- ✅ Audit review page (read-only V1) — Task 5
- ✅ "Generate Hub" approval flow — Tasks 5, 6
- ✅ Status labels everywhere existing labels appear — Task 6
- ✅ Inbox notification for `run_audit_ready` — Task 6
- ✅ End-to-end smoke — Task 7

**Placeholder scan:** every step has executable code or commands. The one place with notable variability — Task 5 Step 2's `dispatchHubBuildRun` helper — explicitly enumerates two options (match existing pattern; create minimal subprocess helper) and tells the engineer how to discover the existing pattern.

**Type consistency:** `RunAuditView`, `ChannelProfileView`, `CanonNodeView`, `PageBriefView`, `VideoIntelligenceCardView`, `VisualMomentView` are defined in Task 4 and used verbatim in Task 5's components. The `runStatusEnum` literal added in Task 1 is referenced in Task 4's `RunAuditView.status` union and Task 5's status checks. The two new pipeline functions in Task 2 (`runAuditPipeline`, `runHubBuildPipeline`) are imported in Task 3's dispatcher.

**Scope check:** the plan covers a real product flow change touching DB schema, pipeline orchestrator, dispatch script, and UI. It deliberately defers V2 work (editing the audit, billing splits, push notifications, refund flow) into a clearly-labeled out-of-scope section. Properly sized at ~7 tasks across ~2-3 days of execution.

**Risk:** the highest-risk task is Task 5 Step 2 (`dispatchHubBuildRun` helper), because the existing dispatcher pattern in this codebase isn't fully documented and the plan can't prescribe code that's certain to match. Mitigation: the task explicitly tells the engineer to find and replicate the existing pattern, with a fallback minimal subprocess approach if no pattern exists.

---

**Plan estimated effort:** 12-18 hours of focused execution. ~2-3 working days including review loops.

**Plan does not depend on:**
- Editorial polish E2E completing (orthogonal — different stage of the pipeline)
- Codex CLI provider (orthogonal — different concern; though Codex provider would help during E2E testing if API quotas are tight)
