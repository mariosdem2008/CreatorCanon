# Multi-Agent Pipeline — v2 Design Spec

**Date:** 2026-04-26
**Status:** Draft (awaiting user sign-off)
**Owner:** Mario
**Scope target:** One implementation plan covering pipeline rebuild end-to-end. Editorial Atlas template already exists; this spec describes the engine that produces its data.
**Supersedes:** the LLM stages of `release_manifest_v0` (`synthesize_v0_review`, `draft_pages_v0`). Preserves the deterministic preprocessing layer.

---

## 1. Why this exists

The current pipeline produces hub content as **two sequential one-shot LLM calls**: a single archive-review call (`synthesize_v0_review`) and a single draft-pages call (`draft_pages_v0`). Both rely on prompt-engineered "anchor quotes" for grounding — the LLM is asked to cite, the pipeline tries to match the cited text back to a transcript segment, and when matching fails the citation is silently dropped. This is the brittlest part of the existing engine and the reason new templates can't be added without rewriting both prompts.

The new design replaces those two calls with **a network of specialized autonomous agents** whose grounding is structural rather than post-hoc: an agent literally cannot submit a finding without evidence, because the only way to record a finding is to call a tool that requires real `SegmentRef[]` IDs returned by other tools. Hallucinated citations stop being possible at the type-system level.

The output is a **template-agnostic intermediate** (the *Archive Knowledge Object*) that template-specific adapters then project into per-template manifests. Adding a new template no longer requires touching the engine.

## 2. Guiding principles

1. **Grounding is a property of the tool surface, not a verification phase.** Every `propose*` tool requires `evidence: SegmentRef[]`. Server-side validation rejects unknown segment IDs. There is no path for an agent to record a finding without a citation back to real source material.
2. **Each agent has one job.** Specialists are narrow. The list is meant to grow over time (new specialists for new content patterns). Adding one is a self-contained change.
3. **Deterministic where possible, agentic where it earns its keep.** Specialists are autonomous tool-using LLM agents because exploratory archive-wide work benefits from iteration. Mergers are typed functions with at most one or two LLM calls because they need to be predictable and cheap. The template adapter has no LLM at all because it's pure projection.
4. **Templates are projections, not products.** The pipeline produces the same `ArchiveKnowledgeObject` regardless of which template a hub will use. Per-template adapters select and reshape; they don't drive the engine.
5. **Cost-conscious by design.** Model assignments per specialist are listed explicitly. Specialists run once per archive (not per video) and use retrieval tools to read what they need. Mergers run per-page (parallel-friendly) with a single optional polish call. No autonomous loops in mergers or adapters.
6. **Reuse what works.** The transcription, normalization, and segmentation stages of the existing pipeline are kept as-is. The `generationRun` / `generationStageRun` harness, idempotency framework, R2 storage, and cost-ledger integration are kept as-is. Only the LLM stages are rebuilt.

## 3. Scope

### In scope
- New tables: `archive_finding`, `archive_relation`
- New per-template adapter framework (`packages/pipeline/src/adapters/`)
- New `editorial-atlas` adapter producing `editorial_atlas_v1` manifests
- One conditional 14th surface in the Editorial Atlas template (Highlights)
- Per-hub trust-block override via `hub.metadata` JSONB (additive schema change)
- Replacement of `synthesize_v0_review` and `draft_pages_v0` stages with the multi-agent run
- Tool surface (8 universal tools + 7 typed `propose*` tools + verification + relation tool)
- Stop conditions, budget caps, and observability for autonomous agent runs
- Migration gating — new pipeline runs only for hubs whose `hub.templateKey === 'editorial_atlas'`; existing hubs continue using the legacy stages until migrated

### Out of scope
- New transcription strategies (the existing `ensure_transcripts` / `audio-extraction` stays)
- New segmentation strategies (`segment_transcripts` stays)
- DB destructive cleanup (no TRUNCATE, no R2 deletion, no enum drops)
- Authenticated `/app` UI changes beyond what's needed to surface new run state
- Per-hub trust customization UI (the JSONB column lands; the editor UI is a later session)
- Real-time chat/RAG backend (the chat schema in `packages/pipeline/chat/` stays mock-only)
- Voice / audio overlays / multi-hub aggregation
- Removing legacy `release_manifest_v0` schema (it stays in service for non-migrated hubs)

## 4. Architecture

### 4.1 Layered model

Three layers, three different agent models:

```
Layer 1 — Specialists (autonomous LLM with tools)
   Run until they decide they're done OR budget cap hits.
   Tool surface enforces grounding by type.
   ↓
Layer 2 — Mergers (typed functions, ≤2 LLM calls each)
   Per-page parallel runs. No loops. Optional polish call.
   ↓
Layer 3 — Template Adapter (deterministic projection, no LLM)
   Per-template module. Selects, reshapes, writes manifest to R2.
```

### 4.2 The five phases

```
Phase 0 — Preprocessing  (DETERMINISTIC, kept from existing pipeline)
   import_selection_snapshot → ensure_transcripts → normalize_transcripts → segment_transcripts

Phase 1 — Discovery  (PARALLEL, autonomous specialists)
   topic_spotter ▪ framework_extractor ▪ lesson_extractor

Phase 2 — Synthesis  (PARALLEL, autonomous specialists; can read Phase 1 findings)
   playbook_extractor ▪ source_ranker ▪ quote_finder ▪ aha_moment_detector

Phase 3 — Verify  (single autonomous specialist, cheap model)
   citation_grounder

Phase 4 — Merge  (DETERMINISTIC + minimal LLM)
   page_composer (per page, parallel) ▪ evidence_aggregator (per archive)

Phase 5 — Adapt  (DETERMINISTIC, no LLM)
   template_adapter (one per template; routes by hub.templateKey)
```

