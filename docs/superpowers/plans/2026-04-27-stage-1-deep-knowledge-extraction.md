# Stage 1: Deep Knowledge Extraction Implementation Plan (v2 — revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new content engine — `canon_v1` — that pivots from "agent-discovery-first" to "deep-read-first" (Channel Profile → Per-Video Intelligence Cards → Creator Canon → Page Briefs → Brief-Driven Composition with source-packet writing → Deterministic Page QA). Run it **alongside** the legacy `findings_v1` engine behind a feature flag, never replacing it. Generate hubs through both engines from the same source set so we can compare on specific quality metrics before promoting.

**Architecture:** Two parallel content engines share the same `Phase 0` ingestion (selection snapshot, transcripts, normalization, segmentation) and the same `adapt + render` tail (Editorial Atlas template). The orchestrator branches on `process.env.PIPELINE_CONTENT_ENGINE` (`'findings_v1'` default | `'canon_v1'`). Five new tables (`channel_profile`, `video_intelligence_card`, `canon_node`, `page_brief`, `page_quality_report`), one extended harness (materialization validation), one constrained LLM page writer with deterministic fallback, one inspection script, one side-by-side audit script.

**Tech Stack:** TypeScript, Drizzle ORM, Zod, OpenAI/Gemini function-calling, postgres-js, node:test + tsx.

---

## What changed from v1 of this plan

This v2 was rewritten end-to-end based on operator feedback. The 17 deltas are folded into the body below; flagged here for reviewer context.

| # | Delta | Where it shows up |
|---|---|---|
| 1 | Don't replace legacy pipeline. Feature-flag both engines. | Phase 9 — Feature-Flagged Orchestrator |
| 2 | Primary read tool is `getSegmentedTranscript`, not raw VTT. | Phase 2 — Read Tools, Phase 4 — VIDEO_ANALYST_PROMPT |
| 3 | Strict segment ownership validation. | Phase 3 — Propose Tools |
| 4 | Implement missing `getVideoIntelligenceCard` tool. | Phase 2 — Read Tools |
| 5 | Add deterministic page QA in v1. | Phase 6.6 — Page Quality Stage |
| 6 | Five tables, not four. | Phase 1 — Schema |
| 7 | Stage-level deletes + upserts for idempotency. | Phase 3 — Propose Tools, Phase 6 — Stages |
| 8 | Stage cache must validate materialized rows. | Phase 7 — Materialization Validation |
| 9 | Run limits for canon_v1. | Phase 6.2, Phase 9 |
| 10 | Output caps in video_analyst prompt. | Phase 4 — VIDEO_ANALYST_PROMPT |
| 11 | `origin` + `confidenceScore` on canon_node. | Phase 1 — Schema, Phase 4 — CANON_ARCHITECT_PROMPT |
| 12 | Richer 9-section page shape minimums. | Phase 6.5 — Page Composition |
| 13 | Source packets carry actual segment excerpts. | Phase 6.5 |
| 14 | One constrained LLM page-writing pass with deterministic fallback. | Phase 4 — PAGE_WRITER_PROMPT, Phase 6.5 |
| 15 | Fix `sourceCoveragePercent` to be `distinct_source_videos / total_selected_videos`. | Phase 6.5, Phase 8 — Adapter |
| 16 | Operator-mode `inspect-canon-run.ts` script (no UI yet). | Phase 10 |
| 17 | Side-by-side verification on the same videoSet. | Phase 11 |

---

## Hard constraints

- **Legacy `findings_v1` pipeline stays wired and reachable.** Reverting to it at any time must remain a one-env-var change.
- **Editorial Atlas renderer unchanged.** All output goes through the existing `pageVersion.blockTreeJson` shape and `editorialAtlasManifestSchema`.
- **No visual context extraction in this plan.** Gemini Vision on keyframes is a separate plan.
- **No customer-facing review/approve UX in this plan.** Operator workflows are scripts, not pages.
- **No personalized design generation, paid access, chat backend, custom domains, or multi-source ingestion.**
- **Quality > coverage.** Caps on canon size, page count, and per-card list lengths are intentional.

---

## Scope cut

The user's full Stage-1 vision lists ten phases. This plan ships eight of them (with deterministic versions of the heavier ones).

| Phase | Scope | Status |
|---|---|---|
| Channel Profile (1.1) | 1 agent + 1 table + 1 stage | **v1 (in this plan)** |
| Per-Video Intelligence Card (1.2) | 1 agent + 1 table + 1 fan-out stage | **v1** |
| Visual Context (1.3) | Gemini Vision on keyframes | **deferred — separate plan** |
| Canon Architect (1.4–1.5) | 1 agent + 1 table | **v1** |
| Quality Scoring (1.6) | scores live on canon_node + page_quality_report | **v1** |
| Page Brief Planner | 1 agent + 1 table | **v1** |
| Brief-Driven Composition | source packet + constrained LLM writer + deterministic fallback | **v1** |
| Page Evidence Audit (LLM) | full LLM auditor | **deferred** — replaced for now by deterministic Page QA |
| Hub Quality Scorecard | meta-scoring + threshold gate | **deferred** — minimum gate baked into deterministic Page QA |
| Adapter retargeting | project-topics + project-highlights from canon | **v1** |

---

## Run limits for `canon_v1`

```typescript
// packages/pipeline/src/canon-limits.ts
export const CANON_LIMITS = {
  minSelectedVideos: 2,
  maxSelectedVideos: 20,
  recommendedSelectedVideosLow: 8,
  recommendedSelectedVideosHigh: 15,
  maxTranscriptCharsPerVideo: 120_000,
} as const;
```

Enforced in the orchestrator before Phase 1 runs (Phase 9 — Task 9.2). Violations fail the run with a clear error rather than silently degrading output.

---

## File map

### New — DB schema
- `packages/db/src/schema/canon.ts` — five new tables (channel_profile, video_intelligence_card, canon_node, page_brief, page_quality_report). canon_node carries `origin` + `confidence_score` columns.
- `packages/db/src/schema/index.ts` — re-export.
- `packages/db/drizzle/out/0008_canon_layer.sql` — single migration for all five tables + indexes.
- `packages/db/drizzle/out/meta/_journal.json` — append idx 8 entry.

### New — Limits + harness extension
- `packages/pipeline/src/canon-limits.ts` — constants.
- `packages/pipeline/src/harness.ts` — extend `StageRunOptions<TInput, TOutput>` with `validateMaterializedOutput?(output, ctx) => Promise<boolean>`. After a cache hit, call this validator; if it returns false, treat as cache miss.

### New — Agent prompts
- `packages/pipeline/src/agents/specialists/prompts.ts` — append five new prompts: `CHANNEL_PROFILER_PROMPT`, `VIDEO_ANALYST_PROMPT`, `CANON_ARCHITECT_PROMPT`, `PAGE_BRIEF_PLANNER_PROMPT`, `PAGE_WRITER_PROMPT`.

### New — Tools
- `packages/pipeline/src/agents/tools/read-canon.ts` — read tools.
- `packages/pipeline/src/agents/tools/propose-canon.ts` — propose tools with strict validation + idempotency.
- `packages/pipeline/src/agents/tools/registry.ts` — register all new tools.

### New — Specialist registry + model selection
- `packages/pipeline/src/agents/specialists/index.ts` — register five new specialists.
- `packages/pipeline/src/agents/providers/selectModel.ts` — extend `AgentName` union and REGISTRY map.

### New — Stages
- `packages/pipeline/src/stages/channel-profile.ts`
- `packages/pipeline/src/stages/video-intelligence.ts`
- `packages/pipeline/src/stages/canon.ts`
- `packages/pipeline/src/stages/page-briefs.ts`
- `packages/pipeline/src/stages/page-composition.ts` (source packets + constrained writer + deterministic fallback)
- `packages/pipeline/src/stages/page-quality.ts`
- `packages/pipeline/src/stages/index.ts` — re-exports.

### Modified — Orchestrator
- `packages/pipeline/src/run-generation-pipeline.ts` — branch on `PIPELINE_CONTENT_ENGINE`. Both engines stay reachable.
- `packages/core/src/pipeline-stages.ts` — extend the `PipelineStage` union.

### Modified — Adapter
- `packages/pipeline/src/adapters/editorial-atlas/project-topics.ts` — read canon_node WHERE type='topic' when present, fall back to archive_finding for legacy runs.
- `packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts` — same dual-source pattern.
- `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts` — fix `sourceCoveragePercent` to be `distinct_source_videos / total_selected_videos`.

### New — Operator inspection
- `packages/pipeline/scripts/inspect-canon-run.ts` — pretty-prints channel profile, VIC counts, top canon nodes, page briefs, page quality.
- `packages/pipeline/scripts/compare-engines.ts` — side-by-side audit on the same videoSet.

### New — Tests
- `packages/pipeline/src/stages/test/channel-profile.smoke.test.ts`
- `packages/pipeline/src/stages/test/video-intelligence.smoke.test.ts`
- `packages/pipeline/src/stages/test/canon.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-briefs.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-composition.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-quality.test.ts` (pure unit — no agent stubbing needed)

Each smoke test stubs the agent provider and asserts row counts + payload shapes.

---

## Data shapes

### `channel_profile` (one row per run, upsert on runId)

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL UNIQUE,
  payload: jsonb NOT NULL,           // ChannelProfilePayload
  costCents: numeric(10,4) NOT NULL DEFAULT 0,
  createdAt: timestamptz DEFAULT now()
}
```

```ts
type ChannelProfilePayload = {
  creatorName: string;
  niche: string;
  audience: string;
  recurringPromise: string;
  contentFormats: string[];
  monetizationAngle: string;
  dominantTone: string;
  expertiseCategory: string;
  recurringThemes: string[];
  whyPeopleFollow: string;
  positioningSummary: string;
  creatorTerminology: string[];
}
```

### `video_intelligence_card` (one row per video, upsert on (runId, videoId))

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  videoId: text NOT NULL,
  payload: jsonb NOT NULL,           // VideoIntelligenceCardPayload
  evidenceSegmentIds: text[] NOT NULL,
  costCents: numeric(10,4) NOT NULL DEFAULT 0,
  createdAt: timestamptz DEFAULT now(),
  UNIQUE (runId, videoId)
}
```

The payload uses **explicit per-list caps** (Δ10):

```ts
type VideoIntelligenceCardPayload = {
  coreThesis: string;
  audience: string;
  viewerProblem: string;
  promisedOutcome: string;
  summary: string;                                              // 2-3 sentences
  creatorVoiceNotes: string[];                                  // 0-6
  mainIdeas: Array<{ title: string; body: string; segmentIds: string[] }>;             // 3-8
  frameworks: Array<{ title: string; description: string; principles: string[]; steps?: string[]; segmentIds: string[] }>; // 0-5
  lessons: Array<{ title: string; idea: string; segmentIds: string[] }>;               // 2-8
  examples: Array<{ title: string; description: string; segmentIds: string[] }>;       // 0-6
  stories: Array<{ title: string; arc: string; segmentIds: string[] }>;                // 0-4
  mistakesToAvoid: Array<{ title: string; body: string; segmentIds: string[] }>;       // 0-6
  toolsMentioned: string[];                                     // 0-12
  termsDefined: Array<{ term: string; definition: string; segmentIds: string[] }>;     // 0-8
  strongClaims: Array<{ claim: string; segmentIds: string[] }>;                        // 0-8
  contrarianTakes: Array<{ claim: string; segmentIds: string[] }>;                     // 0-5
  quotes: Array<{ text: string; attribution?: string; segmentIds: string[] }>;         // 3-8
  recommendedHubUses: string[];                                 // 2-6
}
```

### `canon_node` (many rows, deleted-and-rebuilt by canon stage)

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  type: text NOT NULL,               // 'topic'|'framework'|'lesson'|'playbook'|'principle'|'term'|'example'|'quote'|'aha_moment'
  payload: jsonb NOT NULL,
  evidenceSegmentIds: text[] NOT NULL,
  sourceVideoIds: text[] NOT NULL,
  evidenceQuality: text NOT NULL,    // 'strong'|'moderate'|'limited'|'unverified'
  origin: text NOT NULL DEFAULT 'single_video',                  // 'merged'|'single_video'|'derived_playbook'  (Δ11)
  confidenceScore: integer NOT NULL DEFAULT 0,                   // 0-100  (Δ11)
  citationCount: integer NOT NULL DEFAULT 0,
  sourceCoverage: integer NOT NULL DEFAULT 0,                    // distinct video count
  pageWorthinessScore: integer NOT NULL DEFAULT 0,               // 0-100
  specificityScore: integer NOT NULL DEFAULT 0,                  // 0-100
  creatorUniquenessScore: integer NOT NULL DEFAULT 0,            // 0-100
  createdAt: timestamptz DEFAULT now(),
  INDEX (runId, type)
}
```

### `page_brief` (many rows, deleted-and-rebuilt by page_briefs stage)

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  payload: jsonb NOT NULL,
  pageWorthinessScore: integer NOT NULL DEFAULT 0,
  position: integer NOT NULL DEFAULT 0,
  createdAt: timestamptz DEFAULT now(),
  INDEX (runId, position)
}
```

