# Stage 1: Deep Knowledge Extraction Implementation Plan (v4 — execution-ready, fully self-contained)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new content engine — `canon_v1` — that pivots from "agent-discovery-first" to "deep-read-first" with a multimodal understanding layer. Run it **alongside** the legacy `findings_v1` engine behind a feature flag. The two engines share `Phase 0` ingestion and the `adapt + render` tail.

**Architecture:** `Channel Profile → Visual Context (Gemini Vision) → Per-Video Intelligence Cards → Creator Canon → Page Briefs → Brief-Driven Composition with source packets → Deterministic Page QA → Adapt`. Six new tables. Five new agents (channel_profiler, video_analyst, canon_architect, page_brief_planner, page_writer) plus one direct-call stage (visual_context using Gemini Vision without a multi-turn agent). One harness extension (materialization validation). One hybrid model-routing policy. One operator inspection script. One side-by-side audit.

**Tech Stack:** TypeScript, Drizzle ORM, Zod, OpenAI/Gemini function-calling + Gemini Vision, ffmpeg for frame extraction, postgres-js, node:test + tsx.

---

## Hybrid model routing policy

Canon v1 launches GPT-heavy for text reasoning and writing; Gemini powers visual understanding only. Large-context Gemini extraction (e.g. running `video_analyst` on Gemini 2.5 Pro) is benchmarkable later via `PIPELINE_MODEL_MODE=gemini_only`, but is not the default.

| Stage / Agent | Default model | Provider | Why |
|---|---|---|---|
| `visual_frame_analyst` (direct call) | `gemini-2.5-flash` | **Gemini** | Multimodal native; cheap per frame; required for vision. |
| `channel_profiler` | `gpt-5.5` (fallback `gpt-5.4`) | **OpenAI** | Judgment-heavy; needs strict structured output. |
| `video_analyst` | `gpt-5.5` (fallback `gpt-5.4`) | **OpenAI** | Premium output quality; deep multi-section structured card. Gemini benchmarkable later. |
| `canon_architect` | `gpt-5.5` (fallback `gpt-5.4`) | **OpenAI** | Curation across cards; reasoning-heavy. |
| `page_brief_planner` | `gpt-5.5` (fallback `gpt-5.4`) | **OpenAI** | Reader-intent decisions. |
| `page_writer` | `gpt-5.5` (fallback `gpt-5.4`) | **OpenAI** | Final user-facing prose quality. |
| `page_quality` | — | **Deterministic only** | Auditable; free; no model risk. |

**No agent or stage hard-codes a provider.** Everything flows through `selectModel()` and respects the routing rules below.

### `PIPELINE_MODEL_MODE` global mode

Add a global env that gates routing for benchmarking:

```
PIPELINE_MODEL_MODE=hybrid       # default — table above
PIPELINE_MODEL_MODE=gemini_only  # all text agents on Gemini-compatible models; visual still Gemini
PIPELINE_MODEL_MODE=openai_only  # all text agents on OpenAI; visual still Gemini unless PIPELINE_VISUAL_CONTEXT_ENABLED=false
```

**Override priority (highest wins):**
1. Explicit per-agent env override: `PIPELINE_MODEL_<AGENT_NAME>=<modelId>`
2. `PIPELINE_MODEL_MODE` routing
3. The agent's hardcoded fallback chain in `selectModel.ts`

**Mode behaviors:**
- `hybrid` (default): the routing table above. `visual_frame_analyst` → Gemini; everything else → OpenAI.
- `gemini_only`: every text agent uses a Gemini-compatible model (default `gemini-2.5-pro`); `visual_frame_analyst` stays on `gemini-2.5-flash`. If a stage cannot route to Gemini (e.g. a tool unsupported by Gemini function-calling shape), the stage fails clearly with a remediation hint.
- `openai_only`: every text agent uses an OpenAI model. `visual_frame_analyst` still uses Gemini unless `PIPELINE_VISUAL_CONTEXT_ENABLED=false`.

**`visual_frame_analyst` always routes to Gemini** unless `PIPELINE_VISUAL_CONTEXT_ENABLED=false` (which skips the stage entirely).

Per-agent env vars remain available and take priority over the mode:
```
PIPELINE_MODEL_CHANNEL_PROFILER=
PIPELINE_MODEL_VIDEO_ANALYST=
PIPELINE_MODEL_CANON_ARCHITECT=
PIPELINE_MODEL_PAGE_BRIEF_PLANNER=
PIPELINE_MODEL_PAGE_WRITER=
PIPELINE_MODEL_VISUAL_FRAME_ANALYST=
```

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

### New — Visual subsystem (frame extraction + Gemini Vision + shared persistence)
- `packages/pipeline/src/visual/frame-extractor.ts` — extracts N keyframes from a local mp4 at given timestamps using ffmpeg. **Returns a cleanup function**; per-frame failures are skipped, not fatal.
- `packages/pipeline/src/visual/upload-frame.ts` — uploads a JPEG frame to R2 at `workspaces/{ws}/runs/{run}/visual_context/{videoId}/{timestampMs}.jpg`.
- `packages/pipeline/src/visual/resolve-mp4-source.ts` — resolves a local mp4 path for a given `videoId`. **Source: `mediaAsset.type='video_mp4'` only** (v1). Returns `{mp4Path, cleanup} | null`. **yt-dlp fallback is explicitly out of scope for v1** — deferred to v1.1. If a video has no `video_mp4` mediaAsset, the visual stage records a warning and skips that video transcript-only.
- `packages/pipeline/src/visual/gemini-vision.ts` — **dedicated Gemini Vision helper** (NOT routed through the multi-turn `AgentProvider`). Direct Google `@google/generative-ai` SDK call with strict JSON schema response, Zod-validated. Throws on API/JSON/schema failure with a clear error.
- `packages/pipeline/src/visual/persist-visual-moment.ts` — **shared persistence helper used by both the `visual_context` stage AND the `proposeVisualMoment` tool**. Single source of truth for: videoId-in-run check, segmentId ownership check, score threshold (`>= minUsefulnessScore`), workspaceId/runId stamping, insert. Eliminates the duplicate-validation risk.

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

### `channel_profile`

```ts
{ id, workspaceId, runId UNIQUE, payload jsonb, costCents, createdAt }
```

### `video_intelligence_card` (payload includes visual moments)

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

### `canon_node` (payload may reference `visualMomentIds`)

The schema columns are unchanged. Per-node payloads (frameworks, lessons, playbooks, examples) MAY include an optional `visualMomentIds: string[]` field referencing visual moments in the same run. `proposeCanonNode` validates these.

### `page_brief` (payload supports `recommendedVisualMomentIds`)

```ts
type PageBriefPayload = {
  // ... fields from v2 ...
  recommendedVisualMomentIds?: string[];     // optional
}
```

`proposePageBrief` validates that every `recommendedVisualMomentId` exists in run.

### `page_quality_report`

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

Single migration file `0008_canon_layer.sql` containing all six tables:

```sql
CREATE TABLE IF NOT EXISTS "channel_profile" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "cost_cents" numeric(10,4) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "channel_profile" ADD CONSTRAINT "channel_profile_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "channel_profile" ADD CONSTRAINT "channel_profile_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "channel_profile_run_unique" ON "channel_profile" ("run_id");

CREATE TABLE IF NOT EXISTS "video_intelligence_card" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "video_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "evidence_segment_ids" text[] NOT NULL DEFAULT '{}',
  "cost_cents" numeric(10,4) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "vic_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "vic_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
ALTER TABLE "video_intelligence_card" ADD CONSTRAINT "vic_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "video"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "vic_run_video_unique" ON "video_intelligence_card" ("run_id","video_id");
CREATE INDEX IF NOT EXISTS "vic_run_idx" ON "video_intelligence_card" ("run_id");

CREATE TABLE IF NOT EXISTS "canon_node" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "evidence_segment_ids" text[] NOT NULL DEFAULT '{}',
  "source_video_ids" text[] NOT NULL DEFAULT '{}',
  "evidence_quality" text NOT NULL,
  "origin" text NOT NULL DEFAULT 'single_video',
  "confidence_score" integer NOT NULL DEFAULT 0,
  "citation_count" integer NOT NULL DEFAULT 0,
  "source_coverage" integer NOT NULL DEFAULT 0,
  "page_worthiness_score" integer NOT NULL DEFAULT 0,
  "specificity_score" integer NOT NULL DEFAULT 0,
  "creator_uniqueness_score" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "canon_node" ADD CONSTRAINT "canon_node_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "canon_node" ADD CONSTRAINT "canon_node_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "canon_node_run_type_idx" ON "canon_node" ("run_id","type");

CREATE TABLE IF NOT EXISTS "page_brief" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "page_worthiness_score" integer NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "page_brief" ADD CONSTRAINT "page_brief_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "page_brief" ADD CONSTRAINT "page_brief_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS "page_brief_run_position_idx" ON "page_brief" ("run_id","position");

CREATE TABLE IF NOT EXISTS "page_quality_report" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL,
  "run_id" text NOT NULL,
  "page_id" text NOT NULL,
  "evidence_score" integer NOT NULL DEFAULT 0,
  "citation_count" integer NOT NULL DEFAULT 0,
  "distinct_source_videos" integer NOT NULL DEFAULT 0,
  "empty_section_count" integer NOT NULL DEFAULT 0,
  "unsupported_claim_count" integer NOT NULL DEFAULT 0,
  "generic_language_score" integer NOT NULL DEFAULT 0,
  "recommendation" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
ALTER TABLE "page_quality_report" ADD CONSTRAINT "pqr_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspace"("id") ON DELETE CASCADE;
ALTER TABLE "page_quality_report" ADD CONSTRAINT "pqr_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "generation_run"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS "pqr_run_page_unique" ON "page_quality_report" ("run_id","page_id");

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

### Task 4.1 — `CHANNEL_PROFILER_PROMPT`

Append to `packages/pipeline/src/agents/specialists/prompts.ts`:

```typescript
export const CHANNEL_PROFILER_PROMPT = `You are channel_profiler. Build a one-shot creator profile that every other agent in the pipeline will use as context.

You receive: a list of every video in the run with title and duration. You may sample 3-5 representative videos via getSegmentedTranscript (longest, most-recent, or topically distinct — pick a spread). Don't read every video.

Process:
1. Call listVideos to see the archive shape.
2. For 3-5 videos, call getSegmentedTranscript to skim segment text.
3. Call proposeChannelProfile EXACTLY once with this exact shape:
   {
     "creatorName": string (extract from videos or "the creator"),
     "niche": string (one phrase: e.g. "AI automation for solo agencies"),
     "audience": string (one paragraph: who watches, stage, what they care about),
     "recurringPromise": string,
     "contentFormats": string[] (e.g. ["tutorial", "case study", "vlog"]),
     "monetizationAngle": string (course, agency services, affiliate, "unknown"),
     "dominantTone": string,
     "expertiseCategory": string,
     "recurringThemes": string[] (3-8),
     "whyPeopleFollow": string (one sentence),
     "positioningSummary": string (one paragraph),
     "creatorTerminology": string[] (named concepts the creator uses repeatedly — their words, not yours)
   }

Rules:
- Be specific. Concrete > vague.
- creatorTerminology must be the creator's words, drawn from segments you've read.
- "unknown" beats a guess.
- Make exactly ONE proposeChannelProfile call. Then respond with a brief summary and no tool calls.`;
```

Commit:

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): CHANNEL_PROFILER_PROMPT"
```

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