Each phase is a `generationStageRun` row in the existing harness — the same idempotency, retry, cost-tracking, and run-status machinery applies.

### 4.3 The agents in detail

**Phase 1 — Discovery (3 specialists, run in parallel)**

| Agent | Job | Reads via tools | Writes via tools | Default model |
|---|---|---|---|---|
| `topic_spotter` | Find recurring teaching themes across the archive | listVideos, getVideoSummary, searchSegments | proposeTopic | Gemini 2.5 Flash |
| `framework_extractor` | Find named methods/frameworks (e.g. "Feynman Technique", "Eisenhower Matrix") | listVideos, getVideoSummary, searchSegments, listSegmentsForVideo | proposeFramework, proposeRelation (`related_to` between frameworks) | GPT-5.5 |
| `lesson_extractor` | Find self-contained lessons / mental models | listVideos, getVideoSummary, searchSegments, listSegmentsForVideo | proposeLesson, proposeRelation (`related_to` between lessons) | GPT-5.5 |

**Phase 2 — Synthesis (4 specialists, run in parallel; can read Phase 1 findings)**

| Agent | Job | Reads via tools | Writes via tools | Default model |
|---|---|---|---|---|
| `playbook_extractor` | Find end-to-end systems/workflows (often span multiple videos) | listFindings(topic\|framework\|lesson), searchSegments, listSegmentsForVideo | proposePlaybook, proposeRelation (`builds_on` → frameworks/lessons) | GPT-5.5 |
| `source_ranker` | For each topic, rank videos by relevance | listFindings(topic), listVideos, searchSegments | proposeSourceRanking | GPT-5.4 |
| `quote_finder` | Extract pull-quote-worthy moments anchored to existing findings | listFindings, searchSegments, getSegment | proposeQuote, proposeRelation (`supports` → finding it anchors) | GPT-5.5 |
| `aha_moment_detector` | Find insight moments that crystallize a finding | listFindings, searchSegments, getSegment | proposeAhaMoment, proposeRelation (`supports` → finding it anchors) | GPT-5.5 |

**Phase 3 — Verify (1 specialist)**

| Agent | Job | Reads | Writes | Default model |
|---|---|---|---|---|
| `citation_grounder` | Verify every finding's evidence is real, label evidenceQuality | listFindings, getSegment | markFindingEvidence | GPT-5.4 |

**Phase 4 — Merge (2 mergers, not autonomous)**

| Merger | Job | Pattern | Default model (if any) |
|---|---|---|---|
| `page_composer` | Map findings → pages with typed sections; compose Highlights orphans into a Highlights page | Per-page typed function; one LLM polish call when summary fails quality threshold | GPT-5.5 (polish only, conditional) |
| `evidence_aggregator` | Compute citationCount, sourceCoveragePercent, evidenceQuality per page | Per-archive deterministic function | none |

**Phase 5 — Adapt (1 adapter per template)**

| Adapter | Job | Pattern | Model |
|---|---|---|---|
| `editorial-atlas` | Project the merged page set + findings + relations + run/channel data into `EditorialAtlasManifest` | Pure projection function; reads DB, writes R2 JSON | none |

### 4.4 What we keep vs rebuild (concrete)

**Kept as-is:**
- `packages/pipeline/src/stages/import-selection-snapshot.ts`
- `packages/pipeline/src/stages/ensure-transcripts.ts` + `audio-extraction.ts`
- `packages/pipeline/src/stages/normalize-transcripts.ts`
- `packages/pipeline/src/stages/segment-transcripts.ts`
- `packages/pipeline/src/harness.ts` (the `runStage` framework with idempotency, inputHash, artifactR2Key)
- `packages/pipeline/src/contracts/artifacts.ts` for the v0 contract types (kept; legacy adapters still reference)
- `packages/cost-ledger/`
- DB tables: `channel`, `video`, `transcriptAsset`, `mediaAsset`, `normalizedTranscriptVersion`, `segment`, `generationRun`, `generationStageRun`, `release`, `hub`, `page`, `pageVersion`, `pageBlock`
- R2 + local-FS adapter pattern
- Trigger.dev worker dispatch (`apps/worker/src/`)

**Rebuilt:**
- `packages/pipeline/src/stages/synthesize-v0-review.ts` → replaced by Phase 1 specialists
- `packages/pipeline/src/stages/draft-pages-v0.ts` → replaced by Phase 1+2+4 (specialists discover, mergers compose)
- `packages/pipeline/src/run-generation-pipeline.ts` → orchestrator gains the new phases; legacy v0 stages become a fallback path gated by `hub.templateKey`

**Net new:**
- Tables: `archive_finding`, `archive_relation`
- Schema column: `hub.metadata` JSONB
- Module: `packages/pipeline/src/agents/` (specialists + mergers + tools + harness)
- Module: `packages/pipeline/src/adapters/editorial-atlas/`
- Schema: `manifest.highlights[]` field on `EditorialAtlasManifest` (additive)
- Route: `/h/[hubSlug]/highlights` (conditional in renderer)

## 5. Data model

### 5.1 New tables

#### `archive_finding`
Append-only. One row per finding produced by a specialist.

