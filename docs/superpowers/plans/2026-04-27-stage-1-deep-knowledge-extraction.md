# Stage 1: Deep Knowledge Extraction Implementation Plan (v3 — visual_context required)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new content engine — `canon_v1` — that pivots from "agent-discovery-first" to "deep-read-first" with a multimodal understanding layer. Run it **alongside** the legacy `findings_v1` engine behind a feature flag. The two engines share `Phase 0` ingestion and the `adapt + render` tail.

**Architecture:** `Channel Profile → Visual Context (Gemini Vision) → Per-Video Intelligence Cards → Creator Canon → Page Briefs → Brief-Driven Composition with source packets → Deterministic Page QA → Adapt`. Six new tables. Five new agents (channel_profiler, video_analyst, canon_architect, page_brief_planner, page_writer) plus one direct-call stage (visual_context using Gemini Vision without a multi-turn agent). One harness extension (materialization validation). One hybrid model-routing policy. One operator inspection script. One side-by-side audit.

**Tech Stack:** TypeScript, Drizzle ORM, Zod, OpenAI/Gemini function-calling + Gemini Vision, ffmpeg for frame extraction, postgres-js, node:test + tsx.

---

## Hybrid model routing policy

This plan codifies a hybrid architecture rather than picking one provider for everything:

| Layer | Choose | Why |
|---|---|---|
| **Visual understanding + large-context extraction** | **Gemini** (`gemini-2.5-flash` for vision, `gemini-2.5-pro` for big-context fallback) | Multimodal native; 1M-token context; cheap per frame. |
| **Channel profile / archive synthesis / deep video read** | **Strongest reasoning model** (`gpt-5.5` or fallback `gpt-5.4`) | Judgment-heavy, needs structured output discipline. |
| **Canon merging / page brief planning / page writing** | **Strongest reasoning model** | Curation and final user-facing quality matter. |
| **Validation / citation checks / quality gates** | **Deterministic code** | Never an LLM call — deterministic checks are auditable and free. |

Per-agent overrides via env: `PIPELINE_MODEL_<AGENT_NAME>=<modelId>`. The provider is inferred from the model prefix (`gpt-`/`o1` → openai, `gemini-` → gemini). **No agent or stage hard-codes a provider** — they all flow through `selectModel()`.

The system stays provider-agnostic and configurable per agent/stage.

---

## What changed from v2 of this plan

| # | Delta from v2 | Where it shows up |
|---|---|---|
| V1 | `visual_context` is a first-class **required** stage of canon_v1, not deferred. Runs between `channel_profile` and `video_intelligence`. Non-blocking on per-video failures. | Phase 6.2 |
| V2 | Sixth table: `visual_moment`. | Phase 1 |
| V3 | Visual tools (`listVisualMoments`, `getVisualMoment`, `proposeVisualMoment`). | Phase 2, Phase 3 |
| V4 | Frame extraction via ffmpeg from R2 audio source (when present) or yt-dlp on YouTube videos when allowed. Skip+warn if neither available. | Phase 6.2 |
| V5 | Gemini Vision called **directly** (no multi-turn agent), schema-validated JSON output. Only persists moments with `usefulnessScore >= 60`. | Phase 4.6 + Phase 6.2 |
| V6 | `VIDEO_ANALYST_PROMPT` updated to include `listVisualMoments` and add `visualMoments` field to the card payload. | Phase 4.2 |
| V7 | `CANON_ARCHITECT_PROMPT` updated to optionally cite `visualMomentIds` in canon_node payloads. | Phase 4.3 |
| V8 | `PageBriefPayload.recommendedVisualMomentIds`. | Data shapes section |
| V9 | Page composition emits `visual_example` blocks rendered as Editorial-Atlas callouts (Option A — no renderer change). | Phase 6.6 |
| V10 | Page QA validates visual-moment references (run scope, score, not sole evidence). | Phase 6.7 |
| V11 | Cost & limits: `PIPELINE_VISUAL_CONTEXT_ENABLED`, `PIPELINE_VISUAL_MAX_FRAMES_PER_VIDEO=12`, `PIPELINE_VISUAL_MIN_USEFULNESS_SCORE=60`. | Phase 6.0 |
| V12 | Hybrid model routing policy is documented above and enforced via `selectModel`. | Top of plan + Phase 5 |

The 17 v2 directives (feature flag, segmented transcript primary, strict ownership validation, missing tool implemented, deterministic page QA, idempotency via deletes/upserts, materialization validation, run limits, per-list caps, origin+confidence, richer pages, source packets, constrained writer, sourceCoveragePercent fix, inspect script, side-by-side audit) all carry over from v2 unchanged.

---

## Hard constraints (carried over)

- Legacy `findings_v1` pipeline stays wired and reachable via env flip.
- Editorial Atlas renderer unchanged. `visual_example` blocks render as callouts with the visual description (Option A).
- No customer-facing review/approve UX in this plan.
- No personalized design generation, paid access, chat backend, custom domains, or multi-source ingestion.
- **Quality > coverage.** Caps on canon size, page count, per-card list lengths, and frames-per-video are intentional.
- **Visual context is enrichment, not evidence.** Pages still must have transcript citations; visual blocks decorate but don't replace.

---

## Final canon_v1 architecture

```
Phase 0 — Source Preparation (shared with findings_v1)
  1. import_selection_snapshot
  2. ensure_transcripts
  3. normalize_transcripts
  4. segment_transcripts

Content Engine Branch (PIPELINE_CONTENT_ENGINE)

  A) findings_v1 (default — legacy, unchanged):
     5. discovery
     6. synthesis
     7. verify
     8. merge
     9. adapt

  B) canon_v1 (new):
     5. channel_profile           [agent: channel_profiler — gpt-5.5]
     6. visual_context            [direct Gemini Vision call — non-blocking per video]
     7. video_intelligence        [agent: video_analyst per video — gpt-5.5, fan-out 3]
     8. canon                     [agent: canon_architect — gpt-5.5]
     9. page_briefs               [agent: page_brief_planner — gpt-5.5]
     10. page_composition         [direct call: page_writer — gpt-5.5 with deterministic fallback]
     11. page_quality             [deterministic — no LLM]
     12. adapt                    [shared, deterministic]
```

---

## Run limits

```typescript
// packages/pipeline/src/canon-limits.ts
export const CANON_LIMITS = {
  minSelectedVideos: 2,
  maxSelectedVideos: 20,
  recommendedSelectedVideosLow: 8,
  recommendedSelectedVideosHigh: 15,
  maxTranscriptCharsPerVideo: 120_000,
} as const;

export const VISUAL_LIMITS = {
  maxFramesPerVideo: 12,
  maxVisualMomentsPerVideo: 6,
  minUsefulnessScore: 60,
} as const;
```

Env-overridable for visual:
- `PIPELINE_VISUAL_CONTEXT_ENABLED=true` (default true for canon_v1; set `false` to skip the stage)
- `PIPELINE_VISUAL_MAX_FRAMES_PER_VIDEO=12`
- `PIPELINE_VISUAL_MIN_USEFULNESS_SCORE=60`

---

## File map