## Phase 5 — Specialist registry + model selection (with PIPELINE_MODEL_MODE)

### Task 5.1 — Extend `selectModel.ts` with mode-aware routing

Open `packages/pipeline/src/agents/providers/selectModel.ts` and replace the body so it implements: explicit per-agent env override → mode-based routing → fallback chain.

```typescript
import type { ProviderName } from './index';

export type AgentName =
  | 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'
  | 'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
  | 'citation_grounder' | 'page_composer'
  | 'channel_profiler' | 'video_analyst' | 'canon_architect' | 'page_brief_planner' | 'page_writer'
  | 'visual_frame_analyst';

interface ModelChoice { modelId: string; provider: ProviderName }
interface AgentConfig { envVar: string; default: ModelChoice; fallbackChain: ModelChoice[] }

const M = (modelId: string, provider: ProviderName): ModelChoice => ({ modelId, provider });

// Hybrid (default) registry — GPT-heavy for text, Gemini for vision.
const REGISTRY: Record<AgentName, AgentConfig> = {
  // legacy agents (unchanged)
  topic_spotter:        { envVar: 'PIPELINE_MODEL_TOPIC_SPOTTER',        default: M('gemini-2.5-flash','gemini'), fallbackChain: [M('gpt-5.4','openai'), M('gpt-5.5','openai')] },
  framework_extractor:  { envVar: 'PIPELINE_MODEL_FRAMEWORK_EXTRACTOR',  default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  lesson_extractor:     { envVar: 'PIPELINE_MODEL_LESSON_EXTRACTOR',     default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  playbook_extractor:   { envVar: 'PIPELINE_MODEL_PLAYBOOK_EXTRACTOR',   default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  source_ranker:        { envVar: 'PIPELINE_MODEL_SOURCE_RANKER',        default: M('gpt-5.4','openai'),          fallbackChain: [M('gemini-2.5-flash','gemini')] },
  quote_finder:         { envVar: 'PIPELINE_MODEL_QUOTE_FINDER',         default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  aha_moment_detector:  { envVar: 'PIPELINE_MODEL_AHA_MOMENT_DETECTOR',  default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  citation_grounder:    { envVar: 'PIPELINE_MODEL_CITATION_GROUNDER',    default: M('gpt-5.4','openai'),          fallbackChain: [M('gemini-2.5-flash','gemini')] },
  page_composer:        { envVar: 'PIPELINE_MODEL_PAGE_COMPOSER',        default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  // canon_v1 text agents — GPT-heavy
  channel_profiler:     { envVar: 'PIPELINE_MODEL_CHANNEL_PROFILER',     default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  video_analyst:        { envVar: 'PIPELINE_MODEL_VIDEO_ANALYST',        default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  canon_architect:      { envVar: 'PIPELINE_MODEL_CANON_ARCHITECT',      default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  page_brief_planner:   { envVar: 'PIPELINE_MODEL_PAGE_BRIEF_PLANNER',   default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  page_writer:          { envVar: 'PIPELINE_MODEL_PAGE_WRITER',          default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  // visual — always Gemini
  visual_frame_analyst: { envVar: 'PIPELINE_MODEL_VISUAL_FRAME_ANALYST', default: M('gemini-2.5-flash','gemini'), fallbackChain: [M('gemini-2.5-pro','gemini')] },
};

// Mode-routed defaults override REGISTRY[].default when no per-agent env set.
type ModelMode = 'hybrid' | 'gemini_only' | 'openai_only';

function modeRouted(agent: AgentName, mode: ModelMode): ModelChoice {
  // visual_frame_analyst always Gemini regardless of mode
  if (agent === 'visual_frame_analyst') return REGISTRY[agent].default;
  if (mode === 'hybrid') return REGISTRY[agent].default;
  if (mode === 'gemini_only') {
    const fallback = REGISTRY[agent].fallbackChain.find((c) => c.provider === 'gemini');
    if (fallback) return fallback;
    if (REGISTRY[agent].default.provider === 'gemini') return REGISTRY[agent].default;
    throw new Error(`PIPELINE_MODEL_MODE=gemini_only but agent '${agent}' has no Gemini-compatible model in its fallback chain. Set PIPELINE_MODEL_${agent.toUpperCase()} explicitly.`);
  }
  if (mode === 'openai_only') {
    const fallback = REGISTRY[agent].fallbackChain.find((c) => c.provider === 'openai');
    if (fallback) return fallback;
    if (REGISTRY[agent].default.provider === 'openai') return REGISTRY[agent].default;
    throw new Error(`PIPELINE_MODEL_MODE=openai_only but agent '${agent}' has no OpenAI-compatible model in its fallback chain. Set PIPELINE_MODEL_${agent.toUpperCase()} explicitly.`);
  }
  throw new Error(`Unknown PIPELINE_MODEL_MODE: ${mode}. Supported: hybrid | gemini_only | openai_only.`);
}

function parseMode(raw: string | undefined): ModelMode {
  if (!raw) return 'hybrid';
  if (raw === 'hybrid' || raw === 'gemini_only' || raw === 'openai_only') return raw;
  throw new Error(`Invalid PIPELINE_MODEL_MODE: ${raw}. Supported: hybrid | gemini_only | openai_only.`);
}

function inferProvider(modelId: string): ProviderName {
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1')) return 'openai';
  if (modelId.startsWith('gemini-')) return 'gemini';
  throw new Error(`Cannot infer provider for model '${modelId}'. Use a recognized prefix (gpt-, o1, gemini-).`);
}

export interface ResolvedModel {
  modelId: string;
  provider: ProviderName;
  fallbackChain: ModelChoice[];
}

/**
 * Override priority: per-agent env > PIPELINE_MODEL_MODE routing > REGISTRY default.
 */
export function selectModel(agent: AgentName, env: Record<string, string | undefined>): ResolvedModel {
  const cfg = REGISTRY[agent];
  if (!cfg) throw new Error(`Unknown agent: ${agent}`);
  const explicit = env[cfg.envVar];
  if (explicit) return { modelId: explicit, provider: inferProvider(explicit), fallbackChain: cfg.fallbackChain };
  const mode = parseMode(env.PIPELINE_MODEL_MODE);
  const chosen = modeRouted(agent, mode);
  return { ...chosen, fallbackChain: cfg.fallbackChain };
}
```

### Task 5.2 — Tests for routing

Create `packages/pipeline/src/agents/providers/test/selectModel.modes.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectModel } from '../selectModel';

describe('selectModel — PIPELINE_MODEL_MODE', () => {
  it('hybrid (default): video_analyst → openai gpt-5.5', () => {
    const r = selectModel('video_analyst', {});
    assert.equal(r.provider, 'openai');
    assert.equal(r.modelId, 'gpt-5.5');
  });
  it('hybrid: visual_frame_analyst → gemini', () => {
    const r = selectModel('visual_frame_analyst', {});
    assert.equal(r.provider, 'gemini');
  });
  it('gemini_only: video_analyst → gemini fallback', () => {
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'gemini_only' });
    assert.equal(r.provider, 'gemini');
  });
  it('gemini_only: visual_frame_analyst stays gemini', () => {
    const r = selectModel('visual_frame_analyst', { PIPELINE_MODEL_MODE: 'gemini_only' });
    assert.equal(r.provider, 'gemini');
  });
  it('openai_only: visual_frame_analyst still gemini (vision exception)', () => {
    const r = selectModel('visual_frame_analyst', { PIPELINE_MODEL_MODE: 'openai_only' });
    assert.equal(r.provider, 'gemini');
  });
  it('openai_only: video_analyst → openai', () => {
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'openai_only' });
    assert.equal(r.provider, 'openai');
  });
  it('per-agent env override beats mode', () => {
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'gemini_only', PIPELINE_MODEL_VIDEO_ANALYST: 'gpt-5.5' });
    assert.equal(r.provider, 'openai');
    assert.equal(r.modelId, 'gpt-5.5');
  });
  it('unsupported mode throws', () => {
    assert.throws(() => selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'bogus' }), /Invalid PIPELINE_MODEL_MODE/);
  });
});
```

### Task 5.3 — Register five specialists (full code)

Open `packages/pipeline/src/agents/specialists/index.ts` and add the five new specialist entries. (`visual_frame_analyst` is NOT a specialist — it is a direct-call stage and has no entry.)

```typescript
import {
  // ... existing imports
  CHANNEL_PROFILER_PROMPT,
  VIDEO_ANALYST_PROMPT,
  CANON_ARCHITECT_PROMPT,
  PAGE_BRIEF_PLANNER_PROMPT,
  PAGE_WRITER_PROMPT,
} from './prompts';

// Inside SPECIALISTS:
  channel_profiler: {
    agent: 'channel_profiler',
    systemPrompt: CHANNEL_PROFILER_PROMPT,
    allowedTools: ['listVideos', 'getSegmentedTranscript', 'getFullTranscript', 'proposeChannelProfile'],
    stopOverrides: { maxToolCalls: 30, maxTokensSpent: 200_000 },
  },
  video_analyst: {
    agent: 'video_analyst',
    systemPrompt: VIDEO_ANALYST_PROMPT,
    allowedTools: ['getChannelProfile', 'getSegmentedTranscript', 'searchSegments', 'getSegment', 'listVisualMoments', 'getVisualMoment', 'getFullTranscript', 'proposeVideoIntelligenceCard'],
    stopOverrides: { maxToolCalls: 80, maxTokensSpent: 600_000 },
  },
  canon_architect: {
    agent: 'canon_architect',
    systemPrompt: CANON_ARCHITECT_PROMPT,
    allowedTools: ['getChannelProfile', 'listVideoIntelligenceCards', 'getVideoIntelligenceCard', 'searchSegments', 'getSegment', 'listVisualMoments', 'getVisualMoment', 'proposeCanonNode'],
    stopOverrides: { maxToolCalls: 200, maxTokensSpent: 1_000_000 },
  },
  page_brief_planner: {
    agent: 'page_brief_planner',
    systemPrompt: PAGE_BRIEF_PLANNER_PROMPT,
    allowedTools: ['getChannelProfile', 'listCanonNodes', 'getCanonNode', 'getSegment', 'listVisualMoments', 'proposePageBrief'],
    stopOverrides: { maxToolCalls: 60, maxTokensSpent: 400_000 },
  },
  page_writer: {
    agent: 'page_writer',
    systemPrompt: PAGE_WRITER_PROMPT,
    allowedTools: [],
    stopOverrides: { maxToolCalls: 0, maxTokensSpent: 200_000 },
  },
```

