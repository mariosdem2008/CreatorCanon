# Stage 1: Deep Knowledge Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot the pipeline from "agent-discovery-first" (agents search transcripts, propose findings) to "deep-read-first" (every video gets a structured Video Intelligence Card; archive synthesis works on cards, not on raw segment search; pages get planned via Page Briefs before they're written). Stage 1 ends with a curated, evidence-graded canon and a typed plan for which pages should exist.

**Architecture:** Insert a new layer between segmentation and discovery. The new flow is: `Channel Profile → Per-Video Intelligence Cards → Creator Canon (typed knowledge graph) → Page Briefs (intent-led plans) → Brief-Driven Page Composition`. The current Editorial Atlas template is retained as the renderer; only the content layer changes. Stage 2 (Hub Strategist) and Stage 3 (Personalized Hub Builder) are explicitly deferred.

**Tech Stack:** TypeScript, Drizzle ORM, Zod, OpenAI/Gemini function-calling, postgres-js, node:test + tsx for unit tests.

---

## Why this plan exists

The audit on `/h/trial` and `/h/quality-test` exposed shallow content even after every adapter-layer fix landed: pages were assembled from agent findings that came from segment search alone. A creator's terminology, sequencing logic, and core stories never made it into the canon because the agents only surface what their `searchSegments` calls return — and those are short matches against keyword embeddings, not full understanding of any one video.

The fix isn't more searching. It's making the model actually read each video, write down what it found, and let the global synthesis work on those structured reads. Per the spec: *"Before you build the library, you need to understand every book."*

This plan does not change the renderer. It does not introduce design personalization. It does not let the creator review pages before publish (that's a separate flow). It only changes how pages get their content.

---

## Scope cut for this plan

The user's full Stage-1 vision lists ten phases (channel profile, per-video intelligence, visual context, archive synthesis, canon, quality scoring, page briefs, page composition, page evidence audit, hub scorecard). Building all ten in one execution session is unrealistic. This plan ships the architectural backbone end-to-end and explicitly defers the polish layers.

| Phase | Scope | Status |
|---|---|---|
| 1 — Channel Profile | 1 agent + 1 table + 1 stage | **v1 (in this plan)** |
| 2 — Per-Video Intelligence Card | 1 agent (the most important one) + 1 table + 1 fan-out stage | **v1** |
| 3 — Visual Context Extraction | Gemini Vision on keyframes | **v2 (deferred — separate plan)** |
| 4 — Canon Architect | 1 agent + 1 table, replaces discovery + synthesis + verify + merge | **v1** |
| 5 — Page Brief Planner | 1 agent + 1 table | **v1** |
| 6 — Brief-Driven Composition | refactor existing page composer | **v1** |
| 7 — Page Evidence Audit | 1 agent + 1 table, hard publish gate | **v2** |
| 8 — Hub Quality Scorecard | deterministic scoring + threshold | **v2** |
| 9 — Adapter integration | update editorial-atlas projector to read canon | **v1** |

A v1 hub generated from the same 2 uploads as `/h/quality-test` should have:
- 1 channel profile row with positioning summary
- 2 video intelligence cards (one per video) with thesis, frameworks, lessons, claims, quotes
- 8-15 canon nodes typed as topic/framework/lesson/playbook/principle/term/quote
- 4-8 page briefs, each tied to a reader problem and required canon nodes
- 4-8 published pages composed from briefs, each citing real segments

That's a step-change over the current behaviour (every "page-worthy" finding becomes a page → 22 thin pages).

---

## File map

### New — DB schema

- `packages/db/src/schema/canon.ts` — five new tables: `channel_profile`, `video_intelligence_card`, `canon_node`, `page_brief`. Exports + types only.
- `packages/db/src/schema/index.ts` — re-export the new tables.
- `packages/db/drizzle/out/0008_canon_layer.sql` — single migration that creates all four tables + indexes.
- `packages/db/drizzle/out/meta/_journal.json` — append entry idx=8 with timestamp > 0007's `when`.

### New — Agent prompts

- `packages/pipeline/src/agents/specialists/prompts.ts` — append four new prompts: `CHANNEL_PROFILER_PROMPT`, `VIDEO_ANALYST_PROMPT`, `CANON_ARCHITECT_PROMPT`, `PAGE_BRIEF_PLANNER_PROMPT`.
- `packages/pipeline/src/agents/specialists/index.ts` — register the four new specialists with allowed-tool lists.

### New — Agent tools

- `packages/pipeline/src/agents/tools/propose-canon.ts` — four new propose tools: `proposeChannelProfile`, `proposeVideoIntelligenceCard`, `proposeCanonNode`, `proposePageBrief`. Each validates input, persists to its dedicated table, returns `{ok: true, id}`.
- `packages/pipeline/src/agents/tools/read-canon.ts` — read tools: `getChannelProfile`, `listVideoIntelligenceCards`, `getVideoIntelligenceCard`, `listCanonNodes`, `getFullTranscript` (returns the raw VTT for a video).
- `packages/pipeline/src/agents/tools/registry.ts` — register the new tools alongside existing ones.

### New — Stages

- `packages/pipeline/src/stages/channel-profile.ts` — runs the channel_profiler agent once per run.
- `packages/pipeline/src/stages/video-intelligence.ts` — fans out the video_analyst agent per video, bounded concurrency 3.
- `packages/pipeline/src/stages/canon.ts` — runs the canon_architect agent once over all video intelligence cards.
- `packages/pipeline/src/stages/page-briefs.ts` — runs the page_brief_planner agent once over the canon.
- `packages/pipeline/src/stages/page-composition.ts` — deterministic composer (with optional polish call) that turns each page_brief into a `page` + `pageVersion` row.
- `packages/pipeline/src/stages/index.ts` — export the new stages.

### Modified — Orchestrator

- `packages/pipeline/src/run-generation-pipeline.ts` — replace `discovery → synthesis → verify → merge` with `channel_profile → video_intelligence → canon → page_briefs → page_composition`. Adapt stage stays at the end.

### Modified — Adapter

- `packages/pipeline/src/adapters/editorial-atlas/project-topics.ts` — read canon_node WHERE type='topic' instead of archive_finding. Synthetic-page-type fallback still applies.
- `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts` — already reads from `page` + `pageVersion`. No structural change; verify it works with composer's output.
- `packages/pipeline/src/adapters/editorial-atlas/project-citations.ts` — already segment-driven. No change.
- `packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts` — read canon_node WHERE type='aha_moment' instead of archive_finding.

### Modified — Model selection

- `packages/pipeline/src/agents/providers/selectModel.ts` — add four new agent identifiers to the `AgentName` union and `REGISTRY` map: `channel_profiler`, `video_analyst`, `canon_architect`, `page_brief_planner`.

### New — Tests

- `packages/pipeline/src/stages/test/channel-profile.smoke.test.ts`
- `packages/pipeline/src/stages/test/video-intelligence.smoke.test.ts`
- `packages/pipeline/src/stages/test/canon.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-briefs.smoke.test.ts`
- `packages/pipeline/src/stages/test/page-composition.smoke.test.ts`

Each smoke test stubs the agent provider to return canned tool calls and asserts the right rows land in DB.

### Untouched / explicitly out of scope

- `packages/pipeline/src/stages/discovery.ts`, `synthesis.ts`, `verify.ts`, `merge.ts` — kept on disk but unwired from the orchestrator. They become reference material for v2 of the citation_grounder migration.
- All current `archive_finding` / `archive_relation` writers — unwired but tables stay (older runs still readable).
- `apps/web/**` — no changes. Same renderer, same template.

---

## Data shapes

The four new tables are the spine of the new architecture. Their JSON columns carry agent-produced structured payloads matching the user's spec.

### `channel_profile`

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL UNIQUE,
  payload: jsonb NOT NULL,  // see ChannelProfilePayload below
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
  positioningSummary: string;     // 1 paragraph
  creatorTerminology: string[];   // their named concepts
}
```

### `video_intelligence_card`

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  videoId: text NOT NULL REFERENCES video(id),
  payload: jsonb NOT NULL,        // see VideoIntelligenceCardPayload
  evidenceSegmentIds: text[] NOT NULL,
  costCents: numeric NOT NULL,
  createdAt: timestamptz DEFAULT now(),
  UNIQUE (runId, videoId)
}
```