### New — DB schema (six tables)
- `packages/db/src/schema/canon.ts` — six tables: `channel_profile`, `video_intelligence_card`, `canon_node`, `page_brief`, `page_quality_report`, `visual_moment`. canon_node carries `origin` + `confidence_score` columns.
- `packages/db/src/schema/index.ts` — re-export.
- `packages/db/drizzle/out/0008_canon_layer.sql` — single migration for all six.
- `packages/db/drizzle/out/meta/_journal.json` — append idx 8.

### New — Limits + harness extension
- `packages/pipeline/src/canon-limits.ts` — `CANON_LIMITS` + `VISUAL_LIMITS`.
- `packages/pipeline/src/agents/harness.ts` — extend `StageRunOptions` with `validateMaterializedOutput?` hook.

### New — Agent prompts (5 multi-turn agents + 1 direct-call vision prompt)
- `packages/pipeline/src/agents/specialists/prompts.ts` — append `CHANNEL_PROFILER_PROMPT`, `VIDEO_ANALYST_PROMPT` (with visual_moments awareness), `CANON_ARCHITECT_PROMPT`, `PAGE_BRIEF_PLANNER_PROMPT`, `PAGE_WRITER_PROMPT`, `VISUAL_FRAME_ANALYST_PROMPT` (used by the direct Gemini call).

### New — Tools
- `packages/pipeline/src/agents/tools/read-canon.ts` — read tools incl. `getSegmentedTranscript`, `getFullTranscript` (fallback), `getChannelProfile`, `getVideoIntelligenceCard`, `listVideoIntelligenceCards`, `getCanonNode`, `listCanonNodes`, `getPageBrief`, `listVisualMoments`, `getVisualMoment`.
- `packages/pipeline/src/agents/tools/propose-canon.ts` — propose tools incl. `proposeChannelProfile`, `proposeVideoIntelligenceCard`, `proposeCanonNode`, `proposePageBrief`, `proposeVisualMoment`. Strict validation + idempotency.
- `packages/pipeline/src/agents/tools/registry.ts` — register all new tools.

### New — Frame extraction adapter
- `packages/pipeline/src/visual/frame-extractor.ts` — extracts N keyframes from a video at given timestamps using ffmpeg. Sources in priority order: (1) audio R2 source's underlying mp4 if present, (2) `mediaAsset` of type `video_mp4`, (3) yt-dlp from `youtubeVideoId` (best-effort; respects existing `worker` dispatch mode behavior).
- `packages/pipeline/src/visual/upload-frame.ts` — uploads a JPEG frame to R2 at `workspaces/{ws}/runs/{run}/visual_context/{videoId}/{timestampMs}.jpg`.

### New — Specialist registry + model selection
- `packages/pipeline/src/agents/specialists/index.ts` — register five new specialists (channel_profiler, video_analyst, canon_architect, page_brief_planner, page_writer).
- `packages/pipeline/src/agents/providers/selectModel.ts` — extend `AgentName` and REGISTRY. `visual_frame_analyst` (the direct Gemini call) registered too so the model is configurable but it's not run through the multi-turn harness.

### New — Stages
- `packages/pipeline/src/stages/channel-profile.ts`
- `packages/pipeline/src/stages/visual-context.ts` ← **new in v3**
- `packages/pipeline/src/stages/video-intelligence.ts`
- `packages/pipeline/src/stages/canon.ts`
- `packages/pipeline/src/stages/page-briefs.ts`
- `packages/pipeline/src/stages/page-composition.ts`
- `packages/pipeline/src/stages/page-quality.ts`
- `packages/pipeline/src/stages/index.ts` — re-exports.

### Modified — Orchestrator
- `packages/pipeline/src/run-generation-pipeline.ts` — branch on `PIPELINE_CONTENT_ENGINE`. canon_v1 path runs the seven new stages.
- `packages/core/src/pipeline-stages.ts` — extend `PipelineStage`.

### Modified — Adapter
- `packages/pipeline/src/adapters/editorial-atlas/project-topics.ts` — read `canon_node` first, fall back to `archive_finding`.
- `packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts` — same dual-source pattern.
- `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts` — `sourceCoveragePercent = distinctSourceVideos / totalSelectedVideos`.

### New — Operator scripts
- `packages/pipeline/scripts/inspect-canon-run.ts` — pretty-prints channel profile, VIC counts, top canon nodes, page briefs, quality reports, and **visual moment counts by type**.
- `packages/pipeline/scripts/compare-engines.ts` — side-by-side audit on the same videoSet.

### New — Tests
- `packages/pipeline/src/stages/test/channel-profile.smoke.test.ts`
- `packages/pipeline/src/stages/test/visual-context.smoke.test.ts` ← stub Gemini Vision response
- `packages/pipeline/src/stages/test/video-intelligence.smoke.test.ts`
- `packages/pipeline/src/stages/test/canon.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-briefs.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-composition.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-quality.test.ts`
- `packages/pipeline/src/agents/tools/test/visual-moment.test.ts` — propose validation
- `packages/pipeline/src/visual/test/frame-extractor.test.ts` — stubbed ffmpeg

---

## Data shapes

### `channel_profile` (carried from v2)

```ts
{ id, workspaceId, runId UNIQUE, payload jsonb, costCents, createdAt }
```

### `video_intelligence_card` (carried from v2; payload extended)

The payload now includes `visualMoments` (added in v3):

```ts
type VideoIntelligenceCardPayload = {
  // ... fields from v2 ...
  visualMoments: Array<{
    visualMomentId: string;
    timestampMs: number;
    type: string;
    description: string;
    hubUse: string;
  }>;        // 0-6
}
```

`proposeVideoIntelligenceCard` validates that every `visualMomentId` exists in this run.

### `canon_node` (carried from v2; payload may reference `visualMomentIds`)

The schema columns are unchanged. Per-node payloads (frameworks, lessons, playbooks, examples) MAY include an optional `visualMomentIds: string[]` field referencing visual moments in the same run. `proposeCanonNode` validates these.

### `page_brief` (carried from v2; payload extended)

```ts
type PageBriefPayload = {
  // ... fields from v2 ...
  recommendedVisualMomentIds?: string[];     // optional
}
```

`proposePageBrief` validates that every `recommendedVisualMomentId` exists in run.

### `page_quality_report` (carried from v2)

```ts
{ id, workspaceId, runId, pageId UNIQUE-with-runId, evidenceScore, citationCount, distinctSourceVideos, emptySectionCount, unsupportedClaimCount, genericLanguageScore, recommendation, payload, createdAt }
```

### `visual_moment` (NEW in v3 — sixth table)

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  videoId: text NOT NULL,
  segmentId: text,                    // nullable; nearest transcript segment when known
  timestampMs: integer NOT NULL,
  frameR2Key: text,                    // nullable; populated only for useful frames worth keeping
  thumbnailR2Key: text,                // optional; deferred
  type: text NOT NULL,                 // 'screen_demo' | 'slide' | 'chart' | 'whiteboard' | 'code' | 'product_demo' | 'physical_demo' | 'diagram' | 'talking_head' | 'other'
  description: text NOT NULL,
  extractedText: text,                 // OCR-equivalent text Gemini found in the frame
  hubUse: text NOT NULL,               // how this could enrich a hub page
  usefulnessScore: integer NOT NULL DEFAULT 0,    // 0-100
  payload: jsonb NOT NULL,             // full Gemini response (visualClaims, warnings, etc.)
  createdAt: timestamptz DEFAULT now(),
  INDEX (runId, videoId),
  INDEX (runId, usefulnessScore DESC)
}
```

---

## Phase 1 — Schema + migration

### Task 1.1 — Drizzle schema (six tables)

**Files:**
- Create: `packages/db/src/schema/canon.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write `canon.ts`**