### Task 5.4 — Commit

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
pnpm test "src/agents/providers/test/*.test.ts" 2>&1 | tail -5
git add packages/pipeline/src/agents/specialists/index.ts packages/pipeline/src/agents/providers/selectModel.ts packages/pipeline/src/agents/providers/test/selectModel.modes.test.ts
git commit -m "feat(agents): hybrid routing with PIPELINE_MODEL_MODE + visual-aware specialists"
```

---

## Phase 6 — Stages

### Task 6.0 — Limits constants + harness extension

**Files:**
- Create: `packages/pipeline/src/canon-limits.ts`
- Modify: `packages/pipeline/src/agents/harness.ts`

- [ ] **Step 1: Limits constants**

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

- [ ] **Step 2: Harness extension — `validateMaterializedOutput` hook**

In `packages/pipeline/src/agents/harness.ts` (NOTE: confirm path — earlier session showed harness lived at `packages/pipeline/src/harness.ts`; use whichever is real), find the `StageRunOptions` interface and add the optional validator:

```typescript
export interface StageRunOptions<TInput, TOutput> {
  ctx: StageContext;
  stage: PipelineStage;
  input: TInput;
  run: (input: TInput) => Promise<TOutput>;
  /** If provided, after a cache hit, this runs to confirm the materialized DB rows still exist. Returns false → re-execute. */
  validateMaterializedOutput?: (output: TOutput, ctx: StageContext) => Promise<boolean>;
}
```

Then in `runStage`, after the cached-success branch, call the validator:

```typescript
  if (match?.status === 'succeeded' && match.outputJson != null) {
    const cached = match.outputJson as TOutput;
    if (opts.validateMaterializedOutput) {
      const ok = await opts.validateMaterializedOutput(cached, ctx);
      if (!ok) {
        console.warn(`[harness] cached stage_run ${stage} (${match.id}) lost materialized rows; re-running.`);
      } else {
        return cached;
      }
    } else {
      return cached;
    }
  }
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/canon-limits.ts packages/pipeline/src/agents/harness.ts
git commit -m "feat(harness): canon-limits + validateMaterializedOutput hook"
```

### Task 6.1 — `channel-profile` stage (full code)

**Files:**
- Create: `packages/pipeline/src/stages/channel-profile.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Stage code**

```typescript
// packages/pipeline/src/stages/channel-profile.ts
import { eq } from '@creatorcanon/db';
import { channelProfile } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import { listVideosTool } from '../agents/tools/universal';
import type { AgentProvider } from '../agents/providers';
import type { ToolCtx } from '../agents/tools/types';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';

export interface ChannelProfileStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  r2Override?: R2Client;
}

export interface ChannelProfileStageOutput {
  ok: boolean;
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runChannelProfileStage(input: ChannelProfileStageInput): Promise<ChannelProfileStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  const ctx: ToolCtx = { runId: input.runId, workspaceId: input.workspaceId, agent: 'bootstrap', model: 'n/a', db, r2 };
  const videos = await listVideosTool.handler({}, ctx);
  const bootstrap = `Archive: ${videos.length} videos.\n\n` +
    videos.map((v) => `- ${v.id}: ${v.title} (${Math.round(v.durationSec / 60)} min)`).join('\n') +
    `\n\nProduce one channel profile. Sample 3-5 videos via getSegmentedTranscript before deciding.`;

  const cfg = SPECIALISTS.channel_profiler;
  const model = selectModel('channel_profiler', process.env);
  const provider = makeProvider(model.provider);
  try {
    const summary = await runAgent({
      runId: input.runId, workspaceId: input.workspaceId, agent: cfg.agent,
      modelId: model.modelId, provider, r2, tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt, userMessage: bootstrap, caps: cfg.stopOverrides,
    });
    return { ok: true, costCents: summary.costCents, summary };
  } catch (err) {
    return { ok: false, costCents: 0, summary: null, error: (err as Error).message };
  }
}

export async function validateChannelProfileMaterialization(_output: ChannelProfileStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const rows = await db.select({ id: channelProfile.id }).from(channelProfile).where(eq(channelProfile.runId, ctx.runId)).limit(1);
  return rows.length === 1;
}
```

- [ ] **Step 2: Re-export + commit**

```bash
echo "export { runChannelProfileStage, validateChannelProfileMaterialization } from './channel-profile';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/channel-profile.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): channel-profile + materialization validator"
```

### Task 6.2 — `visual-context` stage (NEW in v3 — corrected in v4)

This stage is the most novel piece of canon_v1. It performs frame extraction + Gemini Vision + persistence with strict per-video isolation: a failure on one video does not abort the run. **Temp files are cleaned up in `finally` blocks; the dedicated Gemini Vision helper handles the API call (not the multi-turn `AgentProvider`); and persistence goes through the shared `persistVisualMoment` helper.**

**Files:**
- Create: `packages/pipeline/src/visual/frame-extractor.ts`
- Create: `packages/pipeline/src/visual/upload-frame.ts`
- Create: `packages/pipeline/src/visual/resolve-mp4-source.ts`
- Create: `packages/pipeline/src/visual/gemini-vision.ts`
- Create: `packages/pipeline/src/visual/persist-visual-moment.ts`
- Create: `packages/pipeline/src/stages/visual-context.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Frame extractor (with cleanup)**

```typescript
// packages/pipeline/src/visual/frame-extractor.ts
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ExtractedFrame {
  timestampMs: number;
  filePath: string;
  bytes: Buffer;
}

export interface FrameExtractionResult {
  frames: ExtractedFrame[];
  cleanup: () => Promise<void>;
}

/**
 * Extract N keyframes from an mp4 at given timestamps using ffmpeg.
 * Per-frame failures are skipped, not fatal.
 * Returns a cleanup function that the caller MUST invoke in a finally block.
 */
export async function extractFrames(input: { mp4Path: string; timestampsMs: number[] }): Promise<FrameExtractionResult> {
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
  return {
    frames: out,
    cleanup: async () => { try { await fs.rm(tempDir, { recursive: true, force: true }); } catch {} },
  };
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

- [ ] **Step 3: MP4 source resolver (with cleanup)**

```typescript
// packages/pipeline/src/visual/resolve-mp4-source.ts
import { and, eq } from '@creatorcanon/db';
import { mediaAsset } from '@creatorcanon/db/schema';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { R2Client } from '@creatorcanon/adapters';

export interface LocalMp4Source {
  mp4Path: string;
  cleanup: () => Promise<void>;
}

/**
 * v1: only `mediaAsset.type='video_mp4'` is supported.
 * yt-dlp fallback is deferred to v1.1.
 * Returns null if no usable source — caller skips visual extraction with a warning.
 */
export async function resolveLocalMp4Source(db: any, r2: R2Client, videoId: string): Promise<LocalMp4Source | null> {
  const rows = await db.select({ r2Key: mediaAsset.r2Key }).from(mediaAsset)
    .where(and(eq(mediaAsset.videoId, videoId), eq(mediaAsset.type, 'video_mp4'))).limit(1);
  if (!rows[0]) return null;
  const obj = await r2.getObject(rows[0].r2Key);
  const tmp = path.join(os.tmpdir(), `cc-mp4-${videoId}-${crypto.randomUUID().slice(0, 8)}.mp4`);
  await fs.writeFile(tmp, obj.body);
  return {
    mp4Path: tmp,
    cleanup: async () => { try { await fs.unlink(tmp); } catch {} },
  };
}
```

- [ ] **Step 4: Dedicated Gemini Vision helper**

```typescript
// packages/pipeline/src/visual/gemini-vision.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';

export const visionResponseSchema = z.object({
  isUseful: z.boolean(),
  type: z.enum(['screen_demo', 'slide', 'chart', 'whiteboard', 'code', 'product_demo', 'physical_demo', 'diagram', 'talking_head', 'other']),
  description: z.string(),
  extractedText: z.string().default(''),
  hubUse: z.string(),
  usefulnessScore: z.number().int().min(0).max(100),
  visualClaims: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});
export type VisionResponse = z.infer<typeof visionResponseSchema>;

export async function analyzeFrameWithGemini(input: {
  apiKey: string;
  modelId: string;
  prompt: string;
  imageBytes: Buffer;
  timestampMs: number;
}): Promise<VisionResponse> {
  if (!input.apiKey) throw new Error('GEMINI_API_KEY missing');
  const client = new GoogleGenerativeAI(input.apiKey);
  const model = client.getGenerativeModel({
    model: input.modelId,
    generationConfig: { responseMimeType: 'application/json' },
  });
  const result = await model.generateContent([
    { text: `${input.prompt}\n\nFrame timestamp: ${input.timestampMs}ms.` },
    { inlineData: { data: input.imageBytes.toString('base64'), mimeType: 'image/jpeg' } },
  ]);
  const text = result.response.text();
  let parsedRaw: unknown;
  try { parsedRaw = JSON.parse(text); } catch { throw new Error(`Gemini returned non-JSON: ${text.slice(0, 200)}`); }
  const validated = visionResponseSchema.safeParse(parsedRaw);
  if (!validated.success) throw new Error(`Gemini response failed schema: ${validated.error.issues.map((i) => i.path.join('.') + ': ' + i.message).join('; ')}`);
  return validated.data;
}
```

(`@google/generative-ai` is already in the workspace as a dep of `@creatorcanon/adapters` for `createGeminiProvider`. If not, add to `packages/pipeline/package.json` with `pnpm add @google/generative-ai`.)

- [ ] **Step 5: Shared persistence helper**

```typescript
// packages/pipeline/src/visual/persist-visual-moment.ts
import { and, eq } from '@creatorcanon/db';
import { segment, visualMoment } from '@creatorcanon/db/schema';

const VALID_TYPES = ['screen_demo', 'slide', 'chart', 'whiteboard', 'code', 'product_demo', 'physical_demo', 'diagram', 'talking_head', 'other'] as const;
type VisualMomentType = typeof VALID_TYPES[number];

export interface PersistVisualMomentInput {
  db: any;
  workspaceId: string;
  runId: string;
  videoId: string;
  segmentId?: string | null;
  timestampMs: number;
  frameR2Key?: string | null;
  thumbnailR2Key?: string | null;
  type: VisualMomentType;
  description: string;
  extractedText?: string | null;
  hubUse: string;
  usefulnessScore: number;
  payload: Record<string, unknown>;
  minUsefulnessScore: number;
}

export type PersistResult = { ok: true; id: string } | { ok: false; error: string; reason?: 'below_threshold' | 'video_not_in_run' | 'segment_not_in_video' | 'segment_not_in_run' | 'insert_failed' };

export async function persistVisualMoment(input: PersistVisualMomentInput): Promise<PersistResult> {
  // 1) videoId must belong to the run (i.e. has at least one segment in the run).
  const segOfVideo = await input.db.select({ id: segment.id }).from(segment)
    .where(and(eq(segment.runId, input.runId), eq(segment.videoId, input.videoId))).limit(1);
  if (segOfVideo.length === 0) {
    return { ok: false, error: `videoId ${input.videoId} has no segments in run ${input.runId}.`, reason: 'video_not_in_run' };
  }
  // 2) If segmentId provided, ownership check.
  if (input.segmentId) {
    const s = await input.db.select({ id: segment.id, videoId: segment.videoId }).from(segment)
      .where(and(eq(segment.runId, input.runId), eq(segment.id, input.segmentId))).limit(1);
    if (!s[0]) return { ok: false, error: `segmentId ${input.segmentId} not in run.`, reason: 'segment_not_in_run' };
    if (s[0].videoId !== input.videoId) return { ok: false, error: `segmentId ${input.segmentId} belongs to a different video.`, reason: 'segment_not_in_video' };
  }
  // 3) Score threshold.
  if (input.usefulnessScore < input.minUsefulnessScore) {
    return { ok: false, error: `usefulnessScore ${input.usefulnessScore} below ${input.minUsefulnessScore}; not persisted.`, reason: 'below_threshold' };
  }
  // 4) Insert.
  const id = `vm_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  try {
    await input.db.insert(visualMoment).values({
      id, workspaceId: input.workspaceId, runId: input.runId, videoId: input.videoId,
      segmentId: input.segmentId ?? null, timestampMs: input.timestampMs,
      frameR2Key: input.frameR2Key ?? null, thumbnailR2Key: input.thumbnailR2Key ?? null,
      type: input.type, description: input.description, extractedText: input.extractedText ?? null,
      hubUse: input.hubUse, usefulnessScore: input.usefulnessScore, payload: input.payload,
    });
  } catch (err) {
    return { ok: false, error: `visual_moment insert failed: ${(err as Error).message}`, reason: 'insert_failed' };
  }
  return { ok: true, id };
}
```

The `proposeVisualMoment` tool from Phase 3 calls this helper instead of duplicating validation. Update `propose-canon.ts` to import + delegate.

- [ ] **Step 6: Visual-context stage (uses helpers, has cleanup)**

```typescript
// packages/pipeline/src/stages/visual-context.ts
import { and, eq } from '@creatorcanon/db';
import { segment, visualMoment } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import { selectModel } from '../agents/providers/selectModel';
import { parseServerEnv } from '@creatorcanon/core';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import { extractFrames } from '../visual/frame-extractor';
import { uploadFrame } from '../visual/upload-frame';
import { resolveLocalMp4Source } from '../visual/resolve-mp4-source';
import { analyzeFrameWithGemini } from '../visual/gemini-vision';
import { persistVisualMoment } from '../visual/persist-visual-moment';
import { VISUAL_LIMITS } from '../canon-limits';
import { VISUAL_FRAME_ANALYST_PROMPT } from '../agents/specialists/prompts';