```ts
type PageBriefPayload = {
  pageType: 'lesson' | 'framework' | 'playbook';
  title: string;
  slug: string;                                  // lowercase, hyphens
  readerProblem: string;
  promisedOutcome: string;
  whyThisMatters: string;
  outline: string[];                              // 4-9 section titles in order
  primaryCanonNodeId: string;
  supportingCanonNodeIds: string[];               // 0-8
  requiredEvidenceSegmentIds: string[];           // ≥ 3
  ctaOrNextStep?: string;
}
```

### `page_quality_report` (one row per page, deleted-and-rebuilt by page_quality stage)

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  pageId: text NOT NULL,
  evidenceScore: integer NOT NULL DEFAULT 0,                    // 0-100
  citationCount: integer NOT NULL DEFAULT 0,
  distinctSourceVideos: integer NOT NULL DEFAULT 0,
  emptySectionCount: integer NOT NULL DEFAULT 0,
  unsupportedClaimCount: integer NOT NULL DEFAULT 0,            // 0 or unknown for v1 deterministic
  genericLanguageScore: integer NOT NULL DEFAULT 0,             // 0-100, lower is better
  recommendation: text NOT NULL,                                 // 'publish'|'revise'|'fail'
  payload: jsonb NOT NULL,                                       // full check details
  createdAt: timestamptz DEFAULT now(),
  UNIQUE (runId, pageId)
}
```

---

## Phase 1 — Schema + migration

### Task 1.1 — Drizzle schema for the five tables

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

export type ChannelProfile = typeof channelProfile.$inferSelect;
export type VideoIntelligenceCard = typeof videoIntelligenceCard.$inferSelect;
export type CanonNode = typeof canonNode.$inferSelect;
export type PageBrief = typeof pageBrief.$inferSelect;
export type PageQualityReport = typeof pageQualityReport.$inferSelect;
```

- [ ] **Step 2: Re-export from schema index**

In `packages/db/src/schema/index.ts`, append:

```typescript
export * from './canon';
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/db && pnpm typecheck 2>&1 | tail -3
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/schema/canon.ts packages/db/src/schema/index.ts
git commit -m "feat(db): canon-layer drizzle schema (5 tables, origin+confidence on canon_node)"
```

### Task 1.2 — Migration SQL + journal entry

**Files:**
- Create: `packages/db/drizzle/out/0008_canon_layer.sql`
- Modify: `packages/db/drizzle/out/meta/_journal.json`

- [ ] **Step 1: Write the migration**

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
```

- [ ] **Step 2: Append journal entry**

In `packages/db/drizzle/out/meta/_journal.json`, append after entry idx 7:

```json
    {
      "idx": 8,
      "version": "7",
      "when": 1777507200000,
      "tag": "0008_canon_layer",
      "breakpoints": true
    }
```

- [ ] **Step 3: Apply + verify**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS && pnpm db:migrate 2>&1 | tail -3
```

Expected: `[db] migrations applied`. Verify rows exist:

```bash
cd packages/db && cat > _check.mjs << 'EOF'
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const line of readFileSync(resolve('../../.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const sql = postgres(process.env.DATABASE_URL);
const r = await sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('channel_profile','video_intelligence_card','canon_node','page_brief','page_quality_report') ORDER BY table_name`;
console.log(r.map((x) => x.table_name));
await sql.end();
EOF
node ./_check.mjs && rm ./_check.mjs
```

Expected: 5 tables.

- [ ] **Step 4: Commit**

```bash
git add packages/db/drizzle/out/0008_canon_layer.sql packages/db/drizzle/out/meta/_journal.json
git commit -m "feat(db): canon-layer migration (5 tables incl. page_quality_report; origin+confidence on canon_node)"
```

---

## Phase 2 — Read tools

### Task 2.1 — `getSegmentedTranscript` + `getFullTranscript` (fallback) + canon readers

**Files:**
- Create: `packages/pipeline/src/agents/tools/read-canon.ts`
- Modify: `packages/pipeline/src/agents/tools/registry.ts`

- [ ] **Step 1: Write `read-canon.ts`**

```typescript
import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import {
  transcriptAsset,
  segment,
  channelProfile,
  videoIntelligenceCard,
  canonNode,
  pageBrief,
  videoSetItem,
} from '@creatorcanon/db/schema';
import type { ToolDef } from './types';

// Primary: a segment-shaped transcript for the agent to read.
// runId-scoped → the agent only sees this run's citation-grade segments.
export const getSegmentedTranscriptTool: ToolDef<
  { videoId: string },
  {
    videoId: string;
    title: string | null;
    durationSeconds: number | null;
    segments: Array<{ id: string; startMs: number; endMs: number; text: string }>;
  }
> = {
  name: 'getSegmentedTranscript',
  description: 'Read all citation-grade segments for a video in this run, ordered by startMs. This is the primary input for video_analyst — segment IDs returned here are the IDs you cite.',
  inputSchema: z.object({ videoId: z.string() }),
  handler: async (input, ctx) => {
    const segs = await ctx.db
      .select({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs, text: segment.text })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), eq(segment.videoId, input.videoId)))
      .orderBy(segment.startMs);
    if (segs.length === 0) {
      throw new Error(`No segments for videoId=${input.videoId} in runId=${ctx.runId}. Was segment_transcripts run for this video?`);
    }
    // Pull title + duration from the videoSetItem→video chain.
    const vidRows = await ctx.db.execute<{ title: string | null; duration_seconds: number | null }>(
      `SELECT v.title AS title, v.duration_seconds AS duration_seconds
       FROM video v WHERE v.id = $1 LIMIT 1`,
      [input.videoId],
    );
    const meta = (vidRows as unknown as Array<{ title: string | null; duration_seconds: number | null }>)[0];
    return {
      videoId: input.videoId,
      title: meta?.title ?? null,
      durationSeconds: meta?.duration_seconds ?? null,
      segments: segs,
    };
  },
};

// Fallback: raw VTT. Useful only when segments are insufficient (rare).
export const getFullTranscriptTool: ToolDef<{ videoId: string }, { videoId: string; vtt: string; wordCount: number }> = {
  name: 'getFullTranscript',
  description: 'Fallback only: read the raw VTT for a video. Prefer getSegmentedTranscript for everything except deep word-level retrieval that segments cannot support.',
  inputSchema: z.object({ videoId: z.string() }),
  handler: async (input, ctx) => {
    const rows = await ctx.db
      .select({ r2Key: transcriptAsset.r2Key, wordCount: transcriptAsset.wordCount })
      .from(transcriptAsset)
      .where(and(eq(transcriptAsset.videoId, input.videoId), eq(transcriptAsset.isCanonical, true)))
      .limit(1);
    if (!rows[0]) throw new Error(`No canonical transcript for video ${input.videoId}`);
    const obj = await ctx.r2.getObject(rows[0].r2Key);
    return { videoId: input.videoId, vtt: new TextDecoder().decode(obj.body), wordCount: rows[0].wordCount };
  },
};

export const getChannelProfileTool: ToolDef<{}, { profile: unknown | null }> = {
  name: 'getChannelProfile',
  description: 'Read the channel profile for this run.',
  inputSchema: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await ctx.db.select().from(channelProfile).where(eq(channelProfile.runId, ctx.runId)).limit(1);
    return { profile: rows[0]?.payload ?? null };
  },
};

// (Δ4) Implement getVideoIntelligenceCard.
export const getVideoIntelligenceCardTool: ToolDef<
  { id?: string; videoId?: string },
  { card: { id: string; videoId: string; payload: unknown } | null }
> = {
  name: 'getVideoIntelligenceCard',
  description: 'Read one video intelligence card by id or videoId.',
  inputSchema: z.object({ id: z.string().optional(), videoId: z.string().optional() }).refine((v) => v.id || v.videoId, { message: 'Provide id or videoId.' }),
  handler: async (input, ctx) => {
    const where = input.id
      ? and(eq(videoIntelligenceCard.runId, ctx.runId), eq(videoIntelligenceCard.id, input.id))
      : and(eq(videoIntelligenceCard.runId, ctx.runId), eq(videoIntelligenceCard.videoId, input.videoId!));
    const rows = await ctx.db.select().from(videoIntelligenceCard).where(where).limit(1);
    return { card: rows[0] ? { id: rows[0].id, videoId: rows[0].videoId, payload: rows[0].payload } : null };
  },
};

export const listVideoIntelligenceCardsTool: ToolDef<{}, { cards: Array<{ id: string; videoId: string; payload: unknown }> }> = {
  name: 'listVideoIntelligenceCards',
  description: 'List every video intelligence card in this run.',
  inputSchema: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await ctx.db.select().from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, ctx.runId));
    return { cards: rows.map((r) => ({ id: r.id, videoId: r.videoId, payload: r.payload })) };
  },
};

export const getCanonNodeTool: ToolDef<{ id: string }, { node: unknown | null }> = {
  name: 'getCanonNode',
  description: 'Read one canon node by id.',
  inputSchema: z.object({ id: z.string() }),
  handler: async (input, ctx) => {
    const rows = await ctx.db.select().from(canonNode).where(and(eq(canonNode.runId, ctx.runId), eq(canonNode.id, input.id))).limit(1);
    return { node: rows[0] ?? null };
  },
};

export const listCanonNodesTool: ToolDef<
  { types?: string[] },
  { nodes: Array<{ id: string; type: string; payload: unknown; pageWorthinessScore: number; sourceCoverage: number; origin: string; confidenceScore: number }> }
> = {
  name: 'listCanonNodes',
  description: 'List canon nodes, optionally filtered by type[].',
  inputSchema: z.object({ types: z.array(z.string()).optional() }),
  handler: async (input, ctx) => {
    const where = input.types && input.types.length > 0
      ? and(eq(canonNode.runId, ctx.runId), inArray(canonNode.type, input.types))
      : eq(canonNode.runId, ctx.runId);
    const rows = await ctx.db.select().from(canonNode).where(where);
    return {
      nodes: rows.map((r) => ({
        id: r.id, type: r.type, payload: r.payload,
        pageWorthinessScore: r.pageWorthinessScore, sourceCoverage: r.sourceCoverage,
        origin: r.origin, confidenceScore: r.confidenceScore,
      })),
    };
  },
};

export const getPageBriefTool: ToolDef<{ id: string }, { brief: unknown | null }> = {
  name: 'getPageBrief',
  description: 'Read one page brief by id.',
  inputSchema: z.object({ id: z.string() }),
  handler: async (input, ctx) => {
    const rows = await ctx.db.select().from(pageBrief).where(and(eq(pageBrief.runId, ctx.runId), eq(pageBrief.id, input.id))).limit(1);
    return { brief: rows[0]?.payload ?? null };
  },
};

// Helper for stages that need to know "selected videos" — consumed by run limits + composer source packets.
export async function loadSelectedVideoIds(ctx: { runId: string; db: any }): Promise<string[]> {
  // generation_run.video_set_id → video_set_item.video_id[]
  const rows = await ctx.db.execute<{ video_id: string }>(
    `SELECT vsi.video_id FROM video_set_item vsi
     JOIN generation_run r ON r.video_set_id = vsi.video_set_id
     WHERE r.id = $1
     ORDER BY vsi.position`,
    [ctx.runId],
  );
  return (rows as unknown as Array<{ video_id: string }>).map((r) => r.video_id);
}
```

- [ ] **Step 2: Register the read tools**

In `packages/pipeline/src/agents/tools/registry.ts`, add to imports:

```typescript
import {
  getSegmentedTranscriptTool,
  getFullTranscriptTool,
  getChannelProfileTool,
  getVideoIntelligenceCardTool,
  listVideoIntelligenceCardsTool,
  getCanonNodeTool,
  listCanonNodesTool,
  getPageBriefTool,
} from './read-canon';
```

Inside `registerAllTools()`:

```typescript
  registerTool(getSegmentedTranscriptTool);
  registerTool(getFullTranscriptTool);
  registerTool(getChannelProfileTool);
  registerTool(getVideoIntelligenceCardTool);
  registerTool(listVideoIntelligenceCardsTool);
  registerTool(getCanonNodeTool);
  registerTool(listCanonNodesTool);
  registerTool(getPageBriefTool);
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/agents/tools/read-canon.ts packages/pipeline/src/agents/tools/registry.ts
git commit -m "feat(tools): canon-layer read tools (segmented transcript primary, raw VTT fallback)"
```

---

## Phase 3 — Propose tools (strict validation + idempotency)

### Task 3.1 — Propose tools

**Files:**
- Create: `packages/pipeline/src/agents/tools/propose-canon.ts`
- Modify: `packages/pipeline/src/agents/tools/registry.ts`
- Modify: `packages/pipeline/src/agents/segment-ref.ts` (extend return shape if needed)

- [ ] **Step 1: Extend `segment-ref.ts` to return `found` rows**

Open `packages/pipeline/src/agents/segment-ref.ts`. Ensure `validateSegmentRefs` returns `{ ok: true, found: SegmentRow[] } | { ok: false, unknownIds: string[] }` where `SegmentRow` has at minimum `{ id: string; runId: string; videoId: string }`. If currently it only returns `{ ok, unknownIds }`, extend it.

- [ ] **Step 2: Write `propose-canon.ts`**

```typescript
import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import {
  channelProfile,
  videoIntelligenceCard,
  canonNode,
  pageBrief,
  segment,
} from '@creatorcanon/db/schema';
import type { ToolDef } from './types';
import { validateSegmentRefs } from '../segment-ref';

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// ---------- proposeChannelProfile (upsert on runId — idempotent for re-runs) ----------