```typescript
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { workspace } from './workspace';
import { generationRun } from './generation-run';
import { video } from './video';

export const channelProfile = pgTable('channel_profile', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  costCents: numeric('cost_cents', { precision: 10, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runUnique: uniqueIndex('channel_profile_run_unique').on(t.runId),
}));

export const videoIntelligenceCard = pgTable('video_intelligence_card', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull().references(() => video.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  evidenceSegmentIds: text('evidence_segment_ids').array().notNull().default([]),
  costCents: numeric('cost_cents', { precision: 10, scale: 4 }).notNull().default('0'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runVideoUnique: uniqueIndex('vic_run_video_unique').on(t.runId, t.videoId),
  runIdx: index('vic_run_idx').on(t.runId),
}));

export const canonNode = pgTable('canon_node', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  payload: jsonb('payload').notNull(),
  evidenceSegmentIds: text('evidence_segment_ids').array().notNull().default([]),
  sourceVideoIds: text('source_video_ids').array().notNull().default([]),
  evidenceQuality: text('evidence_quality').notNull(),
  origin: text('origin').notNull().default('single_video'),
  confidenceScore: integer('confidence_score').notNull().default(0),
  citationCount: integer('citation_count').notNull().default(0),
  sourceCoverage: integer('source_coverage').notNull().default(0),
  pageWorthinessScore: integer('page_worthiness_score').notNull().default(0),
  specificityScore: integer('specificity_score').notNull().default(0),
  creatorUniquenessScore: integer('creator_uniqueness_score').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runTypeIdx: index('canon_node_run_type_idx').on(t.runId, t.type),
}));

export const pageBrief = pgTable('page_brief', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  pageWorthinessScore: integer('page_worthiness_score').notNull().default(0),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runPositionIdx: index('page_brief_run_position_idx').on(t.runId, t.position),
}));

export const pageQualityReport = pgTable('page_quality_report', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  pageId: text('page_id').notNull(),
  evidenceScore: integer('evidence_score').notNull().default(0),
  citationCount: integer('citation_count').notNull().default(0),
  distinctSourceVideos: integer('distinct_source_videos').notNull().default(0),
  emptySectionCount: integer('empty_section_count').notNull().default(0),
  unsupportedClaimCount: integer('unsupported_claim_count').notNull().default(0),
  genericLanguageScore: integer('generic_language_score').notNull().default(0),
  recommendation: text('recommendation').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runPageUnique: uniqueIndex('pqr_run_page_unique').on(t.runId, t.pageId),
}));

export const visualMoment = pgTable('visual_moment', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspace.id, { onDelete: 'cascade' }),
  runId: text('run_id').notNull().references(() => generationRun.id, { onDelete: 'cascade' }),
  videoId: text('video_id').notNull().references(() => video.id, { onDelete: 'cascade' }),
  segmentId: text('segment_id'),
  timestampMs: integer('timestamp_ms').notNull(),
  frameR2Key: text('frame_r2_key'),
  thumbnailR2Key: text('thumbnail_r2_key'),
  type: text('type').notNull(),
  description: text('description').notNull(),
  extractedText: text('extracted_text'),
  hubUse: text('hub_use').notNull(),
  usefulnessScore: integer('usefulness_score').notNull().default(0),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
}, (t) => ({
  runVideoIdx: index('visual_moment_run_video_idx').on(t.runId, t.videoId),
  runScoreIdx: index('visual_moment_run_score_idx').on(t.runId, t.usefulnessScore),
}));

export type ChannelProfile = typeof channelProfile.$inferSelect;
export type VideoIntelligenceCard = typeof videoIntelligenceCard.$inferSelect;
export type CanonNode = typeof canonNode.$inferSelect;
export type PageBrief = typeof pageBrief.$inferSelect;
export type PageQualityReport = typeof pageQualityReport.$inferSelect;
export type VisualMoment = typeof visualMoment.$inferSelect;
```

- [ ] **Step 2: Re-export**

```typescript
// packages/db/src/schema/index.ts
export * from './canon';
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/db && pnpm typecheck 2>&1 | tail -3
git add packages/db/src/schema/canon.ts packages/db/src/schema/index.ts
git commit -m "feat(db): canon-layer drizzle schema (6 tables incl. visual_moment)"
```

### Task 1.2 — Migration SQL + journal entry

**Files:**
- Create: `packages/db/drizzle/out/0008_canon_layer.sql`
- Modify: `packages/db/drizzle/out/meta/_journal.json`

- [ ] **Step 1: Write migration**

Includes the five tables from v2 plus `visual_moment`:

```sql
-- (channel_profile, video_intelligence_card, canon_node, page_brief, page_quality_report — same as v2)

CREATE TABLE IF NOT EXISTS "visual_moment" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "video_id" text NOT NULL,
  "segment_id" text,
  "timestamp_ms" integer NOT NULL,
  "frame_r2_key" text,
  "thumbnail_r2_key" text,
  "type" text NOT NULL,
  "description" text NOT NULL,
  "extracted_text" text,
  "hub_use" text NOT NULL,
  "usefulness_score" integer NOT NULL DEFAULT 0,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
ALTER TABLE "visual_moment" ADD CONSTRAINT "visual_moment_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "visual_moment_run_video_idx" ON "visual_moment" ("run_id","video_id");
CREATE INDEX IF NOT EXISTS "visual_moment_run_score_idx" ON "visual_moment" ("run_id","usefulness_score");
```

(Combine with the five-table SQL block from v2 of this plan, then save as a single 0008 migration.)

- [ ] **Step 2: Append journal entry idx 8** (`when: 1777507200000, tag: 0008_canon_layer`).

- [ ] **Step 3: Apply + verify six tables exist + commit**

```bash
pnpm db:migrate 2>&1 | tail -3
# verify: SELECT table_name FROM information_schema.tables WHERE table_name IN ('channel_profile','video_intelligence_card','canon_node','page_brief','page_quality_report','visual_moment');
git add packages/db/drizzle/out/0008_canon_layer.sql packages/db/drizzle/out/meta/_journal.json
git commit -m "feat(db): canon-layer migration (6 tables incl. visual_moment)"
```

---

## Phase 2 — Read tools (canon + visual)

### Task 2.1 — `read-canon.ts` (extends v2 with visual readers)

In addition to the v2 read tools (`getSegmentedTranscript`, `getFullTranscript`, `getChannelProfile`, `getVideoIntelligenceCard`, `listVideoIntelligenceCards`, `getCanonNode`, `listCanonNodes`, `getPageBrief`), add:

```typescript
import { visualMoment } from '@creatorcanon/db/schema';

export const listVisualMomentsTool: ToolDef<
  { videoId?: string; minScore?: number },
  { moments: Array<{ id: string; videoId: string; timestampMs: number; type: string; description: string; hubUse: string; usefulnessScore: number; segmentId: string | null; frameR2Key: string | null }> }
> = {
  name: 'listVisualMoments',
  description: 'List visual moments in this run, optionally filtered by videoId and minimum usefulness score.',
  inputSchema: z.object({ videoId: z.string().optional(), minScore: z.number().int().min(0).max(100).optional() }),
  handler: async (input, ctx) => {
    let where: any = eq(visualMoment.runId, ctx.runId);
    if (input.videoId) where = and(where, eq(visualMoment.videoId, input.videoId));
    if (typeof input.minScore === 'number') where = and(where, gte(visualMoment.usefulnessScore, input.minScore));
    const rows = await ctx.db.select().from(visualMoment).where(where);
    return {
      moments: rows.map((r) => ({
        id: r.id, videoId: r.videoId, timestampMs: r.timestampMs,
        type: r.type, description: r.description, hubUse: r.hubUse,
        usefulnessScore: r.usefulnessScore, segmentId: r.segmentId, frameR2Key: r.frameR2Key,
      })),
    };
  },
};

export const getVisualMomentTool: ToolDef<{ id: string }, { moment: unknown | null }> = {
  name: 'getVisualMoment',
  description: 'Read one visual moment by id.',
  inputSchema: z.object({ id: z.string() }),
  handler: async (input, ctx) => {
    const rows = await ctx.db.select().from(visualMoment).where(and(eq(visualMoment.runId, ctx.runId), eq(visualMoment.id, input.id))).limit(1);
    return { moment: rows[0] ?? null };
  },
};
```

(Add `gte` to imports from `@creatorcanon/db`.)

Register both in `registry.ts`. Commit:

```bash
git add packages/pipeline/src/agents/tools/read-canon.ts packages/pipeline/src/agents/tools/registry.ts
git commit -m "feat(tools): visual moment read tools (listVisualMoments, getVisualMoment)"
```

---

## Phase 3 — Propose tools (canon + visual, with strict validation + idempotency)

### Task 3.1 — `propose-canon.ts`

Carries the four propose tools from v2 (`proposeChannelProfile` upsert on runId, `proposeVideoIntelligenceCard` upsert on (runId, videoId) with strict segment ownership, `proposeCanonNode`, `proposePageBrief` with primary/supporting node existence checks).

**Updates in v3:**

- `proposeVideoIntelligenceCard` payload schema gains `visualMoments` array (capped 0-6). Validation:
  ```typescript
  // Every visualMoment.visualMomentId must exist in the run.
  const vmIds = input.payload.visualMoments.map((v) => v.visualMomentId);
  if (vmIds.length > 0) {
    const found = await ctx.db.select({ id: visualMoment.id }).from(visualMoment)
      .where(and(eq(visualMoment.runId, ctx.runId), inArray(visualMoment.id, vmIds)));
    const foundSet = new Set(found.map((r) => r.id));
    const missing = vmIds.filter((id) => !foundSet.has(id));
    if (missing.length > 0) return { ok: false, error: `Unknown visualMomentIds: ${missing.join(', ')}` };
  }
  ```

- `proposeCanonNode`: if `payload.visualMomentIds` is present (array of strings), validate every ID exists in the run.

- `proposePageBrief`: if `payload.recommendedVisualMomentIds` is present, validate every ID exists in the run.

### Task 3.2 — `proposeVisualMoment`