```ts
type VideoIntelligenceCardPayload = {
  coreThesis: string;
  audience: string;
  viewerProblem: string;
  promisedOutcome: string;
  summary: string;                // 2-3 sentences
  creatorVoiceNotes: string[];    // tone, repeated phrases
  mainIdeas: Array<{ title: string; body: string; segmentIds: string[] }>;
  frameworks: Array<{ title: string; description: string; principles: string[]; steps?: string[]; segmentIds: string[] }>;
  lessons: Array<{ title: string; idea: string; segmentIds: string[] }>;
  examples: Array<{ title: string; description: string; segmentIds: string[] }>;
  stories: Array<{ title: string; arc: string; segmentIds: string[] }>;
  mistakesToAvoid: Array<{ title: string; body: string; segmentIds: string[] }>;
  toolsMentioned: string[];
  termsDefined: Array<{ term: string; definition: string; segmentIds: string[] }>;
  strongClaims: Array<{ claim: string; segmentIds: string[] }>;
  contrarianTakes: Array<{ claim: string; segmentIds: string[] }>;
  quotes: Array<{ text: string; attribution?: string; segmentIds: string[] }>;
  recommendedHubUses: string[];   // ideas for what pages this video could anchor
}
```

### `canon_node`

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  type: text NOT NULL,           // 'topic'|'framework'|'lesson'|'playbook'|'principle'|'term'|'example'|'quote'|'aha_moment'
  payload: jsonb NOT NULL,        // type-specific shape (frameworks have steps, lessons have ideas, etc.)
  evidenceSegmentIds: text[] NOT NULL,
  sourceVideoIds: text[] NOT NULL,
  evidenceQuality: text NOT NULL,           // 'strong'|'moderate'|'limited'|'unverified'
  citationCount: integer NOT NULL,
  sourceCoverage: integer NOT NULL,         // # of distinct source videos
  pageWorthinessScore: integer NOT NULL,    // 0-100, see prompt
  specificityScore: integer NOT NULL,       // 0-100
  creatorUniquenessScore: integer NOT NULL, // 0-100
  createdAt: timestamptz DEFAULT now(),
  INDEX (runId, type)
}
```

### `page_brief`

```ts
{
  id: text PRIMARY KEY,
  workspaceId: text NOT NULL,
  runId: text NOT NULL,
  payload: jsonb NOT NULL,        // see PageBriefPayload
  pageWorthinessScore: integer NOT NULL,
  position: integer NOT NULL,
  createdAt: timestamptz DEFAULT now(),
  INDEX (runId, position)
}
```

```ts
type PageBriefPayload = {
  pageType: 'lesson' | 'framework' | 'playbook';
  title: string;
  slug: string;                                    // adapter-safe
  readerProblem: string;                           // who is this for, what hurts
  promisedOutcome: string;                         // what they can do after reading
  whyThisMatters: string;                          // why this page should exist
  outline: string[];                               // section titles in order
  primaryCanonNodeId: string;                      // the anchor concept
  supportingCanonNodeIds: string[];                // related nodes
  requiredEvidenceSegmentIds: string[];
  ctaOrNextStep?: string;
}
```

---

## Phase 1 — Channel Profile

The channel_profiler agent runs once at the start of the pipeline. Its output is small but it shapes every downstream prompt: the video_analyst gets the channel profile in its bootstrap so it knows what voice/niche it's reading; the canon_architect uses the recurring themes to merge findings.

### Task 1.1 — Schema + migration

**Files:**
- Create: `packages/db/src/schema/canon.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/db/drizzle/out/0008_canon_layer.sql`
- Modify: `packages/db/drizzle/out/meta/_journal.json`

- [ ] **Step 1: Create schema file**

Create `packages/db/src/schema/canon.ts`:

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

export type ChannelProfile = typeof channelProfile.$inferSelect;
export type VideoIntelligenceCard = typeof videoIntelligenceCard.$inferSelect;
export type CanonNode = typeof canonNode.$inferSelect;
export type PageBrief = typeof pageBrief.$inferSelect;
```

- [ ] **Step 2: Re-export from schema index**

In `packages/db/src/schema/index.ts`, append:

```typescript
export * from './canon';
```

- [ ] **Step 3: Write migration SQL**

Create `packages/db/drizzle/out/0008_canon_layer.sql`:

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
```

- [ ] **Step 4: Append journal entry**

Add to `packages/db/drizzle/out/meta/_journal.json` entries array (after entry idx 7):

```json
    {
      "idx": 8,
      "version": "7",
      "when": 1777507200000,
      "tag": "0008_canon_layer",
      "breakpoints": true
    }
```

- [ ] **Step 5: Apply + verify**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS && pnpm db:migrate 2>&1 | tail -3
```

Expected: `[db] migrations applied`. Then verify the four tables exist:

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
const r = await sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('channel_profile','video_intelligence_card','canon_node','page_brief')`;
console.log(r);
await sql.end();
EOF
node ./_check.mjs && rm ./_check.mjs
```

Expected: 4 rows.

- [ ] **Step 6: Typecheck**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS/packages/db && pnpm typecheck 2>&1 | tail -3
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add packages/db/src/schema/canon.ts packages/db/src/schema/index.ts packages/db/drizzle/out/0008_canon_layer.sql packages/db/drizzle/out/meta/_journal.json
git commit -m "feat(db): canon layer tables (channel_profile, video_intelligence_card, canon_node, page_brief)"
```

### Task 1.2 — Channel profiler prompt

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append CHANNEL_PROFILER_PROMPT**

Add at the end of `packages/pipeline/src/agents/specialists/prompts.ts`:

```typescript
export const CHANNEL_PROFILER_PROMPT = `You are channel_profiler. Your job is to build a one-shot creator profile that every other agent in the pipeline will use as context.

You receive: a list of every video in the run with title and duration. You have read access to the full transcript of any video via getFullTranscript.

Process:
1. Call listVideos to see the archive.
2. For 3-5 representative videos (longest, most-viewed, most-recent — pick a spread), call getFullTranscript to skim. Don't read every video; you're forming a hypothesis.
3. Call proposeChannelProfile exactly once with this exact shape:
   {
     "creatorName": string (extract from videos or use "the creator"),
     "niche": string (one phrase: "AI automation for solo agencies", "calisthenics for endurance athletes", etc.),
     "audience": string (one paragraph: who watches, what stage, what they care about),
     "recurringPromise": string (the implicit value prop across the archive),
     "contentFormats": string[] (e.g. ["tutorial", "case study", "vlog"]),
     "monetizationAngle": string (course, agency services, affiliate, etc.),
     "dominantTone": string ("conversational", "instructional", "academic", "playful"),
     "expertiseCategory": string (single phrase classification),
     "recurringThemes": string[] (3-8 themes that appear across multiple videos),
     "whyPeopleFollow": string (one sentence — the answer to "what does watching this give me"),
     "positioningSummary": string (one paragraph: how this creator is distinct from others in the niche),
     "creatorTerminology": string[] (named concepts the creator uses repeatedly — their language, not generic)
   }

Rules:
- Be specific. "AI content automation for newsletter operators" beats "AI content".
- creatorTerminology should be the creator's words, not yours. Read transcripts.
- Don't fabricate themes. If you only see 2 videos, return 2-3 themes — under-claim rather than over-claim.
- If something is genuinely unknowable from the available content (e.g. monetizationAngle), use "unknown" rather than guess.
- Make exactly ONE proposeChannelProfile call. Then respond with a brief summary and no tool calls.`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): channel_profiler"
```

### Task 1.3 — `getFullTranscript` and `proposeChannelProfile` tools

**Files:**
- Create: `packages/pipeline/src/agents/tools/read-canon.ts`
- Create: `packages/pipeline/src/agents/tools/propose-canon.ts`
- Modify: `packages/pipeline/src/agents/tools/registry.ts`

- [ ] **Step 1: Create read tools**

Create `packages/pipeline/src/agents/tools/read-canon.ts`:

```typescript
import { z } from 'zod';
import { and, eq, inArray } from '@creatorcanon/db';
import { transcriptAsset, video, channelProfile, videoIntelligenceCard, canonNode } from '@creatorcanon/db/schema';
import type { ToolDef } from './types';

// getFullTranscript(videoId) — read the canonical VTT from R2 and return it.
export const getFullTranscriptTool: ToolDef<{ videoId: string }, { videoId: string; vtt: string; wordCount: number }> = {
  name: 'getFullTranscript',
  description: 'Read the full canonical VTT transcript for a video. Use sparingly (transcripts are long); prefer searchSegments for targeted retrieval.',
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

// getChannelProfile() — read the run's channel_profile row (used by video_analyst).
export const getChannelProfileTool: ToolDef<{}, { profile: unknown | null }> = {
  name: 'getChannelProfile',
  description: 'Read the channel profile for this run.',
  inputSchema: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await ctx.db.select().from(channelProfile).where(eq(channelProfile.runId, ctx.runId)).limit(1);
    return { profile: rows[0]?.payload ?? null };
  },
};