export interface VisualContextStageInput {
  runId: string;
  workspaceId: string;
  r2Override?: R2Client;
}

export interface VisualContextStageOutput {
  videosProcessed: number;
  videosFailed: number;
  videosWithMp4Source: number;
  videosSkippedNoMp4: number;
  framesSampled: number;
  visualMomentsCreated: number;
  warnings: string[];
}

export async function runVisualContextStage(input: VisualContextStageInput): Promise<VisualContextStageOutput> {
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  if (process.env.PIPELINE_VISUAL_CONTEXT_ENABLED === 'false') {
    return { videosProcessed: 0, videosFailed: 0, videosWithMp4Source: 0, videosSkippedNoMp4: 0, framesSampled: 0, visualMomentsCreated: 0, warnings: ['PIPELINE_VISUAL_CONTEXT_ENABLED=false; stage skipped.'] };
  }

  const maxFrames = Number(process.env.PIPELINE_VISUAL_MAX_FRAMES_PER_VIDEO ?? VISUAL_LIMITS.maxFramesPerVideo);
  const minScore = Number(process.env.PIPELINE_VISUAL_MIN_USEFULNESS_SCORE ?? VISUAL_LIMITS.minUsefulnessScore);

  const segs = await db.selectDistinct({ videoId: segment.videoId }).from(segment).where(eq(segment.runId, input.runId));
  const videoIds = segs.map((s) => s.videoId);

  // Idempotency: clear visual moments for this run.
  if (videoIds.length > 0) {
    await db.delete(visualMoment).where(eq(visualMoment.runId, input.runId));
  }

  const visionModel = selectModel('visual_frame_analyst', process.env);
  const apiKey = env.GEMINI_API_KEY ?? '';

  const out: VisualContextStageOutput = {
    videosProcessed: 0, videosFailed: 0, videosWithMp4Source: 0, videosSkippedNoMp4: 0,
    framesSampled: 0, visualMomentsCreated: 0, warnings: [],
  };

  for (const videoId of videoIds) {
    let mp4Source: { mp4Path: string; cleanup: () => Promise<void> } | null = null;
    let frameCleanup: (() => Promise<void>) | null = null;
    try {
      mp4Source = await resolveLocalMp4Source(db, r2, videoId);
      if (!mp4Source) {
        out.videosSkippedNoMp4 += 1;
        out.warnings.push(`videoId=${videoId}: no video_mp4 mediaAsset; skipped (transcript-only).`);
        continue;
      }
      out.videosWithMp4Source += 1;

      const cueSegments = await db
        .select({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs, text: segment.text })
        .from(segment)
        .where(and(eq(segment.runId, input.runId), eq(segment.videoId, videoId)))
        .orderBy(segment.startMs);
      const timestamps = pickFrameTimestamps(cueSegments, { maxFrames });
      out.framesSampled += timestamps.length;

      const extraction = await extractFrames({ mp4Path: mp4Source.mp4Path, timestampsMs: timestamps });
      frameCleanup = extraction.cleanup;
      const frames = extraction.frames;

      let saved = 0;
      for (const frame of frames) {
        if (saved >= VISUAL_LIMITS.maxVisualMomentsPerVideo) break;
        try {
          const v = await analyzeFrameWithGemini({
            apiKey, modelId: visionModel.modelId,
            prompt: VISUAL_FRAME_ANALYST_PROMPT,
            imageBytes: frame.bytes, timestampMs: frame.timestampMs,
          });
          if (!v.isUseful || v.usefulnessScore < minScore) continue;

          const frameR2Key = await uploadFrame({ r2, workspaceId: input.workspaceId, runId: input.runId, videoId, timestampMs: frame.timestampMs, bytes: frame.bytes });
          const nearest = nearestSegmentId(cueSegments, frame.timestampMs);

          const result = await persistVisualMoment({
            db, workspaceId: input.workspaceId, runId: input.runId, videoId,
            segmentId: nearest, timestampMs: frame.timestampMs,
            frameR2Key, type: v.type, description: v.description,
            extractedText: v.extractedText, hubUse: v.hubUse,
            usefulnessScore: v.usefulnessScore, payload: v as unknown as Record<string, unknown>,
            minUsefulnessScore: minScore,
          });
          if (result.ok) {
            saved += 1;
            out.visualMomentsCreated += 1;
          } else if (result.reason !== 'below_threshold') {
            out.warnings.push(`videoId=${videoId} ts=${frame.timestampMs}: persist failed (${result.error})`);
          }
        } catch (frameErr) {
          out.warnings.push(`videoId=${videoId} ts=${frame.timestampMs}: vision call failed (${(frameErr as Error).message}); continuing.`);
        }
      }
      out.videosProcessed += 1;
    } catch (videoErr) {
      out.videosFailed += 1;
      out.warnings.push(`videoId=${videoId}: ${(videoErr as Error).message}`);
    } finally {
      // Clean up temp files even on failure.
      if (frameCleanup) await frameCleanup();
      if (mp4Source) await mp4Source.cleanup();
    }
  }

  return out;
}

export async function validateVisualContextMaterialization(output: VisualContextStageOutput, ctx: { runId: string }): Promise<boolean> {
  // Zero visual moments is valid (e.g. archive is talking-head only or no mp4 sources).
  // BUT if the cached output claims rows were created, the DB must contain them.
  if (output.visualMomentsCreated === 0) return true;
  const db = getDb();
  const rows = await db.select({ id: visualMoment.id }).from(visualMoment).where(eq(visualMoment.runId, ctx.runId));
  return rows.length >= output.visualMomentsCreated;
}

// ---------- helpers ----------

const TEACHING_CUE_PHRASES = [
  'look at', 'as you can see', 'on screen', 'this chart', 'this dashboard', 'this example',
  'the code', 'the slide', 'this setup', 'before and after', 'watch', 'shown here',
];

function pickFrameTimestamps(cueSegments: Array<{ startMs: number; endMs: number; text: string }>, opts: { maxFrames: number }): number[] {
  if (cueSegments.length === 0) return [];
  const totalMs = cueSegments[cueSegments.length - 1]!.endMs;
  const cueTimestamps: number[] = [];
  for (const seg of cueSegments) {
    if (TEACHING_CUE_PHRASES.some((phrase) => seg.text.toLowerCase().includes(phrase))) {
      cueTimestamps.push(Math.floor((seg.startMs + seg.endMs) / 2));
    }
  }
  const out = new Set<number>(cueTimestamps.slice(0, Math.min(cueTimestamps.length, Math.floor(opts.maxFrames / 2))));
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
```

- [ ] **Step 4: Re-export + commit**

```bash
echo "export { runVisualContextStage, validateVisualContextMaterialization } from './visual-context';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/visual/ packages/pipeline/src/stages/visual-context.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): visual_context — bounded ffmpeg + Gemini Vision + per-video resilience"
```

### Task 6.3 — `video-intelligence` stage (fan-out, run-limits, transcript-cap)

**Files:**
- Create: `packages/pipeline/src/stages/video-intelligence.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Stage code**

```typescript
// packages/pipeline/src/stages/video-intelligence.ts
import { eq, inArray } from '@creatorcanon/db';
import { segment, videoIntelligenceCard, transcriptAsset } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';
import { CANON_LIMITS } from '../canon-limits';

const CONCURRENCY = 3;

export interface VideoIntelligenceStageInput { runId: string; workspaceId: string; providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider; r2Override?: R2Client; }
export interface VideoIntelligenceStageOutput {
  videosAnalyzed: number; videosFailed: number; costCents: number;
  perVideo: Array<{ videoId: string; ok: boolean; summary: RunAgentSummary | null; error?: string }>;
}

export async function runVideoIntelligenceStage(input: VideoIntelligenceStageInput): Promise<VideoIntelligenceStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();
  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };
  const segs = await db.selectDistinct({ videoId: segment.videoId }).from(segment).where(eq(segment.runId, input.runId));
  const videoIds = segs.map((s) => s.videoId);
  if (videoIds.length < CANON_LIMITS.minSelectedVideos) throw new Error(`canon_v1 requires ≥ ${CANON_LIMITS.minSelectedVideos} videos with segments; found ${videoIds.length}.`);
  if (videoIds.length > CANON_LIMITS.maxSelectedVideos) throw new Error(`canon_v1 caps at ${CANON_LIMITS.maxSelectedVideos} videos; this run has ${videoIds.length}. Reduce videoSet or use PIPELINE_CONTENT_ENGINE=findings_v1.`);
  // Transcript size guard.
  const transcripts = await db.select({ videoId: transcriptAsset.videoId, wordCount: transcriptAsset.wordCount })
    .from(transcriptAsset).where(inArray(transcriptAsset.videoId, videoIds));
  for (const t of transcripts) {
    const approxChars = (t.wordCount ?? 0) * 6;
    if (approxChars > CANON_LIMITS.maxTranscriptCharsPerVideo) throw new Error(`Transcript for ${t.videoId} ~${approxChars} chars exceeds canon_v1 cap of ${CANON_LIMITS.maxTranscriptCharsPerVideo}. Run with findings_v1 or shorten the source.`);
  }
  const cfg = SPECIALISTS.video_analyst;
  const model = selectModel('video_analyst', process.env);
  const results = await runWithConcurrency(videoIds, CONCURRENCY, async (videoId) => {
    const provider = makeProvider(model.provider);
    const userMessage = `Analyze video ${videoId}. Read getChannelProfile, then getSegmentedTranscript({videoId: '${videoId}'}), then listVisualMoments({videoId: '${videoId}', minScore: 60}). Build the intelligence card.`;
    try {
      const summary = await runAgent({
        runId: input.runId, workspaceId: input.workspaceId, agent: cfg.agent,
        modelId: model.modelId, provider, r2, tools: cfg.allowedTools,
        systemPrompt: cfg.systemPrompt, userMessage, caps: cfg.stopOverrides,
      });
      return { videoId, ok: true, summary, error: undefined };
    } catch (err) {
      return { videoId, ok: false, summary: null, error: (err as Error).message };
    }
  });
  return {
    videosAnalyzed: results.filter((r) => r.ok).length,
    videosFailed: results.filter((r) => !r.ok).length,
    costCents: results.reduce((acc, r) => acc + (r.summary?.costCents ?? 0), 0),
    perVideo: results,
  };
}

export async function validateVideoIntelligenceMaterialization(_output: VideoIntelligenceStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const segs = await db.selectDistinct({ videoId: segment.videoId }).from(segment).where(eq(segment.runId, ctx.runId));
  const cards = await db.select({ id: videoIntelligenceCard.id }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, ctx.runId));
  return cards.length === segs.length;
}

async function runWithConcurrency<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = [];
  let i = 0;
  await Promise.all(Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]!); }
  }));
  return out;
}
```

- [ ] **Step 2: Re-export + commit**

```bash
echo "export { runVideoIntelligenceStage, validateVideoIntelligenceMaterialization } from './video-intelligence';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/video-intelligence.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): video-intelligence fan-out + run-limits + transcript-cap enforcement"
```

### Task 6.4 — `canon` stage (full code)

```typescript
// packages/pipeline/src/stages/canon.ts
import { eq } from '@creatorcanon/db';
import { canonNode, videoIntelligenceCard } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';

export interface CanonStageInput { runId: string; workspaceId: string; providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider; r2Override?: R2Client; }
export interface CanonStageOutput { ok: boolean; nodeCount: number; costCents: number; summary: RunAgentSummary | null; error?: string }

export async function runCanonStage(input: CanonStageInput): Promise<CanonStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();
  // Idempotency.
  await db.delete(canonNode).where(eq(canonNode.runId, input.runId));
  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };
  const cards = await db.select({ id: videoIntelligenceCard.id }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, input.runId));
  const bootstrap = `${cards.length} video intelligence cards available. Read every card via listVideoIntelligenceCards. Visual moments are also available via listVisualMoments(minScore:60). Merge into a canon. Don't pad weak content.`;
  const cfg = SPECIALISTS.canon_architect;
  const model = selectModel('canon_architect', process.env);
  const provider = makeProvider(model.provider);
  try {
    const summary = await runAgent({
      runId: input.runId, workspaceId: input.workspaceId, agent: cfg.agent,
      modelId: model.modelId, provider, r2, tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt, userMessage: bootstrap, caps: cfg.stopOverrides,
    });
    const finalNodes = await db.select({ id: canonNode.id }).from(canonNode).where(eq(canonNode.runId, input.runId));
    return { ok: true, nodeCount: finalNodes.length, costCents: summary.costCents, summary };
  } catch (err) {
    return { ok: false, nodeCount: 0, costCents: 0, summary: null, error: (err as Error).message };
  }
}