```ts
archive_finding {
  id              text PRIMARY KEY                     // generated server-side: 'fnd_<nanoid>'
  runId           text NOT NULL REFERENCES generationRun(id) ON DELETE CASCADE
  type            enum('topic','framework','lesson','playbook','quote','aha_moment','source_ranking') NOT NULL
  agent           text NOT NULL                        // canonical agent name, e.g. 'topic_spotter'
  model           text NOT NULL                        // model id used, e.g. 'gpt-5.5' | 'gemini-2.5-flash'
  payload         jsonb NOT NULL                       // typed by `type`, validated server-side via zod
  evidenceSegmentIds text[] NOT NULL DEFAULT '{}'      // denormalized for fast verifier queries; set [] for source_ranking
  evidenceQuality enum('strong','moderate','limited','unverified') NOT NULL DEFAULT 'unverified'
  costCents       integer DEFAULT 0
  durationMs      integer DEFAULT 0
  createdAt       timestamptz NOT NULL DEFAULT now()

  INDEX (runId, type)
  INDEX (runId, agent)
}
```

The `payload` shape per `type`:

```ts
// type='topic'
{ title: string; description: string; iconKey: string; accentColor: AccentColor; }

// type='framework'
{ title: string; summary: string; principles: { title; body; }[]; steps?: { title; body; }[]; }

// type='lesson'
{ title: string; summary: string; idea: string; }

// type='playbook'
{ title: string; summary: string; principles: { title; body; }[]; scenes?: { title; body; }[]; workflow?: { day; items: string[]; }[]; failurePoints?: { title; body; }[]; }

// type='quote'
{ text: string; attribution?: string; }

// type='aha_moment'
{ quote: string; context: string; attribution?: string; }

// type='source_ranking'
{ topicId: string; videoIds: string[]; }
```

Each payload variant is validated by a zod schema in `packages/pipeline/src/agents/schemas.ts` before insert.

#### `archive_relation`
Append-only. One row per relation between two findings.

```ts
archive_relation {
  id                  text PRIMARY KEY                 // 'rel_<nanoid>'
  runId               text NOT NULL REFERENCES generationRun(id) ON DELETE CASCADE
  agent               text NOT NULL
  model               text NOT NULL
  fromFindingId       text NOT NULL REFERENCES archive_finding(id) ON DELETE CASCADE
  toFindingId         text NOT NULL REFERENCES archive_finding(id) ON DELETE CASCADE
  type                enum('supports','builds_on','related_to','instance_of','contradicts') NOT NULL
  evidenceSegmentIds  text[] NOT NULL                   // why this relation holds; required, min 1
  notes               text
  createdAt           timestamptz NOT NULL DEFAULT now()

  INDEX (runId)
  INDEX (fromFindingId)
  INDEX (toFindingId)
}
```

### 5.2 Schema additions to existing tables

```sql
ALTER TABLE hub ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb NOT NULL;
```

`hub.metadata` is a freeform JSONB column. The trust-override path uses:

```ts
hub.metadata.trust = {
  methodologySummary?: string,
  qualityPrinciples?: { title: string; body: string }[],
  creationProcess?: { stepNumber: number; title: string; body: string }[],
  faq?: { question: string; answer: string }[],
}
```

If any field is set, the adapter uses it; otherwise it falls back to template defaults. The adapter does a **shallow merge** at the field level (a creator who only customizes `faq` keeps the default `methodologySummary`).

No migration of existing rows needed — the default is `'{}'`.

### 5.3 Provenance

Every `archive_finding` and `archive_relation` row carries `runId`, `agent`, and `model`. Mergers can attribute every page to the agents that contributed to it. The cost ledger aggregates per-agent costs from `archive_finding.costCents`.

## 6. Agent execution model

### 6.1 What "agent" means here

An agent is **an LLM in a tool-use loop, run server-side by the pipeline harness, with a fixed system prompt, a typed tool surface, and bounded execution.** It is *not* a long-running daemon; each agent run is a single stage execution that opens, completes, and closes. Reruns are idempotent at the stage level (via `inputHash`) but each run produces a fresh batch of findings.

### 6.2 Tool-use loop

```
1. Harness builds:
   - System prompt (specialist-specific)
   - User message with bootstrap context (channel info, video count, list of video titles, any prior-phase findings)
   - Tool schemas (universal + specialist's propose tool + relation tool)

2. Harness sends to provider (OpenAI or Gemini), receives tool calls.

3. For each tool call: harness executes the tool, returns the result.

4. Repeat (steps 2–3) until:
   - Provider returns a message with no tool calls (agent's done signal), OR
   - Budget cap hits (max calls, max cost, max wall time)

5. Harness records:
   - All findings/relations the agent produced (already inserted by tool calls)
   - Total cost, duration, call count
   - Provider transcript (compressed, stored as artifactR2Key)
   - Stage status (succeeded | failed)
```

### 6.3 Stop conditions

Three caps, all enforced by the harness:

| Cap | Default value | Override path |
|---|---|---|
| Max tool calls per agent run | 30 | Per-specialist override in agent registry |
| Max cost per agent run (cents) | 500 (= $5) | Per-specialist override |
| Max wall-clock time per agent run | 10 min | Per-specialist override |

When a cap approaches (e.g. 90% of max calls), the harness injects a system message: *"You have N calls remaining. Submit your final findings or wrap up."* When a cap is hit hard, the loop terminates and the stage is marked `succeeded` if any findings were recorded, `failed` otherwise.

### 6.4 Concurrent execution

- Within a phase, specialists run concurrently. Each opens its own DB transaction for tool calls.
- Across phases, execution is sequential (Phase 1 fully completes before Phase 2 starts).
- The harness uses Trigger.dev's `triggerAndWait` for parallel fan-out within a phase.
- Idempotency: each agent's `inputHash` is `{ runId, agent }`; a re-run of the same stage with the same inputs is a no-op.