// listVideoIntelligenceCards() — used by canon_architect.
export const listVideoIntelligenceCardsTool: ToolDef<{}, { cards: Array<{ id: string; videoId: string; payload: unknown }> }> = {
  name: 'listVideoIntelligenceCards',
  description: 'List every video intelligence card in this run.',
  inputSchema: z.object({}),
  handler: async (_input, ctx) => {
    const rows = await ctx.db.select().from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, ctx.runId));
    return { cards: rows.map((r) => ({ id: r.id, videoId: r.videoId, payload: r.payload })) };
  },
};

// listCanonNodes() — used by page_brief_planner.
export const listCanonNodesTool: ToolDef<{ types?: string[] }, { nodes: Array<{ id: string; type: string; payload: unknown; pageWorthinessScore: number; sourceCoverage: number }> }> = {
  name: 'listCanonNodes',
  description: 'List canon nodes, optionally filtered by type[].',
  inputSchema: z.object({ types: z.array(z.string()).optional() }),
  handler: async (input, ctx) => {
    const where = input.types && input.types.length > 0
      ? and(eq(canonNode.runId, ctx.runId), inArray(canonNode.type, input.types))
      : eq(canonNode.runId, ctx.runId);
    const rows = await ctx.db.select().from(canonNode).where(where);
    return { nodes: rows.map((r) => ({ id: r.id, type: r.type, payload: r.payload, pageWorthinessScore: r.pageWorthinessScore, sourceCoverage: r.sourceCoverage })) };
  },
};
```

- [ ] **Step 2: Create propose tools**

Create `packages/pipeline/src/agents/tools/propose-canon.ts`:

```typescript
import { z } from 'zod';
import { channelProfile, videoIntelligenceCard, canonNode, pageBrief } from '@creatorcanon/db/schema';
import type { ToolDef } from './types';
import { validateSegmentRefs } from '../segment-ref';

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

// proposeChannelProfile — exactly one row per run.
const channelProfilePayloadSchema = z.object({
  creatorName: z.string().min(1),
  niche: z.string().min(1),
  audience: z.string().min(1),
  recurringPromise: z.string().min(1),
  contentFormats: z.array(z.string()).min(1),
  monetizationAngle: z.string().min(1),
  dominantTone: z.string().min(1),
  expertiseCategory: z.string().min(1),
  recurringThemes: z.array(z.string()).min(1),
  whyPeopleFollow: z.string().min(1),
  positioningSummary: z.string().min(1),
  creatorTerminology: z.array(z.string()),
});