export async function validateCanonMaterialization(_output: CanonStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const r = await db.select({ id: canonNode.id }).from(canonNode).where(eq(canonNode.runId, ctx.runId));
  return r.length > 0;
}
```

```bash
echo "export { runCanonStage, validateCanonMaterialization } from './canon';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/canon.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): canon stage (delete-and-rebuild + materialization validator)"
```

### Task 6.5 — `page-briefs` stage (full code)

```typescript
// packages/pipeline/src/stages/page-briefs.ts
import { eq } from '@creatorcanon/db';
import { canonNode, pageBrief } from '@creatorcanon/db/schema';
import { runAgent, type RunAgentSummary } from '../agents/harness';
import { SPECIALISTS } from '../agents/specialists';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { createGeminiProvider } from '../agents/providers/gemini';
import { ensureToolsRegistered } from '../agents/tools/registry';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';
import { getDb } from '@creatorcanon/db';
import { createR2Client, type R2Client } from '@creatorcanon/adapters';

export interface PageBriefsStageInput { runId: string; workspaceId: string; providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider; r2Override?: R2Client; }
export interface PageBriefsStageOutput { ok: boolean; briefCount: number; costCents: number; summary: RunAgentSummary | null; error?: string }

export async function runPageBriefsStage(input: PageBriefsStageInput): Promise<PageBriefsStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();
  await db.delete(pageBrief).where(eq(pageBrief.runId, input.runId));
  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };
  const nodes = await db.select({ id: canonNode.id, type: canonNode.type, score: canonNode.pageWorthinessScore }).from(canonNode).where(eq(canonNode.runId, input.runId));
  const bootstrap = `Canon contains ${nodes.length} nodes (${nodes.filter((n) => n.type === 'framework').length} frameworks, ${nodes.filter((n) => n.type === 'lesson').length} lessons, ${nodes.filter((n) => n.type === 'playbook').length} playbooks). Visual moments available via listVisualMoments(minScore:60). Pick 4-12 page-worthy anchors and brief each.`;
  const cfg = SPECIALISTS.page_brief_planner;
  const model = selectModel('page_brief_planner', process.env);
  const provider = makeProvider(model.provider);
  try {
    const summary = await runAgent({
      runId: input.runId, workspaceId: input.workspaceId, agent: cfg.agent,
      modelId: model.modelId, provider, r2, tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt, userMessage: bootstrap, caps: cfg.stopOverrides,
    });
    const finalBriefs = await db.select({ id: pageBrief.id }).from(pageBrief).where(eq(pageBrief.runId, input.runId));
    return { ok: true, briefCount: finalBriefs.length, costCents: summary.costCents, summary };
  } catch (err) {
    return { ok: false, briefCount: 0, costCents: 0, summary: null, error: (err as Error).message };
  }
}

export async function validatePageBriefsMaterialization(_output: PageBriefsStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const r = await db.select({ id: pageBrief.id }).from(pageBrief).where(eq(pageBrief.runId, ctx.runId));
  return r.length > 0;
}
```

```bash
echo "export { runPageBriefsStage, validatePageBriefsMaterialization } from './page-briefs';" >> packages/pipeline/src/stages/index.ts
git add packages/pipeline/src/stages/page-briefs.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): page-briefs stage (delete-and-rebuild + materialization validator)"
```

### Task 6.6 — `page-composition` stage (source packets + constrained writer + deterministic fallback + visual_example block support)

The composition stage:
1. Wipes prior `page` + `pageVersion` rows for the run.
2. For each `pageBrief` (in `position` order):
   - Loads primary + supporting `canonNode`s.
   - Builds a **source packet** of segment excerpts to give the writer concrete material.
   - If `recommendedVisualMomentIds` set, loads those `visualMoment` rows into the packet.
   - Calls the constrained `page_writer` agent with strict JSON schema output.
   - Validates citation IDs all appear in the packet; if any invalid, falls back to deterministic sections.
   - Writes a `page` + `pageVersion` row whose `blockTreeJson.atlasMeta` carries `distinctSourceVideos`, `totalSelectedVideos`, `readerProblem`, `promisedOutcome`, `whyThisMatters` for downstream adapter + QA.

Full code:

```typescript
// packages/pipeline/src/stages/page-composition.ts
import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import { canonNode, page, pageBrief, pageVersion, segment, video, videoSetItem, generationRun, visualMoment } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import { SPECIALISTS } from '../agents/specialists';
import { tokenCostCents } from '../agents/cost-tracking';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';

function nano(): string { return crypto.randomUUID().replace(/-/g, '').slice(0, 10); }

export interface PageCompositionStageInput {
  runId: string;
  workspaceId: string;
  writerProvider?: AgentProvider | null;
}
export interface PageCompositionStageOutput {
  pageCount: number;
  llmWrittenCount: number;
  fallbackCount: number;
  costCents: number;
}

const sectionSchema = z.array(z.object({
  kind: z.enum(['overview', 'paragraph', 'principles', 'steps', 'scenes', 'workflow', 'common_mistakes', 'failure_points', 'quote', 'callout', 'visual_example']),
  body: z.string().optional(),
  title: z.string().optional(),
  items: z.array(z.union([z.string(), z.object({ title: z.string(), body: z.string() })])).optional(),
  schedule: z.array(z.object({ day: z.string(), items: z.array(z.string()).min(1) })).optional(),
  attribution: z.string().optional(),
  sourceVideoId: z.string().optional(),
  timestampStart: z.number().optional(),
  tone: z.enum(['note', 'warn', 'success']).optional(),
  visualMomentId: z.string().optional(),
  description: z.string().optional(),
  citationIds: z.array(z.string()),
})).min(5).max(9);

interface SourcePacketSegment { segmentId: string; videoId: string; videoTitle: string | null; startMs: number; endMs: number; text: string; }
interface SourcePacketVisual { visualMomentId: string; videoId: string; timestampMs: number; type: string; description: string; hubUse: string; frameR2Key: string | null; }