## 7. Tool surface

All tools are typed with zod schemas. The harness wires zod → OpenAI/Gemini function-calling JSON schemas automatically.

### 7.1 Universal read tools (every specialist)

```ts
listVideos(): VideoSummary[]
  // Returns array of { id, title, durationSec, publishedAt, thumbnailUrl }
  // Cap: returns ALL videos in this run's selection set (typically 50–500).
  // Cost: cached query; effectively free.

getVideoSummary(videoId: string): { title; summary?; durationSec; segmentCount; }
  // If pre-computed summary exists, returns it; otherwise null summary.
  // Used by agents to decide whether to dive deeper.

searchSegments(query: string, opts?: {
  videoIds?: string[];      // restrict to subset
  topK?: number;            // default 20, max 50
}): SegmentMatch[]
  // SegmentMatch = { segmentId, videoId, startMs, endMs, text, score }
  // Hybrid: BM25 + (when vector index ready) cosine similarity over segment embeddings.
  // The agent's primary discovery tool.

listSegmentsForVideo(videoId: string, range?: { startSec; endSec }): Segment[]
  // Pulls one video's segments, optionally trimmed by time range.
  // Used after searchSegments narrows interest.
  // Cap: max 200 segments per call (longer videos return only the requested range).

getSegment(segmentId: string): Segment
  // Full text + timestamps for one segment. Used to verify or quote precisely.
```

### 7.2 Phase 2+ read tool

```ts
listFindings(type: FindingType, filter?: {
  agent?: string;
  evidenceQuality?: EvidenceQuality;
}): Finding[]
  // Returns findings of the requested type from prior phases of this run.
  // Phase 2 specialists read Phase 1's output via this tool.
  // Cap: returns all matching rows. Most archives produce <50 findings per type.
```

### 7.3 Per-specialist `propose*` tools

Each specialist is given **exactly one** propose tool. Calling it inserts an `archive_finding` row with the calling agent + model recorded server-side. Server validates that all `evidence` segment IDs exist in this run's segment table; on failure, the tool returns `{ ok: false, error: "Unknown segment ID: seg_xxx. Use searchSegments to find valid IDs." }` and the agent must retry.

```ts
// topic_spotter
proposeTopic(input: {
  title: string;            // 2–60 chars
  description: string;      // 1–280 chars
  iconKey: 'productivity'|'learning'|'writing'|'career'|'systems'|'mindset'|'habits'|'growth'|'general';
  accentColor: 'mint'|'peach'|'lilac'|'rose'|'blue'|'amber'|'sage'|'slate';
  evidence: SegmentRef[];   // min 1, max 20
}): { ok: true; findingId: string } | { ok: false; error: string }

// framework_extractor
proposeFramework(input: {
  title: string;
  summary: string;
  principles: { title: string; body: string }[];   // min 1
  steps?: { title: string; body: string }[];
  evidence: SegmentRef[];   // min 2
}): { ok: true; findingId } | { ok: false; error }

// lesson_extractor
proposeLesson(input: {
  title: string;
  summary: string;
  idea: string;             // the actual mental model in one paragraph
  evidence: SegmentRef[];   // min 1
}): { ok: true; findingId } | { ok: false; error }

// playbook_extractor
proposePlaybook(input: {
  title: string;
  summary: string;
  principles: { title: string; body: string }[];
  scenes?: { title: string; body: string }[];
  workflow?: { day: string; items: string[] }[];
  failurePoints?: { title: string; body: string }[];
  evidence: SegmentRef[];   // min 3 (playbooks span teaching)
  buildsOnFindingIds?: string[];  // optional; if set, harness creates implicit `builds_on` relations
}): { ok: true; findingId } | { ok: false; error }

// quote_finder
proposeQuote(input: {
  text: string;             // 10–280 chars
  attribution?: string;
  evidence: SegmentRef;     // exactly one segment
}): { ok: true; findingId } | { ok: false; error }

// aha_moment_detector
proposeAhaMoment(input: {
  quote: string;            // 10–280 chars
  context: string;          // why this is an "aha" — 1 paragraph
  attribution?: string;
  evidence: SegmentRef;
}): { ok: true; findingId } | { ok: false; error }

// source_ranker
proposeSourceRanking(input: {
  topicFindingId: string;   // FK to a topic finding
  videoIds: string[];       // ranked, most-relevant first
}): { ok: true; findingId } | { ok: false; error }
```

`SegmentRef = { segmentId: string }` (start/end times derived server-side from the segment row).

### 7.4 Universal `proposeRelation` tool (every specialist)

```ts
proposeRelation(input: {
  fromFindingId: string;          // any prior finding ID this run produced
  toFindingId: string;
  type: 'supports'|'builds_on'|'related_to'|'instance_of'|'contradicts';
  evidence: SegmentRef[];         // min 1; the segments that make this relation hold
  notes?: string;                 // optional 1-line rationale
}): { ok: true; relationId: string } | { ok: false; error: string }
```

Server validates that both finding IDs exist and belong to this run.

### 7.5 Phase 3 verification tool (citation_grounder only)

```ts
markFindingEvidence(input: {
  findingId: string;
  verdict: 'strong'|'moderate'|'limited';
  notes?: string;
}): { ok: true } | { ok: false; error }
```