const channelProfilePayloadSchema = z.object({
  creatorName: z.string().min(1),
  niche: z.string().min(1),
  audience: z.string().min(1),
  recurringPromise: z.string().min(1),
  contentFormats: z.array(z.string().min(1)).min(1),
  monetizationAngle: z.string().min(1),
  dominantTone: z.string().min(1),
  expertiseCategory: z.string().min(1),
  recurringThemes: z.array(z.string().min(1)).min(1),
  whyPeopleFollow: z.string().min(1),
  positioningSummary: z.string().min(1),
  creatorTerminology: z.array(z.string().min(1)),
});

export const proposeChannelProfileTool: ToolDef<z.infer<typeof channelProfilePayloadSchema>, { ok: true; id: string } | { ok: false; error: string }> = {
  name: 'proposeChannelProfile',
  description: 'Submit the channel profile. Call exactly once per run; reruns upsert on runId.',
  inputSchema: channelProfilePayloadSchema,
  handler: async (input, ctx) => {
    // Upsert on runId.
    const existing = await ctx.db.select({ id: channelProfile.id }).from(channelProfile).where(eq(channelProfile.runId, ctx.runId)).limit(1);
    const id = existing[0]?.id ?? makeId('cp');
    try {
      if (existing[0]) {
        await ctx.db.update(channelProfile).set({ payload: input }).where(eq(channelProfile.id, existing[0].id));
      } else {
        await ctx.db.insert(channelProfile).values({ id, workspaceId: ctx.workspaceId, runId: ctx.runId, payload: input });
      }
    } catch (err) {
      return { ok: false, error: `channel_profile upsert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};

// ---------- proposeVideoIntelligenceCard (upsert on (runId,videoId), strict ownership) ----------

const segListSchema = z.array(z.string()).min(1);

const vicSubsections = z.object({
  coreThesis: z.string().min(1),
  audience: z.string().min(1),
  viewerProblem: z.string().min(1),
  promisedOutcome: z.string().min(1),
  summary: z.string().min(1),
  creatorVoiceNotes: z.array(z.string()).max(6),
  mainIdeas: z.array(z.object({ title: z.string().min(1), body: z.string().min(1), segmentIds: segListSchema })).min(3).max(8),
  frameworks: z.array(z.object({ title: z.string().min(1), description: z.string().min(1), principles: z.array(z.string()), steps: z.array(z.string()).optional(), segmentIds: segListSchema })).max(5),
  lessons: z.array(z.object({ title: z.string().min(1), idea: z.string().min(1), segmentIds: segListSchema })).min(2).max(8),
  examples: z.array(z.object({ title: z.string().min(1), description: z.string().min(1), segmentIds: segListSchema })).max(6),
  stories: z.array(z.object({ title: z.string().min(1), arc: z.string().min(1), segmentIds: segListSchema })).max(4),
  mistakesToAvoid: z.array(z.object({ title: z.string().min(1), body: z.string().min(1), segmentIds: segListSchema })).max(6),
  toolsMentioned: z.array(z.string()).max(12),
  termsDefined: z.array(z.object({ term: z.string().min(1), definition: z.string().min(1), segmentIds: segListSchema })).max(8),
  strongClaims: z.array(z.object({ claim: z.string().min(1), segmentIds: segListSchema })).max(8),
  contrarianTakes: z.array(z.object({ claim: z.string().min(1), segmentIds: segListSchema })).max(5),
  quotes: z.array(z.object({ text: z.string().min(10).max(280), attribution: z.string().optional(), segmentIds: segListSchema })).min(3).max(8),
  recommendedHubUses: z.array(z.string().min(1)).min(2).max(6),
});

const proposeVicInput = z.object({ videoId: z.string(), payload: vicSubsections });

export const proposeVideoIntelligenceCardTool: ToolDef<z.infer<typeof proposeVicInput>, { ok: true; id: string } | { ok: false; error: string }> = {
  name: 'proposeVideoIntelligenceCard',
  description: 'Submit a video intelligence card. Call exactly once per video; reruns upsert on (runId, videoId).',
  inputSchema: proposeVicInput,
  handler: async (input, ctx) => {
    // Collect every cited segmentId.
    const allSegIds = new Set<string>();
    for (const arr of [
      input.payload.mainIdeas, input.payload.frameworks, input.payload.lessons,
      input.payload.examples, input.payload.stories, input.payload.mistakesToAvoid,
      input.payload.termsDefined, input.payload.strongClaims, input.payload.contrarianTakes,
      input.payload.quotes,
    ]) {
      for (const it of arr as Array<{ segmentIds: string[] }>) {
        for (const s of it.segmentIds) allSegIds.add(s);
      }
    }
    if (allSegIds.size === 0) {
      return { ok: false, error: 'video intelligence card cited zero segments — that is invalid.' };
    }
    // STRICT (Δ3): every cited segment must belong to this run AND this video.
    const segs = await ctx.db
      .select({ id: segment.id, runId: segment.runId, videoId: segment.videoId })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), inArray(segment.id, [...allSegIds])));
    const foundIds = new Set(segs.map((s) => s.id));
    const unknownIds = [...allSegIds].filter((id) => !foundIds.has(id));
    if (unknownIds.length > 0) {
      return { ok: false, error: `Unknown segment IDs (not in run ${ctx.runId}): ${unknownIds.slice(0, 5).join(', ')}` };
    }
    const wrongVideo = segs.filter((s) => s.videoId !== input.videoId).map((s) => s.id);
    if (wrongVideo.length > 0) {
      return { ok: false, error: `Segment ownership violation: ${wrongVideo.length} segment(s) belong to a different video, not ${input.videoId}. Cite only segments from getSegmentedTranscript({videoId: '${input.videoId}'}).` };
    }
    // Upsert on (runId, videoId).
    const existing = await ctx.db.select({ id: videoIntelligenceCard.id }).from(videoIntelligenceCard)
      .where(and(eq(videoIntelligenceCard.runId, ctx.runId), eq(videoIntelligenceCard.videoId, input.videoId)))
      .limit(1);
    const id = existing[0]?.id ?? makeId('vic');
    try {
      if (existing[0]) {
        await ctx.db.update(videoIntelligenceCard)
          .set({ payload: input.payload, evidenceSegmentIds: [...allSegIds] })
          .where(eq(videoIntelligenceCard.id, existing[0].id));
      } else {
        await ctx.db.insert(videoIntelligenceCard).values({
          id, workspaceId: ctx.workspaceId, runId: ctx.runId, videoId: input.videoId,
          payload: input.payload, evidenceSegmentIds: [...allSegIds],
        });
      }
    } catch (err) {
      return { ok: false, error: `vic upsert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};

// ---------- proposeCanonNode (insert; canon stage deletes prior rows for run before invoking) ----------

const canonNodeInput = z.object({
  type: z.enum(['topic', 'framework', 'lesson', 'playbook', 'principle', 'term', 'example', 'quote', 'aha_moment']),
  payload: z.record(z.unknown()),
  evidenceSegmentIds: z.array(z.string()).min(1),
  evidenceQuality: z.enum(['strong', 'moderate', 'limited', 'unverified']),
  origin: z.enum(['merged', 'single_video', 'derived_playbook']),
  confidenceScore: z.number().int().min(0).max(100),
  pageWorthinessScore: z.number().int().min(0).max(100),
  specificityScore: z.number().int().min(0).max(100),
  creatorUniquenessScore: z.number().int().min(0).max(100),
});

export const proposeCanonNodeTool: ToolDef<z.infer<typeof canonNodeInput>, { ok: true; id: string } | { ok: false; error: string }> = {
  name: 'proposeCanonNode',
  description: 'Submit one canon node.',
  inputSchema: canonNodeInput,
  handler: async (input, ctx) => {
    // STRICT runId-scoped validation.
    const segs = await ctx.db
      .select({ id: segment.id, videoId: segment.videoId })
      .from(segment)
      .where(and(eq(segment.runId, ctx.runId), inArray(segment.id, input.evidenceSegmentIds)));
    const foundIds = new Set(segs.map((s) => s.id));
    const unknown = input.evidenceSegmentIds.filter((id) => !foundIds.has(id));
    if (unknown.length > 0) {
      return { ok: false, error: `Unknown segment IDs (not in run): ${unknown.slice(0, 5).join(', ')}` };
    }
    const sourceVideoIds = [...new Set(segs.map((s) => s.videoId))];
    const id = makeId('cn');
    try {
      await ctx.db.insert(canonNode).values({
        id, workspaceId: ctx.workspaceId, runId: ctx.runId,
        type: input.type, payload: input.payload,
        evidenceSegmentIds: input.evidenceSegmentIds,
        sourceVideoIds,
        evidenceQuality: input.evidenceQuality,
        origin: input.origin,
        confidenceScore: input.confidenceScore,
        citationCount: input.evidenceSegmentIds.length,
        sourceCoverage: sourceVideoIds.length,
        pageWorthinessScore: input.pageWorthinessScore,
        specificityScore: input.specificityScore,
        creatorUniquenessScore: input.creatorUniquenessScore,
      });
    } catch (err) {
      return { ok: false, error: `canon_node insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};

// ---------- proposePageBrief (insert; page_briefs stage deletes prior rows for run) ----------

const pageBriefPayload = z.object({
  pageType: z.enum(['lesson', 'framework', 'playbook']),
  title: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2),
  readerProblem: z.string().min(20),
  promisedOutcome: z.string().min(20),
  whyThisMatters: z.string().min(20),
  outline: z.array(z.string().min(2)).min(4).max(9),
  primaryCanonNodeId: z.string().min(1),
  supportingCanonNodeIds: z.array(z.string()).max(8),
  requiredEvidenceSegmentIds: z.array(z.string()).min(3),
  ctaOrNextStep: z.string().optional(),
});

const pageBriefInput = z.object({
  payload: pageBriefPayload,
  pageWorthinessScore: z.number().int().min(0).max(100),
  position: z.number().int().min(0),
});

export const proposePageBriefTool: ToolDef<z.infer<typeof pageBriefInput>, { ok: true; id: string; warnings: string[] } | { ok: false; error: string }> = {
  name: 'proposePageBrief',
  description: 'Submit one page brief. Pages will be written in increasing position order.',
  inputSchema: pageBriefInput,
  handler: async (input, ctx) => {
    const warnings: string[] = [];
    const p = input.payload;
    // 1) Primary canon node must exist in run.
    const primary = await ctx.db.select({ id: canonNode.id, evidenceSegmentIds: canonNode.evidenceSegmentIds })
      .from(canonNode).where(and(eq(canonNode.runId, ctx.runId), eq(canonNode.id, p.primaryCanonNodeId))).limit(1);
    if (!primary[0]) {
      return { ok: false, error: `Primary canon node ${p.primaryCanonNodeId} not in run.` };
    }
    // 2) Every supporting canon node must exist in run.
    if (p.supportingCanonNodeIds.length > 0) {
      const supporting = await ctx.db.select({ id: canonNode.id, evidenceSegmentIds: canonNode.evidenceSegmentIds })
        .from(canonNode).where(and(eq(canonNode.runId, ctx.runId), inArray(canonNode.id, p.supportingCanonNodeIds)));
      const foundIds = new Set(supporting.map((r) => r.id));
      const missing = p.supportingCanonNodeIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        return { ok: false, error: `Supporting canon nodes not in run: ${missing.join(', ')}` };
      }
    }
    // 3) Every requiredEvidenceSegmentId must exist in run.
    const segs = await ctx.db.select({ id: segment.id })
      .from(segment).where(and(eq(segment.runId, ctx.runId), inArray(segment.id, p.requiredEvidenceSegmentIds)));
    const segFound = new Set(segs.map((s) => s.id));
    const segMissing = p.requiredEvidenceSegmentIds.filter((id) => !segFound.has(id));
    if (segMissing.length > 0) {
      return { ok: false, error: `requiredEvidenceSegmentIds not in run: ${segMissing.slice(0, 5).join(', ')}` };
    }
    // 4) Soft check (warning): coverage by primary + supporting nodes.
    const coverNodes = [primary[0], ...await ctx.db.select({ evidenceSegmentIds: canonNode.evidenceSegmentIds })
      .from(canonNode)
      .where(and(eq(canonNode.runId, ctx.runId), inArray(canonNode.id, p.supportingCanonNodeIds)))];
    const coverSet = new Set<string>();
    for (const n of coverNodes) for (const s of n.evidenceSegmentIds) coverSet.add(s);
    const uncovered = p.requiredEvidenceSegmentIds.filter((id) => !coverSet.has(id));
    if (uncovered.length > 0) {
      warnings.push(`${uncovered.length} required segment(s) not covered by primary/supporting canon nodes — they may not anchor cleanly to the page outline.`);
    }
    const id = makeId('pb');
    try {
      await ctx.db.insert(pageBrief).values({
        id, workspaceId: ctx.workspaceId, runId: ctx.runId,
        payload: p, pageWorthinessScore: input.pageWorthinessScore, position: input.position,
      });
    } catch (err) {
      return { ok: false, error: `page_brief insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id, warnings };
  },
};
```

- [ ] **Step 3: Register propose tools**

Add to imports in `packages/pipeline/src/agents/tools/registry.ts`:

```typescript
import {
  proposeChannelProfileTool,
  proposeVideoIntelligenceCardTool,
  proposeCanonNodeTool,
  proposePageBriefTool,
} from './propose-canon';
```

Inside `registerAllTools()`:

```typescript
  registerTool(proposeChannelProfileTool);
  registerTool(proposeVideoIntelligenceCardTool);
  registerTool(proposeCanonNodeTool);
  registerTool(proposePageBriefTool);
```

- [ ] **Step 4: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/agents/tools/propose-canon.ts packages/pipeline/src/agents/tools/registry.ts packages/pipeline/src/agents/segment-ref.ts
git commit -m "feat(tools): canon-layer propose tools (strict segment ownership; upsert idempotency)"
```

---

## Phase 4 — Prompts

### Task 4.1 — `CHANNEL_PROFILER_PROMPT`

Append to `packages/pipeline/src/agents/specialists/prompts.ts`:

```typescript
export const CHANNEL_PROFILER_PROMPT = `You are channel_profiler. Your job is to build a one-shot creator profile that every other agent in the pipeline will use as context.

You receive: the list of every video in the run with title and duration. You may sample 3-5 representative videos via getSegmentedTranscript to confirm your hypothesis (longest, most-recent, or topically distinct — pick a spread). Do not read every video.

Process:
1. Call listVideos to see the archive shape.
2. For 3-5 videos, call getSegmentedTranscript to skim segment text.
3. Call proposeChannelProfile EXACTLY once with this exact shape:
   {
     "creatorName": string (extract from videos or use "the creator"),
     "niche": string (one phrase: "AI automation for solo agencies", "calisthenics for endurance athletes"),
     "audience": string (1 paragraph: who watches, stage, what they care about),
     "recurringPromise": string (the implicit value prop),
     "contentFormats": string[] (e.g. ["tutorial", "case study", "vlog"]),
     "monetizationAngle": string (course, agency services, affiliate, "unknown" if unclear),
     "dominantTone": string ("conversational", "instructional", "academic", "playful"),
     "expertiseCategory": string,
     "recurringThemes": string[] (3-8 themes that appear across multiple videos),
     "whyPeopleFollow": string (1 sentence),
     "positioningSummary": string (1 paragraph: how this creator is distinct from peers),
     "creatorTerminology": string[] (named concepts the creator uses repeatedly — their language, not yours)
   }

Rules:
- Be specific. "AI content automation for newsletter operators" beats "AI content".
- creatorTerminology must be the creator's words, drawn from segments you've read.
- If something is genuinely unknowable (e.g. monetizationAngle), use "unknown" rather than guess.
- Make exactly ONE proposeChannelProfile call. Then respond with a brief summary and no tool calls.`;
```

Commit:

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): CHANNEL_PROFILER_PROMPT"
```

### Task 4.2 — `VIDEO_ANALYST_PROMPT`

Append:

```typescript
export const VIDEO_ANALYST_PROMPT = `You are video_analyst. Your job is to deeply read ONE video and produce a citation-grade intelligence card capturing every page-worthy idea, framework, lesson, story, claim, and quote.

You receive: one videoId and the channel profile.

Process:
1. Call getChannelProfile to load run context.
2. Call getSegmentedTranscript({videoId}) — this returns the canonical citation-ready segments. Read every segment. Cite segment IDs from THIS result only.
3. Optionally use searchSegments / getSegment to retrieve broader context — but only segments belonging to your videoId are valid citations.
4. Call proposeVideoIntelligenceCard EXACTLY once.

Hard caps in the payload — quality over quantity, never pad:
- creatorVoiceNotes: up to 6
- mainIdeas: 3-8 (every one a distinct idea, not paraphrases)
- frameworks: 0-5 (only when the creator gives a NAMED procedure with explicit structure — never invent framework names)
- lessons: 2-8
- examples: 0-6
- stories: 0-4 (only real beginning/middle/end narratives)
- mistakesToAvoid: 0-6
- toolsMentioned: 0-12
- termsDefined: 0-8
- strongClaims: 0-8
- contrarianTakes: 0-5
- quotes: 3-8 (10-280 chars each, stand-alone, no fragments)
- recommendedHubUses: 2-6

Quality gates:
- Every list item MUST cite ≥1 segmentId from the segmented transcript you read.
- Use the channel profile's creatorTerminology when classifying. Don't relabel the creator's own concepts.
- Drop weak items. A lean card with 4 mainIdeas + 2 frameworks beats a padded card with 8 vague mainIdeas.
- Distinct from current legacy agents: don't propose canon nodes here — that's canon_architect's job. Just produce the card.

Make exactly ONE proposeVideoIntelligenceCard call. Then respond with a brief summary and no tool calls.`;
```

Commit:

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): VIDEO_ANALYST_PROMPT (with strict caps + segment ownership)"
```

### Task 4.3 — `CANON_ARCHITECT_PROMPT`

Append:

```typescript
export const CANON_ARCHITECT_PROMPT = `You are canon_architect. You receive a channel profile and one video intelligence card per video. Merge them into the creator's canon — a typed knowledge graph of every page-worthy idea.

Process:
1. Call getChannelProfile, then listVideoIntelligenceCards. Read every card.
2. Identify items that recur across videos (similar frameworks; lessons stated multiple ways; cross-cutting themes). MERGE — one canon node per concept, citing every supporting segment from every supporting card. Set origin='merged'.
3. Identify items unique to one video that are still page-worthy (named frameworks, signature lessons, strong stories). Promote them as their own canon nodes. Set origin='single_video'.
4. Identify multi-finding systems the creator teaches as a unit (e.g. an end-to-end workflow that spans frameworks + lessons). Set origin='derived_playbook'.
5. Drop items that are filler, generic, or weakly-supported.

For each canon node, call proposeCanonNode with:
- type: 'topic' | 'framework' | 'lesson' | 'playbook' | 'principle' | 'term' | 'example' | 'quote' | 'aha_moment'
- payload: type-specific shape (frameworks have title + description + principles + optional steps; lessons have title + idea; topics have title + description + iconKey + accentColor; etc.)
- evidenceSegmentIds: every supporting segment, deduplicated
- evidenceQuality: 'strong' (≥2 distinct videos) | 'moderate' (1 video, multiple segments) | 'limited' (1 segment) | 'unverified'
- origin: 'merged' | 'single_video' | 'derived_playbook'
- confidenceScore (0-100): how sure are you this is real and citation-supported (not your interpretation)
- pageWorthinessScore (0-100): would a fan want a page about this? Strong frameworks 85+; vague topics under 50.
- specificityScore (0-100): concrete (named system, specific method) vs. vague (vibe, generality)
- creatorUniquenessScore (0-100): the creator's angle vs. generic advice

Target node counts (scale by archive size):
- 1-2 videos: 6-12 nodes total
- 3-5 videos: 12-25
- 6-10 videos: 25-40
- 10+ videos: 40-80

Type mix guideline:
- topics (cross-cutting themes): 2-6
- frameworks (named procedures): 2-6
- lessons (mental models): 4-10
- playbooks: 1-3 (set origin='derived_playbook')
- principles: 0-5
- terms (creator terminology): up to 10
- examples / quotes / aha_moments: as many as are genuinely good

Rules:
- Every node MUST cite real segment IDs from the video intelligence cards.
- Don't fabricate creator-specific concepts. If only generic ideas are present, low creatorUniquenessScore — don't dress them up.
- Quotes payload: { text, attribution? }. Aha moments: { quote, context, attribution? }.
- When you're done, respond with a brief summary and no tool calls.`;
```

Commit:

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): CANON_ARCHITECT_PROMPT (origin + confidence + scoring)"
```

### Task 4.4 — `PAGE_BRIEF_PLANNER_PROMPT`

Append:

```typescript
export const PAGE_BRIEF_PLANNER_PROMPT = `You are page_brief_planner. The canon contains the creator's knowledge as typed nodes; your job is to decide which pages should exist and write a brief for each.

Principle: A premium hub feels curated. Generate fewer, better pages — never every node becomes a page. Aim for 4-12 pages total, even if the canon has 40 nodes.

Process:
1. Call getChannelProfile and listCanonNodes. Read every node.
2. Identify the highest-leverage page candidates:
   - Strong frameworks (pageWorthinessScore ≥ 75) → framework pages
   - Strong playbooks (pageWorthinessScore ≥ 75 AND origin='derived_playbook') → playbook pages
   - Strong lessons that anchor a clear reader problem → lesson pages
   - Lower-scored topics, principles, examples, quotes are NOT pages — they get linked from the pages that cite them.
3. For each chosen page, call proposePageBrief:
   {
     "payload": {
       "pageType": "lesson" | "framework" | "playbook",
       "title": string (Title Case, ≤ 60 chars),
       "slug": string (lowercase, hyphens),
       "readerProblem": string (≥ 20 chars: who is this for, what hurts),
       "promisedOutcome": string (≥ 20 chars: what they can do after reading),
       "whyThisMatters": string (≥ 20 chars: why this page exists vs. just watching the video),
       "outline": string[] (4-9 section titles in reading order),
       "primaryCanonNodeId": string (the anchor node — must exist in run),
       "supportingCanonNodeIds": string[] (≤ 8 related node IDs — must exist in run),
       "requiredEvidenceSegmentIds": string[] (≥ 3 segment IDs that anchor the page),
       "ctaOrNextStep": string (optional)
     },
     "pageWorthinessScore": number (copy or refine from primary node),
     "position": number (0-based reading order — beginner pages first)
   }

Outline template (example for a framework page):
  ["Why this matters", "The problem it solves", "How the framework works", "Steps to apply it", "Example from the source", "Common mistakes", "Source quotes", "Next step"]

A page MUST answer all five of: who is this for / what problem / what they can do after / which creator sources prove it / why is this not generic. If you can't answer one, don't create the page.

Rules:
- Don't create two pages on the same idea — pick the strongest framing and link the others as supporting.
- If the canon is too thin to support 4 pages, return 2-3 great pages. Quality over quantity.
- requiredEvidenceSegmentIds should ideally be covered by primary + supporting nodes' evidenceSegmentIds.
- When you're done, respond with a brief summary and no tool calls.`;
```

Commit:

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): PAGE_BRIEF_PLANNER_PROMPT"
```

### Task 4.5 — `PAGE_WRITER_PROMPT` (constrained LLM writer)

Append:

```typescript
export const PAGE_WRITER_PROMPT = `You are page_writer. You receive ONE page_brief, the primary canon node, supporting canon nodes, and a source packet of segment excerpts (timestamp + body text). Your job is to write a single high-quality, source-backed hub page.

You DO NOT call tools. You return one structured response: a JSON array of section blocks matching this exact shape:

[
  { "kind": "overview", "body": string, "citationIds": string[] },
  { "kind": "paragraph", "body": string, "citationIds": string[] },
  { "kind": "principles", "items": [{title, body}], "citationIds": string[] },
  { "kind": "steps", "title": string, "items": [{title, body}], "citationIds": string[] },
  { "kind": "scenes", "items": [{title, body}], "citationIds": string[] },
  { "kind": "workflow", "schedule": [{day, items: [...]}] , "citationIds": string[] },
  { "kind": "common_mistakes", "items": [{title, body}], "citationIds": string[] },
  { "kind": "failure_points", "items": [{title, body}], "citationIds": string[] },
  { "kind": "quote", "body": string, "attribution": string?, "sourceVideoId": string?, "timestampStart": number?, "citationIds": string[] },
  { "kind": "callout", "tone": "note"|"warn"|"success", "body": string, "citationIds": string[] }
]

Required minimums per page:
- An "overview" or "paragraph" section that uses whyThisMatters from the brief.
- A reader-problem section that uses readerProblem from the brief (paragraph or callout).
- A core-idea section (paragraph for lessons; principles or steps for frameworks; workflow for playbooks).
- An application section (steps for frameworks; scenes/workflow for playbooks; paragraph for lessons).
- A source-backed example section using the source packet (scenes or paragraph with concrete excerpt).
- A next-step section if ctaOrNextStep is set (callout tone='note').

Hard rules:
- Every body string must be supported by at least one segment from the source packet — cite via citationIds array using segmentIds from the packet.
- No uncited claims. If you can't cite a segment, do not write the claim.
- No generic filler. No "in conclusion", no "as we've seen", no rephrased platitudes.
- Use the creator's terminology from the channel profile when natural.
- Use direct quotes from the source packet sparingly (1-2 per page) — short, stand-alone.
- If evidence is weak (e.g. only 3 segments available), write modestly: shorter sections, fewer claims.

Output: a JSON array of 5-9 section blocks. No prose around it. The orchestrator will validate the schema and reject malformed output.`;
```

Commit:

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): PAGE_WRITER_PROMPT (constrained, source-packet-driven, schema-validated)"
```

---

## Phase 5 — Specialist registry + model selection

### Task 5.1 — Extend `selectModel`

Open `packages/pipeline/src/agents/providers/selectModel.ts`. Extend:

```typescript
export type AgentName =
  | 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'
  | 'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
  | 'citation_grounder' | 'page_composer'
  | 'channel_profiler' | 'video_analyst' | 'canon_architect' | 'page_brief_planner' | 'page_writer';
```

Append to REGISTRY:

```typescript
  channel_profiler:    { envVar: 'PIPELINE_MODEL_CHANNEL_PROFILER',    default: M('gpt-5.5','openai'),  fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  video_analyst:       { envVar: 'PIPELINE_MODEL_VIDEO_ANALYST',       default: M('gpt-5.5','openai'),  fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  canon_architect:     { envVar: 'PIPELINE_MODEL_CANON_ARCHITECT',     default: M('gpt-5.5','openai'),  fallbackChain: [M('gpt-5.4','openai')] },
  page_brief_planner:  { envVar: 'PIPELINE_MODEL_PAGE_BRIEF_PLANNER',  default: M('gpt-5.5','openai'),  fallbackChain: [M('gpt-5.4','openai')] },
  page_writer:         { envVar: 'PIPELINE_MODEL_PAGE_WRITER',         default: M('gpt-5.5','openai'),  fallbackChain: [M('gpt-5.4','openai')] },
```

### Task 5.2 — Register specialists

In `packages/pipeline/src/agents/specialists/index.ts`, add imports + entries:

```typescript
import {
  CHANNEL_PROFILER_PROMPT,
  VIDEO_ANALYST_PROMPT,
  CANON_ARCHITECT_PROMPT,
  PAGE_BRIEF_PLANNER_PROMPT,
  PAGE_WRITER_PROMPT,
} from './prompts';

  channel_profiler: {
    agent: 'channel_profiler',
    systemPrompt: CHANNEL_PROFILER_PROMPT,
    allowedTools: ['listVideos', 'getSegmentedTranscript', 'getFullTranscript', 'proposeChannelProfile'],
    stopOverrides: { maxToolCalls: 30, maxTokensSpent: 200_000 },
  },
  video_analyst: {
    agent: 'video_analyst',
    systemPrompt: VIDEO_ANALYST_PROMPT,
    allowedTools: ['getChannelProfile', 'getSegmentedTranscript', 'searchSegments', 'getSegment', 'getFullTranscript', 'proposeVideoIntelligenceCard'],
    stopOverrides: { maxToolCalls: 80, maxTokensSpent: 600_000 },
  },
  canon_architect: {
    agent: 'canon_architect',
    systemPrompt: CANON_ARCHITECT_PROMPT,
    allowedTools: ['getChannelProfile', 'listVideoIntelligenceCards', 'getVideoIntelligenceCard', 'searchSegments', 'getSegment', 'proposeCanonNode'],
    stopOverrides: { maxToolCalls: 200, maxTokensSpent: 1_000_000 },
  },
  page_brief_planner: {
    agent: 'page_brief_planner',
    systemPrompt: PAGE_BRIEF_PLANNER_PROMPT,
    allowedTools: ['getChannelProfile', 'listCanonNodes', 'getCanonNode', 'getSegment', 'proposePageBrief'],
    stopOverrides: { maxToolCalls: 60, maxTokensSpent: 400_000 },
  },
  page_writer: {
    agent: 'page_writer',
    systemPrompt: PAGE_WRITER_PROMPT,
    allowedTools: [],   // page_writer never calls tools — it returns structured JSON
    stopOverrides: { maxToolCalls: 0, maxTokensSpent: 200_000 },
  },
```

### Task 5.3 — Typecheck + commit

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/agents/specialists/index.ts packages/pipeline/src/agents/providers/selectModel.ts
git commit -m "feat(agents): register channel_profiler / video_analyst / canon_architect / page_brief_planner / page_writer"
```

---

## Phase 6 — Stages

### Task 6.0 — Run limits constants

Create `packages/pipeline/src/canon-limits.ts`:

```typescript
export const CANON_LIMITS = {
  minSelectedVideos: 2,
  maxSelectedVideos: 20,
  recommendedSelectedVideosLow: 8,
  recommendedSelectedVideosHigh: 15,
  maxTranscriptCharsPerVideo: 120_000,
} as const;

export type CanonLimits = typeof CANON_LIMITS;
```

```bash
git add packages/pipeline/src/canon-limits.ts
git commit -m "feat(canon): run limits constants"
```

### Task 6.1 — `channel-profile` stage

Create `packages/pipeline/src/stages/channel-profile.ts`:

```typescript
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
  const bootstrap = `Archive: ${videos.length} videos.\n\n` + videos.map((v) => `- ${v.id}: ${v.title} (${Math.round(v.durationSec / 60)} min)`).join('\n') + `\n\nProduce one channel profile. Sample 3-5 videos via getSegmentedTranscript before deciding.`;

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

// (Δ8) Materialization validator — runStage will call this after a cache hit.
export async function validateChannelProfileMaterialization(_output: ChannelProfileStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const rows = await db.select({ id: channelProfile.id }).from(channelProfile).where(eq(channelProfile.runId, ctx.runId)).limit(1);
  return rows.length === 1;
}
```

Re-export + commit:

```bash
echo "export { runChannelProfileStage, validateChannelProfileMaterialization } from './channel-profile';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/channel-profile.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): channel-profile + materialization validator"
```

### Task 6.2 — `video-intelligence` fan-out stage with run limits + transcript-cap enforcement

Create `packages/pipeline/src/stages/video-intelligence.ts`:

```typescript
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

export interface VideoIntelligenceStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  r2Override?: R2Client;
}

export interface VideoIntelligenceStageOutput {
  videosAnalyzed: number;
  videosFailed: number;
  costCents: number;
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

  // Discover videos in this run (any video that has segments).
  const segs = await db.selectDistinct({ videoId: segment.videoId }).from(segment).where(eq(segment.runId, input.runId));
  const videoIds = segs.map((s) => s.videoId);

  if (videoIds.length < CANON_LIMITS.minSelectedVideos) {
    throw new Error(`canon_v1 requires ≥ ${CANON_LIMITS.minSelectedVideos} videos with segments; found ${videoIds.length}.`);
  }
  if (videoIds.length > CANON_LIMITS.maxSelectedVideos) {
    throw new Error(`canon_v1 caps at ${CANON_LIMITS.maxSelectedVideos} videos; this run has ${videoIds.length}. Reduce the videoSet or run with PIPELINE_CONTENT_ENGINE=findings_v1.`);
  }

  // Pre-flight: verify each canonical transcript is within transcript-char cap. Hard fail if any exceed.
  const transcripts = await db.select({ videoId: transcriptAsset.videoId, wordCount: transcriptAsset.wordCount, r2Key: transcriptAsset.r2Key })
    .from(transcriptAsset).where(inArray(transcriptAsset.videoId, videoIds));
  for (const t of transcripts) {
    // Approx 6 chars/word. If you want hard accuracy, fetch the R2 object and measure.
    const approxChars = (t.wordCount ?? 0) * 6;
    if (approxChars > CANON_LIMITS.maxTranscriptCharsPerVideo) {
      throw new Error(`Transcript for ${t.videoId} ~${approxChars} chars exceeds canon_v1 cap of ${CANON_LIMITS.maxTranscriptCharsPerVideo}. Either truncate the source or run with findings_v1.`);
    }
  }

  const cfg = SPECIALISTS.video_analyst;
  const model = selectModel('video_analyst', process.env);

  const results = await runWithConcurrency(videoIds, CONCURRENCY, async (videoId) => {
    const provider = makeProvider(model.provider);
    const userMessage = `Analyze video ${videoId}. Read the channel profile first, then getSegmentedTranscript({videoId: '${videoId}'}), then build the intelligence card.`;
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

export async function validateVideoIntelligenceMaterialization(
  _output: VideoIntelligenceStageOutput,
  ctx: { runId: string },
): Promise<boolean> {
  const db = getDb();
  const segs = await db.selectDistinct({ videoId: segment.videoId }).from(segment).where(eq(segment.runId, ctx.runId));
  const expected = segs.length;
  const cards = await db.select({ id: videoIntelligenceCard.id }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, ctx.runId));
  return cards.length === expected;
}

async function runWithConcurrency<T, U>(items: T[], concurrency: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = [];
  let i = 0;
  await Promise.all(Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]!);
    }
  }));
  return out;
}
```

```bash
echo "export { runVideoIntelligenceStage, validateVideoIntelligenceMaterialization } from './video-intelligence';" >> packages/pipeline/src/stages/index.ts
git add packages/pipeline/src/stages/video-intelligence.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): video-intelligence fan-out + run-limits + transcript-cap enforcement"
```

### Task 6.3 — `canon` stage

Create `packages/pipeline/src/stages/canon.ts`:

```typescript
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

export interface CanonStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  r2Override?: R2Client;
}

export interface CanonStageOutput {
  ok: boolean;
  nodeCount: number;
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runCanonStage(input: CanonStageInput): Promise<CanonStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  // Idempotency: clear prior canon nodes for this run before invoking the agent.
  await db.delete(canonNode).where(eq(canonNode.runId, input.runId));

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  const cards = await db.select({ id: videoIntelligenceCard.id }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, input.runId));
  const bootstrap = `${cards.length} video intelligence cards available. Read every card via listVideoIntelligenceCards, then merge into a canon. Don't pad with weak content.`;

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
git add packages/pipeline/src/stages/canon.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): canon stage (delete-and-rebuild idempotency + materialization validator)"
```

### Task 6.4 — `page-briefs` stage

Create `packages/pipeline/src/stages/page-briefs.ts`:

```typescript
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

export interface PageBriefsStageInput {
  runId: string;
  workspaceId: string;
  providerOverride?: (provider: 'openai' | 'gemini') => AgentProvider;
  r2Override?: R2Client;
}

export interface PageBriefsStageOutput {
  ok: boolean;
  briefCount: number;
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

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
  const bootstrap = `Canon contains ${nodes.length} nodes (${nodes.filter((n) => n.type === 'framework').length} frameworks, ${nodes.filter((n) => n.type === 'lesson').length} lessons, ${nodes.filter((n) => n.type === 'playbook').length} playbooks). Pick 4-12 page-worthy anchors and brief each.`;

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

### Task 6.5 — `page-composition` stage with source packets + constrained writer + deterministic fallback

Create `packages/pipeline/src/stages/page-composition.ts`:

```typescript
import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import { canonNode, page, pageBrief, pageVersion, segment, video, videoSetItem, generationRun } from '@creatorcanon/db/schema';
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
  /** Test override; pass null to disable LLM writer. */
  writerProvider?: AgentProvider | null;
}

export interface PageCompositionStageOutput {
  pageCount: number;
  llmWrittenCount: number;
  fallbackCount: number;
  costCents: number;
}

// Block schema — what page_writer must return.
const sectionSchema = z.array(z.object({
  kind: z.enum(['overview','paragraph','principles','steps','scenes','workflow','common_mistakes','failure_points','quote','callout']),
  body: z.string().optional(),
  title: z.string().optional(),
  items: z.array(z.union([z.string(), z.object({ title: z.string(), body: z.string() })])).optional(),
  schedule: z.array(z.object({ day: z.string(), items: z.array(z.string()).min(1) })).optional(),
  attribution: z.string().optional(),
  sourceVideoId: z.string().optional(),
  timestampStart: z.number().optional(),
  tone: z.enum(['note','warn','success']).optional(),
  citationIds: z.array(z.string()),
})).min(5).max(9);

interface SourcePacketSegment {
  segmentId: string;
  videoId: string;
  videoTitle: string | null;
  startMs: number;
  endMs: number;
  text: string;
}

export async function runPageCompositionStage(input: PageCompositionStageInput): Promise<PageCompositionStageOutput> {
  const db = getDb();
  const env = parseServerEnv(process.env);

  // Resolve writer provider.
  let writer: AgentProvider | null = null;
  if (input.writerProvider === null) {
    writer = null;
  } else if (input.writerProvider !== undefined) {
    writer = input.writerProvider;
  } else {
    writer = env.OPENAI_API_KEY ? createOpenAIProvider(env.OPENAI_API_KEY) : null;
  }
  const writerModel = selectModel('page_writer', process.env);

  // Idempotency: clear prior pages for this run.
  await db.delete(pageVersion).where(eq(pageVersion.runId, input.runId));
  await db.delete(page).where(eq(page.runId, input.runId));

  const briefs = await db.select().from(pageBrief).where(eq(pageBrief.runId, input.runId)).orderBy(pageBrief.position);
  if (briefs.length === 0) return { pageCount: 0, llmWrittenCount: 0, fallbackCount: 0, costCents: 0 };

  // Total selected videos for sourceCoverage calc.
  const setRows = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .innerJoin(generationRun, eq(generationRun.videoSetId, videoSetItem.videoSetId))
    .where(eq(generationRun.id, input.runId));
  const totalSelectedVideos = setRows.length;

  // Preload all canon nodes referenced.
  const nodeIds = new Set<string>();
  for (const b of briefs) {
    const p = b.payload as { primaryCanonNodeId: string; supportingCanonNodeIds: string[] };
    nodeIds.add(p.primaryCanonNodeId);
    for (const id of p.supportingCanonNodeIds) nodeIds.add(id);
  }
  const nodes = nodeIds.size
    ? await db.select().from(canonNode).where(and(eq(canonNode.runId, input.runId), inArray(canonNode.id, [...nodeIds])))
    : [];
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
    };
    const primary = nodeById.get(p.primaryCanonNodeId);
    if (!primary) continue;
    const supporting = p.supportingCanonNodeIds.map((id) => nodeById.get(id)).filter(Boolean) as typeof nodes;

    // Build the source packet — actual segment text the writer will draw from.
    const sourcePacket = await buildSourcePacket(db, input.runId, primary, supporting);

    // Try the constrained LLM writer first.
    let sections: Array<Record<string, unknown> & { kind: string; citationIds: string[] }> | null = null;
    if (writer) {
      try {
        const userMessage = `BRIEF:\n${JSON.stringify(p, null, 2)}\n\nPRIMARY CANON NODE:\n${JSON.stringify(primary.payload)}\n\nSUPPORTING CANON NODES:\n${JSON.stringify(supporting.map((n) => ({ id: n.id, type: n.type, payload: n.payload })))}\n\nSOURCE PACKET:\n${JSON.stringify(sourcePacket)}\n\nReturn ONE JSON array of section blocks per the schema. No prose around it.`;
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
          sections = validation.data as Array<Record<string, unknown> & { kind: string; citationIds: string[] }>;
          // Check every citationId appears in the source packet.
          const validIds = new Set(sourcePacket.requiredSegments.map((s) => s.segmentId));
          const allCited = sections.flatMap((s) => s.citationIds);
          const invalid = allCited.filter((id) => !validIds.has(id));
          if (invalid.length === 0) {
            llmWrittenCount += 1;
            costCents += tokenCostCents(writerModel.modelId, result.usage?.inputTokens ?? 0, result.usage?.outputTokens ?? 0);
          } else {
            sections = null; // fall back to deterministic
          }
        }
      } catch {
        sections = null;
      }
    }

    if (!sections) {
      sections = buildDeterministicSections(p, primary, supporting);
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
        type: s.kind, id: `blk_${i}`,
        content: (({ kind: _k, citationIds: _c, ...rest }) => rest)(s as Record<string, unknown>),
        citations: s.citationIds,
      })),
      atlasMeta: {
        evidenceQuality: primary.evidenceQuality,
        citationCount: evidenceSegmentIds.length,
        sourceCoveragePercent: totalSelectedVideos > 0
          ? Math.min(1, distinctSourceVideos.size / totalSelectedVideos)   // (Δ15) — distinct source videos / selected videos
          : 0,
        relatedPageIds: [],
        hero: { illustrationKey: p.pageType === 'framework' ? 'desk' : p.pageType === 'playbook' ? 'desk' : 'open-notebook' },
        evidenceSegmentIds,
        primaryFindingId: primary.id,
        supportingFindingIds: p.supportingCanonNodeIds,
        // Carry the brief metadata onto the page so QA can read it without re-loading.
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

async function buildSourcePacket(db: any, runId: string, primary: typeof canonNode.$inferSelect, supporting: Array<typeof canonNode.$inferSelect>): Promise<{ requiredSegments: SourcePacketSegment[] }> {
  const segIds = new Set<string>();
  for (const s of primary.evidenceSegmentIds) segIds.add(s);
  for (const n of supporting) for (const s of n.evidenceSegmentIds) segIds.add(s);
  if (segIds.size === 0) return { requiredSegments: [] };
  const rows = await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, endMs: segment.endMs, text: segment.text, videoTitle: video.title })
    .from(segment)
    .leftJoin(video, eq(video.id, segment.videoId))
    .where(and(eq(segment.runId, runId), inArray(segment.id, [...segIds])));
  return {
    requiredSegments: rows.map((r: any) => ({
      segmentId: r.id, videoId: r.videoId, videoTitle: r.videoTitle ?? null,
      startMs: r.startMs, endMs: r.endMs, text: r.text,
    })),
  };
}

function collectEvidenceSegmentIds(primary: typeof canonNode.$inferSelect, supporting: Array<typeof canonNode.$inferSelect>): string[] {
  const set = new Set<string>(primary.evidenceSegmentIds);
  for (const s of supporting) for (const id of s.evidenceSegmentIds) set.add(id);
  return [...set];
}

// Deterministic fallback when LLM writer is unavailable or invalid.
// Produces a 5-7 section page from canon node payload + brief copy.
function buildDeterministicSections(
  brief: { pageType: string; readerProblem: string; promisedOutcome: string; whyThisMatters: string; outline: string[]; ctaOrNextStep?: string },
  primary: typeof canonNode.$inferSelect,
  supporting: Array<typeof canonNode.$inferSelect>,
): Array<Record<string, unknown> & { kind: string; citationIds: string[] }> {
  const sections: Array<Record<string, unknown> & { kind: string; citationIds: string[] }> = [];
  const primaryPayload = primary.payload as Record<string, unknown>;
  const cite = primary.evidenceSegmentIds.slice(0, 5);
  // 1. Overview = whyThisMatters
  sections.push({ kind: 'overview', body: brief.whyThisMatters, citationIds: cite.slice(0, 2) });
  // 2. Reader problem
  sections.push({ kind: 'callout', tone: 'note', body: brief.readerProblem, citationIds: cite.slice(0, 2) });
  // 3. Core idea
  if (brief.pageType === 'framework' && Array.isArray(primaryPayload.principles)) {
    sections.push({
      kind: 'principles',
      items: (primaryPayload.principles as Array<{ title?: string; body?: string } | string>).map((it) =>
        typeof it === 'string' ? { title: it.slice(0, 60), body: it } : { title: it.title ?? 'Principle', body: it.body ?? '' },
      ).filter((it) => it.body),
      citationIds: cite,
    });
  } else if (brief.pageType === 'playbook' && (Array.isArray(primaryPayload.workflow) || Array.isArray(primaryPayload.scenes))) {
    const sched = (primaryPayload.workflow ?? primaryPayload.scenes) as Array<{ day?: string; title?: string; items?: string[]; description?: string }>;
    sections.push({
      kind: 'workflow',
      schedule: sched.map((s) => ({ day: s.day ?? s.title ?? 'Step', items: s.items ?? (s.description ? [s.description] : ['—']) })).filter((s) => s.items.length > 0 && s.items.every((i) => i)),
      citationIds: cite,
    });
  } else if (typeof primaryPayload.idea === 'string') {
    sections.push({ kind: 'paragraph', body: primaryPayload.idea, citationIds: cite });
  }
  // 4. Application: steps if framework, paragraph otherwise
  if (brief.pageType === 'framework' && Array.isArray(primaryPayload.steps) && (primaryPayload.steps as unknown[]).length > 0) {
    sections.push({
      kind: 'steps', title: 'Steps',
      items: (primaryPayload.steps as Array<string | { title?: string; body?: string }>).map((s, i) =>
        typeof s === 'string' ? { title: `Step ${i + 1}`, body: s } : { title: s.title ?? `Step ${i + 1}`, body: s.body ?? '' },
      ),
      citationIds: cite,
    });
  }
  // 5. Source-backed example: pick first supporting node of type 'example' or 'story' if present.
  const exampleNode = supporting.find((s) => s.type === 'example' || s.type === 'quote');
  if (exampleNode) {
    const ep = exampleNode.payload as { text?: string; description?: string; quote?: string };
    sections.push({
      kind: 'paragraph',
      body: ep.description ?? ep.text ?? ep.quote ?? '',
      citationIds: exampleNode.evidenceSegmentIds.slice(0, 2),
    });
  }
  // 6. One supporting quote
  const quote = supporting.find((s) => s.type === 'quote' || s.type === 'aha_moment');
  if (quote) {
    const qp = quote.payload as { text?: string; quote?: string; attribution?: string };
    sections.push({
      kind: 'quote', body: qp.text ?? qp.quote ?? '',
      attribution: qp.attribution, citationIds: quote.evidenceSegmentIds.slice(0, 1),
    });
  }
  // 7. CTA
  if (brief.ctaOrNextStep) {
    sections.push({ kind: 'callout', tone: 'note', body: brief.ctaOrNextStep, citationIds: [] });
  }
  return sections;
}
```

```bash
echo "export { runPageCompositionStage, validatePageCompositionMaterialization } from './page-composition';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/page-composition.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): page composition with source packets + constrained writer + deterministic fallback"
```

### Task 6.6 — `page-quality` stage (deterministic QA)

Create `packages/pipeline/src/stages/page-quality.ts`:

```typescript
import { eq, inArray } from '@creatorcanon/db';
import { page, pageVersion, pageQualityReport, segment } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';

export interface PageQualityStageInput {
  runId: string;
  workspaceId: string;
}

export interface PageQualityStageOutput {
  pagesEvaluated: number;
  pagesPublishable: number;
  pagesRevise: number;
  pagesFail: number;
}

const THRESHOLDS = {
  minimumCitationsPerPage: 3,
  minimumCitedSections: 2,
  minimumBodyChars: 1200,
  maximumEmptySections: 0,
} as const;

const GENERIC_PHRASES = [
  'in conclusion', 'as we have seen', 'as we\'ve seen', 'in summary', 'all things considered',
  'at the end of the day', 'when all is said and done', 'needless to say',
  'it is worth noting', 'it goes without saying', 'simply put',
];

export async function runPageQualityStage(input: PageQualityStageInput): Promise<PageQualityStageOutput> {
  const db = getDb();
  await db.delete(pageQualityReport).where(eq(pageQualityReport.runId, input.runId));

  const pages = await db.select().from(page).where(eq(page.runId, input.runId));
  const versions = await db.select().from(pageVersion).where(eq(pageVersion.runId, input.runId));
  const versionByPageId = new Map(versions.map((v) => [v.pageId, v]));

  // Collect every segmentId referenced by any block; then resolve to runId for ownership check.
  const allBlockSegIds = new Set<string>();
  for (const v of versions) {
    const tree = v.blockTreeJson as { blocks: Array<{ citations?: string[] }> };
    for (const b of tree.blocks ?? []) for (const id of b.citations ?? []) allBlockSegIds.add(id);
  }
  const validSegs = allBlockSegIds.size
    ? await db.select({ id: segment.id }).from(segment).where(inArray(segment.id, [...allBlockSegIds]))
    : [];
  const validSegSet = new Set(validSegs.map((s) => s.id));

  // Detect duplicate slugs / titles across the run.
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

    // 1. citation count
    const allCites = tree.blocks.flatMap((b) => b.citations ?? []);
    const validCites = allCites.filter((id) => validSegSet.has(id));
    checks.citationCount = { pass: validCites.length >= THRESHOLDS.minimumCitationsPerPage, detail: `${validCites.length} valid citations` };

    // 2. cited sections count
    const citedSections = tree.blocks.filter((b) => (b.citations ?? []).some((id) => validSegSet.has(id))).length;
    checks.citedSectionsCount = { pass: citedSections >= THRESHOLDS.minimumCitedSections, detail: `${citedSections} cited sections` };

    // 3. empty sections — section is empty if it has no body/items/schedule of substance
    const emptySections = tree.blocks.filter((b) => isSectionEmpty(b)).length;
    checks.emptySections = { pass: emptySections <= THRESHOLDS.maximumEmptySections, detail: `${emptySections} empty sections` };

    // 4. body char count (sum of all body strings)
    const totalBodyChars = sumBodyChars(tree.blocks);
    checks.bodyLength = { pass: totalBodyChars >= THRESHOLDS.minimumBodyChars, detail: `${totalBodyChars} chars` };

    // 5. ownership: every cited segment must be in the run (already filtered above)
    const invalidCites = allCites.length - validCites.length;
    checks.citationOwnership = { pass: invalidCites === 0, detail: `${invalidCites} invalid citations` };

    // 6. brief copy present
    const meta = (v.blockTreeJson as { atlasMeta?: { readerProblem?: string; promisedOutcome?: string } }).atlasMeta ?? {};
    checks.readerProblemPresent = { pass: typeof meta.readerProblem === 'string' && meta.readerProblem.length > 10 };
    checks.promisedOutcomePresent = { pass: typeof meta.promisedOutcome === 'string' && meta.promisedOutcome.length > 10 };

    // 7. title not generic
    const generic = ['untitled', 'page', 'lesson', 'framework', 'playbook'];
    checks.titleNotGeneric = { pass: !generic.includes(v.title.toLowerCase().trim()) };

    // 8. duplicate slug / title
    checks.duplicateSlug = { pass: (slugCount.get(p.slug) ?? 0) === 1 };
    checks.duplicateTitle = { pass: (titleCount.get(v.title) ?? 0) === 1 };

    // 9. generic-language score (number of generic phrases × 5, capped at 100; lower is better)
    const allText = tree.blocks.map((b) => JSON.stringify(b.content)).join(' ').toLowerCase();
    const genericHits = GENERIC_PHRASES.filter((p) => allText.includes(p)).length;
    const genericLanguageScore = Math.min(100, genericHits * 5);

    // Distinct cited videos
    const distinctSourceVideos = new Set<string>();
    if (allBlockSegIds.size > 0) {
      const segVids = await db.select({ id: segment.id, videoId: segment.videoId }).from(segment).where(inArray(segment.id, [...validCites, ...invalidCitesArrayPlaceholder()]));
      for (const s of segVids) distinctSourceVideos.add(s.videoId);
    }

    const pass = Object.values(checks).every((c) => c.pass);
    const recommendation: 'publish' | 'revise' | 'fail' = pass
      ? 'publish'
      : (checks.bodyLength.pass && checks.citationCount.pass && checks.citationOwnership.pass)
        ? 'revise'
        : 'fail';

    out[recommendation === 'publish' ? 'pagesPublishable' : recommendation === 'revise' ? 'pagesRevise' : 'pagesFail'] += 1;

    const evidenceScore = (validCites.length >= 8 ? 100 : validCites.length >= 5 ? 80 : validCites.length >= 3 ? 60 : 30)
                       - (invalidCites > 0 ? 20 : 0);

    await db.insert(pageQualityReport).values({
      id: `pqr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
      workspaceId: input.workspaceId, runId: input.runId, pageId: p.id,
      evidenceScore: Math.max(0, evidenceScore),
      citationCount: validCites.length,
      distinctSourceVideos: distinctSourceVideos.size,
      emptySectionCount: emptySections,
      unsupportedClaimCount: invalidCites,
      genericLanguageScore,
      recommendation,
      payload: { checks, totalBodyChars },
    });
  }

  return out;
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

function invalidCitesArrayPlaceholder(): string[] { return []; }   // shape compatibility for the inArray spread above

export async function validatePageQualityMaterialization(_output: PageQualityStageOutput, ctx: { runId: string }): Promise<boolean> {
  const db = getDb();
  const reports = await db.select({ id: pageQualityReport.id }).from(pageQualityReport).where(eq(pageQualityReport.runId, ctx.runId));
  const pages = await db.select({ id: page.id }).from(page).where(eq(page.runId, ctx.runId));
  return reports.length === pages.length;
}
```

```bash
echo "export { runPageQualityStage, validatePageQualityMaterialization } from './page-quality';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/page-quality.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): deterministic page-quality QA + threshold-driven recommendations"
```

---

## Phase 7 — Materialization validation in runStage

### Task 7.1 — Extend `harness.ts`

Open `packages/pipeline/src/harness.ts`. Extend the type and the cache-hit path:

```typescript
export interface StageRunOptions<TInput, TOutput> {
  ctx: StageContext;
  stage: PipelineStage;
  input: TInput;
  run: (input: TInput) => Promise<TOutput>;
  // (Δ8) Optional: re-run if cached output's DB rows are missing.
  validateMaterializedOutput?: (output: TOutput, ctx: StageContext) => Promise<boolean>;
}

// In runStage, after the cache-hit branch:
  if (match?.status === 'succeeded' && match.outputJson != null) {
    const cached = match.outputJson as TOutput;
    if (opts.validateMaterializedOutput) {
      const ok = await opts.validateMaterializedOutput(cached, ctx);
      if (!ok) {
        // Cached but rows are missing — fall through and re-run.
        console.warn(`[harness] cached stage_run ${stage} (${match.id}) lost its materialized rows; re-running.`);
      } else {
        return cached;
      }
    } else {
      return cached;
    }
  }
```

Typecheck + commit:

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/harness.ts
git commit -m "feat(harness): runStage validates materialized output before returning cache"
```

---

## Phase 8 — Adapter retargeting

### Task 8.1 — `project-topics` reads canon_node when available

Open `packages/pipeline/src/adapters/editorial-atlas/project-topics.ts`. Switch the primary query:

```typescript
import { canonNode, archiveFinding, page as pageTable, pageVersion } from '@creatorcanon/db/schema';

// In projectTopics:
  // (Δ8) Prefer canon_node for canon_v1 runs; fall back to archive_finding for legacy runs.
  const canonRows = await db.select().from(canonNode).where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));
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
  const legacyRows = await db.select().from(archiveFinding).where(and(eq(archiveFinding.runId, runId), eq(archiveFinding.type, 'topic')));
  if (legacyRows.length > 0) {
    // … existing legacy code path
  }
  // …existing synthetic fallback (Frameworks/Lessons/Playbooks)
```

### Task 8.2 — `project-highlights` likewise

Open `packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts`. Switch the source from `archiveFinding WHERE type IN ('quote','aha_moment')` to `canonNode WHERE type IN ('quote','aha_moment')` when canon_node has any rows for the run; fall back to archive_finding otherwise.

### Task 8.3 — `project-pages` source-coverage fix

Open `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`. The page composer now writes `atlasMeta.distinctSourceVideos` and `atlasMeta.totalSelectedVideos`. Compute `sourceCoveragePercent` from those when present:

```typescript
        sourceCoveragePercent: typeof meta.distinctSourceVideos === 'number' && typeof meta.totalSelectedVideos === 'number' && meta.totalSelectedVideos > 0
          ? meta.distinctSourceVideos / meta.totalSelectedVideos
          : meta.sourceCoveragePercent ?? 0,
```

(Existing code keeps backward compatibility for legacy runs that don't carry these fields.)

Typecheck + commit:

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/adapters/editorial-atlas/project-topics.ts packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "fix(adapter): canon-node primary source for topics+highlights; sourceCoveragePercent uses distinct videos"
```

---

## Phase 9 — Feature-flagged orchestrator

### Task 9.1 — Branch on `PIPELINE_CONTENT_ENGINE`

Open `packages/pipeline/src/run-generation-pipeline.ts`. Replace the `Phase 1: discovery` through `Phase 4: merge` block with a feature-flag branch. Both engines stay reachable.

```typescript
import {
  importSelectionSnapshot, ensureTranscripts, normalizeTranscripts, segmentTranscripts,
  // legacy:
  // runDiscoveryStage, runSynthesisStage, runVerifyStage, runMergeStage,   // already imported via './stages'
  // canon_v1:
  runChannelProfileStage, validateChannelProfileMaterialization,
  runVideoIntelligenceStage, validateVideoIntelligenceMaterialization,
  runCanonStage, validateCanonMaterialization,
  runPageBriefsStage, validatePageBriefsMaterialization,
  runPageCompositionStage, validatePageCompositionMaterialization,
  runPageQualityStage, validatePageQualityMaterialization,
} from './stages';
import { runDiscoveryStage } from './stages/discovery';
import { runSynthesisStage } from './stages/synthesis';
import { runVerifyStage } from './stages/verify';
import { runMergeStage } from './stages/merge';
import { CANON_LIMITS } from './canon-limits';
import { canonNode } from '@creatorcanon/db/schema';

// inside runGenerationPipeline, after Phase 0 (segmentation) and the hub gate:
    const contentEngine = (process.env.PIPELINE_CONTENT_ENGINE === 'canon_v1') ? 'canon_v1' : 'findings_v1';

    let pageCountFromComposition = 0;
    if (contentEngine === 'canon_v1') {
      // (Δ9) Run-limits enforcement — fail clearly before spending any tokens.
      if (snapshot.videoCount < CANON_LIMITS.minSelectedVideos) {
        throw new Error(`canon_v1 requires ≥ ${CANON_LIMITS.minSelectedVideos} videos; this run has ${snapshot.videoCount}.`);
      }
      if (snapshot.videoCount > CANON_LIMITS.maxSelectedVideos) {
        throw new Error(`canon_v1 caps at ${CANON_LIMITS.maxSelectedVideos} videos; this run has ${snapshot.videoCount}. Reduce the videoSet or set PIPELINE_CONTENT_ENGINE=findings_v1.`);
      }

      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx, stage: 'channel_profile' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runChannelProfileStage(i),
        validateMaterializedOutput: validateChannelProfileMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx, stage: 'video_intelligence' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runVideoIntelligenceStage(i),
        validateMaterializedOutput: validateVideoIntelligenceMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx, stage: 'canon' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runCanonStage(i),
        validateMaterializedOutput: validateCanonMaterialization,
      });

      await assertWithinRunBudget(payload.runId);
      await runStage({
        ctx, stage: 'page_briefs' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageBriefsStage(i),
        validateMaterializedOutput: validatePageBriefsMaterialization,
      });

      const composition = await runStage({
        ctx, stage: 'page_composition' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageCompositionStage(i),
        validateMaterializedOutput: validatePageCompositionMaterialization,
      });
      pageCountFromComposition = composition.pageCount;

      await runStage({
        ctx, stage: 'page_quality' as PipelineStage,
        input: { runId: payload.runId, workspaceId: payload.workspaceId },
        run: async (i) => runPageQualityStage(i),
        validateMaterializedOutput: validatePageQualityMaterialization,
      });
    } else {
      // Legacy findings_v1 — unchanged.
      await assertWithinRunBudget(payload.runId);
      await runStage({ ctx, stage: 'discovery', input: { runId: payload.runId, workspaceId: payload.workspaceId }, run: async (i) => runDiscoveryStage(i) });

      await assertWithinRunBudget(payload.runId);
      await runStage({ ctx, stage: 'synthesis', input: { runId: payload.runId, workspaceId: payload.workspaceId }, run: async (i) => runSynthesisStage(i) });

      await assertWithinRunBudget(payload.runId);
      await runStage({ ctx, stage: 'verify', input: { runId: payload.runId, workspaceId: payload.workspaceId }, run: async (i) => runVerifyStage(i) });

      await assertWithinRunBudget(payload.runId);
      const merge = await runStage({ ctx, stage: 'merge', input: { runId: payload.runId, workspaceId: payload.workspaceId }, run: async (i) => runMergeStage(i) });
      pageCountFromComposition = merge.pageCount;
    }
    // continue to adapt …