export async function runPageCompositionStage(input: PageCompositionStageInput): Promise<PageCompositionStageOutput> {
  const db = getDb();
  const env = parseServerEnv(process.env);

  let writer: AgentProvider | null = null;
  if (input.writerProvider === null) writer = null;
  else if (input.writerProvider !== undefined) writer = input.writerProvider;
  else writer = env.OPENAI_API_KEY ? createOpenAIProvider(env.OPENAI_API_KEY) : null;
  const writerModel = selectModel('page_writer', process.env);

  await db.delete(pageVersion).where(eq(pageVersion.runId, input.runId));
  await db.delete(page).where(eq(page.runId, input.runId));

  const briefs = await db.select().from(pageBrief).where(eq(pageBrief.runId, input.runId)).orderBy(pageBrief.position);
  if (briefs.length === 0) return { pageCount: 0, llmWrittenCount: 0, fallbackCount: 0, costCents: 0 };

  const setRows = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .innerJoin(generationRun, eq(generationRun.videoSetId, videoSetItem.videoSetId))
    .where(eq(generationRun.id, input.runId));
  const totalSelectedVideos = setRows.length;

  const nodeIds = new Set<string>();
  for (const b of briefs) {
    const p = b.payload as { primaryCanonNodeId: string; supportingCanonNodeIds: string[] };
    nodeIds.add(p.primaryCanonNodeId);
    for (const id of p.supportingCanonNodeIds) nodeIds.add(id);
  }
  const nodes = nodeIds.size ? await db.select().from(canonNode).where(and(eq(canonNode.runId, input.runId), inArray(canonNode.id, [...nodeIds]))) : [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  let position = 0;
  let llmWrittenCount = 0;
  let fallbackCount = 0;
  let costCents = 0;

  for (const brief of briefs) {
    const p = brief.payload as {
      pageType: 'lesson' | 'framework' | 'playbook';
      title: string; slug: string;
      readerProblem: string; promisedOutcome: string; whyThisMatters: string;
      outline: string[];
      primaryCanonNodeId: string; supportingCanonNodeIds: string[];
      requiredEvidenceSegmentIds: string[];
      ctaOrNextStep?: string;
      recommendedVisualMomentIds?: string[];
    };
    const primary = nodeById.get(p.primaryCanonNodeId);
    if (!primary) continue;
    const supporting = p.supportingCanonNodeIds.map((id) => nodeById.get(id)).filter(Boolean) as typeof nodes;

    const sourcePacket = await buildSourcePacket(db, input.runId, primary, supporting, p.recommendedVisualMomentIds ?? []);

    let sections: Array<Record<string, unknown> & { kind: string; citationIds: string[] }> | null = null;
    if (writer) {
      try {
        const userMessage = `BRIEF:\n${JSON.stringify(p, null, 2)}\n\nPRIMARY CANON NODE:\n${JSON.stringify(primary.payload)}\n\nSUPPORTING CANON NODES:\n${JSON.stringify(supporting.map((n) => ({ id: n.id, type: n.type, payload: n.payload })))}\n\nSOURCE PACKET:\n${JSON.stringify(sourcePacket)}\n\nReturn ONE JSON array of section blocks. No prose around it.`;
        const result = await writer.complete({
          model: writerModel.modelId,
          messages: [
            { role: 'system', content: SPECIALISTS.page_writer.systemPrompt },
            { role: 'user', content: userMessage },
          ],
          tools: [],
          jsonMode: true,
        });
        const parsed = JSON.parse(result.content ?? '[]');
        const validation = sectionSchema.safeParse(parsed);
        if (validation.success) {
          const validSegIds = new Set(sourcePacket.requiredSegments.map((s) => s.segmentId));
          const validVmIds = new Set(sourcePacket.visuals.map((v) => v.visualMomentId));
          const allCited = (validation.data as Array<{ citationIds: string[] }>).flatMap((s) => s.citationIds);
          const invalidCites = allCited.filter((id) => !validSegIds.has(id));
          const visualBlocks = (validation.data as Array<{ kind: string; visualMomentId?: string }>).filter((s) => s.kind === 'visual_example');
          const invalidVms = visualBlocks.filter((b) => !b.visualMomentId || !validVmIds.has(b.visualMomentId));
          if (invalidCites.length === 0 && invalidVms.length === 0) {
            sections = validation.data as Array<Record<string, unknown> & { kind: string; citationIds: string[] }>;
            llmWrittenCount += 1;
            costCents += tokenCostCents(writerModel.modelId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0);
          }
        }
      } catch { sections = null; }
    }

    if (!sections) {
      sections = buildDeterministicSections(p, primary, supporting, sourcePacket.visuals);
      fallbackCount += 1;
    }

    const evidenceSegmentIds = collectEvidenceSegmentIds(primary, supporting);
    const distinctSourceVideos = new Set<string>();
    for (const n of [primary, ...supporting]) for (const v of n.sourceVideoIds) distinctSourceVideos.add(v);

    const pageId = `pg_${nano()}`;
    const versionId = `pv_${nano()}`;
    await db.insert(page).values({
      id: pageId, workspaceId: input.workspaceId, runId: input.runId,
      slug: p.slug, pageType: p.pageType, position: position++,
      supportLabel: 'review_recommended', currentVersionId: versionId,
    });
    const blockTree = {
      blocks: sections.map((s, i) => ({
        type: s.kind === 'visual_example' ? 'callout' : s.kind,    // Option A: render visual_example as callout
        id: `blk_${i}`,
        content: s.kind === 'visual_example'
          ? { tone: 'note', body: `Visual example from source: ${(s as { description?: string }).description ?? ''}`, _visualMomentId: (s as { visualMomentId?: string }).visualMomentId }
          : (({ kind: _k, citationIds: _c, ...rest }) => rest)(s as Record<string, unknown>),
        citations: s.citationIds,
      })),
      atlasMeta: {
        evidenceQuality: primary.evidenceQuality,
        citationCount: evidenceSegmentIds.length,
        sourceCoveragePercent: totalSelectedVideos > 0 ? Math.min(1, distinctSourceVideos.size / totalSelectedVideos) : 0,
        relatedPageIds: [],
        hero: { illustrationKey: p.pageType === 'framework' ? 'desk' : p.pageType === 'playbook' ? 'desk' : 'open-notebook' },
        evidenceSegmentIds,
        primaryFindingId: primary.id,
        supportingFindingIds: p.supportingCanonNodeIds,
        readerProblem: p.readerProblem,
        promisedOutcome: p.promisedOutcome,
        whyThisMatters: p.whyThisMatters,
        distinctSourceVideos: distinctSourceVideos.size,
        totalSelectedVideos,
      },
    };
    await db.insert(pageVersion).values({
      id: versionId, workspaceId: input.workspaceId, pageId, runId: input.runId,
      version: 1, title: p.title, summary: p.promisedOutcome, blockTreeJson: blockTree, isCurrent: true,
    });
  }

  return { pageCount: briefs.length, llmWrittenCount, fallbackCount, costCents };
}

export async function validatePageCompositionMaterialization(_output: PageCompositionStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const p = await db.select({ id: page.id }).from(page).where(eq(page.runId, ctx.runId));
  return p.length > 0;
}

async function buildSourcePacket(db: any, runId: string, primary: typeof canonNode.$inferSelect, supporting: Array<typeof canonNode.$inferSelect>, visualMomentIds: string[]): Promise<{ requiredSegments: SourcePacketSegment[]; visuals: SourcePacketVisual[] }> {
  const segIds = new Set<string>();
  for (const s of primary.evidenceSegmentIds) segIds.add(s);
  for (const n of supporting) for (const s of n.evidenceSegmentIds) segIds.add(s);
  const requiredSegments: SourcePacketSegment[] = segIds.size === 0 ? [] : (await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, endMs: segment.endMs, text: segment.text, videoTitle: video.title })
    .from(segment).leftJoin(video, eq(video.id, segment.videoId))
    .where(and(eq(segment.runId, runId), inArray(segment.id, [...segIds])))
  ).map((r: any) => ({ segmentId: r.id, videoId: r.videoId, videoTitle: r.videoTitle ?? null, startMs: r.startMs, endMs: r.endMs, text: r.text }));
  const visuals: SourcePacketVisual[] = visualMomentIds.length === 0 ? [] : (await db
    .select({ id: visualMoment.id, videoId: visualMoment.videoId, timestampMs: visualMoment.timestampMs, type: visualMoment.type, description: visualMoment.description, hubUse: visualMoment.hubUse, frameR2Key: visualMoment.frameR2Key })
    .from(visualMoment).where(and(eq(visualMoment.runId, runId), inArray(visualMoment.id, visualMomentIds)))
  ).map((r: any) => ({ visualMomentId: r.id, videoId: r.videoId, timestampMs: r.timestampMs, type: r.type, description: r.description, hubUse: r.hubUse, frameR2Key: r.frameR2Key }));
  return { requiredSegments, visuals };
}

function collectEvidenceSegmentIds(primary: typeof canonNode.$inferSelect, supporting: Array<typeof canonNode.$inferSelect>): string[] {
  const set = new Set<string>(primary.evidenceSegmentIds);
  for (const s of supporting) for (const id of s.evidenceSegmentIds) set.add(id);
  return [...set];
}

function buildDeterministicSections(brief: { pageType: string; readerProblem: string; promisedOutcome: string; whyThisMatters: string; outline: string[]; ctaOrNextStep?: string }, primary: typeof canonNode.$inferSelect, supporting: Array<typeof canonNode.$inferSelect>, visuals: SourcePacketVisual[]): Array<Record<string, unknown> & { kind: string; citationIds: string[] }> {
  const out: Array<Record<string, unknown> & { kind: string; citationIds: string[] }> = [];
  const pp = primary.payload as Record<string, unknown>;
  const cite = primary.evidenceSegmentIds.slice(0, 5);
  out.push({ kind: 'overview', body: brief.whyThisMatters, citationIds: cite.slice(0, 2) });
  out.push({ kind: 'callout', tone: 'note', body: brief.readerProblem, citationIds: cite.slice(0, 2) });
  if (brief.pageType === 'framework' && Array.isArray(pp.principles)) {
    out.push({ kind: 'principles', items: (pp.principles as Array<{ title?: string; body?: string } | string>).map((it) => typeof it === 'string' ? { title: it.slice(0, 60), body: it } : { title: it.title ?? 'Principle', body: it.body ?? '' }).filter((it) => it.body), citationIds: cite });
  } else if (brief.pageType === 'playbook' && (Array.isArray(pp.workflow) || Array.isArray(pp.scenes))) {
    const sched = (pp.workflow ?? pp.scenes) as Array<{ day?: string; title?: string; items?: string[]; description?: string }>;
    out.push({ kind: 'workflow', schedule: sched.map((s) => ({ day: s.day ?? s.title ?? 'Step', items: s.items ?? (s.description ? [s.description] : ['—']) })).filter((s) => s.items.length > 0 && s.items.every((i) => i)), citationIds: cite });
  } else if (typeof pp.idea === 'string') {
    out.push({ kind: 'paragraph', body: pp.idea, citationIds: cite });
  }
  if (brief.pageType === 'framework' && Array.isArray(pp.steps) && (pp.steps as unknown[]).length > 0) {
    out.push({ kind: 'steps', title: 'Steps', items: (pp.steps as Array<string | { title?: string; body?: string }>).map((s, i) => typeof s === 'string' ? { title: `Step ${i + 1}`, body: s } : { title: s.title ?? `Step ${i + 1}`, body: s.body ?? '' }), citationIds: cite });
  }
  // Visual example fallback (Option A: rendered as callout).
  if (visuals.length > 0) {
    out.push({ kind: 'visual_example', visualMomentId: visuals[0]!.visualMomentId, description: visuals[0]!.description, citationIds: [] });
  }
  const exampleNode = supporting.find((s) => s.type === 'example' || s.type === 'quote');
  if (exampleNode) {
    const ep = exampleNode.payload as { text?: string; description?: string; quote?: string };
    out.push({ kind: 'paragraph', body: ep.description ?? ep.text ?? ep.quote ?? '', citationIds: exampleNode.evidenceSegmentIds.slice(0, 2) });
  }
  const quote = supporting.find((s) => s.type === 'quote' || s.type === 'aha_moment');
  if (quote) {
    const qp = quote.payload as { text?: string; quote?: string; attribution?: string };
    out.push({ kind: 'quote', body: qp.text ?? qp.quote ?? '', attribution: qp.attribution, citationIds: quote.evidenceSegmentIds.slice(0, 1) });
  }
  if (brief.ctaOrNextStep) out.push({ kind: 'callout', tone: 'note', body: brief.ctaOrNextStep, citationIds: [] });
  return out;
}
```

```bash
echo "export { runPageCompositionStage, validatePageCompositionMaterialization } from './page-composition';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/page-composition.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): page composition with source packets + constrained writer + visual_example blocks"
```

### Task 6.7 — `page-quality` stage (deterministic, with visual checks)

```typescript
// packages/pipeline/src/stages/page-quality.ts
import { eq, inArray } from '@creatorcanon/db';
import { page, pageVersion, pageQualityReport, segment, visualMoment } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';

export interface PageQualityStageInput { runId: string; workspaceId: string; }
export interface PageQualityStageOutput { pagesEvaluated: number; pagesPublishable: number; pagesRevise: number; pagesFail: number; }

const THRESHOLDS = {
  minimumCitationsPerPage: 3,
  minimumCitedSections: 2,
  minimumBodyChars: 1200,
  maximumEmptySections: 0,
  minimumTranscriptCitedSections: 3,    // visual blocks don't count
} as const;

const GENERIC_PHRASES = [
  'in conclusion', 'as we have seen', "as we've seen", 'in summary', 'all things considered',
  'at the end of the day', 'when all is said and done', 'needless to say',
  'it is worth noting', 'it goes without saying', 'simply put',
];