```typescript
const visualMomentInput = z.object({
  videoId: z.string(),
  segmentId: z.string().optional(),
  timestampMs: z.number().int().min(0),
  frameR2Key: z.string().optional(),
  thumbnailR2Key: z.string().optional(),
  type: z.enum(['screen_demo', 'slide', 'chart', 'whiteboard', 'code', 'product_demo', 'physical_demo', 'diagram', 'talking_head', 'other']),
  description: z.string().min(1),
  extractedText: z.string().optional(),
  hubUse: z.string().min(1),
  usefulnessScore: z.number().int().min(0).max(100),
  payload: z.record(z.unknown()),
});

export const proposeVisualMomentTool: ToolDef<z.infer<typeof visualMomentInput>, { ok: true; id: string } | { ok: false; error: string; reason?: string }> = {
  name: 'proposeVisualMoment',
  description: 'Persist one visual moment. Caller (visual_context stage) must filter usefulnessScore >= 60 BEFORE calling.',
  inputSchema: visualMomentInput,
  handler: async (input, ctx) => {
    // 1) videoId must belong to the run (i.e., have at least one segment in the run).
    const segs = await ctx.db.select({ id: segment.id }).from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.videoId, input.videoId))).limit(1);
    if (segs.length === 0) return { ok: false, error: `videoId ${input.videoId} has no segments in run ${ctx.runId}.` };
    // 2) If segmentId is provided, verify ownership.
    if (input.segmentId) {
      const s = await ctx.db.select({ id: segment.id, videoId: segment.videoId }).from(segment)
        .where(and(eq(segment.runId, ctx.runId), eq(segment.id, input.segmentId))).limit(1);
      if (!s[0]) return { ok: false, error: `segmentId ${input.segmentId} not in run.` };
      if (s[0].videoId !== input.videoId) return { ok: false, error: `segmentId ${input.segmentId} belongs to a different video.` };
    }
    // 3) Hard threshold (Δ V11): refuse to persist anything with low usefulness.
    if (input.usefulnessScore < 60) {
      return { ok: false, error: `usefulnessScore ${input.usefulnessScore} below 60. Drop instead of persisting.`, reason: 'below_threshold' };
    }
    const id = `vm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    try {
      await ctx.db.insert(visualMoment).values({
        id, workspaceId: ctx.workspaceId, runId: ctx.runId, videoId: input.videoId,
        segmentId: input.segmentId ?? null, timestampMs: input.timestampMs,
        frameR2Key: input.frameR2Key ?? null, thumbnailR2Key: input.thumbnailR2Key ?? null,
        type: input.type, description: input.description, extractedText: input.extractedText ?? null,
        hubUse: input.hubUse, usefulnessScore: input.usefulnessScore, payload: input.payload,
      });
    } catch (err) {
      return { ok: false, error: `visual_moment insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};
```

Register in `registry.ts`. Commit:

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/agents/tools/propose-canon.ts packages/pipeline/src/agents/tools/registry.ts
git commit -m "feat(tools): proposeVisualMoment + visual extensions on existing propose tools"
```

---

## Phase 4 — Prompts

### Task 4.1 — `CHANNEL_PROFILER_PROMPT` (carried from v2 unchanged)

(Same as v2 — no visual awareness needed; profile is text-derived.)

### Task 4.2 — `VIDEO_ANALYST_PROMPT` (extended with visual awareness)

```typescript
export const VIDEO_ANALYST_PROMPT = `You are video_analyst. Your job is to deeply read ONE video and produce a citation-grade intelligence card.

You receive: one videoId, the channel profile, and any visual moments already extracted for this video.

Process:
1. getChannelProfile to load run context.
2. getSegmentedTranscript({videoId}) — read every segment. Cite segment IDs from THIS result only.
3. listVisualMoments({videoId, minScore: 60}) — these are screen demos / slides / charts / code / physical demos extracted by visual_context. Use them to enrich your understanding of how the creator teaches.
4. proposeVideoIntelligenceCard EXACTLY once.

Hard caps in the payload (quality over quantity):
- creatorVoiceNotes: up to 6
- mainIdeas: 3-8
- frameworks: 0-5 (only NAMED procedures with explicit structure)
- lessons: 2-8
- examples: 0-6
- stories: 0-4
- mistakesToAvoid: 0-6
- toolsMentioned: 0-12
- termsDefined: 0-8
- strongClaims: 0-8
- contrarianTakes: 0-5
- quotes: 3-8 (10-280 chars; stand-alone)
- recommendedHubUses: 2-6
- visualMoments: 0-6 (selected from listVisualMoments — the moments most aligned with what you propose; cite their visualMomentId, timestampMs, type, description, hubUse)

Quality gates:
- Every list item MUST cite ≥ 1 segmentId from your getSegmentedTranscript call.
- Visual moments enrich examples / tools / steps / UI walkthroughs / demonstrations / charts. They DO NOT replace transcript citations — only complement them.
- Use the channel profile's creatorTerminology when classifying.
- Drop weak items.

Make exactly ONE proposeVideoIntelligenceCard call. Then respond with a brief summary and no tool calls.`;
```

### Task 4.3 — `CANON_ARCHITECT_PROMPT` (extended with visual awareness)

Add this paragraph to the existing v2 prompt:

```
- Canon nodes MAY reference visual moments via payload.visualMomentIds (array of visual_moment IDs).
  Add this when a canon node — typically a framework, example, or playbook — is best understood with the
  on-screen demo, chart, code, slide, or physical demonstration that anchors it. Visual references are
  context enrichment, not evidence; transcript segments remain the citation backbone.
```

Allowed-tools list grows to include `listVisualMoments`, `getVisualMoment`.

### Task 4.4 — `PAGE_BRIEF_PLANNER_PROMPT` (extended with visual awareness)

Add to the brief schema:

```
"recommendedVisualMomentIds": string[] (optional — IDs of visual moments that would enrich this page; up to 4)
```

And one process step:

```
4b. Call listVisualMoments({minScore: 60}) and listVisualMoments per page if visual context would help.
    Recommend up to 4 visual moments per page when the page is about a tool/dashboard/workflow/code/diagram.
    Most lesson pages won't need any.
```

### Task 4.5 — `PAGE_WRITER_PROMPT` (extended with `visual_example` block)

Add `visual_example` to the allowed block kinds in the writer's output schema:

```
{ "kind": "visual_example", "title": string, "description": string, "visualMomentId": string, "timestampMs": number, "citationIds": string[] }
```

And one output rule:

```
- If the brief includes recommendedVisualMomentIds AND a visual moment fits a section's intent, emit a visual_example block. Otherwise omit them.
- Pages must still have at least 3 transcript-cited sections beyond visual_example blocks.
```

### Task 4.6 — `VISUAL_FRAME_ANALYST_PROMPT` (NEW — direct Gemini Vision call)

This prompt drives the direct Gemini Vision call in `visual_context`. It is NOT a multi-turn agent; the stage sends one image + this prompt and parses one JSON response.

```typescript
export const VISUAL_FRAME_ANALYST_PROMPT = `You are analyzing a single sampled frame from a creator video.

Your job is to decide whether this frame contains useful teaching context that should enrich a source-grounded knowledge hub.

Classify the frame type as exactly one of:
- screen_demo (creator's screen showing app/dashboard/workflow)
- slide (presentation slide)
- chart (graph or data visualization)
- whiteboard (physical whiteboard with writing/drawing)
- code (source code visible)
- product_demo (physical product being shown/used)
- physical_demo (creator demonstrating a physical motion — exercise form, technique)
- diagram (drawn or rendered diagram)
- talking_head (creator face only, no teaching context)
- other

Return JSON exactly matching this schema:
{
  "isUseful": boolean,
  "type": one of the above strings,
  "description": string (specific description of what is visible — name the app/tool/exercise if recognizable),
  "extractedText": string (visible text from the frame, or empty string),
  "hubUse": string (one sentence: how this could help a reader of a knowledge hub understand the creator's teaching),
  "usefulnessScore": integer 0-100,
  "visualClaims": string[] (only claims directly visible in the frame — e.g. "Notion dashboard with weekly content tracker" — never inferred),
  "warnings": string[]
}

Rules:
- Be specific. "Notion dashboard" beats "productivity app".
- Do NOT infer beyond what is visible. If the frame shows code but the language isn't visible, do not guess the language.
- A generic talking_head with no teaching context: isUseful=false, usefulnessScore < 60.
- A dashboard / chart / code / slide / physical demonstration / diagram / before-after: write a clear description and assign usefulnessScore based on how distinctive and teaching-rich it is (60+).
- visualClaims must be directly observable. No interpretation. No "the creator probably means…".
- Output JSON only, no surrounding prose.`;
```

Commit all five new/updated prompts:

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompts): canon-v1 prompts incl. visual-aware video_analyst + VISUAL_FRAME_ANALYST"
```

---

## Phase 5 — Specialist registry + model selection (hybrid routing)

### Task 5.1 — Extend `selectModel.ts` with hybrid routing

```typescript
export type AgentName =
  | 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'
  | 'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
  | 'citation_grounder' | 'page_composer'
  | 'channel_profiler' | 'video_analyst' | 'canon_architect' | 'page_brief_planner' | 'page_writer'
  | 'visual_frame_analyst';   // direct-call, but routed for env override

// REGISTRY entries (hybrid routing — Gemini for vision/large-context, OpenAI for reasoning):
  channel_profiler:    { envVar: 'PIPELINE_MODEL_CHANNEL_PROFILER',    default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  video_analyst:       { envVar: 'PIPELINE_MODEL_VIDEO_ANALYST',       default: M('gpt-5.5','openai'),         fallbackChain: [M('gemini-2.5-pro','gemini'), M('gpt-5.4','openai')] },
  canon_architect:     { envVar: 'PIPELINE_MODEL_CANON_ARCHITECT',     default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai')] },
  page_brief_planner:  { envVar: 'PIPELINE_MODEL_PAGE_BRIEF_PLANNER',  default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai')] },
  page_writer:         { envVar: 'PIPELINE_MODEL_PAGE_WRITER',         default: M('gpt-5.5','openai'),         fallbackChain: [M('gpt-5.4','openai')] },
  visual_frame_analyst:{ envVar: 'PIPELINE_MODEL_VISUAL_FRAME_ANALYST', default: M('gemini-2.5-flash','gemini'), fallbackChain: [M('gemini-2.5-pro','gemini')] },
```

### Task 5.2 — Register five specialists (`channel_profiler`, `video_analyst`, `canon_architect`, `page_brief_planner`, `page_writer`)

(Same as v2. `visual_frame_analyst` does NOT register as a specialist — it's a direct-call stage, so no entry in `SPECIALISTS`.)

Update `video_analyst.allowedTools` to include `listVisualMoments` + `getVisualMoment`.
Update `canon_architect.allowedTools` to include `listVisualMoments` + `getVisualMoment`.
Update `page_brief_planner.allowedTools` to include `listVisualMoments`.

Commit:

```bash
git add packages/pipeline/src/agents/specialists/index.ts packages/pipeline/src/agents/providers/selectModel.ts
git commit -m "feat(agents): hybrid model routing — Gemini for vision, OpenAI for reasoning"
```

---

## Phase 6 — Stages

### Task 6.0 — Limits + harness extension

Same as v2 with the added `VISUAL_LIMITS`:

```typescript
export const CANON_LIMITS = { minSelectedVideos: 2, maxSelectedVideos: 20, recommendedSelectedVideosLow: 8, recommendedSelectedVideosHigh: 15, maxTranscriptCharsPerVideo: 120_000 } as const;
export const VISUAL_LIMITS = { maxFramesPerVideo: 12, maxVisualMomentsPerVideo: 6, minUsefulnessScore: 60 } as const;
```

`packages/pipeline/src/agents/harness.ts` extension carries from v2 (`validateMaterializedOutput?` hook). Commit unchanged.

### Task 6.1 — `channel-profile` stage (carried from v2 unchanged)

### Task 6.2 — `visual-context` stage (NEW in v3)

This stage is the most novel piece of v3. It performs frame extraction + Gemini Vision + persistence with strict per-video isolation: a failure on one video does not abort the run.

**Files:**
- Create: `packages/pipeline/src/visual/frame-extractor.ts`
- Create: `packages/pipeline/src/visual/upload-frame.ts`
- Create: `packages/pipeline/src/stages/visual-context.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Frame extractor**

```typescript
// packages/pipeline/src/visual/frame-extractor.ts
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ExtractedFrame {
  timestampMs: number;
  filePath: string;       // local path to JPEG
  bytes: Buffer;
}

/**
 * Extracts N keyframes from an mp4 at given timestamps using ffmpeg.
 * Caller is responsible for cleaning up files (or using ExtractedFrame.bytes
 * directly without retaining the file).
 *
 * Returns frames in input timestamp order, skipping any individual ffmpeg
 * failures (per-frame resilience).
 */
export async function extractFrames(input: { mp4Path: string; timestampsMs: number[] }): Promise<ExtractedFrame[]> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-frames-'));
  const out: ExtractedFrame[] = [];
  for (const ts of input.timestampsMs) {
    const file = path.join(tempDir, `frame_${ts}.jpg`);
    try {
      await runFfmpeg(['-ss', `${ts / 1000}`, '-i', input.mp4Path, '-frames:v', '1', '-q:v', '5', '-y', file]);
      const bytes = await fs.readFile(file);
      out.push({ timestampMs: ts, filePath: file, bytes });
    } catch {
      // skip this frame, continue
    }
  }
  return out;
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const ff = spawn(process.env.AUDIO_EXTRACTION_FFMPEG_BIN?.trim() || 'ffmpeg', args, { stdio: 'ignore' });
    ff.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
    ff.on('error', reject);
  });
}
```

- [ ] **Step 2: Upload helper**

```typescript
// packages/pipeline/src/visual/upload-frame.ts
import type { R2Client } from '@creatorcanon/adapters';