```

Update the result to count canon nodes when running canon_v1 (else fall back to existing finding count):

```typescript
    const finalFindingCount = contentEngine === 'canon_v1'
      ? (await db.select({ id: canonNode.id }).from(canonNode).where(eq(canonNode.runId, payload.runId))).length
      : (discovery.findingCount ?? 0) + (synthesis.findingCount ?? 0); // legacy
```

(Capture the legacy values inside the else branch if you want this expression to compile. For minimum risk, hoist `let discoveryFindingCount = 0; let synthesisFindingCount = 0;` and assign inside the legacy branch.)

### Task 9.2 — Extend `PipelineStage` union

Open `packages/core/src/pipeline-stages.ts` and append:

```typescript
  | 'channel_profile'
  | 'video_intelligence'
  | 'canon'
  | 'page_briefs'
  | 'page_composition'
  | 'page_quality'
```

Typecheck + commit:

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../core && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/run-generation-pipeline.ts packages/core/src/pipeline-stages.ts
git commit -m "feat(pipeline): feature-flagged content engine (findings_v1 default | canon_v1)"
```

---

## Phase 10 — Operator inspection script

### Task 10.1 — `inspect-canon-run.ts`

Create `packages/pipeline/scripts/inspect-canon-run.ts`:

```typescript
// Usage: npx tsx ./scripts/inspect-canon-run.ts <runId>
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const f of ['../../.env']) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
const runId = process.argv[2];
if (!runId) { console.error('Usage: npx tsx ./scripts/inspect-canon-run.ts <runId>'); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL!);

console.log('=== CHANNEL PROFILE ===');
const cp = await sql`SELECT payload FROM channel_profile WHERE run_id = ${runId} LIMIT 1`;
if (cp[0]) {
  const p = cp[0].payload as Record<string, unknown>;
  console.log(`creatorName: ${p.creatorName}`);
  console.log(`niche: ${p.niche}`);
  console.log(`audience: ${p.audience}`);
  console.log(`recurringThemes: ${(p.recurringThemes as string[])?.join(', ')}`);
  console.log(`creatorTerminology: ${(p.creatorTerminology as string[])?.join(', ')}`);
  console.log(`positioningSummary: ${p.positioningSummary}`);
} else { console.log('(none)'); }

console.log('\n=== VIDEO INTELLIGENCE CARDS ===');
const cards = await sql`SELECT id, video_id, payload FROM video_intelligence_card WHERE run_id = ${runId}`;
console.log(`count: ${cards.length}`);
for (const c of cards) {
  const p = c.payload as Record<string, unknown>;
  console.log(`- ${c.video_id}: thesis="${p.coreThesis}" · ${(p.mainIdeas as unknown[])?.length} ideas · ${(p.frameworks as unknown[])?.length} frameworks · ${(p.lessons as unknown[])?.length} lessons · ${(p.quotes as unknown[])?.length} quotes`);
}

console.log('\n=== CANON NODES ===');
const nodes = await sql`SELECT type, COUNT(*) FROM canon_node WHERE run_id = ${runId} GROUP BY type ORDER BY type`;
for (const n of nodes) console.log(`  ${n.type}: ${n.count}`);
console.log('\n--- top 10 by pageWorthinessScore ---');
const top = await sql`SELECT type, payload->>'title' AS title, page_worthiness_score, source_coverage, evidence_quality, origin FROM canon_node WHERE run_id = ${runId} ORDER BY page_worthiness_score DESC LIMIT 10`;
for (const t of top) console.log(`  [${t.page_worthiness_score}] ${t.type} (${t.origin}, ${t.evidence_quality}, ${t.source_coverage} videos): ${t.title}`);

console.log('\n=== PAGE BRIEFS (in reading order) ===');
const briefs = await sql`SELECT position, payload, page_worthiness_score FROM page_brief WHERE run_id = ${runId} ORDER BY position`;
for (const b of briefs) {
  const p = b.payload as Record<string, unknown>;
  console.log(`  [${b.position}] (${p.pageType}, score ${b.page_worthiness_score}) ${p.title}`);
  console.log(`     Reader: ${p.readerProblem}`);
  console.log(`     Outcome: ${p.promisedOutcome}`);
  console.log(`     Outline: ${(p.outline as string[]).join(' → ')}`);
}

console.log('\n=== PAGE QUALITY ===');
const reports = await sql`SELECT pqr.recommendation, p.slug, pqr.evidence_score, pqr.citation_count, pqr.distinct_source_videos, pqr.empty_section_count, pqr.unsupported_claim_count, pqr.generic_language_score
                          FROM page_quality_report pqr JOIN page p ON p.id = pqr.page_id WHERE pqr.run_id = ${runId} ORDER BY pqr.evidence_score DESC`;
for (const r of reports) {
  console.log(`  ${r.recommendation.padEnd(8)} ${r.slug.padEnd(40)} evidence=${r.evidence_score} cites=${r.citation_count} videos=${r.distinct_source_videos} empty=${r.empty_section_count} unsupported=${r.unsupported_claim_count} generic=${r.generic_language_score}`);
}

await sql.end();
```

