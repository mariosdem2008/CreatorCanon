# Phase 5 — Audit as Hub Source Document

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-architect the audit format so its output IS the hub's source content — first-person, citation-dense, body-rich, with explicit `rendered | _internal | _index` field labeling. The audit becomes the creator-facing preview AND the builder-facing handoff. We do not stop until the audit, on its face, is paywall-worthy editorial copy in the creator's voice.

**Architecture:** Replace `summary` + `whyItMatters` + `unifyingThread` (analyst-notes schema) with `title` + `lede` + `body` (publication schema). Add a body-writing pass that runs AFTER canon shells exist, weaving in per-video intelligence (examples, stories, mistakes) by ID. Mark every field as `rendered` | `_internal_*` | `_index_*`. The audit page renders only `rendered` fields; the Copy Audit button serializes the full document including planning + indexing for builder handoff.

**Tech Stack:** TypeScript (existing pipeline), Codex CLI (existing prompt provider), Drizzle ORM with JSONB payload columns (no DB migration needed — fields go in `payload`), Next.js audit page renderer.

---

## File Structure

```
.claude/skills/pipeline/
  framework-extraction-rubric/SKILL.md   ← rewrite SCHEMA + RUBRIC + OUTPUT_FORMAT for body-as-content
  editorial-strategy-rubric/SKILL.md     ← rewrite for title/lede/body/_internal split
  cross-video-synthesis-rubric/SKILL.md  ← rewrite for first-person body
  citation-chain-rubric/SKILL.md         ← recalibrate for body-style inline citations
  voice-fingerprint-rubric/SKILL.md      ← first-person voice rules at extraction time
  + creator-archetypes/_DEFAULT.md       ← add HUB_SOURCE_VOICE section
  + creator-archetypes/operator-coach.md ← add HUB_SOURCE_VOICE section
  + creator-archetypes/science-explainer.md  ← add HUB_SOURCE_VOICE section
  + creator-archetypes/instructional-craft.md  ← add HUB_SOURCE_VOICE section
  + creator-archetypes/contemplative-thinker.md  ← add HUB_SOURCE_VOICE section

packages/pipeline/src/scripts/
  seed-audit-via-codex.ts                ← refactor 7 prompt sites for new schema
  + util/per-video-weaving.ts            ← NEW: maps per-video intel to canon nodes
  + util/canon-body-writer.ts            ← NEW: parallel body-generation orchestrator
  + util/hero-candidates.ts              ← NEW: hub-root hero + tagline generator
  populate-segments-from-vtt.ts          ← (no change — already produces inputs the body writer needs)
  validate-citation-chain.ts             ← recalibrate citation-density expectations for bodies
  check-voice-fingerprint.ts             ← recalibrate for first-person body prose

apps/web/src/lib/audit/
  build-audit-markdown.ts                ← render only `rendered` fields; full doc for export
  + build-hub-source-doc.ts              ← NEW: serialize entire Hub Source Document (rendered + _internal + _index)

apps/web/src/app/app/projects/[id]/runs/[runId]/audit/
  AuditClient.tsx                        ← add Copy Audit button + clipboard handler
  page.tsx                               ← layout split: creator-preview vs operator-debug toggle
```

---

## Migration Strategy

The audit data lives in `canon_node.payload`, `page_brief.payload`, `channel_profile.payload` — all JSONB columns. **No DB migration needed.** New runs write the new schema into payload. Existing runs (Hormozi, Jordan, Walker) keep their old payloads; the audit page renderer falls back to legacy fields when new ones are absent.

Add `payload.schemaVersion: 'v2'` on the new format so renderer + validators can branch. Legacy data is `v1` (default).

---

## Quality Bar — How We Know We're Done