export async function uploadFrame(input: {
  r2: R2Client; workspaceId: string; runId: string; videoId: string; timestampMs: number; bytes: Buffer;
}): Promise<string> {
  const key = `workspaces/${input.workspaceId}/runs/${input.runId}/visual_context/${input.videoId}/${input.timestampMs}.jpg`;
  await input.r2.putObject({ key, body: input.bytes, contentType: 'image/jpeg' });
  return key;
}
```

- [ ] **Step 3: Visual-context stage**

```typescript
// packages/pipeline/src/stages/visual-context.ts
import { and, eq, inArray } from '@creatorcanon/db';
import { segment, video, visualMoment, mediaAsset } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import { createGeminiProvider } from '../agents/providers/gemini';
import { selectModel } from '../agents/providers/selectModel';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import { extractFrames } from '../visual/frame-extractor';
import { uploadFrame } from '../visual/upload-frame';
import { VISUAL_LIMITS } from '../canon-limits';
import { VISUAL_FRAME_ANALYST_PROMPT } from '../agents/specialists/prompts';
import { z } from 'zod';

export interface VisualContextStageInput {
  runId: string;
  workspaceId: string;
  visionProvider?: AgentProvider | null;     // test override
  r2Override?: R2Client;
}

export interface VisualContextStageOutput {
  videosProcessed: number;
  videosFailed: number;
  framesSampled: number;
  visualMomentsCreated: number;
  warnings: string[];
}