Strong/moderate/limited rules:
- `strong` — every claim in the finding is supported by ≥1 segment from ≥2 distinct videos
- `moderate` — every claim is supported by ≥1 segment, but from a single video, OR claims are mostly supported but one is weak
- `limited` — at least one claim has no supporting segment OR evidence is from one offhand mention

### 7.6 Tool implementation notes

- All tools live in `packages/pipeline/src/agents/tools/`. Each tool is a typed function `(input, ctx) => result` where `ctx` carries `{ runId, db, r2 }`.
- The tool registry maps tool name → handler + zod schema. The harness uses this registry to (a) build the OpenAI/Gemini function specs and (b) dispatch tool calls.
- Tool calls are logged to `archive_finding.payload.toolCalls` for the agent's run-summary record. (Discussion: store tool calls as a separate `agent_tool_call` table; deferred — see § 18.)

## 8. Run lifecycle

Each phase is a `generationStageRun` row. The same retry/idempotency machinery as today.

### 8.1 Stage breakdown

| Phase | Stage row name | Inputs (artifacts/queries) | Outputs |
|---|---|---|---|
| 0 | `import_selection_snapshot` | videoSet → DB | snapshot JSON to R2 |
| 0 | `ensure_transcripts` | video IDs | `transcriptAsset` rows + VTT in R2 |
| 0 | `normalize_transcripts` | VTT files | `normalizedTranscriptVersion` rows |
| 0 | `segment_transcripts` | normalized | `segment` rows (8–60s chunks) |
| 1 | `discovery` | segments + videos | N `archive_finding` rows (types: topic, framework, lesson) |
| 2 | `synthesis` | findings + segments | N `archive_finding` rows (types: playbook, quote, aha_moment, source_ranking) |
| 3 | `verify` | findings | `evidenceQuality` updated on each finding |
| 4 | `merge` | findings + relations | `page` + `pageVersion` rows |
| 5 | `adapt` | pages + findings + relations | `EditorialAtlasManifest` JSON to R2 + `release.manifestR2Key` |

The orchestrator (`runGenerationPipeline`) gains a switch on `hub.templateKey`:
- `editorial_atlas` → run new phases (discovery → synthesis → verify → merge → adapt)
- legacy / unset → run old `synthesize_v0_review` → `draft_pages_v0` → `publish_run_as_hub` (existing path; untouched)

### 8.2 Artifacts per stage

- All stages write a summary artifact to R2 at `runs/{runId}/stage/{stageName}/summary.json` (cost, count of findings produced, agent transcripts).
- Phase 1+2 stages additionally write per-agent transcripts to `runs/{runId}/stage/{stageName}/agents/{agentName}/transcript.json` for debugging.

### 8.3 Idempotency + retries

- `inputHash` per stage is computed from a stage-specific function:
  - Phase 1/2/3: `hash({ runId, agent, model, promptVersion })`
  - Phase 4: `hash({ runId, findingsCount, relationsCount })` (so a re-run with new findings recomposes; same findings yield same pages)
  - Phase 5: `hash({ runId, templateKey, pagesCount })`
- Same inputHash + previously-succeeded stage = no-op. Different inputHash = full re-run.
- Retries on transient failure (rate limit, network) handled by the existing harness with exponential backoff; max 3 retries.

## 9. Model assignments

### 9.1 Per-specialist model

| Specialist | Default model | Reason | Fallback chain |
|---|---|---|---|
| `topic_spotter` | Gemini 2.5 Flash | High-volume reads; long context cheap | GPT-5.4 → GPT-5.5 |
| `framework_extractor` | GPT-5.5 | Pattern recognition, false positives expensive | GPT-5.4 → Gemini 2.5 Pro |
| `lesson_extractor` | GPT-5.5 | Recognize self-contained ideas | GPT-5.4 → Gemini 2.5 Pro |
| `playbook_extractor` | GPT-5.5 | Hardest task; cross-video synthesis | GPT-5.4 (degraded but acceptable) |
| `source_ranker` | GPT-5.4 | Cheap ranking task | Gemini 2.5 Flash |
| `quote_finder` | GPT-5.5 | Aesthetic judgment matters | GPT-5.4 |
| `aha_moment_detector` | GPT-5.5 | Aesthetic judgment matters | GPT-5.4 |
| `citation_grounder` | GPT-5.4 | Mostly mechanical (string match + segment lookup) | Gemini 2.5 Flash |
| `page_composer` (polish call only) | GPT-5.5 | Quality of polished prose matters | GPT-5.4 |

Model IDs are **environment-configurable** per agent via:
```
PIPELINE_MODEL_TOPIC_SPOTTER=gemini-2.5-flash
PIPELINE_MODEL_FRAMEWORK_EXTRACTOR=gpt-5.5
...
```
This lets us hot-swap models without code changes when a new model lands or a price drops.

### 9.2 Fallback behavior

If a model returns a transient error (rate limit, 5xx) the harness retries the same model up to 3 times with backoff. If a hard error persists (model deprecation, auth), the harness falls back to the next model in the chain and logs a warning. If the entire chain fails, the stage fails.

### 9.3 Cost forecast (approximate, per hub run, 200-video archive)

| Phase | Cost estimate |
|---|---|
| Phase 0 (preprocessing) | ~$0.50 (transcription dominated; only when timedtext fails and Whisper kicks in) |
| Phase 1 (3 specialists × ~30 calls × ~50KB context) | ~$3–5 |
| Phase 2 (4 specialists × ~25 calls) | ~$4–6 |
| Phase 3 (citation_grounder) | ~$1 |
| Phase 4 (polish on ~10 of ~20 pages) | ~$1–2 |
| Phase 5 (adapter) | $0 |
| **Total** | **~$10–15 per hub generation** |