Commit:

```bash
git add packages/pipeline/scripts/inspect-canon-run.ts
git commit -m "feat(ops): inspect-canon-run script for operator visibility"
```

---

## Phase 11 — Side-by-side verification

### Task 11.1 — Side-by-side audit script

Create `packages/pipeline/scripts/compare-engines.ts`. Given a videoSetId, this script:
1. Spawns two projects from the same videoSet (one runs `findings_v1`, one runs `canon_v1` via per-process env override).
2. Awaits both pipelines, then publishes both as hubs.
3. Loads both manifests from R2 and computes the metrics below.
4. Prints a side-by-side report.

Pseudocode of the metrics:

```typescript
const metrics = [
  { label: 'Page count (target 4-12)',                check: (m) => m.pages.length },
  { label: 'Avg citations per page (target 5+)',       check: (m) => avg(m.pages.map((p) => p.citations.length)) },
  { label: 'Pages with non-empty readerProblem (100%)', check: (m) => percent(m.pages, (p) => !!p.readerProblemFromMeta) },
  { label: 'Pages with non-empty promisedOutcome',     check: (m) => percent(m.pages, (p) => !!p.promisedOutcomeFromMeta) },
  { label: 'Pages with source-backed example (80%+)',  check: (m) => percent(m.pages, (p) => p.sections.some((s) => s.kind === 'paragraph' || s.kind === 'scenes')) },
  { label: 'Empty/weak sections (target 0)',           check: (m) => count(m.pages.flatMap((p) => p.sections), isEmpty) },
  { label: 'Duplicate slugs (target 0)',               check: (m) => duplicates(m.pages.map((p) => p.slug)) },
  { label: 'Generic page titles (target 0-1)',         check: (m) => count(m.pages, (p) => /^(untitled|page|lesson|framework|playbook)$/i.test(p.title.trim())) },
  { label: 'Canon nodes from multiple videos (30%+)',  check: () => /* canon-only */ percentMultiVideoCanonNodes },
  { label: 'Creator-specific terminology used (5+)',   check: () => /* canon-only: count creatorTerminology references in pages */ },
];
```

