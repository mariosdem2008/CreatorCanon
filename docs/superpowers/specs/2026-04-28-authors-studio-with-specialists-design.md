# Author's Studio + Specialists — Design Spec

**Status:** draft for user review · 2026-04-28
**Replaces:** the existing `page_writer` + deterministic-fallback path in `page-composition.ts` and the related schema/renderer surface.

## 1. Goal

Turn the canon_v1 hub from "structured wiki of what the creator said" into an **editorial product on top of the source** — pages that **teach** an idea, **defend** a claim, **show a worked example the creator never recorded**, **give the reader an actionable roadmap**, **visualize the moving parts as a diagram**, and **call out the common mistakes**. The bar: the creator looks at a finished page and thinks "I couldn't have made this in three hours."

The current pipeline already produces excellent upstream artifacts (channel profile, video intelligence cards, canon nodes, page briefs). Where it fails is at the authoring boundary: a single overloaded `page_writer` agent that doesn't actually fire, falling through to a deterministic stub generator that emits 3 boilerplate sections per page. This spec replaces that single agent with a coordinated multi-agent **Author's Studio**, plus a tightened upstream so each agent has the source material it needs to do its job without hallucination.

## 2. Non-goals (out of scope for v1)

- Image generation (Stable Diffusion / DALL·E / Imagen) for diagrams. Mermaid only.
- Per-reader Q&A (the existing "Ask this hub" chat is unchanged).
- Multi-page cross-stitching narratives (e.g. "as we saw on the previous page..." — strategist may avoid duplication but doesn't author cross-page transitions).
- Per-section streaming render (the page composes whole-page, then renders).
- Translating to non-English voices.

## 3. Architecture overview

```
canon_v1 (existing)                      ▲ EDITORIAL UPGRADES
  ├── channel_profile                    │ - Adds creator voice mode
  ├── visual_context                     │ - Stays
  ├── video_intelligence                 │ - PROMPT EXTENSION: mistakes/failure modes
  ├── canon_architect                    │ - PROMPT EXTENSION: editorial fields
  └── page_brief_planner                 │ - Hub navigation only

                ↓ briefs + canon_nodes + channel_profile + voice_mode

┌─────────────────────────────────────────────────────────────┐
│  AUTHOR'S STUDIO (new — replaces page_writer)               │
│                                                             │
│  ┌────────────────────────────────────┐                     │
│  │  1. PAGE STRATEGIST                │                     │
│  │  Per-page editorial plan:           │                     │
│  │  thesis · arc · voice · which       │                     │
│  │  artifacts (prose, roadmap,         │                     │
│  │  example, diagram, mistakes) ·      │                     │
│  │  per-artifact source assignments    │                     │
│  └────────────────────────────────────┘                     │
│              ↓ page_plan + artifact_briefs                  │
│                                                             │
│  ┌────────────────────────────────────┐                     │
│  │  2. SPECIALIST AUTHORS (parallel)   │                     │
│  │  ┌────────┐ ┌────────┐ ┌────────┐   │                     │
│  │  │ PROSE  │ │ROADMAP │ │EXAMPLE │   │                     │
│  │  └────────┘ └────────┘ └────────┘   │                     │
│  │  ┌────────┐ ┌────────┐              │                     │
│  │  │DIAGRAM │ │MISTAKES│              │                     │
│  │  └────────┘ └────────┘              │                     │
│  └────────────────────────────────────┘                     │
│              ↓ artifact bundle                              │
│                                                             │
│  ┌────────────────────────────────────┐                     │
│  │  3. CRITIC                         │                     │
│  │  Specific revision notes per       │                     │
│  │  artifact: generic claims, voice   │                     │
│  │  drift, weak transitions, vague    │                     │
│  │  example, non-actionable roadmap,  │                     │
│  │  redundant diagram, missing cites  │                     │
│  └────────────────────────────────────┘                     │
│              ↓ revision_notes                               │
│                                                             │
│  ┌────────────────────────────────────┐                     │
│  │  4. REVISE PASS                    │                     │
│  │  Each specialist receives its      │                     │
│  │  notes + reauthors that artifact   │                     │
│  └────────────────────────────────────┘                     │
│              ↓ final artifact bundle                        │
│                                                             │
│  ┌────────────────────────────────────┐                     │
│  │  5. ASSEMBLER + VALIDATOR          │                     │
│  │  Stitches into blockTreeJson;      │                     │
│  │  citation grounding; Mermaid       │                     │
│  │  parse; voice consistency; format  │                     │
│  │  normalization. Surfaces failed    │                     │
│  │  artifacts for human review.       │                     │
│  └────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
              ↓
       page + page_version (existing tables; new block kinds)
              ↓
       adapt → manifest (existing; renderer extended)
```

## 4. Voice configuration

A new `voiceMode` field on the project config is set by the user during hub configuration. Two options:

- **`reader_second_person`** (default) — direct, prescriptive, you-pronoun. *"If you want to win retainers, embed Phase 2 hooks in your Phase 1 proposal."* Best for how-to / reference / playbook pages. The dominant voice for almost every commercially successful knowledge hub.
- **`creator_first_person`** — Duncan's first-person voice. *"I built the proposal generator after losing too many deals to slow turnaround."* Best for "the creator's story" pages, philosophy pages, opinion pieces.

The voice mode is read from `project.config.voiceMode`, surfaced via `process.env.PIPELINE_HUB_VOICE_MODE` at run time, and threaded into every Author's Studio agent's system prompt (Strategist + 5 Specialists + Critic). The Critic enforces voice consistency.

UI surface: a radio control in the existing `/app/configure` page next to the tone preset selector. Storage: an additional key on the existing JSONB `project.config` column. No DB migration needed.

## 5. Set A artifact taxonomy

Five block kinds compose a page:

| # | Block kind | Specialist | Source dependency | Purpose |
|---|---|---|---|---|
| 1 | `cited_prose` | **Prose Author** | canon nodes' `summary` + `explanation` + segment transcripts | Whole-page narrative body, voice-consistent, citation-grounded |
| 2 | `hypothetical_example` | **Example Author** | canon nodes' `useCase` + `preconditions` + channel profile audience | A concrete scenario showing application of the lesson |
| 3 | `roadmap` | **Roadmap Author** | canon nodes' `steps` + `sequencingRationale` + `successSignal` | Actionable, sequenced "do this, then that" plan |
| 4 | `diagram` | **Diagram Author** | canon nodes' `steps` + `tools` + `inputs/outputs` | Mermaid flowchart / sequence / hierarchy |
| 5 | `common_mistakes` | **Mistakes Author** | canon nodes' `commonMistake` + VIC `mistakesToAvoid` | 3-5 anti-patterns with corrections |

Each is a first-class block kind in the manifest. The renderer styles each distinctly so the reader can scan a page and visually grasp "prose → example → roadmap → diagram → mistakes" as a recognizable shape.

### Page-type → artifact selection (Strategist's responsibility)

The strategist picks which artifacts each page needs. Defaults:

| Page type | Prose | Example | Roadmap | Diagram | Mistakes |
|---|---|---|---|---|---|
| `lesson` | always | always | sometimes | sometimes | always |
| `framework` | always | always | always | always | always |
| `playbook` | always | sometimes | always | always | always |
| `topic_overview` | always | sometimes | rarely | sometimes | sometimes |
| `principle` | always | always | rarely | rarely | sometimes |
| `definition` | always | sometimes | rarely | sometimes | sometimes |

The strategist deviates from defaults when source thinness or topic mismatch makes an artifact wasteful (e.g. "principle pages don't need a roadmap unless the principle is a sequencing rule"). The Critic flags missing-but-expected artifacts.

## 6. Specialist agents — concise role descriptions

Each specialist is a single-pass LLM call (no multi-turn loop) with a strict output JSON schema. All run in parallel after the strategist plans the page.

### 6.1 Prose Author
**Job:** Write the page's main body as continuous teaching prose. NOT a sequence of independent sections — a coherent essay/explanation that builds an argument across paragraphs. Cites segments inline. Honors voice mode.
**Input:** strategist plan + every canon node's full payload + segment text excerpts.
**Output:** a `cited_prose` block: `{ paragraphs: Array<{ heading?, body, citationIds }> }`. 4-8 paragraphs, ~600-1000 words.
**Model:** gpt-5.5 (whole-page coherence is the highest-leverage call; pay for quality).

### 6.2 Roadmap Author
**Job:** Convert the underlying procedure into a sequenced, actionable plan. Each step must be (a) atomic, (b) verifiable (the reader knows when it's done), (c) sequenced with a reason ("first X because…").
**Input:** strategist plan + canon nodes flagged "roadmap source" + canon `steps`/`tools`/`successSignal`.
**Output:** `roadmap` block: `{ title, steps: Array<{ index, title, body, durationLabel?, citationIds }> }`. 3-7 steps.
**Model:** gemini-2.5-flash. Roadmap structure is highly templatable; Flash with strong constraints handles it.

### 6.3 Hypothetical Example Author
**Job:** Write a concrete, bounded scenario showing the lesson applied. Must include a named protagonist, a specific industry, a specific number/date, and a clear outcome. NOT generic ("imagine you're a coach"). The example draws ON the channel profile's audience description.
**Input:** strategist plan + canon nodes flagged "example source" + channel profile audience + creator terminology.
**Output:** `hypothetical_example` block: `{ setup, stepsTaken: string[], outcome, citationIds }`. 100-200 words total.
**Model:** gpt-5.5. Example concreteness is hard for Flash; small but high-impact.

### 6.4 Diagram Author
**Job:** Produce a single Mermaid diagram that clarifies a procedure, decision, or relationship. Picks the right diagram type (flowchart / sequence / state / mindmap). Output must parse cleanly.
**Input:** strategist plan + canon nodes flagged "diagram source" + canon `steps`/`tools`.
**Output:** `diagram` block: `{ diagramType, mermaidSrc, caption, citationIds }`. Source ≤ 200 lines.
**Model:** gpt-5.4 (Mermaid is a constrained syntax; mid-tier handles it well; gpt-5.5 unnecessary).
**Validation:** Mermaid parser runs at the validator stage; failure triggers a single retry with the parse error fed back. Two failures → drop the diagram block from the page (with a warning logged).

### 6.5 Common Mistakes Author
**Job:** Surface 3-5 specific anti-patterns the reader is likely to hit, each with a one-sentence correction. Drawn from canon `commonMistake` fields + VIC `mistakesToAvoid` lists. Not generic ("don't be careless") — specific ("don't ask for budget before establishing expected impact, because…").
**Input:** strategist plan + canon nodes' `commonMistake` fields + VIC `mistakesToAvoid` arrays.
**Output:** `common_mistakes` block: `{ items: Array<{ mistake, why, correction, citationIds }> }`. 3-5 items.
**Model:** gemini-2.5-flash. Pattern is constrained.

## 7. Strategist — the page editor

The strategist is the only agent that holds the **whole-page intent** in its head. Specialists each see only their slice. Strategist tasks:

1. **Pick the page's thesis.** What single idea does this page argue/teach?
2. **Define the arc.** A 3-7-beat argument structure, anchored to canon nodes.
3. **Pick artifacts.** Which of the 5 block kinds does this page need (per Section 5 defaults)?
4. **Assign canon nodes to artifacts.** Each canon node ID → one or more artifacts that should draw from it.
5. **Set voice notes.** Pull 3-5 specific terms from `creatorTerminology` to use; flag tone (analytical / practitioner / urgent / generous).
6. **Sibling-page awareness.** The strategist receives the briefs of all 11 pages — instructed not to repeat content that lives on a sibling page (e.g. don't re-explain the 5-question intake on every retainer-related page; reference it).
7. **Output the page plan as JSON** — consumed by every downstream specialist.

**Model:** gpt-5.5. Editorial planning is the highest-leverage call; pay for quality.

## 8. Critic — the revision gate

The critic is the second-most-important agent, after the prose author. Its job is what makes this an editorial product rather than an LLM dump.

**Inputs:** the strategist plan + all 5 specialists' output + the original canon nodes + segment transcripts.

**Output:** structured revision notes per artifact, each note specifying:
- `artifactKind` (which artifact)
- `severity` (critical | important | minor)
- `issue` (one sentence)
- `evidence` (the offending text + the source it should have used)
- `prescription` (concrete fix — "use the $1,000/week example from cn_d8541e6329 instead of the generic 'AI saves time'")

The critic is graded by whether its notes are *concrete*. Vague notes ("make it better") are themselves a critic failure; the critic prompt explicitly bans them.

**Model:** gpt-5.5. Asking a Flash model to do critic work is a known failure mode (Flash agrees with whatever it's reading and produces vague feedback).

## 9. Revise pass — narrow re-authoring

Each specialist whose work has revision notes runs again with: `original output + critic notes + same source inputs`. Only the artifacts with notes re-run; the others pass through.

The revise pass is single-iteration (no second critic round). If after revision the validator still rejects (e.g. Mermaid still invalid), the failed artifact is dropped from the page and a warning is logged for human review.

## 10. Assembler + Validator

Deterministic, runs after revise pass.

- Stitches artifacts into the page's `blockTreeJson` in the order the strategist specified.
- Runs final integrity checks:
  - **Citation grounding:** every `citationIds` entry on every block resolves to a real segment in this run.
  - **Mermaid parse:** `mermaid.parse(diagram.mermaidSrc)` succeeds.
  - **Length sanity:** prose 400-1500 words; roadmap 3-7 steps; mistakes 3-5 items.
  - **Voice consistency:** simple regex / classifier check on first vs second person pronouns matches `voiceMode`.
- Writes `page` + `page_version` rows.

Nothing here uses an LLM — fully deterministic, fast, fail-loud.

## 11. Upstream upgrades — required for the new authoring layer to work

### 11.1 `video_intelligence` prompt extension

Add to VIDEO_ANALYST_PROMPT a sharper directive on `mistakesToAvoid`: when the creator says *"a mistake people make is..."*, *"don't do X"*, *"this is what tripped me up"*, etc., capture it with the corrective action. Today this is implicit; in practice the agent skips it.

Also surface (new fields in VIC payload):
- `failureModes`: when this idea/procedure fails (e.g. "this proposal generator fails when the discovery call doesn't surface budget").
- `counterCases`: when NOT to apply this idea.

These flow into canon, which flows into specialists.

### 11.2 `canon_architect` prompt extension

Today canon node payloads vary by type (playbook has `steps`, principle has `explanation`, etc.). Standardize editorial fields across types:

- **All canon nodes** must include: `whenToUse`, `whenNotToUse`, `commonMistake`, `successSignal`.
- **Playbook/framework/lesson** must include (when source supports): `preconditions`, `failureModes`.
- **Framework/playbook** must include: `sequencingRationale` ("why this order").

Without these, specialists hallucinate them or omit them. With these, specialists produce grounded synthesis.

The canon_architect prompt is updated to require these fields per node type, defaulting to `null` when the source doesn't surface them (rather than fabricating).

### 11.3 Manifest schema extension (renderer)

Three new block kinds added to `apps/web/src/lib/hub/manifest/schema.ts`:

```ts
roadmap: {
  kind: 'roadmap',
  title: string,
  steps: Array<{
    index: number,
    title: string,
    body: string,
    durationLabel?: string,
    citationIds?: string[]
  }>
}

diagram: {
  kind: 'diagram',
  diagramType: 'flowchart' | 'sequence' | 'state' | 'mindmap',
  mermaidSrc: string,
  caption: string,
  citationIds?: string[]
}

hypothetical_example: {
  kind: 'hypothetical_example',
  setup: string,
  stepsTaken: string[],
  outcome: string,
  citationIds?: string[]
}
```

Plus three React renderer components in `apps/web/src/components/hub/sections/`:
- `RoadmapBlock.tsx` — numbered vertical timeline
- `DiagramBlock.tsx` — Mermaid + caption (uses `mermaid.js` ESM dynamic import on the client)
- `HypotheticalExampleBlock.tsx` — labeled "Try it" / "Worked example" callout with setup/steps/outcome

The existing `common_mistakes` block kind already exists in the schema — no work there.

### 11.4 Voice config UI

Add a `Voice` radio group to `/app/configure` next to the existing tone preset:
- (•) Direct (you-pronoun) — best for how-to and reference pages
- ( ) Creator's voice (first-person) — best for opinion / philosophy pages

Stored on `project.config.voiceMode`. Read by orchestrator → passed as env var → consumed by Author's Studio agents.

## 12. Cost & quality target

| Stage | Calls/page | Model | ~Cost/page | Notes |
|---|---|---|---|---|
| Strategist | 1 | gpt-5.5 | $0.05 | once per page |
| Prose author | 1 | gpt-5.5 | $0.10 | longest output |
| Roadmap author | 1 | gemini-2.5-flash | $0.005 | constrained |
| Example author | 1 | gpt-5.5 | $0.03 | concreteness matters |
| Diagram author | 1 | gpt-5.4 | $0.01 | Mermaid is constrained |
| Mistakes author | 1 | gemini-2.5-flash | $0.005 | constrained |
| Critic | 1 | gpt-5.5 | $0.06 | reads everything |
| Revise (avg) | 1.5 | mixed | $0.05 | ~half artifacts revise |
| **Total per page** | ~8 | | **~$0.32** | |

For an 11-page hub: **~$3.50**. Add the upstream re-runs (canon ~$0.10, VIC ~$0.10): **~$3.70 per 5h hub.**

This is **2-3× the current $1.50 target** but produces *editorial-grade* output. For a creator who otherwise needs to pay a writer + designer + editor to produce equivalent content (~$2,000-5,000), this is rounding error. The cost-quality slope is steep and we're on the right end of it.

### Quality target

- 90% of pages pass page_quality without "revise recommended" flag.
- 0% of pages fall back to deterministic-stub authoring (the deterministic fallback becomes a critical-path failure flag, not a normal-mode output).
- Mermaid diagrams parse cleanly on first try ≥ 70%; with one retry ≥ 95%.
- Voice consistency check passes on ≥ 99% of pages.
- Manual reviewer (you) reads 5 random pages and rates each ≥ 4/5 on "I'd be proud to publish this."

## 13. Failure modes & recovery

| Failure | Detection | Recovery |
|---|---|---|
| Specialist returns empty output | Validator catches | Single retry with same input |
| Specialist returns invalid JSON | Provider error or Zod fail | Retry with the parse error fed back, max 1 |
| Mermaid invalid | `mermaid.parse()` throws | Retry once with the error; on second failure drop the block from the page |
| Critic returns vague notes | Critic prompt explicit ban + post-hoc length/specificity check | Page ships without revise pass for that artifact, logged |
| Strategist picks irrelevant artifact for the page | Critic catches ("this roadmap is non-actionable") | Specialist writes anyway; critic flags; revise drops or rewrites |
| Source-thin page (no canon nodes have the field a specialist needs) | Strategist catches in the planning phase | Strategist omits that artifact from the page rather than forcing the specialist to fabricate |
| Voice drift | Critic flags + assembler regex check | Revise the offending artifact |
| All artifacts fail validation after revise | Assembler logs critical | Page is created but flagged for human review (page_quality recommendation = "fail"); the existing page_quality stage continues to gate publishing |

## 14. Idempotency & re-run economics

- **Strategist plan** is idempotent given (canon snapshot + briefs + voice mode). Cached at `page_strategist` stage_run row.
- **Specialist outputs** are idempotent given (page plan + canon snapshot). Cached.
- **Critic notes** are idempotent given (specialist outputs).
- **Revise outputs** depend on critic notes.

A re-run from any stage replays only the affected stages downstream, exactly as the existing harness pattern. The `validateMaterializedOutput` hook (already wired in Phase 6) confirms `page` + `page_version` rows exist for the run, re-running on truncate.

## 15. Migration / coexistence with the existing `page-composition`

The new Author's Studio replaces the **inside** of `runPageCompositionStage`. The stage's external contract — `pageBriefs in → page + page_version out, with the same blockTreeJson schema for cross-cutting fields like atlasMeta` — is unchanged. The existing `page_quality` stage and `adapt` stage consume the same shape they consumed before; only the block kinds inside `blockTreeJson.blocks[]` are extended. No DB migration. Manifest schema extension ships in lockstep with the new block kinds.

The deterministic fallback in the current `page-composition.ts` is removed entirely — replaced by the validator's critical-failure log + `page_quality` revise/fail recommendation. We trust the multi-stage chain instead of a stub fallback.

## 16. Open questions to confirm before plan

1. **Voice mode default for the existing 1 hub.** The existing project `bd8dfb10-...` has no `voiceMode` set. Default to `reader_second_person` retroactively, or ask user to choose during the next config edit?
2. **Do we ship Set A in one cut, or split into two ships** — first Author's Studio (prose + critic) without specialists, then add specialists in a follow-up? Recommended: one cut. The strategist + critic add little value without the specialists they coordinate.
3. **Do diagrams need a server-side Mermaid validator** in the validator stage, or can we accept the cost of a broken diagram caught only at render time? Recommended: server-side validation. Cheap, catches issues early, satisfies the loud-fail principle.

## 17. Self-review

**Placeholder scan:** No "TBD" / "fill in later" / vague directives. Every component has a specific role, model, input, output. ✓
**Internal consistency:** Sections 5-9 align (artifact taxonomy → specialists → strategist → critic → revise). The cost table in section 12 sums correctly. ✓
**Scope:** This is a single coherent subsystem (the authoring layer). Not multiple subsystems. Single implementation plan can deliver it. ✓
**Ambiguity:** "Strategist" was at risk of overlapping with "Page Brief Planner" — clarified that the brief planner is hub-level navigation and the strategist is per-page editorial. ✓