Compare: existing pipeline ~$1–3 per hub. Trade-off explicit: 5–10× cost for grounded, multi-template-ready output.

## 10. Mergers

### 10.1 `page_composer`

**Pattern:** Per-page typed function. One run per finding-that-becomes-a-page. Runs in parallel across pages within the merge stage.

**Inputs:** one finding (the "primary" finding for this page) + supporting findings/relations + segments + videos.

**Output:** one `page` row + one `pageVersion` row.

**Composition rules per finding type:**

| Finding type | Page type | Sections (in order) |
|---|---|---|
| `lesson` | lesson | `overview` ← summary · `paragraph` ← idea · `quote` (if `aha_moment` related) · `quote` (if `quote` related) · `paragraph` (closing if any unattached relation notes) |
| `framework` | framework | `overview` ← summary · `principles` ← principles[] · `steps` (if non-empty) · `common_mistakes` (from `contradicts` relations, if any) · `callout` tone=note (if evidenceQuality !== 'strong') |
| `playbook` | playbook | `overview` · `principles` · `scenes` · `workflow` (if non-empty) · `failure_points` (if non-empty) · `paragraph` (related-frameworks summary if `builds_on` relations exist) |

**Highlights handling:**
- `aha_moment` and `quote` findings are NOT promoted to their own pages.
- The composer first attempts to embed each into its most-related lesson/framework/playbook page (via `supports` relations).
- If a `quote` or `aha_moment` has no `supports` relation, OR its target page doesn't exist (filtered out), it's collected into a separate **Highlights** virtual page.

**Dedup rule for same concept appearing as both lesson and framework:**
- Detect: a `framework` and a `lesson` finding share ≥50% of evidence segments AND have title cosine similarity ≥0.85.
- Action: keep the `framework` finding, delete the `lesson` finding's would-be page, and convert the lesson into a `supports` relation pointing at the framework. Logged for telemetry.

**Polish call (conditional):**
- Compute summary quality score: `summaryWordCount / 25 + 0.5 * (hasFullSentence ? 1 : 0)`.
- If score < 0.8 OR summary < 100 chars OR summary > 600 chars, call GPT-5.5 with the finding's payload + a polish prompt. Replace `pageVersion.summary` with the LLM output.
- Otherwise, use the finding's `summary` as-is.
- Cost cap: $0.30 per page polish; if exceeded, fall back to deterministic.