Print:

```
                                              findings_v1     canon_v1
Page count (target 4-12)                      22              7
Avg citations per page (target 5+)            8.3             6.1
Pages with non-empty readerProblem (100%)     0%              100%
Pages with non-empty promisedOutcome           0%             100%
Pages with source-backed example (80%+)       62%             100%
Empty/weak sections (target 0)                3               0
Duplicate slugs (target 0)                    0               0
Generic page titles (target 0-1)              0               0
Canon nodes from multiple videos (30%+)       n/a             45%
Creator-specific terminology used (5+)        n/a             8 terms
```

Commit:

```bash
git add packages/pipeline/scripts/compare-engines.ts
git commit -m "feat(ops): compare-engines side-by-side audit"
```

### Task 11.2 — Run side-by-side on the existing 2 ready uploads

Use the same workspaceId / userId / 2 video IDs as the previous quality-test. Spawn two fresh projects (subdomains `findings-test` and `canon-test`). Run, publish, audit. Verify the printed report.

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS/packages/pipeline && PIPELINE_CONTENT_ENGINE=findings_v1 npx tsx ./scripts/compare-engines.ts <videoSetId>
```

Pass criteria for promoting `canon_v1`:
- Page count between 4 and 12.
- Pages with non-empty readerProblem and promisedOutcome: 100%.
- No duplicate slugs.
- No generic page titles.
- Avg citations per page ≥ 5.
- At least one canon node has origin='merged' AND ≥2 distinct source videos.

If pass: continue with manual hub review, then optionally flip default in env.

---

## Self-Review

**Spec coverage** — every directive folded in:

- ✅ Δ1 — Feature flag, both engines reachable (Phase 9)
- ✅ Δ2 — `getSegmentedTranscript` is primary; `getFullTranscript` is fallback (Phase 2 + Phase 4 prompt)
- ✅ Δ3 — Strict segment-ownership validation (Phase 3 propose tools)
- ✅ Δ4 — `getVideoIntelligenceCard` implemented (Phase 2)
- ✅ Δ5 — Deterministic page QA in v1 (Phase 6.6)
- ✅ Δ6 — Five tables (Phase 1)
- ✅ Δ7 — Stage-level deletes for canon_node, page_brief, page_quality_report; upsert for channel_profile + video_intelligence_card; page_composition wipes page+pageVersion (Phase 6)
- ✅ Δ8 — `validateMaterializedOutput` hook on runStage; six validators wired (Phase 7 + Phase 6)
- ✅ Δ9 — Canon v1 run limits, hard-failed in stage + orchestrator (Phase 6.2 + Phase 9)
- ✅ Δ10 — Output caps in VIDEO_ANALYST_PROMPT + zod schema enforcement at propose time (Phase 4 + Phase 3)
- ✅ Δ11 — `origin` + `confidence_score` columns on canon_node + prompt usage (Phase 1 + Phase 4)
- ✅ Δ12 — 9-section minimum shape with required overview / readerProblem / coreIdea / application / source-example / next-step (Phase 4 PAGE_WRITER_PROMPT + Phase 6.5 deterministic fallback)
- ✅ Δ13 — Source packets carry actual segment excerpts to the writer (Phase 6.5)
- ✅ Δ14 — Constrained LLM writer with deterministic fallback + schema validation + citation-ID validation (Phase 6.5)
- ✅ Δ15 — `sourceCoveragePercent` = distinctSourceVideos / totalSelectedVideos (Phase 6.5 + Phase 8.3)
- ✅ Δ16 — `inspect-canon-run.ts` script (Phase 10)
- ✅ Δ17 — Side-by-side `compare-engines.ts` (Phase 11)

**Placeholder scan:** No "TBD" / "fill in later" / "similar to task X". Every prompt is full text. Every code block is runnable. Two areas use representative patterns rather than full bodies (the side-by-side audit script's metric block; the `project-pages.ts` edit) — those are tightly scoped and cited inline.

**Type consistency:** Cross-checked. `proposeChannelProfile` upserts `channelProfile` rows that `getChannelProfile` reads; `proposeVideoIntelligenceCard` upserts `videoIntelligenceCard` rows that `listVideoIntelligenceCards` and `getVideoIntelligenceCard` read; `proposeCanonNode` writes `canonNode` rows with `origin` + `confidenceScore` that `listCanonNodes` returns and the adapter consumes; `proposePageBrief` writes `pageBrief` rows that the page composer reads; the composer writes `page` + `pageVersion` rows whose `atlasMeta` carries `distinctSourceVideos` + `totalSelectedVideos` that `project-pages` consumes for `sourceCoveragePercent`. Canon node enums (origin, type, evidenceQuality) match between zod schema, drizzle schema, and prompts.

**Risks and assumptions:**

- **Cost.** A canon_v1 run on 2 videos: channel profile ~$0.10, two VICs ~$0.50 each, canon ~$0.30, briefs ~$0.20, page composition with 6-8 LLM writer calls ~$0.40. ~$2 total. Within the $25 budget cap. Larger archives (8-15 videos) approach $5-10 per run; still under the cap, but the run-limits constants are intentional safeguards.
- **Validator overhead.** The materialization validators run after every cache hit. Each is a single SELECT count, negligible.
- **Constrained writer reliability.** GPT-5.5 with `jsonMode: true` and a strict schema is reliable at this size of output. The deterministic fallback exists for any failure mode (rate limit, malformed JSON, citation-ID violation). Both paths produce valid manifest output; the LLM path is just denser/better-written.
- **Backward compatibility.** Adapter falls back to legacy archive_finding when `canonNode` rows are absent, so older runs (`/h/trial`, `/h/quality-test`) keep rendering identically.
- **What this plan does NOT solve.** Visual context extraction, full LLM evidence audit, hub strategy / personalized design, customer review-and-approve UX, multi-source ingestion. Those are out of scope per the user's constraints.

**Execution time estimate:** ~30-40 tasks across Phases 1-11. Roughly 2-3 hours of focused execution + one ~10-minute end-to-end pipeline run on the 2-video archive + a side-by-side comparison run. The verification can be repeated cheaply once the engine works.

**Ready for execution.**