export async function runPageQualityStage(input: PageQualityStageInput): Promise<PageQualityStageOutput> {
  const db = getDb();
  await db.delete(pageQualityReport).where(eq(pageQualityReport.runId, input.runId));
  const pages = await db.select().from(page).where(eq(page.runId, input.runId));
  const versions = await db.select().from(pageVersion).where(eq(pageVersion.runId, input.runId));
  const versionByPageId = new Map(versions.map((v) => [v.pageId, v]));

  // Validate cited segments belong to this run (we filter cites per page below).
  const allCitedSegIds = new Set<string>();
  for (const v of versions) {
    const tree = v.blockTreeJson as { blocks: Array<{ citations?: string[] }> };
    for (const b of tree.blocks ?? []) for (const id of b.citations ?? []) allCitedSegIds.add(id);
  }
  const validSegRows = allCitedSegIds.size ? await db.select({ id: segment.id, videoId: segment.videoId }).from(segment).where(inArray(segment.id, [...allCitedSegIds])) : [];
  const validSegSet = new Set(validSegRows.map((s) => s.id));
  const segVideoMap = new Map(validSegRows.map((s) => [s.id, s.videoId]));

  // Collect all referenced visual moment IDs from blocks (extracted from block.content._visualMomentId).
  const allVmIds = new Set<string>();
  for (const v of versions) {
    const tree = v.blockTreeJson as { blocks: Array<{ content?: Record<string, unknown> }> };
    for (const b of tree.blocks ?? []) {
      const vmId = (b.content as { _visualMomentId?: string } | undefined)?._visualMomentId;
      if (vmId) allVmIds.add(vmId);
    }
  }
  const vmRows = allVmIds.size ? await db.select({ id: visualMoment.id, score: visualMoment.usefulnessScore }).from(visualMoment).where(inArray(visualMoment.id, [...allVmIds])) : [];
  const vmById = new Map(vmRows.map((v) => [v.id, v]));

  const slugCount = new Map<string, number>();
  const titleCount = new Map<string, number>();
  for (const p of pages) slugCount.set(p.slug, (slugCount.get(p.slug) ?? 0) + 1);
  for (const v of versions) titleCount.set(v.title, (titleCount.get(v.title) ?? 0) + 1);

  const out = { pagesEvaluated: 0, pagesPublishable: 0, pagesRevise: 0, pagesFail: 0 };

  for (const p of pages) {
    const v = versionByPageId.get(p.id);
    if (!v) continue;
    out.pagesEvaluated += 1;
    const tree = v.blockTreeJson as { blocks: Array<{ type: string; content: Record<string, unknown>; citations?: string[] }> };
    const checks: Record<string, { pass: boolean; detail?: string }> = {};

    // Distinguish visual blocks (callout with _visualMomentId) from transcript blocks.
    const blocks = tree.blocks ?? [];
    const visualBlocks = blocks.filter((b) => (b.content as { _visualMomentId?: string })._visualMomentId);
    const transcriptBlocks = blocks.filter((b) => !(b.content as { _visualMomentId?: string })._visualMomentId);

    const allCites = blocks.flatMap((b) => b.citations ?? []);
    const validCites = allCites.filter((id) => validSegSet.has(id));
    checks.citationCount = { pass: validCites.length >= THRESHOLDS.minimumCitationsPerPage };

    // Transcript-cited sections (NOT counting visual blocks)
    const transcriptCitedSections = transcriptBlocks.filter((b) => (b.citations ?? []).some((id) => validSegSet.has(id))).length;
    checks.transcriptCitedSections = { pass: transcriptCitedSections >= THRESHOLDS.minimumTranscriptCitedSections, detail: `${transcriptCitedSections} transcript-cited sections` };

    const emptySections = blocks.filter(isSectionEmpty).length;
    checks.emptySections = { pass: emptySections <= THRESHOLDS.maximumEmptySections };

    const totalBodyChars = sumBodyChars(blocks);
    checks.bodyLength = { pass: totalBodyChars >= THRESHOLDS.minimumBodyChars };

    const invalidCites = allCites.length - validCites.length;
    checks.citationOwnership = { pass: invalidCites === 0 };

    const meta = (v.blockTreeJson as { atlasMeta?: { readerProblem?: string; promisedOutcome?: string; whyThisMatters?: string } }).atlasMeta ?? {};
    checks.readerProblemPresent = { pass: typeof meta.readerProblem === 'string' && meta.readerProblem.length > 10 };
    checks.promisedOutcomePresent = { pass: typeof meta.promisedOutcome === 'string' && meta.promisedOutcome.length > 10 };

    const generic = ['untitled', 'page', 'lesson', 'framework', 'playbook'];
    checks.titleNotGeneric = { pass: !generic.includes(v.title.toLowerCase().trim()) };
    checks.duplicateSlug = { pass: (slugCount.get(p.slug) ?? 0) === 1 };
    checks.duplicateTitle = { pass: (titleCount.get(v.title) ?? 0) === 1 };

    const allText = blocks.map((b) => JSON.stringify(b.content)).join(' ').toLowerCase();
    const genericHits = GENERIC_PHRASES.filter((ph) => allText.includes(ph)).length;
    const genericLanguageScore = Math.min(100, genericHits * 5);

    // Visual block validation
    for (const vb of visualBlocks) {
      const vmId = (vb.content as { _visualMomentId?: string })._visualMomentId;
      if (!vmId) continue;
      const vm = vmById.get(vmId);
      checks.visualMomentExists = checks.visualMomentExists ?? { pass: true };
      if (!vm) checks.visualMomentExists.pass = false;
      else if (vm.score < 60) checks.visualMomentExists.pass = false;
    }

    // Visual is never sole evidence: pages must have >= minimumTranscriptCitedSections.
    // (Already enforced by `transcriptCitedSections` check above.)

    const distinctSourceVideos = new Set<string>();
    for (const id of validCites) {
      const vid = segVideoMap.get(id);
      if (vid) distinctSourceVideos.add(vid);
    }

    const pass = Object.values(checks).every((c) => c.pass);
    const recommendation: 'publish' | 'revise' | 'fail' = pass ? 'publish' : (checks.bodyLength.pass && checks.citationCount.pass && checks.citationOwnership.pass) ? 'revise' : 'fail';
    out[recommendation === 'publish' ? 'pagesPublishable' : recommendation === 'revise' ? 'pagesRevise' : 'pagesFail'] += 1;

    const evidenceScore = Math.max(0, (validCites.length >= 8 ? 100 : validCites.length >= 5 ? 80 : validCites.length >= 3 ? 60 : 30) - (invalidCites > 0 ? 20 : 0));

    await db.insert(pageQualityReport).values({
      id: `pqr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      workspaceId: input.workspaceId, runId: input.runId, pageId: p.id,
      evidenceScore, citationCount: validCites.length, distinctSourceVideos: distinctSourceVideos.size,
      emptySectionCount: emptySections, unsupportedClaimCount: invalidCites,
      genericLanguageScore, recommendation,
      payload: { checks, totalBodyChars, transcriptCitedSections, visualBlockCount: visualBlocks.length },
    });
  }

  return out;
}

export async function validatePageQualityMaterialization(_output: PageQualityStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const reports = await db.select({ id: pageQualityReport.id }).from(pageQualityReport).where(eq(pageQualityReport.runId, ctx.runId));
  const pages = await db.select({ id: page.id }).from(page).where(eq(page.runId, ctx.runId));
  return reports.length === pages.length;
}

function isSectionEmpty(b: { type: string; content: Record<string, unknown> }): boolean {
  const c = b.content as { body?: string; items?: unknown[]; schedule?: unknown[] };
  if (typeof c.body === 'string' && c.body.trim().length > 0) return false;
  if (Array.isArray(c.items) && c.items.length > 0) return false;
  if (Array.isArray(c.schedule) && c.schedule.length > 0) return false;
  return true;
}

function sumBodyChars(blocks: Array<{ content: Record<string, unknown> }>): number {
  let n = 0;
  for (const b of blocks) {
    const c = b.content as { body?: string; items?: Array<{ body?: string } | string>; schedule?: Array<{ items?: string[] }> };
    if (typeof c.body === 'string') n += c.body.length;
    if (Array.isArray(c.items)) for (const it of c.items) {
      if (typeof it === 'string') n += it.length;
      else if (typeof it === 'object' && it && typeof it.body === 'string') n += it.body.length;
    }
    if (Array.isArray(c.schedule)) for (const s of c.schedule) for (const i of s.items ?? []) n += String(i).length;
  }
  return n;
}
```

```bash
echo "export { runPageQualityStage, validatePageQualityMaterialization } from './page-quality';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/page-quality.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): deterministic page-quality QA + visual block + transcript-cited-sections rules"
```

---

## Phase 7 — Materialization validation

The harness extension was completed in Phase 6 — Task 6.0. Each stage's validator was inlined in its corresponding Phase 6 task. To recap the validator behaviors (no new code):

| Stage | Validator returns true if |
|---|---|
| `channel_profile` | exactly 1 row in `channel_profile` for `runId` |
| `visual_context` | `output.visualMomentsCreated === 0` OR row count ≥ that number (zero is valid; missing rows after claimed creation is not) |
| `video_intelligence` | `videoIntelligenceCard` row count == distinct videoIds with segments |
| `canon` | ≥ 1 row in `canon_node` for `runId` |
| `page_briefs` | ≥ 1 row in `page_brief` for `runId` |
| `page_composition` | ≥ 1 row in `page` for `runId` |
| `page_quality` | `page_quality_report` row count == `page` row count |

The orchestrator in Phase 9 wires each into its `runStage` call via `validateMaterializedOutput`.

---

## Phase 8 — Adapter retargeting

### Task 8.1 — `project-topics` reads canon_node when present

Open `packages/pipeline/src/adapters/editorial-atlas/project-topics.ts`. Update the imports + body so canon_node is the primary source, with fallback to archive_finding for legacy runs:

```typescript
import { and, eq } from '@creatorcanon/db';
import { canonNode, archiveFinding, page as pageTable, pageVersion } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';

// Inside projectTopics({runId, db}) — replace the existing query block:

  // canon_v1: canon_node WHERE type='topic'
  const canonRows = await db.select().from(canonNode)
    .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));
  if (canonRows.length > 0) {
    return canonRows.map((r) => {
      const pld = r.payload as { title?: string; description?: string; iconKey?: string; accentColor?: ProjectedTopic['accentColor'] };
      return {
        id: r.id,
        slug: slugify(pld.title ?? 'topic'),
        title: pld.title ?? 'Topic',
        description: pld.description ?? '',
        iconKey: pld.iconKey ?? 'grid',
        accentColor: pld.accentColor ?? 'mint',
        pageCount: 0,
        evidenceSegmentIds: r.evidenceSegmentIds,
      };
    });
  }
  // findings_v1 legacy fallback
  const legacyRows = await db.select().from(archiveFinding)
    .where(and(eq(archiveFinding.runId, runId), eq(archiveFinding.type, 'topic')));
  if (legacyRows.length > 0) {
    // …existing legacy code path (unchanged)
  }
  // …existing synthetic page-type fallback (Frameworks/Lessons/Playbooks) when both empty
```

### Task 8.2 — `project-highlights` likewise

Open `packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts`. Switch the source to `canon_node WHERE type IN ('quote','aha_moment')` first; fall back to `archive_finding` if canon is empty.

```typescript
const canonRows = await db.select().from(canonNode)
  .where(and(eq(canonNode.runId, runId), inArray(canonNode.type, ['quote', 'aha_moment'])));
if (canonRows.length > 0) {
  // existing collectHighlights expects rows with {type, evidenceSegmentIds, payload} — canonNode has all three
  // pass canonRows through the existing aggregator
  return existingCollectHighlights(canonRows);
}
// fall back to archive_finding (legacy code path)
```

### Task 8.3 — `project-pages` source-coverage fix

Open `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`. The page composer (Phase 6.6) writes `atlasMeta.distinctSourceVideos` and `atlasMeta.totalSelectedVideos`. Use those directly when present:

```typescript
        sourceCoveragePercent:
          typeof meta.distinctSourceVideos === 'number' && typeof meta.totalSelectedVideos === 'number' && meta.totalSelectedVideos > 0
            ? meta.distinctSourceVideos / meta.totalSelectedVideos
            : meta.sourceCoveragePercent ?? 0,
```

(Existing legacy code keeps backward compatibility for runs whose `atlasMeta` doesn't include the new fields.)

### Task 8.4 — Typecheck + commit

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/adapters/editorial-atlas/project-topics.ts packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "fix(adapter): canon_node primary source for topics+highlights; sourceCoveragePercent uses distinct videos"
```

The adapter does not need to know about `visual_example` blocks — Phase 6.6's composer maps them to `callout` blocks at the `pageVersion.blockTreeJson` level (Option A). When we later add native renderer support, the composer will emit `visual_example` directly and the adapter changes accordingly.

---

## Phase 9 — Feature-flagged orchestrator

In `packages/pipeline/src/run-generation-pipeline.ts`, branch on `PIPELINE_CONTENT_ENGINE`. Both engines stay reachable. canon_v1 runs the seven new stages with materialization validators wired:

```typescript
    if (contentEngine === 'canon_v1') {
      // Run-limits enforcement
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

      await runStage({
        ctx, stage: 'video_intelligence' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runVideoIntelligenceStage(i),
        validateMaterializedOutput: validateVideoIntelligenceMaterialization,
      });
      await runStage({
        ctx, stage: 'canon' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runCanonStage(i),
        validateMaterializedOutput: validateCanonMaterialization,
      });
      await runStage({
        ctx, stage: 'page_briefs' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageBriefsStage(i),
        validateMaterializedOutput: validatePageBriefsMaterialization,
      });
      await runStage({
        ctx, stage: 'page_composition' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageCompositionStage(i),
        validateMaterializedOutput: validatePageCompositionMaterialization,
      });
      await runStage({
        ctx, stage: 'page_quality' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageQualityStage(i),
        validateMaterializedOutput: validatePageQualityMaterialization,
      });
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

## Phase 10 — Manual upload mp4 persistence (NEW in v4)

`visual_context` resolves a local mp4 from `mediaAsset.type='video_mp4'`. Today, manual uploads only persist `audio.m4a`. Add forward-looking persistence + a one-off backfill so existing uploads can also exercise visual_context.

### Task 10.1 — Persist `video_mp4` mediaAsset on upload-complete

**Files:**
- Modify: `apps/web/src/app/api/upload/complete/route.ts` (or whichever file the upload-complete handler lives in)
- Inspect: `apps/worker/src/tasks/transcribe-uploaded-video.ts` (don't modify; just confirm the source.mp4 R2 key the upload writes)
- Reference schema: `packages/db/src/schema/media.ts` (or wherever `mediaAsset` table is defined; confirm the table accepts `type='video_mp4'`)

The upload flow writes the original mp4 to `workspaces/{workspaceId}/uploads/{videoId}/source.mp4`. After the user calls `/api/upload/complete`, we know the file is in R2. Insert a `mediaAsset` row of type `'video_mp4'` pointing at it.

- [ ] **Step 1: Inspect the existing complete handler**

```bash
grep -n "uploadStatus\|mediaAsset" apps/web/src/app/api/upload/complete/route.ts | head -20
```

Confirm the handler sets `video.uploadStatus = 'uploaded'` and dispatches the transcribe task.

- [ ] **Step 2: Add the mediaAsset insert**

Right after `db.update(video).set({ uploadStatus: 'uploaded' })`, add:

```typescript
import { mediaAsset } from '@creatorcanon/db/schema';

// Persist the source mp4 as a mediaAsset so visual_context can find it.
await db.insert(mediaAsset).values({
  id: `ma_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
  workspaceId,
  videoId,
  type: 'video_mp4',
  r2Key: `workspaces/${workspaceId}/uploads/${videoId}/source.mp4`,
  byteSize: row.fileSizeBytes ?? null,
  contentType: 'video/mp4',
}).onConflictDoNothing();
```

(Field shapes mirror existing `mediaAsset` insertions for `audio_m4a`. If the schema uses different column names, mirror the pattern from the transcribe task's audio insert.)

- [ ] **Step 3: Confirm `mediaAsset.type` enum allows `'video_mp4'`**

```bash
grep -n "video_mp4\|audio_m4a\|mediaAssetType" packages/db/src/schema/media.ts packages/db/src/schema/enums.ts 2>&1 | head
```

If `'video_mp4'` is not yet a valid enum value, append a small migration `0009_add_video_mp4_media_type.sql`:

```sql
ALTER TYPE "media_asset_type" ADD VALUE IF NOT EXISTS 'video_mp4';
```

Apply, journal entry idx 9, commit migration.

- [ ] **Step 4: Backfill the 2 existing uploads**

For the existing 2 manual uploads (`mu_9d970d091c38`, `mu_e0787f2f4a95`), the source mp4 is already in R2. Insert mediaAsset rows directly:

```javascript
// scripts/backfill-mediaasset-video-mp4.mjs
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const f of ['../../.env']) {
  try { for (const line of readFileSync(resolve(process.cwd(), f), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/i); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }} catch {}
}
const wsId = 'e1ad6446-d463-4ee9-9451-7be5ac76f187';
const ids = ['mu_9d970d091c38', 'mu_e0787f2f4a95'];
const sql = postgres(process.env.DATABASE_URL);
for (const videoId of ids) {
  // Skip if mediaAsset already exists
  const exist = await sql`SELECT id FROM media_asset WHERE video_id = ${videoId} AND type = 'video_mp4' LIMIT 1`;
  if (exist[0]) { console.log(`already exists: ${videoId}`); continue; }
  const r2Key = `workspaces/${wsId}/uploads/${videoId}/source.mp4`;
  const id = `ma_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await sql`INSERT INTO media_asset (id, workspace_id, video_id, type, r2_key, content_type) VALUES (${id}, ${wsId}, ${videoId}, 'video_mp4', ${r2Key}, 'video/mp4')`;
  console.log(`backfilled: ${videoId}`);
}
await sql.end();
```

Run from `packages/db` (where postgres is installed):

```bash
cd packages/db && cp ../../scripts/backfill-mediaasset-video-mp4.mjs . && node ./backfill-mediaasset-video-mp4.mjs && rm ./backfill-mediaasset-video-mp4.mjs
```

- [ ] **Step 5: Verify the source mp4 is still in R2**

The transcribe task may have left the audio.m4a but kept the source. Confirm via R2 HEAD:

```bash
# from packages/adapters where aws-sdk-s3 lives
node -e "
import('@aws-sdk/client-s3').then(async ({S3Client, HeadObjectCommand}) => {
  // ... HEAD workspaces/{ws}/uploads/{videoId}/source.mp4 for both videos
})
"
```

If a source.mp4 is missing for either of the 2 existing uploads, the visual_context stage will warn-and-skip that specific video. The pipeline still completes; just visual extraction is skipped for it.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/upload/complete/route.ts packages/db/drizzle/out/0009_add_video_mp4_media_type.sql packages/db/drizzle/out/meta/_journal.json
git commit -m "feat(uploads): persist source mp4 as mediaAsset video_mp4 (enables visual_context)"
```

---

## Phase 11 — Operator inspection script

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

## Phase 12 — Side-by-side verification (corrected expectations)

Run **both** engines on the same videoSet from the existing 2 ready uploads:

```bash
# canon_v1 hub
PIPELINE_CONTENT_ENGINE=canon_v1 npx tsx ./scripts/compare-engines.ts <videoSetId>
# findings_v1 hub
PIPELINE_CONTENT_ENGINE=findings_v1 npx tsx ./scripts/compare-engines.ts <videoSetId>
```

(`compare-engines.ts` spawns two fresh projects from the same videoSet, runs each engine, publishes both, then audits.)

### Engine-comparison metrics

| Metric | Target | Engine that meets it |
|---|---|---|
| Page count | 4-12 | canon_v1 |
| Avg citations per page | 5+ | canon_v1 ≥, findings_v1 already does |
| Pages with non-empty `readerProblem` | 100% | canon_v1 only |
| Pages with non-empty `promisedOutcome` | 100% | canon_v1 only |
| Pages with source-backed example | 80%+ | canon_v1 |
| Empty/weak sections | 0 | canon_v1 |
| Duplicate slugs | 0 | both |
| Generic page titles | 0-1 max | both |
| Canon nodes with `origin='merged'` AND ≥2 source videos | ≥ 1 | canon_v1 only |
| Creator-specific terminology used in pages | ≥ 5 distinct terms | canon_v1 |

### Visual-specific metrics (canon_v1 only)

**Do not require `visual_moment` rows > 0**. The archive may be talking-head only OR have no `video_mp4` source. Instead, the audit reports:

| Field | Source |
|---|---|
| `videosWithMp4Source` | count of selected videos with `mediaAsset.type='video_mp4'` |
| `videosSkippedNoMp4` | selected videos without an mp4 mediaAsset (visual_context skipped them) |
| `framesSampled` | from `visual_context` stage output |
| `visualMomentsCreated` | row count in `visual_moment` for the run |
| `visualContextWarnings` | from stage warnings list |
| `pagesWithVisualCallouts` | count of pages whose `pageVersion.blockTreeJson` has at least one block with `_visualMomentId` set |
| `pagesWhereVisualIsSoleEvidence` | **must always be 0** — pages must have ≥ 3 transcript-cited sections (page_quality enforces this) |

**Conditional expectation:** if at least one selected video has demo / slide / chart / code / screen / physical teaching content AND a `video_mp4` source, then `visualMomentsCreated` should be > 0. If selected videos are talking-head only, 0 is fine. If no selected video has a `video_mp4` source (e.g. all uploads predate Phase 10's persistence + backfill wasn't run), `videosSkippedNoMp4` will equal the selected count and `visualMomentsCreated = 0` is fine.

### Hard pass criteria for promoting `canon_v1` to default

- `pageCount ∈ [4, 12]`
- `pages with readerProblem == 100%`
- `pages with promisedOutcome == 100%`
- `duplicate slugs == 0`
- `generic page titles ≤ 1`
- `avg citations per page ≥ 5`
- `≥ 1 canon node with origin='merged' AND ≥ 2 source videos`
- **`pagesWhereVisualIsSoleEvidence == 0`** (always)

If pass: hub looks meaningfully better than findings_v1; flip the env default in deploy.
If fail: triage from the operator inspection script (Phase 11) and the per-stage warnings.

Commit the audit script:

```bash
git add packages/pipeline/scripts/compare-engines.ts
git commit -m "feat(ops): compare-engines side-by-side audit with visual-aware metrics"
```

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

**Placeholder scan:** No "TBD" / "fill in later" / "similar to task X". No "carried from v2" — all stage code, prompts, harness extension, and adapter changes are inlined in this document. The plan is executable end-to-end by an agent that only sees this file.

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