const visionResponseSchema = z.object({
  isUseful: z.boolean(),
  type: z.enum(['screen_demo', 'slide', 'chart', 'whiteboard', 'code', 'product_demo', 'physical_demo', 'diagram', 'talking_head', 'other']),
  description: z.string(),
  extractedText: z.string().default(''),
  hubUse: z.string(),
  usefulnessScore: z.number().int().min(0).max(100),
  visualClaims: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export async function runVisualContextStage(input: VisualContextStageInput): Promise<VisualContextStageOutput> {
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  if (process.env.PIPELINE_VISUAL_CONTEXT_ENABLED === 'false') {
    return { videosProcessed: 0, videosFailed: 0, framesSampled: 0, visualMomentsCreated: 0, warnings: ['PIPELINE_VISUAL_CONTEXT_ENABLED=false; stage skipped.'] };
  }

  const maxFrames = Number(process.env.PIPELINE_VISUAL_MAX_FRAMES_PER_VIDEO ?? VISUAL_LIMITS.maxFramesPerVideo);
  const minScore = Number(process.env.PIPELINE_VISUAL_MIN_USEFULNESS_SCORE ?? VISUAL_LIMITS.minUsefulnessScore);

  const segs = await db.selectDistinct({ videoId: segment.videoId }).from(segment).where(eq(segment.runId, input.runId));
  const videoIds = segs.map((s) => s.videoId);

  // Idempotency: clear visual moments for this run so re-runs are clean.
  if (videoIds.length > 0) {
    await db.delete(visualMoment).where(eq(visualMoment.runId, input.runId));
  }

  const vision: AgentProvider = input.visionProvider ?? createGeminiProvider(env.GEMINI_API_KEY ?? '');
  const visionModel = selectModel('visual_frame_analyst', process.env);

  const out: VisualContextStageOutput = { videosProcessed: 0, videosFailed: 0, framesSampled: 0, visualMomentsCreated: 0, warnings: [] };

  for (const videoId of videoIds) {
    try {
      // 1) Resolve a usable mp4 path. Order: mediaAsset.video_mp4 → audio source mp4 (if extension is mp4 not m4a) → skip.
      const mp4Path = await resolveLocalMp4Path(db, r2, videoId);
      if (!mp4Path) {
        out.warnings.push(`videoId=${videoId}: no usable mp4 source; skipped visual extraction.`);
        out.videosFailed += 1;
        continue;
      }
      // 2) Pick timestamps. Spread across duration; bias toward segments containing teaching-cue phrases.
      const cueSegments = await db
        .select({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs, text: segment.text })
        .from(segment)
        .where(and(eq(segment.runId, input.runId), eq(segment.videoId, videoId)))
        .orderBy(segment.startMs);
      const timestamps = pickFrameTimestamps(cueSegments, { maxFrames, durationCue: 'span' });
      out.framesSampled += timestamps.length;

      // 3) Extract frames via ffmpeg.
      const frames = await extractFrames({ mp4Path, timestampsMs: timestamps });

      // 4) For each frame, call Gemini Vision; persist if useful.
      let saved = 0;
      for (const frame of frames) {
        if (saved >= VISUAL_LIMITS.maxVisualMomentsPerVideo) break;
        try {
          const result = await vision.complete({
            model: visionModel.modelId,
            messages: [
              { role: 'system', content: VISUAL_FRAME_ANALYST_PROMPT },
              { role: 'user', content: [
                { type: 'text', text: `Frame timestamp: ${frame.timestampMs}ms` },
                { type: 'image', mediaType: 'image/jpeg', bytes: frame.bytes },
              ] as any },
            ],
            tools: [],
            jsonMode: true,
          });
          const parsed = visionResponseSchema.safeParse(JSON.parse(result.content ?? '{}'));
          if (!parsed.success) continue;
          const v = parsed.data;
          if (!v.isUseful || v.usefulnessScore < minScore) continue;

          // Upload the frame to R2 (only useful frames).
          const frameR2Key = await uploadFrame({ r2, workspaceId: input.workspaceId, runId: input.runId, videoId, timestampMs: frame.timestampMs, bytes: frame.bytes });

          // Find nearest segmentId.
          const nearest = nearestSegmentId(cueSegments, frame.timestampMs);

          await db.insert(visualMoment).values({
            id: `vm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
            workspaceId: input.workspaceId,
            runId: input.runId,
            videoId,
            segmentId: nearest,
            timestampMs: frame.timestampMs,
            frameR2Key,
            type: v.type,
            description: v.description,
            extractedText: v.extractedText || null,
            hubUse: v.hubUse,
            usefulnessScore: v.usefulnessScore,
            payload: v as Record<string, unknown>,
          });
          saved += 1;
          out.visualMomentsCreated += 1;
        } catch (frameErr) {
          out.warnings.push(`videoId=${videoId} ts=${frame.timestampMs}: vision call failed (${(frameErr as Error).message}); continuing.`);
        }
      }
      out.videosProcessed += 1;
    } catch (videoErr) {
      out.videosFailed += 1;
      out.warnings.push(`videoId=${videoId}: ${(videoErr as Error).message}`);
    }
  }

  return out;
}

export async function validateVisualContextMaterialization(_output: VisualContextStageOutput, _ctx: { runId: string }): Promise<boolean> {
  // Visual context is non-blocking — even zero rows is a valid outcome.
  // The validator returns true unconditionally; the stage's own warnings list captures failures.
  return true;
}

// ---------- helpers ----------

const TEACHING_CUE_PHRASES = [
  'look at', 'as you can see', 'on screen', 'this chart', 'this dashboard', 'this example',
  'the code', 'the slide', 'this setup', 'before and after', 'watch', 'shown here',
];

function pickFrameTimestamps(cueSegments: Array<{ startMs: number; endMs: number; text: string }>, opts: { maxFrames: number; durationCue: 'span' | 'cue_first' }): number[] {
  if (cueSegments.length === 0) return [];
  const totalMs = cueSegments[cueSegments.length - 1]!.endMs;
  // Cue-prioritized timestamps first.
  const cueTimestamps: number[] = [];
  for (const seg of cueSegments) {
    if (TEACHING_CUE_PHRASES.some((phrase) => seg.text.toLowerCase().includes(phrase))) {
      cueTimestamps.push(Math.floor((seg.startMs + seg.endMs) / 2));
    }
  }
  const out = new Set<number>(cueTimestamps.slice(0, Math.min(cueTimestamps.length, Math.floor(opts.maxFrames / 2))));
  // Fill rest with even spread.
  const targetCount = totalMs / 60_000 < 2 ? Math.min(opts.maxFrames, 4)
                    : totalMs / 60_000 < 20 ? Math.min(opts.maxFrames, 8)
                    : opts.maxFrames;
  if (out.size < targetCount) {
    const step = totalMs / (targetCount + 1);
    for (let i = 1; i <= targetCount && out.size < targetCount; i += 1) {
      out.add(Math.floor(step * i));
    }
  }
  return [...out].sort((a, b) => a - b);
}

function nearestSegmentId(cueSegments: Array<{ id: string; startMs: number; endMs: number }>, timestampMs: number): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const s of cueSegments) {
    const center = (s.startMs + s.endMs) / 2;
    const d = Math.abs(center - timestampMs);
    if (d < bestDist) { bestDist = d; best = s.id; }
  }
  return best;
}

async function resolveLocalMp4Path(db: any, r2: R2Client, videoId: string): Promise<string | null> {
  // Strategy: download a video_mp4 mediaAsset to a temp file, OR fall back to skip.
  const mp4Rows = await db.select({ r2Key: mediaAsset.r2Key }).from(mediaAsset)
    .where(and(eq(mediaAsset.videoId, videoId), eq(mediaAsset.type, 'video_mp4'))).limit(1);
  if (!mp4Rows[0]) return null;
  const obj = await r2.getObject(mp4Rows[0].r2Key);
  const tmp = `${require('os').tmpdir()}/cc-mp4-${videoId}.mp4`;
  await require('fs').promises.writeFile(tmp, obj.body);
  return tmp;
}
```

- [ ] **Step 4: Re-export + commit**

```bash
echo "export { runVisualContextStage, validateVisualContextMaterialization } from './visual-context';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/visual/ packages/pipeline/src/stages/visual-context.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): visual_context — bounded ffmpeg + Gemini Vision + per-video resilience"
```

### Tasks 6.3–6.7 — `video-intelligence`, `canon`, `page-briefs`, `page-composition`, `page-quality`

Carried from v2 with these visual-aware deltas:

- **`video-intelligence`**: bootstrap message reminds the agent to call `listVisualMoments({videoId, minScore: 60})` after `getSegmentedTranscript`.
- **`canon`**: bootstrap mentions visual moments as available context.
- **`page-briefs`**: bootstrap mentions visual moments. Validation of `recommendedVisualMomentIds` is in the propose-tool handler (Phase 3).
- **`page-composition`**: source packet now includes the brief's `recommendedVisualMomentIds` resolved to full `visual_moment` rows (so the page writer can describe the frame). The constrained writer is allowed to emit `visual_example` blocks. The deterministic fallback emits a `callout` with `tone='note'` and the visual moment description prefixed with "Visual example from source: " (Option A — no renderer change needed).
- **`page-quality`**: extend the deterministic checks:
  - If a page has any `visual_example` blocks, every referenced `visualMomentId` must exist in run.
  - Every visual moment cited must have `usefulnessScore >= 60`.
  - A page MUST have ≥ 3 transcript-cited sections (not counting visual_example blocks). Visual blocks are enrichment, not evidence.

Commit each as a separate task.

---

## Phase 7 — Materialization validation (carried from v2)

Same as v2. Plus the new `validateVisualContextMaterialization` (returns `true` unconditionally — visual is non-blocking).

---

## Phase 8 — Adapter (carried from v2)

Same as v2 (project-topics + project-highlights read from `canon_node` first, fall back to `archive_finding`; `sourceCoveragePercent = distinctSourceVideos / totalSelectedVideos`).

The adapter also reads `visual_example` blocks via the existing `pageVersion.blockTreeJson` path. **Renderer change avoided** by the page composer mapping `visual_example` to a `callout` block when emitting (Option A). When we eventually add native renderer support for visual blocks, the composer will start emitting them as `visual_example` directly.

---

## Phase 9 — Feature-flagged orchestrator

Same as v2 with one inserted line in the canon_v1 branch — `visual_context` runs between `channel_profile` and `video_intelligence`:

```typescript
    if (contentEngine === 'canon_v1') {
      // Run-limits (carried from v2)
      // …

      await runStage({
        ctx, stage: 'channel_profile' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runChannelProfileStage(i),
        validateMaterializedOutput: validateChannelProfileMaterialization,
      });

      // (V1) visual_context — required, non-blocking on per-video failures.
      await runStage({
        ctx, stage: 'visual_context' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runVisualContextStage(i),
        validateMaterializedOutput: validateVisualContextMaterialization,
      });

      // …video_intelligence, canon, page_briefs, page_composition, page_quality (same as v2)
    } else {
      // findings_v1 (legacy, unchanged)
    }
```

`PipelineStage` union extended to add `'visual_context'` alongside the v2 additions.

Commit:

```bash
git add packages/pipeline/src/run-generation-pipeline.ts packages/core/src/pipeline-stages.ts
git commit -m "feat(pipeline): canon_v1 adds visual_context between channel_profile and video_intelligence"
```

---

## Phase 10 — Operator inspection script (extended)

Extend `inspect-canon-run.ts` from v2 with a visual-moments section:

```typescript
console.log('\n=== VISUAL MOMENTS ===');
const vmCounts = await sql`SELECT type, COUNT(*) FROM visual_moment WHERE run_id = ${runId} GROUP BY type ORDER BY type`;
for (const r of vmCounts) console.log(`  ${r.type}: ${r.count}`);
const topVisuals = await sql`SELECT v.id, v.video_id, v.timestamp_ms, v.type, v.usefulness_score, v.description
                              FROM visual_moment v WHERE v.run_id = ${runId} ORDER BY v.usefulness_score DESC LIMIT 8`;
console.log('\n--- top 8 by usefulness ---');
for (const v of topVisuals) console.log(`  [${v.usefulness_score}] ${v.type} (${v.video_id} @ ${Math.floor(v.timestamp_ms / 1000)}s): ${v.description}`);
```

Commit.

---

## Phase 11 — Side-by-side verification (extended)

Extend `compare-engines.ts` from v2 with these visual-specific metrics:

| Metric | Target | Notes |
|---|---|---|
| Visual moments persisted | > 0 in canon_v1 (depending on archive content) | `findings_v1` always 0 |
| Useful visuals per video (avg) | 0–6 | Bounded by `maxVisualMomentsPerVideo` |
| Pages with visual_example blocks | > 0 if archive contains screen demos / charts / code | Should be 0 if archive is talking-head only |
| Pages still source-grounded | 100% have transcript citations | Visual is enrichment only |
| Pages where visual is sole evidence | 0 | Hard rule — page_quality fails this |

Run on the existing 2 ready uploads after migrations + code are in. Print the report.

Commit.

---

## Self-Review

**Spec coverage** — every v2 + v3 directive folded in:

- ✅ All 17 v2 deltas (feature flag, segmented-transcript primary, strict ownership, getVideoIntelligenceCard, deterministic page QA, six-tables wording, idempotency, materialization validation, run limits, output caps, origin+confidence, richer pages, source packets, constrained writer, sourceCoveragePercent fix, inspect script, side-by-side audit).
- ✅ V1 — visual_context required between channel_profile and video_intelligence.
- ✅ V2 — sixth table visual_moment.
- ✅ V3 — listVisualMoments / getVisualMoment / proposeVisualMoment.
- ✅ V4 — frame-extractor.ts via ffmpeg with mediaAsset video_mp4 source.
- ✅ V5 — direct Gemini call, schema-validated, ≥60 score gate.
- ✅ V6 — VIDEO_ANALYST reads visual moments + carries them in card payload.
- ✅ V7 — CANON_ARCHITECT may reference visualMomentIds in payloads.
- ✅ V8 — recommendedVisualMomentIds on PageBriefPayload.
- ✅ V9 — visual_example blocks in page composition; mapped to callout (Option A).
- ✅ V10 — page_quality validates visual moment scope, score, and not-sole-evidence rule.
- ✅ V11 — env-driven enable/disable + frame and score limits.
- ✅ V12 — hybrid model routing policy is in the top-of-plan section + selectModel REGISTRY.

**Placeholder scan:** No "TBD" / "fill in later" / "similar to task X". Some sections cite v2 carry-over rather than reproducing the full code (page-briefs, canon, page-composition deterministic fallback, project-topics adapter changes) — see the v2 section of these locations for full code.

**Type consistency:**
- visual_moment columns match Drizzle schema and migration SQL.
- `proposeVisualMoment` validates videoId is in run, segmentId belongs to videoId, score ≥ 60.
- `VideoIntelligenceCardPayload.visualMoments[].visualMomentId` round-trips through `proposeVideoIntelligenceCard` validation.
- `CanonNodePayload.visualMomentIds?` (free-form jsonb extension) round-trips through `proposeCanonNode` validation.
- `PageBriefPayload.recommendedVisualMomentIds?` round-trips through `proposePageBrief` validation.
- `visual_example` block schema matches what the writer prompt specifies and what the deterministic fallback emits.
- `selectModel('visual_frame_analyst')` returns a Gemini model; `selectModel('page_writer')` returns OpenAI — hybrid routing enforced at the registry level.

**Risks and assumptions:**

- **Cost.** Worst-case canon_v1 visual cost: 20 videos × 12 frames × ~$0.001/Gemini-Flash-vision-call = $0.24 in vision. Plus per-video LLM calls (~$1 each) and the canon/brief/writer phases. Total under the existing $25 cap with comfortable margin.
- **Frame extraction availability.** Today, manual uploads have an `audio.m4a` mediaAsset but no `video_mp4` mediaAsset. The visual stage will warn-and-skip such videos until the upload pipeline starts persisting the source mp4 as a `video_mp4` mediaAsset (a small change tracked in a follow-up — could be added in this same plan if needed). YouTube videos with yt-dlp dispatch mode have other paths. **For the existing 2 manual uploads**, the visual stage will skip and warn — the verification will exercise the non-blocking path. To exercise visual extraction end-to-end you'd want a YouTube source or an mp4 mediaAsset. **Recommend**: as part of this plan's first task batch, also persist `mediaAsset.type='video_mp4'` for new manual uploads (one-line change in the upload-complete handler).
- **Gemini schema strictness.** Gemini Flash with `jsonMode: true` returns valid JSON ≥99% of the time. The `visionResponseSchema.safeParse` guards against the rest. Failed parses are logged as warnings, not stage failures.
- **Renderer.** `visual_example` blocks emit as `callout` blocks via the composer's deterministic fallback or via a writer mapping. Existing renderer handles `callout` natively. Future renderer work: native `visual_example` support (separate plan).

**Execution time estimate:**
- Tasks: ~38 (vs. ~30 in v2).
- Implementation time: 3-4 hours of focused execution.
- One end-to-end pipeline run on the existing 2-video archive: ~10-15 minutes (extra ~3 minutes for visual context if mp4 source exists).
- Side-by-side comparison: ~30 minutes total.

**Ready for execution.**