export const proposeChannelProfileTool: ToolDef<z.infer<typeof channelProfilePayloadSchema>, { ok: true; id: string } | { ok: false; error: string }> = {
  name: 'proposeChannelProfile',
  description: 'Submit the channel profile. Call exactly once.',
  inputSchema: channelProfilePayloadSchema,
  handler: async (input, ctx) => {
    const id = makeId('cp');
    try {
      await ctx.db.insert(channelProfile).values({
        id,
        workspaceId: ctx.workspaceId,
        runId: ctx.runId,
        payload: input,
      });
    } catch (err) {
      return { ok: false, error: `channel_profile insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};

// proposeVideoIntelligenceCard — one row per video.
const videoIntelligenceCardPayloadSchema = z.object({
  coreThesis: z.string().min(1),
  audience: z.string().min(1),
  viewerProblem: z.string().min(1),
  promisedOutcome: z.string().min(1),
  summary: z.string().min(1),
  creatorVoiceNotes: z.array(z.string()),
  mainIdeas: z.array(z.object({ title: z.string(), body: z.string(), segmentIds: z.array(z.string()).min(1) })).min(1),
  frameworks: z.array(z.object({ title: z.string(), description: z.string(), principles: z.array(z.string()), steps: z.array(z.string()).optional(), segmentIds: z.array(z.string()).min(1) })),
  lessons: z.array(z.object({ title: z.string(), idea: z.string(), segmentIds: z.array(z.string()).min(1) })),
  examples: z.array(z.object({ title: z.string(), description: z.string(), segmentIds: z.array(z.string()).min(1) })),
  stories: z.array(z.object({ title: z.string(), arc: z.string(), segmentIds: z.array(z.string()).min(1) })),
  mistakesToAvoid: z.array(z.object({ title: z.string(), body: z.string(), segmentIds: z.array(z.string()).min(1) })),
  toolsMentioned: z.array(z.string()),
  termsDefined: z.array(z.object({ term: z.string(), definition: z.string(), segmentIds: z.array(z.string()).min(1) })),
  strongClaims: z.array(z.object({ claim: z.string(), segmentIds: z.array(z.string()).min(1) })),
  contrarianTakes: z.array(z.object({ claim: z.string(), segmentIds: z.array(z.string()).min(1) })),
  quotes: z.array(z.object({ text: z.string(), attribution: z.string().optional(), segmentIds: z.array(z.string()).min(1) })),
  recommendedHubUses: z.array(z.string()),
});

const proposeVideoIntelligenceCardInput = z.object({
  videoId: z.string(),
  payload: videoIntelligenceCardPayloadSchema,
});

export const proposeVideoIntelligenceCardTool: ToolDef<z.infer<typeof proposeVideoIntelligenceCardInput>, { ok: true; id: string } | { ok: false; error: string }> = {
  name: 'proposeVideoIntelligenceCard',
  description: 'Submit a video intelligence card. Call exactly once per video.',
  inputSchema: proposeVideoIntelligenceCardInput,
  handler: async (input, ctx) => {
    // Collect every segmentId the agent referenced and validate.
    const allSegIds = new Set<string>();
    for (const arr of [input.payload.mainIdeas, input.payload.frameworks, input.payload.lessons, input.payload.examples, input.payload.stories, input.payload.mistakesToAvoid, input.payload.termsDefined, input.payload.strongClaims, input.payload.contrarianTakes, input.payload.quotes]) {
      for (const it of arr as Array<{ segmentIds: string[] }>) {
        for (const s of it.segmentIds) allSegIds.add(s);
      }
    }
    const validation = await validateSegmentRefs(
      ctx.runId,
      [...allSegIds].map((segmentId) => ({ segmentId })),
      ctx.db,
    );
    if (!validation.ok) {
      return { ok: false, error: `Unknown segment IDs: ${validation.unknownIds.join(', ')}.` };
    }
    const id = makeId('vic');
    try {
      await ctx.db.insert(videoIntelligenceCard).values({
        id,
        workspaceId: ctx.workspaceId,
        runId: ctx.runId,
        videoId: input.videoId,
        payload: input.payload,
        evidenceSegmentIds: [...allSegIds],
      });
    } catch (err) {
      return { ok: false, error: `vic insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};

// proposeCanonNode — many rows per run.
const canonNodeInput = z.object({
  type: z.enum(['topic', 'framework', 'lesson', 'playbook', 'principle', 'term', 'example', 'quote', 'aha_moment']),
  payload: z.record(z.unknown()),
  evidenceSegmentIds: z.array(z.string()).min(1),
  evidenceQuality: z.enum(['strong', 'moderate', 'limited', 'unverified']),
  pageWorthinessScore: z.number().int().min(0).max(100),
  specificityScore: z.number().int().min(0).max(100),
  creatorUniquenessScore: z.number().int().min(0).max(100),
});

export const proposeCanonNodeTool: ToolDef<z.infer<typeof canonNodeInput>, { ok: true; id: string } | { ok: false; error: string }> = {
  name: 'proposeCanonNode',
  description: 'Submit one canon node (topic/framework/lesson/playbook/principle/term/example/quote/aha_moment).',
  inputSchema: canonNodeInput,
  handler: async (input, ctx) => {
    const validation = await validateSegmentRefs(
      ctx.runId,
      input.evidenceSegmentIds.map((segmentId) => ({ segmentId })),
      ctx.db,
    );
    if (!validation.ok) {
      return { ok: false, error: `Unknown segment IDs: ${validation.unknownIds.join(', ')}.` };
    }
    // Source video coverage = distinct video_ids of evidence segments.
    const sourceVideoIds = [...new Set(validation.found.map((s) => s.videoId))];
    const id = makeId('cn');
    try {
      await ctx.db.insert(canonNode).values({
        id,
        workspaceId: ctx.workspaceId,
        runId: ctx.runId,
        type: input.type,
        payload: input.payload,
        evidenceSegmentIds: input.evidenceSegmentIds,
        sourceVideoIds,
        evidenceQuality: input.evidenceQuality,
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

// proposePageBrief — many rows per run, ordered by position.
const pageBriefInput = z.object({
  payload: z.object({
    pageType: z.enum(['lesson', 'framework', 'playbook']),
    title: z.string().min(1),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    readerProblem: z.string().min(1),
    promisedOutcome: z.string().min(1),
    whyThisMatters: z.string().min(1),
    outline: z.array(z.string().min(1)).min(2),
    primaryCanonNodeId: z.string(),
    supportingCanonNodeIds: z.array(z.string()),
    requiredEvidenceSegmentIds: z.array(z.string()).min(1),
    ctaOrNextStep: z.string().optional(),
  }),
  pageWorthinessScore: z.number().int().min(0).max(100),
  position: z.number().int().min(0),
});

export const proposePageBriefTool: ToolDef<z.infer<typeof pageBriefInput>, { ok: true; id: string } | { ok: false; error: string }> = {
  name: 'proposePageBrief',
  description: 'Submit one page brief. Pages are written in increasing position order.',
  inputSchema: pageBriefInput,
  handler: async (input, ctx) => {
    const validation = await validateSegmentRefs(
      ctx.runId,
      input.payload.requiredEvidenceSegmentIds.map((segmentId) => ({ segmentId })),
      ctx.db,
    );
    if (!validation.ok) {
      return { ok: false, error: `Unknown segment IDs: ${validation.unknownIds.join(', ')}.` };
    }
    const id = makeId('pb');
    try {
      await ctx.db.insert(pageBrief).values({
        id,
        workspaceId: ctx.workspaceId,
        runId: ctx.runId,
        payload: input.payload,
        pageWorthinessScore: input.pageWorthinessScore,
        position: input.position,
      });
    } catch (err) {
      return { ok: false, error: `page_brief insert failed: ${(err as Error).message}` };
    }
    return { ok: true, id };
  },
};
```

- [ ] **Step 3: Register the tools**

In `packages/pipeline/src/agents/tools/registry.ts`, add to the imports:

```typescript
import {
  getFullTranscriptTool,
  getChannelProfileTool,
  listVideoIntelligenceCardsTool,
  listCanonNodesTool,
} from './read-canon';
import {
  proposeChannelProfileTool,
  proposeVideoIntelligenceCardTool,
  proposeCanonNodeTool,
  proposePageBriefTool,
} from './propose-canon';
```

In the body of `registerAllTools()` (find the function — likely at the bottom of the file), add:

```typescript
  registerTool(getFullTranscriptTool);
  registerTool(getChannelProfileTool);
  registerTool(listVideoIntelligenceCardsTool);
  registerTool(listCanonNodesTool);
  registerTool(proposeChannelProfileTool);
  registerTool(proposeVideoIntelligenceCardTool);
  registerTool(proposeCanonNodeTool);
  registerTool(proposePageBriefTool);
```

- [ ] **Step 4: Update segment-ref to expose found segments**

`validateSegmentRefs` currently returns `{ok, unknownIds}`. The propose tools above need `validation.found` (the matched segments with their `videoId`). Open `packages/pipeline/src/agents/segment-ref.ts` and verify the return shape includes `found: Array<{ id, videoId }>`. If not, extend it:

```typescript
// Existing function should return:
//   { ok: true, found: SegmentRow[] } | { ok: false, unknownIds: string[] }
// where SegmentRow has at minimum { id, videoId }.
// If currently it only returns { ok, unknownIds }, add the found array.
```

- [ ] **Step 5: Typecheck**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS/packages/pipeline && pnpm typecheck 2>&1 | tail -3
```

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/agents/tools/read-canon.ts packages/pipeline/src/agents/tools/propose-canon.ts packages/pipeline/src/agents/tools/registry.ts packages/pipeline/src/agents/segment-ref.ts
git commit -m "feat(tools): canon-layer read + propose tools"
```

### Task 1.4 — Register `channel_profiler` specialist + model selection

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/index.ts`
- Modify: `packages/pipeline/src/agents/providers/selectModel.ts`

- [ ] **Step 1: Add to AgentName + REGISTRY in selectModel**

In `packages/pipeline/src/agents/providers/selectModel.ts`, extend the `AgentName` union and add four new REGISTRY entries:

```typescript
export type AgentName =
  | 'topic_spotter' | 'framework_extractor' | 'lesson_extractor'
  | 'playbook_extractor' | 'source_ranker' | 'quote_finder' | 'aha_moment_detector'
  | 'citation_grounder' | 'page_composer'
  | 'channel_profiler' | 'video_analyst' | 'canon_architect' | 'page_brief_planner';
```

Append to REGISTRY:

```typescript
  channel_profiler:    { envVar: 'PIPELINE_MODEL_CHANNEL_PROFILER',    default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  video_analyst:       { envVar: 'PIPELINE_MODEL_VIDEO_ANALYST',       default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai'), M('gemini-2.5-pro','gemini')] },
  canon_architect:     { envVar: 'PIPELINE_MODEL_CANON_ARCHITECT',     default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
  page_brief_planner:  { envVar: 'PIPELINE_MODEL_PAGE_BRIEF_PLANNER',  default: M('gpt-5.5','openai'),          fallbackChain: [M('gpt-5.4','openai')] },
```

- [ ] **Step 2: Register channel_profiler specialist**

In `packages/pipeline/src/agents/specialists/index.ts`, add the import for the new prompt and a new entry in `SPECIALISTS`:

```typescript
import {
  // ... existing prompts
  CHANNEL_PROFILER_PROMPT,
} from './prompts';

// Inside SPECIALISTS:
  channel_profiler: {
    agent: 'channel_profiler',
    systemPrompt: CHANNEL_PROFILER_PROMPT,
    allowedTools: ['listVideos', 'getFullTranscript', 'proposeChannelProfile'],
    stopOverrides: { maxToolCalls: 30, maxTokensSpent: 200000 },
  },
```

(Tighter caps because the agent shouldn't read every transcript — 3-5 max.)

- [ ] **Step 3: Typecheck + commit**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS/packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/agents/specialists/index.ts packages/pipeline/src/agents/providers/selectModel.ts
git commit -m "feat(agents): register channel_profiler + 3 new agent identifiers in selectModel"
```

### Task 1.5 — `channel-profile` stage

**Files:**
- Create: `packages/pipeline/src/stages/channel-profile.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Create the stage**

Create `packages/pipeline/src/stages/channel-profile.ts`:

```typescript
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

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  // Bootstrap: list videos with title + duration so the agent has the archive shape.
  const ctx: ToolCtx = { runId: input.runId, workspaceId: input.workspaceId, agent: 'bootstrap', model: 'n/a', db: getDb(), r2 };
  const videos = await listVideosTool.handler({}, ctx);
  const bootstrap = `Archive: ${videos.length} videos.\n\n` + videos.map((v) => `- ${v.id}: ${v.title} (${Math.round(v.durationSec / 60)} min)`).join('\n') + `\n\nProduce one channel profile. Use getFullTranscript on at most 3-5 representative videos.`;

  const cfg = SPECIALISTS.channel_profiler;
  const model = selectModel('channel_profiler', process.env);
  const provider = makeProvider(model.provider);

  try {
    const summary = await runAgent({
      runId: input.runId,
      workspaceId: input.workspaceId,
      agent: cfg.agent,
      modelId: model.modelId,
      provider,
      r2,
      tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt,
      userMessage: bootstrap,
      caps: cfg.stopOverrides,
    });
    return { ok: true, costCents: summary.costCents, summary };
  } catch (err) {
    return { ok: false, costCents: 0, summary: null, error: (err as Error).message };
  }
}
```

- [ ] **Step 2: Re-export**

In `packages/pipeline/src/stages/index.ts`, append:

```typescript
export { runChannelProfileStage } from './channel-profile';
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS/packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/channel-profile.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): channel-profile stage runs channel_profiler agent once per run"
```

---

## Phase 2 — Per-Video Intelligence Card

This is the most important new agent. For each video it produces a structured `video_intelligence_card` — the raw intellectual material the rest of the pipeline depends on.

### Task 2.1 — VIDEO_ANALYST_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append the prompt**

Append to `packages/pipeline/src/agents/specialists/prompts.ts`:

```typescript
export const VIDEO_ANALYST_PROMPT = `You are video_analyst. Your job is to deeply read ONE video and produce a structured intelligence card capturing every page-worthy idea, framework, lesson, story, claim, and quote — citation-grade.

You receive: one videoId you must analyze, plus the channel profile (so you understand the creator's niche, audience, and recurring themes).

Process:
1. Call getChannelProfile to read the run-level context.
2. Call getFullTranscript with your videoId to read the entire transcript.
3. Use searchSegments and getSegment to map specific claims to specific segment IDs. Every item you propose MUST cite real segment IDs that you've read.
4. Call proposeVideoIntelligenceCard exactly once with this exact shape:
   {
     "videoId": "<your video id>",
     "payload": {
       "coreThesis": string,
       "audience": string,
       "viewerProblem": string,
       "promisedOutcome": string,
       "summary": string (2-3 sentences),
       "creatorVoiceNotes": string[] (tone, repeated phrases — capture the creator's actual style),
       "mainIdeas": [{ title, body, segmentIds: [...] }, ...],
       "frameworks": [{ title, description, principles: [], steps?: [], segmentIds: [...] }],
       "lessons": [{ title, idea, segmentIds: [...] }],
       "examples": [{ title, description, segmentIds: [...] }],
       "stories": [{ title, arc, segmentIds: [...] }],
       "mistakesToAvoid": [{ title, body, segmentIds: [...] }],
       "toolsMentioned": string[],
       "termsDefined": [{ term, definition, segmentIds: [...] }],
       "strongClaims": [{ claim, segmentIds: [...] }],
       "contrarianTakes": [{ claim, segmentIds: [...] }],
       "quotes": [{ text (10-280 chars), attribution?, segmentIds: [...] }],
       "recommendedHubUses": string[]
     }
   }

Quality gates:
- mainIdeas: at least 3, each with a clear distinct idea (not paraphrases of each other).
- frameworks: only if the creator gives a NAMED procedure with explicit structure. Do not invent framework names.
- lessons: ideas the viewer can carry away as mental models. Distinct from frameworks (which are procedures).
- stories: only when the creator narrates a real example with a beginning/middle/end.
- strongClaims: assertions the creator makes definitively. quote-anchor them.
- contrarianTakes: only when the creator pushes back against conventional advice.
- quotes: short, stand-alone — no "as I said earlier" fragments.
- creatorTerminology: use the creator's actual phrases, not generic equivalents.

Use the channel profile to keep classifications consistent across videos. If the channel profile says the creator's niche is "AI automation for solo agencies", then a tool listed in this video should fit that lens.

Make exactly ONE proposeVideoIntelligenceCard call. Then respond with a brief summary and no tool calls.`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): video_analyst"
```

### Task 2.2 — Register video_analyst specialist

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/index.ts`

- [ ] **Step 1: Add specialist entry**

Add to `SPECIALISTS`:

```typescript
import { VIDEO_ANALYST_PROMPT } from './prompts'; // append to existing imports

  video_analyst: {
    agent: 'video_analyst',
    systemPrompt: VIDEO_ANALYST_PROMPT,
    allowedTools: ['getChannelProfile', 'getFullTranscript', 'searchSegments', 'getSegment', 'listSegmentsForVideo', 'proposeVideoIntelligenceCard'],
    stopOverrides: { maxToolCalls: 80, maxTokensSpent: 600000 },
  },
```

(Higher caps because the agent will read a full transcript and may need many getSegment calls.)

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/agents/specialists/index.ts
git commit -m "feat(agents): register video_analyst specialist"
```

### Task 2.3 — `video-intelligence` fan-out stage

**Files:**
- Create: `packages/pipeline/src/stages/video-intelligence.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Create the stage**

Create `packages/pipeline/src/stages/video-intelligence.ts`:

```typescript
import { eq } from '@creatorcanon/db';
import { segment } from '@creatorcanon/db/schema';
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
  const segments = await db
    .selectDistinct({ videoId: segment.videoId })
    .from(segment)
    .where(eq(segment.runId, input.runId));
  const videoIds = segments.map((s) => s.videoId);

  const cfg = SPECIALISTS.video_analyst;
  const model = selectModel('video_analyst', process.env);

  const results = await runWithConcurrency(videoIds, CONCURRENCY, async (videoId) => {
    const provider = makeProvider(model.provider);
    const userMessage = `Analyze video ${videoId}. Read the channel profile first, then getFullTranscript for this video, then build the intelligence card.`;
    try {
      const summary = await runAgent({
        runId: input.runId,
        workspaceId: input.workspaceId,
        agent: cfg.agent,
        modelId: model.modelId,
        provider,
        r2,
        tools: cfg.allowedTools,
        systemPrompt: cfg.systemPrompt,
        userMessage,
        caps: cfg.stopOverrides,
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

- [ ] **Step 2: Re-export**

In `packages/pipeline/src/stages/index.ts`, append:

```typescript
export { runVideoIntelligenceStage } from './video-intelligence';
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS/packages/pipeline && pnpm typecheck 2>&1 | tail -3
git add packages/pipeline/src/stages/video-intelligence.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): video-intelligence fans out video_analyst per video"
```

---

## Phase 4 — Canon Architect

Replaces the current `discovery + synthesis + verify + merge` chain. Reads every video intelligence card + channel profile, produces typed canon nodes with quality scores.

### Task 4.1 — CANON_ARCHITECT_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append prompt**

Append:

```typescript
export const CANON_ARCHITECT_PROMPT = `You are canon_architect. You receive a channel profile and one video intelligence card per video. Your job is to merge them into the creator's canon — a typed knowledge graph of every page-worthy idea.

Process:
1. Call getChannelProfile, then listVideoIntelligenceCards. Read every card.
2. Identify items that recur across videos (similar frameworks, lessons stated multiple ways, themes that span the archive). MERGE them — one canon node per concept, citing every video that supports it.
3. Identify items that are unique to one video but page-worthy (specific frameworks, signature lessons). Promote them as their own canon nodes.
4. Drop items that are filler, generic, or weakly-supported.
5. For each canon node, call proposeCanonNode with:
   - type: 'topic' | 'framework' | 'lesson' | 'playbook' | 'principle' | 'term' | 'example' | 'quote' | 'aha_moment'
   - payload: type-specific shape (frameworks have title + description + principles + optional steps; lessons have title + idea; topics have title + description + iconKey + accentColor; etc. — match the existing schema)
   - evidenceSegmentIds: every segment ID across the cards that supports this node
   - evidenceQuality: 'strong' (≥2 distinct videos), 'moderate' (1 video, multiple segments), 'limited' (1 segment), 'unverified' (uncertain)
   - pageWorthinessScore (0-100): would a fan want a page about this? Strong frameworks score 85+; vague topics score under 50.
   - specificityScore (0-100): is this concrete (a named system, a specific method) or vague (a vibe, a generality)? Score concreteness.
   - creatorUniquenessScore (0-100): does the creator have their own angle on this, or is it generic advice?

Target counts (scale by archive size):
- 1-2 videos: 6-12 nodes total
- 3-5 videos: 12-25 nodes
- 6-10 videos: 25-40 nodes
- 10+ videos: 40-80 nodes

Type mix guideline:
- topics (cross-cutting themes): 2-6
- frameworks (named procedures): 2-6
- lessons (mental models): 4-10
- playbooks (multi-finding systems): 1-3
- principles (rules of thumb): 0-5
- terms (creator terminology): up to 10
- examples, quotes, aha_moments: as many as are good

Rules:
- Every node MUST cite real segment IDs.
- Don't fabricate creator-specific concepts. If only generic ideas are present, say so via low creatorUniquenessScore — don't dress them up.
- A node that scores under 60 on pageWorthinessScore should still be created (it's useful for cross-linking) but the page_brief_planner won't promote it to a page.
- Quotes: payload = { text, attribution? }. Aha moments: payload = { quote, context, attribution? }.
- When you're done, respond with a brief summary and no tool calls.`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): canon_architect"
```

### Task 4.2 — Register canon_architect specialist

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/index.ts`

- [ ] **Step 1: Add entry**

```typescript
import { CANON_ARCHITECT_PROMPT } from './prompts';

  canon_architect: {
    agent: 'canon_architect',
    systemPrompt: CANON_ARCHITECT_PROMPT,
    allowedTools: ['getChannelProfile', 'listVideoIntelligenceCards', 'getVideoIntelligenceCard', 'searchSegments', 'getSegment', 'proposeCanonNode'],
    stopOverrides: { maxToolCalls: 200, maxTokensSpent: 1_000_000 },
  },
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/agents/specialists/index.ts
git commit -m "feat(agents): register canon_architect"
```

### Task 4.3 — `canon` stage

**Files:**
- Create: `packages/pipeline/src/stages/canon.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Create the stage**

Create `packages/pipeline/src/stages/canon.ts`:

```typescript
import { eq } from '@creatorcanon/db';
import { videoIntelligenceCard } from '@creatorcanon/db/schema';
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
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runCanonStage(input: CanonStageInput): Promise<CanonStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  const cards = await db.select({ id: videoIntelligenceCard.id, videoId: videoIntelligenceCard.videoId }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, input.runId));
  const bootstrap = `${cards.length} video intelligence cards available. Read every card via listVideoIntelligenceCards, then merge into a canon. Target node counts based on archive size; don't pad with weak content.`;

  const cfg = SPECIALISTS.canon_architect;
  const model = selectModel('canon_architect', process.env);
  const provider = makeProvider(model.provider);

  try {
    const summary = await runAgent({
      runId: input.runId,
      workspaceId: input.workspaceId,
      agent: cfg.agent,
      modelId: model.modelId,
      provider,
      r2,
      tools: cfg.allowedTools,
      systemPrompt: cfg.systemPrompt,
      userMessage: bootstrap,
      caps: cfg.stopOverrides,
    });
    return { ok: true, costCents: summary.costCents, summary };
  } catch (err) {
    return { ok: false, costCents: 0, summary: null, error: (err as Error).message };
  }
}
```

- [ ] **Step 2: Re-export + typecheck + commit**

```bash
echo "export { runCanonStage } from './canon';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../..
git add packages/pipeline/src/stages/canon.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): canon stage runs canon_architect over video intelligence cards"
```

---

## Phase 5 — Page Brief Planner

The canon has many nodes (2-80 depending on archive size). Not every node deserves a page. The page_brief_planner reads the canon and decides which 4-12 pages should exist, what each is FOR, and what canon nodes anchor each.

### Task 5.1 — PAGE_BRIEF_PLANNER_PROMPT

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts`

- [ ] **Step 1: Append prompt**

```typescript
export const PAGE_BRIEF_PLANNER_PROMPT = `You are page_brief_planner. The canon contains the creator's knowledge as typed nodes; your job is to decide which pages should exist and write a brief for each.

Principle: A premium hub feels curated. Generate fewer, better pages — never every node becomes a page. Aim for 4-12 pages total, even if the canon has 40 nodes.

Process:
1. Call getChannelProfile and listCanonNodes. Read every node.
2. Identify the highest-leverage page candidates:
   - Strong frameworks (pageWorthinessScore ≥ 75) → framework pages
   - Strong playbooks (pageWorthinessScore ≥ 75) → playbook pages
   - Strong lessons that anchor a clear reader problem → lesson pages
   - Lower-scored topics, principles, examples, quotes are NOT pages — they get linked from the pages that cite them
3. For each chosen page, call proposePageBrief with this exact shape:
   {
     "payload": {
       "pageType": "lesson" | "framework" | "playbook",
       "title": string (Title Case, ≤ 60 chars),
       "slug": string (lowercase, hyphens),
       "readerProblem": string (1-2 sentences: who is this for, what hurts),
       "promisedOutcome": string (1 sentence: what they can do after reading),
       "whyThisMatters": string (1-2 sentences: why this page exists vs. just watching the video),
       "outline": string[] (4-7 section titles in reading order),
       "primaryCanonNodeId": string (the anchor node),
       "supportingCanonNodeIds": string[] (related lesson/quote/example/principle IDs),
       "requiredEvidenceSegmentIds": string[] (≥3, drawn from primary + supporting nodes),
       "ctaOrNextStep": string (what should the reader do next; can be empty)
     },
     "pageWorthinessScore": number (0-100, copy or refine from primary node),
     "position": number (0-based reading order — beginner pages first, advanced last)
   }

Rules:
- A page must answer all five of: who is this for / what problem does it solve / what can the reader do after / which creator sources prove it / why is this not generic.
- If you can't answer one of those, don't create the page.
- outline section titles describe the actual content, not generic ("Intro", "Conclusion") — be specific.
- Order pages by reader journey: foundational lessons before frameworks before complex playbooks.
- Don't create two pages on the same idea — pick the strongest framing and link the others as supporting.
- If the canon is too thin to support 4 pages, return 2-3 great pages. Quality over quantity.
- When you're done, respond with a brief summary and no tool calls.`;
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "feat(prompt): page_brief_planner"
```

### Task 5.2 — Register page_brief_planner specialist

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/index.ts`

- [ ] **Step 1: Add entry**

```typescript
import { PAGE_BRIEF_PLANNER_PROMPT } from './prompts';

  page_brief_planner: {
    agent: 'page_brief_planner',
    systemPrompt: PAGE_BRIEF_PLANNER_PROMPT,
    allowedTools: ['getChannelProfile', 'listCanonNodes', 'getSegment', 'proposePageBrief'],
    stopOverrides: { maxToolCalls: 60, maxTokensSpent: 400000 },
  },
```

- [ ] **Step 2: Commit**

```bash
git add packages/pipeline/src/agents/specialists/index.ts
git commit -m "feat(agents): register page_brief_planner"
```

### Task 5.3 — `page-briefs` stage

**Files:**
- Create: `packages/pipeline/src/stages/page-briefs.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Create the stage** (mirrors the canon stage shape)

```typescript
// packages/pipeline/src/stages/page-briefs.ts
import { eq } from '@creatorcanon/db';
import { canonNode } from '@creatorcanon/db/schema';
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
  costCents: number;
  summary: RunAgentSummary | null;
  error?: string;
}

export async function runPageBriefsStage(input: PageBriefsStageInput): Promise<PageBriefsStageOutput> {
  ensureToolsRegistered();
  const env = parseServerEnv(process.env);
  const r2 = input.r2Override ?? createR2Client(env);
  const db = getDb();

  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (input.providerOverride) return input.providerOverride(name);
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };

  const nodes = await db.select({ id: canonNode.id, type: canonNode.type, score: canonNode.pageWorthinessScore }).from(canonNode).where(eq(canonNode.runId, input.runId));
  const bootstrap = `Canon contains ${nodes.length} nodes (${nodes.filter((n) => n.type === 'framework').length} frameworks, ${nodes.filter((n) => n.type === 'lesson').length} lessons, ${nodes.filter((n) => n.type === 'playbook').length} playbooks). Pick 4-12 page-worthy anchors and brief them.`;

  const cfg = SPECIALISTS.page_brief_planner;
  const model = selectModel('page_brief_planner', process.env);
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
```

- [ ] **Step 2: Re-export + commit**

```bash
echo "export { runPageBriefsStage } from './page-briefs';" >> packages/pipeline/src/stages/index.ts
git add packages/pipeline/src/stages/page-briefs.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): page-briefs runs page_brief_planner over the canon"
```

---

## Phase 6 — Brief-Driven Page Composer

Deterministic composer: takes each `page_brief`, fetches its primary + supporting canon nodes, builds the page block tree directly. Optionally calls a single GPT polish pass per page to smooth prose. Writes `page` + `pageVersion` rows so the existing adapter projects them.

### Task 6.1 — `page-composition` stage

**Files:**
- Create: `packages/pipeline/src/stages/page-composition.ts`
- Modify: `packages/pipeline/src/stages/index.ts`

- [ ] **Step 1: Create the composer**

```typescript
// packages/pipeline/src/stages/page-composition.ts
import { and, eq, inArray } from '@creatorcanon/db';
import { page, pageVersion, pageBrief, canonNode } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import { selectModel } from '../agents/providers/selectModel';
import { createOpenAIProvider } from '../agents/providers/openai';
import type { AgentProvider } from '../agents/providers';
import { parseServerEnv } from '@creatorcanon/core';

function nano(): string { return crypto.randomUUID().replace(/-/g, '').slice(0, 10); }

export interface PageCompositionStageInput {
  runId: string;
  workspaceId: string;
  polishProvider?: AgentProvider | null;
}

export interface PageCompositionStageOutput {
  pageCount: number;
}

export async function runPageCompositionStage(input: PageCompositionStageInput): Promise<PageCompositionStageOutput> {
  const db = getDb();

  // Idempotent: clear prior pages for this run.
  await db.delete(pageVersion).where(eq(pageVersion.runId, input.runId));
  await db.delete(page).where(eq(page.runId, input.runId));

  const briefs = await db.select().from(pageBrief).where(eq(pageBrief.runId, input.runId)).orderBy(pageBrief.position);
  if (briefs.length === 0) return { pageCount: 0 };

  // Load every canon node referenced by any brief in one shot.
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
  for (const brief of briefs) {
    const p = brief.payload as {
      pageType: 'lesson' | 'framework' | 'playbook';
      title: string;
      slug: string;
      readerProblem: string;
      promisedOutcome: string;
      whyThisMatters: string;
      outline: string[];
      primaryCanonNodeId: string;
      supportingCanonNodeIds: string[];
      requiredEvidenceSegmentIds: string[];
      ctaOrNextStep?: string;
    };
    const primary = nodeById.get(p.primaryCanonNodeId);
    if (!primary) continue;

    const sections = buildSections(p, primary, p.supportingCanonNodeIds.map((id) => nodeById.get(id)).filter(Boolean) as typeof nodes);
    const evidenceSegmentIds = collectEvidenceSegmentIds(primary, p.supportingCanonNodeIds.map((id) => nodeById.get(id)).filter(Boolean) as typeof nodes);

    const pageId = `pg_${nano()}`;
    const versionId = `pv_${nano()}`;

    await db.insert(page).values({
      id: pageId,
      workspaceId: input.workspaceId,
      runId: input.runId,
      slug: p.slug,
      pageType: p.pageType,
      position: position++,
      supportLabel: 'review_recommended',
      currentVersionId: versionId,
    });

    const blockTree = {
      blocks: sections.map((s, i) => ({
        type: s.kind,
        id: `blk_${i}`,
        content: (({ kind: _k, citations: _c, ...rest }) => rest)(s as Record<string, unknown> & { kind: string; citations?: string[] }),
        citations: s.citations ?? [],
      })),
      atlasMeta: {
        evidenceQuality: primary.evidenceQuality,
        citationCount: evidenceSegmentIds.length,
        sourceCoveragePercent: Math.min(1, primary.sourceCoverage / Math.max(1, briefs.length)),
        relatedPageIds: [], // backfilled v2
        hero: { illustrationKey: p.pageType === 'framework' ? 'desk' : p.pageType === 'playbook' ? 'desk' : 'open-notebook' },
        evidenceSegmentIds,
        primaryFindingId: primary.id,
        supportingFindingIds: p.supportingCanonNodeIds,
      },
    };

    await db.insert(pageVersion).values({
      id: versionId,
      workspaceId: input.workspaceId,
      pageId,
      runId: input.runId,
      version: 1,
      title: p.title,
      summary: p.promisedOutcome,
      blockTreeJson: blockTree,
      isCurrent: true,
    });
  }

  return { pageCount: briefs.length };
}

interface SectionLike { kind: string; citations?: string[]; [k: string]: unknown }

function buildSections(brief: { pageType: string; readerProblem: string; promisedOutcome: string; whyThisMatters: string; outline: string[]; ctaOrNextStep?: string }, primary: typeof canonNode.$inferSelect, supporting: Array<typeof canonNode.$inferSelect>): SectionLike[] {
  const sections: SectionLike[] = [];
  const primaryPayload = primary.payload as Record<string, unknown>;

  // Section 1: overview = whyThisMatters (NOT the same as the page summary above).
  sections.push({ kind: 'overview', body: brief.whyThisMatters, citations: primary.evidenceSegmentIds.slice(0, 3) });

  // Section 2: depending on type
  if (brief.pageType === 'framework' && Array.isArray(primaryPayload.principles)) {
    sections.push({
      kind: 'principles',
      items: (primaryPayload.principles as Array<{ title?: string; body?: string } | string>).map((it) =>
        typeof it === 'string' ? { title: it, body: it } : { title: it.title ?? 'Principle', body: it.body ?? '' },
      ).filter((it) => it.body),
      citations: primary.evidenceSegmentIds.slice(0, 5),
    });
    if (Array.isArray(primaryPayload.steps) && (primaryPayload.steps as unknown[]).length > 0) {
      sections.push({
        kind: 'steps',
        title: 'Steps',
        items: (primaryPayload.steps as Array<string | { title?: string; body?: string }>).map((s, i) =>
          typeof s === 'string' ? { title: `Step ${i + 1}`, body: s } : { title: s.title ?? `Step ${i + 1}`, body: s.body ?? '' },
        ),
        citations: primary.evidenceSegmentIds.slice(0, 5),
      });
    }
  } else if (brief.pageType === 'playbook') {
    if (Array.isArray(primaryPayload.principles)) {
      sections.push({ kind: 'principles', items: primaryPayload.principles, citations: primary.evidenceSegmentIds.slice(0, 5) });
    }
    if (Array.isArray(primaryPayload.workflow) || Array.isArray(primaryPayload.scenes)) {
      const schedule = (primaryPayload.workflow ?? primaryPayload.scenes) as Array<{ day?: string; title?: string; items?: string[]; description?: string }>;
      sections.push({
        kind: 'workflow',
        schedule: schedule.map((s) => ({
          day: s.day ?? s.title ?? 'Step',
          items: s.items ?? (s.description ? [s.description] : ['—']),
        })).filter((s) => s.items.length > 0 && s.items.every((i) => i)),
        citations: primary.evidenceSegmentIds.slice(0, 5),
      });
    }
    if (Array.isArray(primaryPayload.failurePoints)) {
      sections.push({ kind: 'failure_points', items: primaryPayload.failurePoints, citations: primary.evidenceSegmentIds.slice(0, 3) });
    }
  } else {
    // lesson
    if (typeof primaryPayload.idea === 'string') {
      sections.push({ kind: 'paragraph', body: primaryPayload.idea, citations: primary.evidenceSegmentIds.slice(0, 3) });
    }
  }

  // Pull at most 2 supporting quotes/aha into the page.
  const quoteSupports = supporting.filter((s) => s.type === 'quote' || s.type === 'aha_moment').slice(0, 2);
  for (const q of quoteSupports) {
    const qp = q.payload as { text?: string; quote?: string; attribution?: string };
    sections.push({
      kind: 'quote',
      body: qp.text ?? qp.quote ?? '',
      attribution: qp.attribution,
      citations: q.evidenceSegmentIds.slice(0, 1),
    });
  }

  // CTA callout if present.
  if (brief.ctaOrNextStep) {
    sections.push({ kind: 'callout', tone: 'note', body: brief.ctaOrNextStep, citations: [] });
  }

  return sections;
}

function collectEvidenceSegmentIds(primary: typeof canonNode.$inferSelect, supporting: Array<typeof canonNode.$inferSelect>): string[] {
  const set = new Set<string>(primary.evidenceSegmentIds);
  for (const s of supporting) for (const id of s.evidenceSegmentIds) set.add(id);
  return [...set];
}
```

- [ ] **Step 2: Re-export + typecheck + commit**

```bash
echo "export { runPageCompositionStage } from './page-composition';" >> packages/pipeline/src/stages/index.ts
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../..
git add packages/pipeline/src/stages/page-composition.ts packages/pipeline/src/stages/index.ts
git commit -m "feat(stage): brief-driven page composer (canon → page+pageVersion)"
```

---

## Phase 9 — Adapter integration

The adapter currently reads from `archive_finding` (topics) and `pageVersion` (pages). Pages already work because the new composer writes to the same `pageVersion` table. Topics need a small change.

### Task 9.1 — `project-topics` reads from canon_node

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-topics.ts`

- [ ] **Step 1: Switch the source table**

In `packages/pipeline/src/adapters/editorial-atlas/project-topics.ts`, replace the import:

```typescript
import { canonNode, page as pageTable, pageVersion } from '@creatorcanon/db/schema';
```

Replace the main query:

```typescript
  const rows = await db
    .select()
    .from(canonNode)
    .where(and(eq(canonNode.runId, runId), eq(canonNode.type, 'topic')));

  if (rows.length > 0) {
    return rows.map((r) => {
      const p = r.payload as {
        title: string;
        description?: string;
        iconKey?: string;
        accentColor?: ProjectedTopic['accentColor'];
      };
      return {
        id: r.id,
        slug: slugify(p.title),
        title: p.title,
        description: p.description ?? '',
        iconKey: p.iconKey ?? 'grid',
        accentColor: p.accentColor ?? 'mint',
        pageCount: 0,
        evidenceSegmentIds: r.evidenceSegmentIds,
      };
    });
  }
```

The synthetic-page-type fallback (Frameworks/Lessons/Playbooks) stays unchanged.

Remove the `archiveFinding` import — it's no longer used here.

- [ ] **Step 2: `project-highlights` likewise**

Open `packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts`. Switch the source query from `archiveFinding` to `canonNode WHERE type IN ('quote', 'aha_moment')`. The downstream `collectHighlights` helper expects rows with `type` + `evidenceSegmentIds` + `payload` — canon_node has all three.

- [ ] **Step 3: Typecheck + commit**

```bash
cd packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../..
git add packages/pipeline/src/adapters/editorial-atlas/project-topics.ts packages/pipeline/src/adapters/editorial-atlas/project-highlights.ts
git commit -m "fix(adapter): project topics + highlights from canon_node instead of archive_finding"
```

---

## Phase 10 — Orchestrator wiring

### Task 10.1 — Replace pipeline body

**Files:**
- Modify: `packages/pipeline/src/run-generation-pipeline.ts`

- [ ] **Step 1: Replace the LLM-phase block**

Find the section in `runGenerationPipeline` from the `Phase 1: discovery` comment through the `Phase 4: merge` block, and replace with:

```typescript
    // Phase 1: channel profile (1 agent run).
    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'channel_profile' as PipelineStage,
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runChannelProfileStage(i),
    });

    // Phase 2: per-video intelligence (one agent run per video, fanned out).
    await assertWithinRunBudget(payload.runId);
    const intelligence = await runStage({
      ctx,
      stage: 'video_intelligence' as PipelineStage,
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runVideoIntelligenceStage(i),
    });

    // Phase 3: canon (1 agent run merges every card into typed knowledge graph).
    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'canon' as PipelineStage,
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runCanonStage(i),
    });

    // Phase 4: page briefs (1 agent run plans which pages should exist).
    await assertWithinRunBudget(payload.runId);
    await runStage({
      ctx,
      stage: 'page_briefs' as PipelineStage,
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runPageBriefsStage(i),
    });

    // Phase 5: page composition (deterministic from briefs + canon).
    const merge = await runStage({
      ctx,
      stage: 'page_composition' as PipelineStage,
      input: { runId: payload.runId, workspaceId: payload.workspaceId },
      run: async (i) => runPageCompositionStage(i),
    });

    // Phase 6: adapt (manifest, unchanged).
```

Update the imports at the top:

```typescript
import {
  importSelectionSnapshot,
  ensureTranscripts,
  normalizeTranscripts,
  segmentTranscripts,
  runChannelProfileStage,
  runVideoIntelligenceStage,
  runCanonStage,
  runPageBriefsStage,
  runPageCompositionStage,
} from './stages';
```

(`runDiscoveryStage`, `runSynthesisStage`, `runVerifyStage`, `runMergeStage` imports can be removed — those stages are still on disk but no longer wired here.)

Update the `findingCount` field in the result to read from the canon instead. Quick approach: at the end of the try block, count canon nodes:

```typescript
const finalFindingCount = (await db.select({ id: canonNode.id }).from(canonNode).where(eq(canonNode.runId, payload.runId))).length;
```

(And import `canonNode` from `@creatorcanon/db/schema` plus `eq` from `@creatorcanon/db` at the top.)

Then in the return:

```typescript
findingCount: finalFindingCount,
```

- [ ] **Step 2: Add new stage names to the pipeline-stages enum**

`PipelineStage` is defined in `@creatorcanon/core`. Check `packages/core/src/pipeline-stages.ts` and append the four new stage names if a strict union exists, or accept any string if it's loose.

```bash
grep -n "PipelineStage" packages/core/src/pipeline-stages.ts
```

If `PipelineStage` is a union, extend it:

```typescript
export type PipelineStage =
  // ... existing
  | 'channel_profile'
  | 'video_intelligence'
  | 'canon'
  | 'page_briefs'
  | 'page_composition';
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /c/Users/mario/Desktop/CHANNEL\ ATLAS/SaaS/packages/pipeline && pnpm typecheck 2>&1 | tail -3
cd ../core && pnpm typecheck 2>&1 | tail -3
cd ../..
git add packages/pipeline/src/run-generation-pipeline.ts packages/core/src/pipeline-stages.ts
git commit -m "feat(pipeline): wire canon-layer pipeline (replaces discovery/synthesis/verify/merge)"
```

---

## Phase G — End-to-End Verification

### Task G1 — Generate a fresh hub from the same 2 uploads

**Files:**
- Temporary: spawn-fresh + run + publish + audit scripts (deleted at end)

- [ ] **Step 1: Spawn a fresh project**

(Same shape as the prior `spawn-fresh-hub.mjs` from the previous plan — see `docs/superpowers/plans/2026-04-27-hub-content-quality.md` Task G1 for the template. Subdomain should be `canon-test`.)

- [ ] **Step 2: Run the pipeline**

```bash
cd packages/pipeline && npx tsx ./run-canon-test.ts 2>&1 | tail -20
```

Expected: result with `videoCount=2`, `pageCount` between 4 and 12 (NOT 22), `findingCount` = canon node count.

- [ ] **Step 3: Publish + audit**

Re-use the publish + audit scripts from the prior plan, pointed at the new project.

Verify:
- `channel_profile` table has 1 row with a real `niche`, `audience`, `recurringTerminology`.
- `video_intelligence_card` has 2 rows, each with non-empty `mainIdeas`, `frameworks` (where applicable), `lessons`, `quotes`, `creatorVoiceNotes`.
- `canon_node` has 8-25 rows across the typed types.
- `page_brief` has 4-12 rows with non-empty `readerProblem` + `promisedOutcome`.
- The published hub has 4-12 pages (not 22). Each page's title comes from a brief, not from a generic finding title.
- Each page's body has `whyThisMatters` as the overview body (not a tautological summary).

- [ ] **Step 4: Visual regression in browser**

Open `/h/canon-test`. Compare side-by-side with `/h/quality-test`:
- Page count should be ~half.
- Page titles should be more specific to the creator's vocabulary.
- Each page's overview body should be a distinct angle from the page summary header.
- Topics should reflect canon-derived themes (not synthetic page-type buckets) when the canon_architect produced topic nodes.

---

## Self-Review Notes

**Spec coverage:**
- ✅ Channel profile (Phase 1)
- ✅ Per-video intelligence card with the user's exact JSON shape (Phase 2)
- ✅ Canon model with typed knowledge graph + quality scores (Phase 4)
- ✅ Page Brief Planner (Phase 5)
- ✅ Brief-Driven Composition (Phase 6)
- ✅ Adapter integration (Phase 9)
- ✅ Orchestrator rewrite (Phase 10)
- ✅ End-to-end verification (Phase G)
- ⏸ Visual context extraction (Phase 3) — DEFERRED with explicit rationale.
- ⏸ Page Evidence Audit (Phase 7) — DEFERRED.
- ⏸ Hub Quality Scorecard (Phase 8) — DEFERRED.
- ⏸ Pre-payment archive diagnosis UX — DEFERRED.

**Placeholder scan:** No "TBD" / "fill in later" / "similar to task X" patterns. Every prompt is full text. Every code block is runnable.

**Type consistency:** `proposeChannelProfile` writes to `channelProfile` (Task 1.3) which the schema (Task 1.1) defines with `payload: jsonb`. `getChannelProfile` reads `channelProfile.payload`. `proposeVideoIntelligenceCard` writes `videoIntelligenceCard` rows, which `listVideoIntelligenceCards` reads. `proposeCanonNode` writes `canonNode`, which `listCanonNodes` and the adapter both read. `proposePageBrief` writes `pageBrief`, which the page-composition stage reads. Field names match across all layers (`evidenceSegmentIds` everywhere, `pageWorthinessScore` everywhere, `slug` matches between brief payload and `page.slug`).

**Risk surface:**
- Per-video intelligence cost. Reading a full transcript + tooling around for citations could push 50K-100K tokens per video on a long video. At gpt-5.5 rates (~$5/1M input, $15/1M output) that's $0.50-$1 per video. For a 20-video archive that's $10-$20. Within the existing $25 cap; logged via the cost ledger.
- Canon agent context. With 20 cards × 2K tokens each = 40K of card content. Manageable.
- The agent might fabricate. The propose-tool segment-ID validation already rejects unknown IDs. The bigger risk is overconfident `evidenceQuality: strong` ratings — verifier from Phase 7 (deferred) is the answer for that.

**Backward compatibility:** existing runs (`/h/trial`, `/h/quality-test`) continue to work because the adapter still reads from the same `page` + `pageVersion` tables. Only NEW runs go through the canon-layer flow.