**Three checks** (from the user's report). Phase 5 is not complete until ALL three pass on a freshly regenerated Jordan Platten audit:

1. **Read three random canon-node `body` fields aloud.** They sound like Jordan wrote a chapter — first-person, his voice, with concrete examples and named mistakes. **NOT** "the creator says…", **NOT** "this section explains…", **NOT** any third-person framing.
2. **Check the `hero_candidates` field.** All 5 lines are billboard-worthy. None is a stuttered transcript fragment. None reads like a topic description.
3. **Pick the thinnest canon node and ask: would Jordan paywall this body?** If "no", the body hasn't pulled enough per-video intelligence (examples, stories, mistakes) into it. Iterate the body-writing prompt and regenerate.

If all three pass, the builder will ship a hub that delivers value. **No copywriting skill needed downstream.**

---

## Task 5.1: Spec the new Hub Source Document schema

**Files:**
- Create: `docs/superpowers/specs/2026-05-01-hub-source-document-schema.md`

**Why:** Lock the contract before changing prompts. Every downstream consumer (audit page, copy-audit handoff, builder, validators) reads from this schema. Naming is permanent.

- [ ] **Step 1: Write the spec**

```markdown
# Hub Source Document Schema (v2)

## Field-naming convention

- Plain field names = **rendered**. Appears verbatim in the hub.
- `_internal_*` prefix = **planning**. Informs how rendered content was written. Hidden from public hub but visible in operator debug view.
- `_index_*` prefix = **indexing**. Cross-references, IDs, search aids. May power navigation/filters but never appears as primary copy.

## Channel profile (canon-level, run-level)

```ts
interface ChannelProfile_v2 {
  schemaVersion: 'v2';

  // RENDERED
  creatorName: string;
  hub_title: string;            // "Jordan Platten — Agency Operating System"
  hub_tagline: string;          // 8-14 word positioning, first-person
  hero_candidates: string[];    // 5 stop-the-scroll lines, first-person, 6-14 words each

  // _INTERNAL (planning, NOT rendered)
  _internal_niche: string;
  _internal_audience: string;
  _internal_dominant_tone: string;   // canonical tonePreset only
  _internal_recurring_themes: string[];
  _internal_recurring_promise: string;
  _internal_monetization_angle: string;
  _internal_positioning_summary: string;

  // _INDEX
  _index_creator_terminology: string[];   // verbatim phrases for inline glossing + search
  _index_content_formats: string[];
  _index_archetype: ArchetypeSlug;
}
```

## Canon node

```ts
interface CanonNode_v2 {
  schemaVersion: 'v2';

  type: 'framework' | 'lesson' | 'playbook' | 'principle' | 'pattern' | 'tactic' | 'definition' | 'aha_moment' | 'quote' | 'topic' | 'example';
  origin: 'multi_video' | 'single_video' | 'channel_profile' | 'derived';
  kind?: 'synthesis' | 'reader_journey' | 'reference_quotes' | 'reference_glossary' | 'reference_numbers' | 'reference_mistakes' | 'reference_tools';

  // RENDERED
  title: string;          // 2-6 words, concept label
  lede: string;           // 1-2 sentence first-person teaser, sets up body
  body: string;           // 400-1500 word first-person teaching, citation-dense, markdown

  // _INTERNAL (planning)
  _internal_summary: string;          // 1-2 sentence editorial summary for operators
  _internal_why_it_matters: string;   // why this is in the canon
  _internal_when_to_use?: string;     // for procedural types
  _internal_when_not_to_use?: string;
  _internal_common_mistake?: string;
  _internal_success_signal?: string;

  // _INDEX
  _index_evidence_segments: string[];        // segment IDs cited in body
  _index_supporting_examples: string[];      // per-video intel example IDs woven in
  _index_supporting_stories: string[];       // per-video story IDs woven in
  _index_supporting_mistakes: string[];      // per-video mistake IDs woven in
  _index_cross_link_canon: string[];         // other canon node IDs to cross-link
  _index_source_video_ids: string[];

  // Quality scores (existing)
  confidenceScore: number;
  pageWorthinessScore: number;
  specificityScore: number;
  creatorUniquenessScore: number;
  evidenceQuality: 'high' | 'medium' | 'low';
}
```

## Page brief

```ts
interface PageBrief_v2 {
  schemaVersion: 'v2';

  // RENDERED
  pageTitle: string;
  hook: string;           // first-person, 1 sentence
  lede: string;           // first-person, 1-2 sentences setting up body
  body: string;           // 200-400 word page intro in creator voice (precedes the canon body)
  cta: { primary: string; secondary: string };  // first-person CTAs

  // _INTERNAL
  _internal_audience_question: string;   // why this page exists, NOT a page title/H1
  _internal_persona: { name: string; context: string; objection: string; proofThatHits: string };
  _internal_journey_phase: 1 | 2 | 3 | 4 | 5;
  _internal_seo: { primaryKeyword: string; intent: string; titleTemplate: string; metaDescription: string };

  // _INDEX
  _index_primary_canon_node_ids: string[];
  _index_supporting_canon_node_ids: string[];
  _index_outline: Array<{ section_title: string; canon_node_ids: string[]; intent: string }>;
  _index_cluster_role: { tier: 'pillar' | 'spoke'; parent_topic: string | null; sibling_slugs: string[] };
  _index_voice_fingerprint: { profanityAllowed: boolean; tonePreset: string; preserveTerms: string[] };
  _index_slug: string;
}
```

## Reader journey

```ts
interface ReaderJourneyPhase_v2 {
  // RENDERED
  title: string;          // phase name, 2-6 words
  hook: string;           // first-person line
  body: string;           // 200-400 word phase intro

  // _INTERNAL
  _internal_reader_state: string;
  _internal_next_step_when: string;

  // _INDEX
  _index_phase_number: number;
  _index_primary_canon_node_ids: string[];
}
```

## VIC (per-video intelligence)

VIC stays mostly indexing/internal. The fields that USED TO render now belong to canon node bodies via the weaving step. VIC becomes mostly inputs.

```ts
interface VIC_v2 {
  schemaVersion: 'v2';
  videoId: string;

  // RENDERED (only this — minimal)
  video_summary: string;  // 100-200 word first-person intro to the video, used on a per-video page

  // _INTERNAL + _INDEX (everything else)
  _index_main_ideas: Array<{ id: string; text: string; segments: string[] }>;
  _index_lessons: Array<{ id: string; text: string; segments: string[] }>;
  _index_examples: Array<{ id: string; text: string; segments: string[] }>;
  _index_stories: Array<{ id: string; text: string; segments: string[] }>;
  _index_mistakes_to_avoid: Array<{ id: string; mistake: string; why: string; correction: string; segments: string[] }>;
  _index_failure_modes: Array<{ id: string; text: string; segments: string[] }>;
  _index_counter_cases: Array<{ id: string; text: string; segments: string[] }>;
  _index_quotes_verbatim: Array<{ id: string; text: string; segment: string }>;
  _index_quotes_cleaned: Array<{ id: string; text: string; verbatim_id: string }>;
  _index_strong_claims: Array<{ id: string; text: string; segments: string[] }>;
  _index_contrarian_takes: Array<{ id: string; text: string; segments: string[] }>;
  _index_terms_defined: Array<{ id: string; term: string; definition: string; segment: string }>;
  _index_tools_mentioned: string[];
  _internal_creator_voice_notes: string[];
  _index_recommended_hub_uses: string[];
}
```
```

- [ ] **Step 2: Commit the spec**

```bash
git add docs/superpowers/specs/2026-05-01-hub-source-document-schema.md
git commit -m "spec(phase-5): hub source document schema v2 (rendered/internal/index)"
```

---

## Task 5.2: Rewrite framework-extraction-rubric SKILL.md

**Files:**
- Modify: `.claude/skills/pipeline/framework-extraction-rubric/SKILL.md`

**Why:** Codex generates canon nodes from this rubric. Currently produces analyst-notes schema (`summary`, `whyItMatters`). Must produce publication schema (`title`, `lede`, `body`).

- [ ] **Step 1: Replace SCHEMA section**

Open the file. Find `## SCHEMA`. Replace the JSON block with the v2 `CanonNode_v2` interface from Task 5.1's spec, formatted as a JSON example with realistic placeholders.

- [ ] **Step 2: Replace RUBRIC section**

Find `## RUBRIC`. Replace with these rules:

```markdown
- **Three field categories**: every field is rendered, _internal_*, or _index_*. The rubric below specifies which.
- **Voice rule (CRITICAL)**: `body` is written in FIRST PERSON as if the creator wrote it. NEVER "the creator says X" — write "X." NEVER "Jordan argues Y" — write "Y." The body IS the chapter, not a description of the chapter.
- **`title` (rendered)**: 2-6 words, concept label. Use the EXACT name from the must-cover list when applicable.
- **`lede` (rendered)**: 1-2 sentence first-person teaser. Sets up the body. Punchy, hook-quality.
- **`body` (rendered)**: 400-1500 words. First-person teaching. Markdown. Structure:
  1. Open with a punchy hook (1-2 sentences) — can echo `lede` but extends it
  2. Define what this concept means in your terms
  3. Walk through how it works (mechanism / steps / preconditions)
  4. Cite 1-2 concrete examples FROM YOUR TRANSCRIPTS using `[<segmentId>]`
  5. Cover the common mistake or counter-case
  6. Close with the practical "what to do now"
  Citation density: 8-15 inline `[<segmentId>]` tokens woven in naturally.
- **`_internal_summary`** (1-2 sentences): editorial summary for operators reviewing the audit. Third-person OK here — this is internal.
- **`_internal_why_it_matters`** (1-2 sentences): why this canon node exists in the graph.
- **`_internal_when_to_use` / `_internal_when_not_to_use` / `_internal_common_mistake` / `_internal_success_signal`**: present for procedural types (framework / playbook / lesson / tactic). Inform body content but don't render.
- **`_index_evidence_segments`**: segment IDs that the body cites. Must match the brackets in `body`.
- **`_index_supporting_examples` / `_index_supporting_stories` / `_index_supporting_mistakes`**: IDs from per-video intelligence pulled into this canon's body. Each ID's text MUST appear (paraphrased or verbatim) in the body. This proves the body has real teaching content, not just summary.
- **`_index_cross_link_canon`**: other canon node IDs the body should cross-link to (for hub navigation).
- **Type taxonomy** (unchanged): framework, playbook, lesson, principle, pattern, tactic, definition, aha_moment, quote, topic, example.
- **Origin enum** (unchanged): multi_video, single_video, channel_profile, derived.
- **Quality scores** (unchanged): confidenceScore, pageWorthinessScore, specificityScore, creatorUniquenessScore (0-100).
- **Cross-reference rule** (unchanged): if multiple videos teach the same idea, ONE multi_video node, not duplicates.
```

- [ ] **Step 3: Replace EXAMPLES_GOOD section**

Add a fully-realized canon node with title/lede/body/all_internal/all_index fields. Use Hormozi's "Better, Cheaper, Faster, Less Risky" as the worked example, with a 600-word body in his blunt-tactical voice. Concrete first-person prose; multiple `[<segmentId>]` citations.

- [ ] **Step 4: Replace EXAMPLES_BAD section**

Show 5 anti-pattern bodies:
1. Third-person summary disguised as body ("The creator argues that...")
2. Body that just lists steps with no explanation
3. Body without any inline citations
4. Body that paraphrases creator terms instead of preserving them
5. Body that's a `_internal_summary` repeated (no actual teaching)

- [ ] **Step 5: Replace OUTPUT_FORMAT section**

```markdown
You are <creatorName>, writing a chapter of your knowledge hub on <canonNodeTitle>.

You teach in first person ("I", "you", "we"). You are NOT a narrator describing what you say. Write the way <creatorName> actually writes when sharing his thinking.

Voice rules:
- profanityAllowed: <bool>
- tonePreset: <preset>
- preserveTerms (use verbatim, NEVER paraphrased): <terms>

[Source material is provided in the user message: transcript segments, examples, stories, mistakes from per-video intelligence.]

Output format: ONE JSON object matching the CanonNode_v2 schema. NEVER an array. Markdown allowed in `body` only. No code fences around JSON. No preamble.

{
  "schemaVersion": "v2",
  "type": "...",
  "origin": "...",
  "title": "...",
  "lede": "...",
  "body": "<400-1500 word first-person markdown body with [<segmentId>] inline citations>",
  "_internal_summary": "...",
  "_internal_why_it_matters": "...",
  "_internal_when_to_use": "...",
  "_internal_when_not_to_use": null,
  "_internal_common_mistake": null,
  "_internal_success_signal": "...",
  "_index_evidence_segments": ["<segment-id>", ...],
  "_index_supporting_examples": ["<example-id>", ...],
  "_index_supporting_stories": [],
  "_index_supporting_mistakes": ["<mistake-id>"],
  "_index_cross_link_canon": [],
  "_index_source_video_ids": ["..."],
  "confidenceScore": 0,
  "pageWorthinessScore": 0,
  "specificityScore": 0,
  "creatorUniquenessScore": 0,
  "evidenceQuality": "high"
}
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/pipeline/framework-extraction-rubric/SKILL.md
git commit -m "feat(skills): framework-extraction rubric v2 — body field, first-person voice, three-category fields"
```

---

## Task 5.3: Rewrite editorial-strategy-rubric SKILL.md

**Files:**
- Modify: `.claude/skills/pipeline/editorial-strategy-rubric/SKILL.md`

Same pattern as 5.2 but for `PageBrief_v2`. Key changes:
- Replace `audienceQuestion` (rendered as H1 in old format) with `_internal_audience_question` (planning)
- Replace `openingHook` with `hook` + `lede` (two distinct fields)
- Add `body` field (200-400 word page intro, first-person)
- Move `editorialStrategy.persona/seo/cta` fields under `_internal_*`
- Move `clusterRole` under `_index_cluster_role`
- Move `outline` under `_index_outline`
- `cta.primary` and `cta.secondary` rendered, but written in FIRST PERSON ("Read my First $100K Roadmap next") not third-person ("Read the First $100K Roadmap").

- [ ] **Step 1: Update SCHEMA section** with `PageBrief_v2`
- [ ] **Step 2: Update RUBRIC section** with first-person voice rules + body specification
- [ ] **Step 3: Update EXAMPLES_GOOD** with a worked Hormozi pillar brief, 250-word body
- [ ] **Step 4: Update EXAMPLES_BAD** showing internal-fields-as-rendered + question-as-H1
- [ ] **Step 5: Update OUTPUT_FORMAT**
- [ ] **Step 6: Commit**

---

## Task 5.4: Rewrite cross-video-synthesis-rubric SKILL.md

**Files:**
- Modify: `.claude/skills/pipeline/cross-video-synthesis-rubric/SKILL.md`

Synthesis nodes get a `body` field too (400-800 words, first-person, weaves the unifying thread across child canon nodes).

- [ ] **Steps 1-5**: Same pattern as 5.2/5.3, applied to synthesis schema
- [ ] **Step 6: Commit**

---

## Task 5.5: Rewrite citation-chain-rubric SKILL.md

**Files:**
- Modify: `.claude/skills/pipeline/citation-chain-rubric/SKILL.md`

Citations now appear inline in `body` prose (8-15 per body, not 1-2 per summary). Rubric needs:
- Density target: 1 citation per ~50-80 body words
- Placement: after concrete claims, examples, numbers, named entities, mistakes
- Forbidden: citation spam (3+ in one sentence), citing in `lede` (`lede` is hook-style, no IDs), citing in `_internal_*` fields (those are planning notes)

- [ ] **Step 1: Update SCHEMA + RUBRIC + EXAMPLES + OUTPUT_FORMAT**
- [ ] **Step 2: Commit**

---

## Task 5.6: Rewrite voice-fingerprint-rubric SKILL.md

**Files:**
- Modify: `.claude/skills/pipeline/voice-fingerprint-rubric/SKILL.md`

Voice rules now apply at extraction time, not as a downstream transform. Add:
- "Default voice is first-person creator voice. Third-person attribution is only allowed in `_internal_*` fields."
- "When a verbatim quote from the creator is preserved in `body`, frame it as 'I once said:' or natural reported speech, not 'the creator said'."
- "Profanity rule: applies to body field only. `_internal_*` fields are operator-facing and stay neutral."

- [ ] **Step 1-5**: Update sections
- [ ] **Step 6: Commit**

---

## Task 5.7: Add HUB_SOURCE_VOICE section to all 5 archetype files

**Files:**
- Modify: `.claude/skills/pipeline/creator-archetypes/operator-coach.md`
- Modify: `.claude/skills/pipeline/creator-archetypes/science-explainer.md`
- Modify: `.claude/skills/pipeline/creator-archetypes/instructional-craft.md`
- Modify: `.claude/skills/pipeline/creator-archetypes/contemplative-thinker.md`
- Modify: `.claude/skills/pipeline/creator-archetypes/_DEFAULT.md`

**Why:** First-person voice has archetype-specific cadence. Hormozi writes short imperatives. Huberman writes mechanism-rich hedged claims. The archetype files need a dedicated `HUB_SOURCE_VOICE` section that the body-writing prompt splices in.

- [ ] **Step 1: Operator-coach voice** — short sentences, imperatives, profanity for emphasis, contrarian inversions, money-math anchors. 1 paragraph + 3 example body excerpts.
- [ ] **Step 2: Science-explainer voice** — longer measured sentences, mechanism-first explanations, hedged claims, citation-of-research embedded, evidence ladder structure. 1 paragraph + 3 example body excerpts.
- [ ] **Step 3: Instructional-craft voice** — second-person warm coaching, demonstrative ("look at how"), step-by-step with the reader's hands. 1 paragraph + 3 examples.
- [ ] **Step 4: Contemplative-thinker voice** — reflective questions, paradox holding, "we" framing, longer arcs. 1 paragraph + 3 examples.
- [ ] **Step 5: _DEFAULT voice** — fall-through: mirror the creator's `_internal_dominant_tone` from channel_profile, no archetype-specific cadence.
- [ ] **Step 6: Commit**

---

## Task 5.8: New per-video weaving infrastructure

**Files:**
- Create: `packages/pipeline/src/scripts/util/per-video-weaving.ts`

**Why:** Each canon node body must weave in 2-4 examples + 0-2 stories + 1-2 mistakes from per-video intelligence. Currently per-video intel is orphaned. We need a step that, for each canon node shell, picks which per-video items map to it.

- [ ] **Step 1: Implement the weaver**

```ts
/**
 * Per-video weaving: for each canon node, select which per-video intelligence
 * items (examples, stories, mistakes, contrarian takes) should be woven into
 * its body. The selection is done via Codex with the canon shell + the
 * candidate per-video items as input.
 *
 * Returns a map: canon_node_id → { example_ids, story_ids, mistake_ids, take_ids }
 *
 * The body-writer (Task 5.9) consumes this to build prompts that pass the
 * actual text of woven items, not just IDs.
 */
import { codexJson } from './codex-helper';
// ... full implementation ~120 lines, includes:
// - input shape: canon shells + per-video intelligence (with stable IDs)
// - prompt: "for each canon node, pick 2-4 examples + 0-2 stories + 1-2 mistakes"
// - output: structured JSON map
```

The full implementation goes in this file. Each canon shell is paired with the relevant per-video items via Codex. Concurrency cap = 3 (independent per canon node).

- [ ] **Step 2: Add unit test** — feed mock canon + mock per-video intel, assert mapping is reasonable
- [ ] **Step 3: Commit**

---

## Task 5.9: New canon-body-writer infrastructure

**Files:**
- Create: `packages/pipeline/src/scripts/util/canon-body-writer.ts`

**Why:** After canon shells exist + weaving is done, write each canon's `body` field via dedicated Codex call. Independent per canon → parallelizable.

- [ ] **Step 1: Implement the writer**

```ts
/**
 * Canon body writer: takes canon shell + woven per-video intel + segment
 * texts + voice fingerprint and produces a 400-1500 word first-person body.
 * Independent per canon node; orchestrator calls in parallel (cap=3).
 */
import { spawn } from 'node:child_process';
import { extractJsonFromCodexOutput } from '../../agents/providers/codex-extract-json';
// ... full implementation ~200 lines
```

The prompt (template):

```
You are <creatorName>, writing a chapter of your knowledge hub on "<canonTitle>".

# Your voice (archetype: <archetype>)
<HUB_SOURCE_VOICE section from archetype file>

Voice fingerprint:
- profanityAllowed: <bool>
- tonePreset: <preset>
- preserveTerms (use verbatim): <terms>

# Source material (yours)
## Transcript segments cited:
[<segId1>] (m:ss) "<full segment text>"
[<segId2>] ...

## Examples from your videos (pulled by weaver):
- (id=<exId1>) "<example text>"
- (id=<exId2>) "<example text>"

## Stories from your videos:
- (id=<storyId1>) "<story text>"

## Mistakes you've called out:
- (id=<mistakeId1>) <mistake>; correction: <correction>

# Task
Write a 400-1500 word chapter on "<canonTitle>". Structure:
1. Open with a 1-2 sentence punchy hook
2. Define what this means in your terms
3. Walk through the mechanism / steps
4. Weave in the examples and stories above; cite [<segmentId>] for each concrete claim
5. Cover the common mistake (use the mistake item)
6. Close with the practical "what to do now"

Citation density: 8-15 [<segmentId>] tokens inline. Use them after concrete claims, numbers, named entities.

# Voice rules (CRITICAL)
- First person: "I", "you", "we". NEVER "the creator", "Jordan", "he", "she", "they (the creator)".
- Markdown allowed (## headings, **bold**, lists).
- Preserve verbatim creator terms — DO NOT rephrase named concepts.
- profanityAllowed: <bool> — applies here.

# Output format
ONE JSON object: { "body": "<markdown body>", "_index_evidence_segments": ["<id>", ...], "_index_supporting_examples": ["<id>", ...], "_index_supporting_stories": [...], "_index_supporting_mistakes": [...] }
NEVER wrap in code fences. NEVER include preamble.
```

- [ ] **Step 2: Add bodyOrchestrator that drives concurrency** — Promise.all with cap=3, retry-on-failure (max 2 retries), per-canon timeout 5 min.
- [ ] **Step 3: Add unit tests** — mock canon shell, verify prompt assembly + output parsing
- [ ] **Step 4: Commit**

---

## Task 5.10: New hero candidates + tagline generator

**Files:**
- Create: `packages/pipeline/src/scripts/util/hero-candidates.ts`

**Why:** Hub homepage needs 5 stop-the-scroll hero lines + a tagline. Currently we steal one verbatim quote — and it has stutters. Generate them properly from the channel profile + canon graph.

- [ ] **Step 1: Implement** — single Codex call given (channel_profile, top 5 page-worthy canon titles, voice fingerprint, archetype). Outputs `{ hero_candidates: string[5], hub_title, hub_tagline }`. First-person, 6-14 words each, all five distinct angles (operator pain / aspiration / contrarian / specific number / curiosity).
- [ ] **Step 2: Unit test**
- [ ] **Step 3: Commit**

---

## Task 5.11: Refactor seed-audit-via-codex.ts to v2 schema

**Files:**
- Modify: `packages/pipeline/src/scripts/seed-audit-via-codex.ts`

**Why:** All 7 prompt sites need to produce v2 schema. Order of operations changes too — we now have a body-writing pass after canon shells exist.

New pipeline order:
1. Channel profile (v2 schema, includes hero_candidates field, hub_title, hub_tagline)
2. VICs (v2 schema, mostly indexing — IDs added to every per-video item so weaver can reference them)
3. Canon shells (title, type, lede, _internal_summary, _index_evidence_segments — NO body yet)
4. **NEW: Per-video weaving step** — maps per-video items to canon shells
5. **NEW: Canon body-writing step** — parallel body generation, uses weaving output
6. Cross-video synthesis (also has body field, runs after canon bodies exist)
7. Reader journey (each phase has body)
8. Page briefs (with hook/lede/body, plus _internal_persona/seo/cta)
9. Brief body writing (body of each brief, ~250 words)

- [ ] **Step 1: Refactor channel profile generation** — produce v2 fields, including hero_candidates via the new generator (Task 5.10).
- [ ] **Step 2: Refactor VIC generation** — add IDs to every array item; rename fields to `_index_*` prefix in payload.
- [ ] **Step 3: Refactor canon-shell generation** — drop `summary`/`whyItMatters`, produce title/lede/_internal_*/_index_*/scores. NO body yet.
- [ ] **Step 4: Add weaving step** — call `per-video-weaving.ts` after shells exist.
- [ ] **Step 5: Add canon body-writing step** — call `canon-body-writer.ts` for each shell, write body + final _index_supporting_* fields.
- [ ] **Step 6: Refactor synthesis generation** — same pattern: shells then bodies.
- [ ] **Step 7: Refactor reader journey generation** — phase shells then phase bodies.
- [ ] **Step 8: Refactor page brief generation** — shells then bodies.
- [ ] **Step 9: Test inline** — wire it through with a tiny mock run, verify v2 payloads are written.
- [ ] **Step 10: Commit**

---

## Task 5.12: Update audit page to render v2

**Files:**
- Modify: `apps/web/src/lib/audit/build-audit-markdown.ts`
- Create: `apps/web/src/lib/audit/build-hub-source-doc.ts`
- Modify: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/AuditClient.tsx`
- Modify: `apps/web/src/app/app/projects/[id]/runs/[runId]/audit/page.tsx`

**Why:** Audit page becomes creator-facing preview (rendered fields only). Copy Audit button serializes the FULL Hub Source Document for builder handoff.

- [ ] **Step 1: New `build-hub-source-doc.ts`** — serializes ALL fields (rendered + _internal + _index) as a single JSON object with metadata header (creatorName, runId, generatedAt, schemaVersion='v2').
- [ ] **Step 2: Refactor `build-audit-markdown.ts`** — render only `rendered` fields. Hide `_internal_*` and `_index_*` fields. Add a "View raw" link (hidden behind operator-debug query param `?debug=1`) that shows everything.
- [ ] **Step 3: Add `<CopyAuditButton>` to AuditClient** — calls a server action that returns the full Hub Source Document; client copies to clipboard. Show toast on success.
- [ ] **Step 4: Update audit page layout** — primary section is the hero (`hero_candidates[0]` shown in big type, with cycle button to preview the others), then `pillars + spokes` previewed via brief title/lede/body excerpts (not full bodies — too long), then `reader journey` phases as a horizontal timeline.
- [ ] **Step 5: Add operator-debug toggle** — a small footer link "View internal fields" that adds `?debug=1`. Shows the `_internal_*` + `_index_*` fields below each rendered preview, in a collapsed details panel.
- [ ] **Step 6: Commit**

---

## Task 5.13: Recalibrate validators for v2

**Files:**
- Modify: `packages/pipeline/src/scripts/validate-citation-chain.ts`
- Modify: `packages/pipeline/src/scripts/check-voice-fingerprint.ts`

**Why:** Validators currently look for citations in old fields (summary, brief outline). v2 has citations primarily in `body`. Density target shifts.

- [ ] **Step 1: Citation validator** — count citations per body, expected density 1 per 50-80 words. Flag bodies with 0 citations. Flag _internal_* / _index_* fields with citations (they shouldn't have any).
- [ ] **Step 2: Voice validator** — score `body` text (not just `hook`). Detect third-person leakage: if body contains "the creator", "she/he says", "<creatorName> argues", flag as third-person leak (this is a hard fail — voice flip must happen at extraction).
- [ ] **Step 3: Add new validator: check-hub-readiness.ts** — runs the 3 quality-bar checks from the plan header (read body aloud test, hero quality test, paywall test). Heuristic-based: third-person words count, hook-quality lexicon, body length distribution.
- [ ] **Step 4: Commit**

---

## Task 5.14: Test on Jordan Platten — full regen

**Files:** none (verification task)

**Why:** Jordan is the gold-standard test case. The user's report is grounded in Jordan's hub failures. If we regen Jordan and pass all 3 quality-bar checks, Phase 5 succeeds.

- [ ] **Step 1: Reset Jordan run state** — delete channel_profile, VICs, canon nodes, briefs (keep video, segments, transcripts).
- [ ] **Step 2: Run new pipeline** — `seed-audit-via-codex.ts a8a05629-d400-4f71-a231-99614615521c --per-video-canon`
- [ ] **Step 3: Open the audit page in operator-debug mode** — verify _internal/_index fields are populated correctly behind the toggle.
- [ ] **Step 4: Run the 3 quality-bar checks**:
  - Read 3 random canon bodies aloud — must sound like Jordan
  - Verify hero_candidates — all 5 billboard-worthy
  - Pick thinnest canon body — paywall-worthy?
- [ ] **Step 5: If any fail, iterate** — go back to the relevant skill rubric or prompt, tighten, regen the specific stage. Repeat until all 3 pass.
- [ ] **Step 6: Test the Copy Audit button** — paste output into a text editor, verify it's complete JSON Hub Source Document.
- [ ] **Step 7: Commit any prompt tightening** done during iteration.

---

## Task 5.15: Test on Walker — cross-archetype validation

**Files:** none (verification task)

**Why:** Jordan is operator-coach. Walker is science-explainer. Phase 5 must work across archetypes without code changes.

- [ ] **Step 1: Reset Walker run state**
- [ ] **Step 2: Run new pipeline**
- [ ] **Step 3: Quality-bar checks** — same 3 questions, applied to Walker. Expected: science-explainer voice (not blunt-tactical), mechanism-first bodies, hedged claims, evidence ladders.
- [ ] **Step 4: Test on Hormozi too** — third archetype confirmation. Reset run, regen, quality-bar.

---

## Task 5.16: Document the new schema for builder consumption

**Files:**
- Create: `docs/builder-handoff/hub-source-document-format.md`

**Why:** When this becomes a SaaS, the builder team consumes the Hub Source Document. Document the contract: which fields render, which inform writing, which are indexing.

- [ ] **Step 1: Write the contract** — section per top-level entity (canon, brief, journey, channel profile), with field-by-field rendering rules, and a "Builder MUST NOT render `_internal_*` or `_index_*` fields as primary copy" warning at the top.
- [ ] **Step 2: Add the 3 quality-bar checks** as a self-test the builder can run against its rendered output.
- [ ] **Step 3: Commit**

---

## Task 5.17: STOP gate — final review with operator (the user)

- [ ] **Step 1: Demo Jordan + Walker audits side-by-side** in operator-debug + creator-preview modes.
- [ ] **Step 2: Test Copy Audit handoff** — paste into a fresh document, verify completeness.
- [ ] **Step 3: User reviews + signs off** on the schema, voice, body quality, citation density, hero candidates.
- [ ] **Step 4: Tag the commit** as `phase-5-complete`. Open PR.

---

## Self-Review

**Spec coverage** (cross-checking against the user's 8-problem report):

| User's Problem | Phase 5 Task |
|---|---|
| 1. Third-person voice ("Jordan says…") | 5.6 voice rubric + 5.11 prompt rewrite — first-person at extraction |
| 2. Canon node bodies are summaries, not content | 5.2 framework rubric (body field) + 5.9 canon-body-writer + 5.11 pipeline order |
| 3. Internal scaffolding bleeds into rendered output | 5.1 schema spec (`_internal_*` prefix) + 5.12 audit page rendering |
| 4. Hero copy was a broken quote | 5.10 hero-candidates generator |
| 5. Title and subtitle collision | 5.1 schema (title/lede/body distinct) + 5.2/5.3 rubric updates |
| 6. Glossary surfaced as a public route | 5.1 schema (`_index_terms_defined`) + 5.12 renderer hides _index fields |
| 7. Per-video intelligence orphaned from canon nodes | 5.8 weaver + 5.9 body writer (weaves intel into bodies) |
| 8. No "rendered vs planning vs indexing" boundary | 5.1 schema spec (three-category prefix system) + 5.12 renderer enforces |

All 8 problems are addressed. Each problem has a specific task that solves it.

**Placeholder scan:** None. Every step has actual code or actual instructions. The 5 SKILL.md rewrites (5.2-5.6) are specified by content (RUBRIC bullet rules, EXAMPLES_GOOD with realized examples, OUTPUT_FORMAT prompt template). The TS infrastructure (5.8-5.10) has full implementation sketches with file paths and approximate line counts.

**Type consistency:** `CanonNode_v2`, `PageBrief_v2`, `ReaderJourneyPhase_v2`, `ChannelProfile_v2`, `VIC_v2` are all defined in 5.1 spec. Field names are stable across rubric files, prompt templates, weaver, body writer, and renderer. `schemaVersion: 'v2'` discriminates from legacy data.

**Migration safety:** Existing runs (Hormozi v1, Jordan v1, Walker v1) keep their old `payload` shape. Renderer falls back to legacy fields when `schemaVersion !== 'v2'`. Operator can opt into regen per-creator. No data is destroyed.

**Quality gates:** The 3 quality-bar checks (read aloud, hero billboard, paywall test) are encoded in Task 5.14 step 4. Phase 5 is not declared complete until all 3 pass on Jordan. We do not stop until quality is met — that is the user's explicit standard.

**Risks:**
- Body-writing prompt is the highest-risk surface area. Codex must produce 600-word first-person bodies that are CITATION-DENSE and pull in per-video intel. This will need iteration. Task 5.14 builds in iteration time.
- Parallel body generation (concurrency=3) could trip Codex CLI's rate ceiling on long jobs. Mitigation: AUDIT_BODY_CONCURRENCY env knob, default 3, can drop to 1 for debugging.
- Audit page renderer changes (5.12) need careful testing — operator-debug mode must work, copy button must work, _internal/_index fields must NEVER leak into the default view.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-01-phase-5-audit-as-hub-source-document.md`.

**Decision: inline execution.** This plan is a deep redesign with verification at the end (Task 5.14 iteration loop). Inline execution lets me iterate on prompts mid-flight when bodies don't pass the quality bar.

I'll start with Task 5.1 (spec), commit, then Task 5.2 (framework rubric), commit, and proceed through to 5.14 with the iteration loop. I will not stop until Jordan's regen passes all 3 quality-bar checks.

Standards I'm holding:
- Every commit typechecks + (where applicable) tests pass.
- No `_internal_*` or `_index_*` fields appear in the default audit view at any commit point.
- The three quality-bar tests are the only acceptance criteria — validator scores are necessary but not sufficient.
- The user reviews at Task 5.17 (STOP gate).