**Hero illustration selection (deterministic):**
- `lesson` → `open-notebook`
- `framework` → `desk`
- `playbook` → `desk` if any workflow section, else `books`
- Override per finding type by hashing the finding ID into the 4 illustration keys (so adjacent pages don't all show the same illustration).

**Topic mapping:**
- A page's `topicSlugs` are the topic findings whose evidence segments overlap with the page's evidence segments by ≥1 shared segment.

**Related pages:**
- Computed deterministically post-composition via `evidence_aggregator` (see below).

### 10.2 `evidence_aggregator`

**Pattern:** Per-archive deterministic function. No LLM.

**Inputs:** all pages + findings + relations + citations for the run.

**Outputs (writes back to `pageVersion`):**
- `citationCount` = unique segment IDs cited in the page's sections
- `sourceCoveragePercent` = (sections with ≥1 citation) / (total sections), in [0, 1]
- `evidenceQuality` = max-of-finding evidenceQuality across the page's primary + supporting findings:
  - all `strong` → `strong`
  - any `limited` → `limited`
  - else → `moderate`
- `relatedPageIds` (also written back to pageVersion) = pages whose primary finding is connected to this page's primary finding via `supports` / `builds_on` / `related_to` edges (transitive depth = 1), sorted by edge weight = (count of shared evidence segments).

## 11. Template adapter

### 11.1 Location

```
packages/pipeline/src/adapters/
  index.ts                                // adapter registry: templateKey → adapter function
  editorial-atlas/
    index.ts                              // entry: adaptArchiveToEditorialAtlas(input): EditorialAtlasManifest
    project-creator.ts                    // build manifest.creator from channel row
    project-stats.ts                      // build manifest.stats from videos + findings
    project-topics.ts                     // findings(type='topic') → manifest.topics[]
    project-pages.ts                      // pages → manifest.pages[]
    project-sources.ts                    // distinct cited videos → manifest.sources[] (key moments via segments)
    project-navigation.ts                 // static nav constants (with conditional Highlights nav item)
    project-trust.ts                      // hub.metadata.trust shallow-merge with defaults
    project-highlights.ts                 // orphan aha_moments + quotes → manifest.highlights[]
    constants.ts                          // template defaults (trust block, navigation)
```

The adapter registry:
```ts
export const ADAPTERS: Record<string, AdapterFn> = {
  editorial_atlas: adaptArchiveToEditorialAtlas,
  // future: playbook_os: adaptArchiveToPlaybookOS,
};
```

### 11.2 Field-by-field projection (Editorial Atlas)

| Manifest field | Source |
|---|---|
| `schemaVersion` | constant `'editorial_atlas_v1'` |
| `templateKey` | constant `'editorial_atlas'` |
| `hubId, releaseId, hubSlug` | run/release/hub rows |
| `visibility` | `hub.accessMode === 'public' ? 'public' : 'unlisted'` |
| `publishedAt, generatedAt` | release row |
| `title` | `project.title` |
| `tagline` | `hub.metadata.tagline ?? template constant` |
| `creator.{name, handle, avatarUrl, bio, youtubeChannelUrl}` | `channel` row |
| `stats.videoCount` | distinct videos in run |
| `stats.sourceCount` | distinct cited videos across all pages |
| `stats.transcriptPercent` | `(videos with canonical transcript) / videoCount` |
| `stats.archiveYears` | `(MAX(video.publishedAt) - MIN(video.publishedAt)) / 1y`, rounded 1 decimal |
| `stats.pageCount` | `pages.length` |
| `topics[]` | findings(type='topic'), with `pageCount` backfilled from page→topic mapping |
| `pages[]` | composed pages, ordered by primary topic frequency desc, then evidenceQuality desc |
| `sources[]` | distinct cited videos. `keyMoments[]` populated from segments referenced by relations of type `supports` or `builds_on` pointing to this video. If no relations, empty (template tolerates) |
| `navigation.primary` | template constant; conditionally includes `Highlights` if `manifest.highlights[].length > 0` |
| `navigation.secondary` | template constant |
| `trust.*` | `shallowMerge(template defaults, hub.metadata.trust ?? {})` |
| `highlights[]` | orphan `aha_moment` and `quote` findings (those without `supports` to a published page), each with its evidence segment + source video reference |

### 11.3 The Highlights conditional surface

A new 14th surface in the Editorial Atlas template:

**Schema change to `EditorialAtlasManifest`:**
```ts
manifest.highlights?: Highlight[]

Highlight = {
  id: string
  type: 'aha_moment' | 'quote'
  text: string                 // the quote or aha-moment quote
  context?: string             // for aha_moment, the "why this is an aha" line
  attribution?: string
  evidence: { sourceVideoId: string; timestampStart: number; timestampLabel: string; }
}
```

**Renderer change:**
- New route: `apps/web/src/app/h/[hubSlug]/highlights/page.tsx`
- New nav item in `HubSidebar` — conditional on `manifest.highlights[].length > 0`
- Page layout: simple list grouped by source video, with embedded YouTube timestamp links
- Treat as a "found while reading" surface — not a primary nav destination

**Adapter rule:** if `manifest.highlights` is empty or absent, the renderer hides the nav item entirely (no empty page).

### 11.4 Versioning + legacy

- `editorial_atlas_v1` is the schema we already have. The new adapter writes it.
- Bumping to `editorial_atlas_v2` later (e.g. to add a new surface) requires both: schema change + adapter change + renderer change. They release together.
- The legacy `release_manifest_v0` schema stays in place. The legacy `synthesize_v0_review` and `draft_pages_v0` stages stay in place. Hubs without `hub.templateKey === 'editorial_atlas'` continue using them.
- Migration of an existing hub to the new template: set `hub.templateKey = 'editorial_atlas'`, kick a new generation run, the new pipeline runs; old releases (still tied to old releases) keep rendering until the new release supersedes them.

## 12. Trust block authorship

### 12.1 Defaults

`packages/pipeline/src/adapters/editorial-atlas/constants.ts` exports:
```ts
export const DEFAULT_TRUST_BLOCK = {
  methodologySummary: '...',  // template-default copy from the existing mock
  qualityPrinciples: [
    { title: 'Source-backed', body: '...' },
    { title: 'Continuously updated', body: '...' },
    { title: 'Made for learners', body: '...' },
    { title: 'Editor reviewed', body: '...' },
  ],
  creationProcess: [
    { stepNumber: 1, title: 'Index videos', body: '...' },
    // ... 5 steps
  ],
  faq: [
    // ... 5 default Q&As
  ],
};
```

### 12.2 Override path

Adapter reads `hub.metadata.trust ?? {}` and shallow-merges per top-level key:
```ts
const trustBlock = {
  methodologySummary: hubTrust?.methodologySummary ?? DEFAULT_TRUST_BLOCK.methodologySummary,
  qualityPrinciples: hubTrust?.qualityPrinciples ?? DEFAULT_TRUST_BLOCK.qualityPrinciples,
  creationProcess: hubTrust?.creationProcess ?? DEFAULT_TRUST_BLOCK.creationProcess,
  faq: hubTrust?.faq ?? DEFAULT_TRUST_BLOCK.faq,
};
```

This means a creator who customizes only `faq` keeps the default methodology summary + principles + process. A future editor UI in `/app/configure/trust` writes to `hub.metadata.trust` directly.

## 13. What we keep from the existing pipeline

- **Transcription ingest** (`ensure_transcripts.ts`, `audio-extraction.ts`) — unchanged
- **Normalization** (`normalize_transcripts.ts`) — unchanged
- **Segmentation** (`segment_transcripts.ts`) — unchanged
- **Run / stage harness** (`harness.ts`, `runStage`) — unchanged. The new agent stages register as new stage names (`discovery`, `synthesis`, `verify`, `merge`, `adapt`) and use the same `inputHash` / artifact-key pattern.
- **R2 + local-FS storage adapter** — unchanged
- **Cost-ledger integration** — unchanged
- **Trigger.dev worker dispatch** — unchanged. New stages dispatch the same way; the harness handles parallelism within a phase.
- **Existing DB schema** — unchanged
- **Legacy `release_manifest_v0` schema + legacy stages** — kept on disk; gated by `hub.templateKey`

## 14. What's deprecated / replaced

- `synthesize_v0_review.ts` → replaced by Phase 1 specialists. Stays on disk for legacy hubs until all hubs are migrated; then deletable.
- `draft_pages_v0.ts` → replaced by Phase 1+2+4 (specialists + page_composer). Stays on disk for legacy hubs; deletable when migrated.
- `publish_run_as_hub.ts` for `editorial_atlas` template → replaced by Phase 5 adapter. The legacy publish path stays for non-Editorial-Atlas hubs.

## 15. Migration

- New hubs (created after this lands) default to `hub.templateKey = 'editorial_atlas'` and use the new pipeline.
- Existing hubs without `templateKey` continue using the legacy pipeline. No automatic migration.
- A small `/app/configure` toggle (one boolean per hub, "Use Editorial Atlas") flips `hub.templateKey` on next generation run. Out of scope for this spec; tracked as a follow-up UI ticket.

## 16. Performance and cost

### 16.1 Latency expectations

Per hub generation (200-video archive):
- Phase 0 (preprocessing): 5–30 min (dominated by transcription if Whisper kicks in)
- Phase 1 (3 specialists in parallel): 2–5 min (longest specialist gates the phase)
- Phase 2 (4 specialists in parallel): 2–5 min
- Phase 3 (citation_grounder): 30s–2 min
- Phase 4 (page_composer × ~20 pages parallel + evidence_aggregator): 30s–2 min
- Phase 5 (adapter): <5s
- **Total: ~10–45 min** (vs. ~5–20 min today; dominated by added LLM round-trips)

### 16.2 Concurrency limits

- Within Phase 1/2: hard cap of 4 concurrent agent runs (avoid OpenAI tier-1 rate-limit issues).
- Within Phase 4: `page_composer` parallelism is `min(8, pageCount)`.
- Across hubs: pipeline-wide concurrency cap is configured per Trigger.dev queue; not in scope for this spec.

### 16.3 Cost ceiling

Per-run hard cap (in the harness): $25. If total cost on `archive_finding.costCents` aggregated for the run exceeds this, the next stage refuses to start and the run is marked `failed_budget`.

## 17. Observability

- **Structured logs** — every tool call, every model response, every stage status — emitted to the existing log stream with `runId`, `agent`, `stage` fields.
- **Sentry** — agent transcripts (compressed) attached to any failed-stage error. PII-stripped.
- **Cost dashboard** — per-stage and per-agent cost rolled up from `archive_finding.costCents`. Visible in `/admin/runs/[runId]` (existing route — we removed admin in the previous session for the template work but it can come back here as a thin debug surface; out of scope for this spec).
- **Run inspector** — `pnpm inspect:run --runId <id>` CLI prints the full timeline: phase durations, per-agent cost, finding counts by type, evidence quality histogram.

## 18. Risks and open questions

1. **Vector index for `searchSegments`.** The current pipeline doesn't compute segment embeddings. The new tool surface assumes hybrid BM25 + vector search. v1 could ship BM25-only (~80% of the value). Adding embeddings is an additive optimization later — flagged.
2. **Tool-call audit trail.** This spec records findings but not the full tool-call sequence per agent (only a compressed transcript artifact). If we need replay/debug at the call-by-call level, we'll add an `agent_tool_call` table. Deferred until we observe a bug class that needs it.
3. **Concept dedup beyond lesson↔framework.** The composer dedups same concept across lesson + framework. It does NOT dedup framework↔framework or lesson↔lesson (e.g. "Pomodoro Technique" found twice with different evidence). For v1, we accept some duplication; v2 adds finding-level dedup driven by evidence-overlap heuristics.
4. **Provider failover.** If GPT-5.5 is down, we fall back to GPT-5.4 (same provider). If OpenAI is fully out, we don't fall back to Gemini *within a single agent run* — that requires translating tool schemas across providers, which is fragile. We fail the stage and require manual restart. Acceptable for an alpha-scale pipeline.
5. **Highlights surface emptiness.** If most aha_moments and quotes successfully embed in related pages, the Highlights surface might be empty for most hubs. The renderer hides the nav item when empty, but we should revisit whether the surface earns its keep after observing real archives.
6. **Cost overrun on rich archives.** A 1000-video archive could blow past the $25 cap. Cost forecasts in § 9.3 are for 200-video archives. If a creator has a 10-year channel, we'll need to either tighten budget caps per agent or accept higher per-hub spend.
7. **GPT-5.5 / GPT-5.4 pricing.** Spec assumes pricing at the time of writing (Jan 2026 knowledge cutoff). At implementation time we'll plug exact prices into the cost-ledger and adjust forecasts. If GPT-5.5 turns out costlier than expected, fall back to GPT-5.4 for the high-volume specialists (lesson_extractor, framework_extractor) is straightforward.

## 19. Definition of done

A run kicked from `/app/projects/[id]` for a hub with `templateKey = 'editorial_atlas'` can:

1. Complete all 5 phases without manual intervention on a 50-video reference archive.
2. Produce ≥10 `archive_finding` rows across all types (topic + framework + lesson + playbook), with `evidenceQuality` populated.
3. Produce ≥5 `archive_relation` rows.
4. Produce ≥8 published pages, each with at least one citation, each rendering correctly in the existing Editorial Atlas template.
5. Produce a Highlights surface only if there are orphan aha_moments/quotes; otherwise hide the nav.
6. Stay under $20 total run cost.
7. Be re-runnable idempotently (running the stage twice = no extra findings, same manifest).
8. Be parsable: the final R2 manifest passes `editorialAtlasManifestSchema.safeParse()` with `success: true`.
9. Pass typecheck + lint + the existing `node:test` suite.
10. Have at least one e2e smoke test that runs Phase 0–5 against a fixture set of 5 pre-seeded videos with pre-seeded transcripts (no real LLM calls — the smoke test mocks model responses) and asserts the output schema.
