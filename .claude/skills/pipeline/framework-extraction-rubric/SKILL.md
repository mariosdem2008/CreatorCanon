---
name: framework-extraction-rubric
description: Use when generating canon nodes (cross-video synthesis OR per-video extraction) from Video Intelligence Cards. Defines the v2 Hub Source Document schema for canon nodes — title, lede, body (first-person teaching content), plus _internal_ planning fields and _index_ cross-references. The body field IS the hub page body, not a summary.
---

# Framework Extraction Rubric (v2)

## PURPOSE
Define the editorial standard for canon nodes — the named, teachable units that form the spine of a creator's knowledge graph. In the v2 schema, each canon node carries its own publishable body content (400-1500 words, first-person, citation-dense, weaving in per-video intelligence). The audit IS the hub source. The canon body IS the page body, not a summary of the page.

This rubric is consumed by `canon_architect` (cross-video) and the per-video canon pass.

## SCHEMA

```json
{
  "schemaVersion": "v2",
  "type": "framework | lesson | playbook | principle | pattern | tactic | definition | aha_moment | quote | topic | example",
  "origin": "multi_video | single_video | channel_profile | derived",
  "kind": "synthesis | reader_journey | reference_quotes | reference_glossary | reference_numbers | reference_mistakes | reference_tools | null",

  "title": "string — 2-6 words, concept label, the page H1",
  "lede": "string — 1-2 sentence first-person teaser, hook quality, sets up body",
  "body": "string — 400-1500 word first-person teaching, markdown allowed, [<segmentId>] citations woven naturally (8-15 per body)",

  "_internal_summary": "string — 1-2 sentence editorial summary for operators (third-person OK here)",
  "_internal_why_it_matters": "string — why this canon node exists in the graph",
  "_internal_when_to_use": "string OR null — for procedural types",
  "_internal_when_not_to_use": "string OR null",
  "_internal_common_mistake": "string OR null",
  "_internal_success_signal": "string OR null",
  "_internal_sequencing_rationale": "string OR null",

  "_index_evidence_segments": ["<segment-id>", "..."],
  "_index_supporting_examples": ["<example-id>", "..."],
  "_index_supporting_stories": ["<story-id>", "..."],
  "_index_supporting_mistakes": ["<mistake-id>", "..."],
  "_index_supporting_contrarian_takes": ["<take-id>", "..."],
  "_index_cross_link_canon": ["cn_<id>", "..."],
  "_index_source_video_ids": ["<videoId>", "..."],

  "confidenceScore": 0,
  "pageWorthinessScore": 0,
  "specificityScore": 0,
  "creatorUniquenessScore": 0,
  "evidenceQuality": "high | medium | low"
}
```

## RUBRIC

### Three field categories (the central rule)

Every field is one of three categories, prefixed accordingly:

- **Plain field name** = rendered. Renders verbatim in the published hub.
- **`_internal_*`** = planning. Informs how rendered content was written. Hidden from public hub.
- **`_index_*`** = indexing. Cross-references, IDs, search/glossing inputs. Powers filters but never primary copy.

### Voice rule (CRITICAL)

The `body` field is written in **FIRST PERSON** as if the creator wrote it. NOT a description of what they say.

- ✅ "I've been in this game for eight years and most beginners quit over picking a niche."
- ❌ "The creator says he's been in this game for eight years..."
- ❌ "Jordan argues that beginners often quit when picking a niche."

Third-person is allowed ONLY in `_internal_*` fields (operator-facing).

### Field-by-field rules

- **`title`** (rendered): 2-6 words. Concept label. Use the EXACT name from the must-cover list when applicable. This is the page H1.

- **`lede`** (rendered): 1-2 sentence first-person teaser. Hook quality. Sets up the body. Does NOT contain `[<segmentId>]` citations (cite in body, not lede).

- **`body`** (rendered) — THE PAGE BODY:
  - Length: 400-1500 words for principle/topic/synthesis; 600-1200 for framework; 800-1500 for playbook; 200-400 for definition/quote/aha_moment.
  - First person ("I", "you", "we"). The chapter, not the description.
  - Markdown OK: `## subheadings`, `**bold**`, ordered/unordered lists, blockquotes.
  - Citation density: 8-15 inline `[<segmentId>]` tokens, woven naturally after concrete claims, numbers, examples, named entities.
  - Recommended structure (not enforced):
    1. Punchy 1-2 sentence opening hook
    2. Define what this concept means in your terms
    3. Walk through the mechanism / steps / how it works
    4. Cite 1-2 concrete examples FROM YOUR TRANSCRIPTS — the per-video weaver gives you specific example IDs to use
    5. Cover the common mistake / counter-case
    6. Close with practical "what to do now"
  - Preserve verbatim creator terminology (no paraphrase of named concepts).
  - Profanity per voice fingerprint's `profanityAllowed` flag.

- **`_internal_summary`** (planning): 1-2 sentences. Editorial summary for operators reviewing the audit. Third-person OK ("This canon node captures...").

- **`_internal_why_it_matters`** (planning): 1-2 sentences. Why this is in the graph. Informs sequencing decisions.

- **`_internal_when_to_use` / `_internal_when_not_to_use` / `_internal_common_mistake` / `_internal_success_signal`**: Required for procedural types (framework / playbook / lesson / tactic). Inform body content. Don't render directly.

- **`_internal_sequencing_rationale`**: Required when `steps` order matters (frameworks / playbooks). Captures why steps run in their order.

- **`_index_evidence_segments`**: Segment IDs cited in `body`. Must match the bracketed UUIDs in the markdown. The validator checks this.

- **`_index_supporting_examples` / `_supporting_stories` / `_supporting_mistakes` / `_supporting_contrarian_takes`**: IDs from the per-video intelligence (`_index_examples`, `_index_stories`, `_index_mistakes_to_avoid`, `_index_contrarian_takes` arrays in VIC_v2). Each ID's text MUST appear (paraphrased or verbatim) somewhere in `body`. The per-video weaver populates this list before body-writing; the body writer must honor it.

- **`_index_cross_link_canon`**: Other canon node IDs that the body links to. Builder renders as sidebar / "see also" links.

- **`_index_source_video_ids`**: All video IDs the canon node was derived from.

### Type taxonomy (unchanged from v1)

Pick the most specific:

| Type | When |
|---|---|
| `framework` | Named procedure with steps |
| `playbook` | Multi-step end-to-end system |
| `lesson` | Self-contained mental model |
| `principle` | Invariant rule |
| `pattern` | Recurring shape across cases |
| `tactic` | Single-move technique |
| `definition` | Term + definition |
| `aha_moment` | Reframe that crystallizes a felt-but-unspoken idea |
| `quote` | Pull-quote-worthy passage |
| `topic` | Recurring teaching theme (often used with `kind: 'synthesis'`) |
| `example` | Concrete case |

### Origin enum (unchanged)

| Origin | When |
|---|---|
| `multi_video` | Taught across 2+ videos in the run |
| `single_video` | Taught in only one video (per-video canon pass) |
| `channel_profile` | Derived from creator profile, not a specific video |
| `derived` | Composed from other canon nodes (synthesis) |

### Quality scores (0-100, integer)

- `confidenceScore` — how sure are we this is what the creator taught
- `pageWorthinessScore` — would a hub reader want a dedicated page on this (≥60 = eligible for own brief)
- `specificityScore` — concrete vs abstract
- `creatorUniquenessScore` — carries the creator's voice/lens vs generic advice
- `evidenceQuality` — `high` (every claim cited, multi-segment), `medium` (cited but thin), `low` (asserted, weak segment support)

### Cross-reference rule

If multiple videos teach the same idea, that's ONE `multi_video` node (NOT duplicates). Title-dedup is enforced downstream.

## EXAMPLES_GOOD

### Example 1: A `framework` canon node body for Hormozi's "Better, Cheaper, Faster, Less Risky"

The full v2 canon node would look like:

```json
{
  "schemaVersion": "v2",
  "type": "framework",
  "origin": "multi_video",
  "title": "Better, Cheaper, Faster, Less Risky",
  "lede": "Customers don't care that you use AI. They care that they get their stuff better, cheaper, faster, with less risk. Everything else is theater.",
  "body": "Customers don't care that you use AI [a1a6709f-...]. They care that they get their stuff better, cheaper, faster, with less risk. Everything else is theater.\n\nHere's the test I run on every offer or workflow change. The four levers are simple:\n\n- **Better** — does the customer get a higher-quality outcome?\n- **Cheaper** — does it cost them less to get the same outcome?\n- **Faster** — do they get the outcome sooner?\n- **Less risky** — is the outcome more likely, or do they bear less downside if it doesn't work?\n\nIf you're not improving on at least ONE of those, you're rebranding, not innovating [c5b6703e-...]. If you're improving on TWO, you have an offer. If you're improving on THREE, you have a 10x offer that doesn't need to be sold — it gets bought.\n\nThe AI lead-generation example: a book launch's customer support team handled 90% of about 120,000 tickets without a human in the loop [233dd89a-...]. That's not 'we used AI' — that's better (no escalations to wrong agents), faster (instant resolution), cheaper (one-tenth the headcount), and less risky (the agent never goes off-script). Four for four. The market doesn't care which model we used. They care that the answer was right and it came fast.\n\nThe common mistake: companies stamp 'AI-powered' on the brochure and ship the same product. The customer experience is unchanged. They congratulate themselves for 'modernizing' and watch their competitor — the one who used AI to actually move one of the four levers — eat their lunch [e35d6a06-...].\n\nThe practical move when you're evaluating an AI tool, a workflow redesign, or a new offer: write the four words down on paper. Force yourself to articulate which one you're moving and by how much. If you can't pick one with conviction, the change isn't ready to ship.",
  "_internal_summary": "A four-axis test for whether a change actually improves customer outcome. The framework is what allows downstream canon (e.g. AI Is Leverage After Judgment) to anchor in business value rather than tool hype.",
  "_internal_why_it_matters": "Operators evaluating AI / new offers / workflow changes need a customer-outcome filter. This node is the filter.",
  "_internal_when_to_use": "Any time the operator is deciding whether to ship a change. Especially useful when the change is being justified by 'we use AI' rather than 'the customer gets X better/cheaper/faster/less-risky'.",
  "_internal_when_not_to_use": "When the question is structural (org design, hiring) rather than customer-facing.",
  "_internal_common_mistake": "Stamping 'AI-powered' on the brochure without moving any of the four levers.",
  "_internal_success_signal": "The customer can articulate why the new offering is better/cheaper/faster/less-risky in their own words.",
  "_internal_sequencing_rationale": "Lever order: better, cheaper, faster, less risky reads naturally as priority but is not strict — operators can lead with whichever lever the change moves most.",
  "_index_evidence_segments": ["a1a6709f-...", "c5b6703e-...", "233dd89a-...", "e35d6a06-..."],
  "_index_supporting_examples": ["ex_book_launch_ai_support"],
  "_index_supporting_stories": [],
  "_index_supporting_mistakes": ["mst_ai_branding_without_lever_movement"],
  "_index_supporting_contrarian_takes": [],
  "_index_cross_link_canon": ["cn_ai_is_leverage_after_judgment", "cn_workflow_based_thinking"],
  "_index_source_video_ids": ["mu_19babea8dd50", "mu_d1874754ed57"],
  "confidenceScore": 95,
  "pageWorthinessScore": 92,
  "specificityScore": 90,
  "creatorUniquenessScore": 88,
  "evidenceQuality": "high"
}
```

The body reads like Hormozi wrote a chapter on his own site. First-person. Concrete example with citation. Common mistake called out. Practical close. ~370 words; in production aim 600-1200 for frameworks.

### Example 2: A `lesson` canon node body in Walker's voice (science-explainer)

```json
{
  "title": "Sleep Is a 24-Hour System",
  "lede": "Your night is the output of your day. If you want better sleep, stop trying to fix bedtime and start fixing the 16 hours that lead up to it.",
  "body": "Most people treat sleep like a software process — start it at 11pm, end it at 7am, hope it ran cleanly. That model fails for almost everyone, and the reason is mechanistic [a1a6709f-...].\n\nSleep is the output of a 24-hour biological system. Two processes determine when you fall asleep, how deeply, and when you wake. Process C is the circadian rhythm — the clock in your suprachiasmatic nucleus that's driven by light, temperature, and timing of meals. Process S is sleep pressure — the buildup of adenosine over the day, dissipated only by sleep [c5b6703e-...].\n\nWhen these align, you fall asleep easily, sleep deeply, and wake refreshed. When they're misaligned — bright phone at 11pm, caffeine at 4pm, irregular wake times — the system is essentially asking your brain to shut down while still producing wake signals. The brain wins. You lie there.\n\nThe practical move is to stop treating sleep as a bedtime event and start treating the whole day as the system that produces tonight's sleep. Three high-yield levers, in order of impact:\n\n1. Wake at the same time every day, including weekends. Stable wake time anchors Process C [233dd89a-...].\n2. Get bright outdoor light within the first hour of waking. This sharpens the circadian signal so cortisol rises in the morning and melatonin can rise at night.\n3. Stop caffeine 8-10 hours before bed. Caffeine's half-life is 5-6 hours, but the binding is non-linear — at 6 hours before bed you still have ~50% of the dose blocking adenosine receptors [e35d6a06-...].\n\nThe common mistake people make is to compensate after a bad night — sleep in, nap aggressively, drink more coffee. All three reduce sleep pressure for the next night, prolonging the disruption. The protocol is to do nothing and let the system reset on the next regular wake time.\n\nWhat you'll notice when this lands: you stop feeling tired-but-wired. Mornings become easier within a week. The need to chase sleep with willpower drops away because you've stopped sabotaging the system that produces it for you.",
  ...
}
```

Note the science-explainer voice differences from Hormozi:
- Longer measured sentences
- Mechanism-first (Process C / Process S explanation before protocol)
- Hedged claims ("almost everyone", not "everyone")
- Numbered protocols
- Evidence ladder (citations after specific claims)
- Same first-person discipline. Same citation density.

## EXAMPLES_BAD

### Bad 1: Body is a third-person summary (single largest failure mode)

```
"body": "The creator argues that customers don't care about AI. He explains that the four levers are better, cheaper, faster, and less risky. Jordan says you should pick one before shipping a change."
```

Why bad: Third-person attribution. Reads like a Wikipedia article summary. The reader sees "Jordan says" on a page that's supposedly BY Jordan. Voice flip is mandatory at extraction time.

### Bad 2: Body is a list of summaries with no teaching

```
"body": "Better, Cheaper, Faster, Less Risky.\n\n- Better: higher quality.\n- Cheaper: lower cost.\n- Faster: less time.\n- Less risky: less downside.\n\nUse this framework when evaluating an offer."
```

Why bad: It's an outline, not a chapter. No examples. No citations. No teaching. The page would be 50 words long.

### Bad 3: Body without citations

```
"body": "Customers don't care that you use AI. They care that they get their stuff better, cheaper, faster, with less risk. Most companies stamp 'AI-powered' on the brochure and ship the same product..."
```

Why bad: Zero `[<segmentId>]` tokens. The validator hard-fails this. Body must cite the transcripts that justify the claims.

### Bad 4: Body that paraphrases creator terms

```
"body": "Use task-oriented planning instead of role-based hiring..."
```

Where the creator says "workflow-based thinking" not "task-oriented planning." Verbatim creator vocabulary is mandatory.

### Bad 5: Body that's `_internal_summary` repeated as body

```
"body": "This canon node captures Hormozi's four-axis test for evaluating offers and changes. It anchors AI claims in customer outcomes."
```

Why bad: That's an _internal_summary — analyst notes. There's no actual teaching. Reader learns nothing.

## ANTI_PATTERNS

- **Tip-promotion**: turning a one-liner ("write more") into a "framework" node. Frameworks have a NAME and a procedure.
- **Concept-bloat**: bodies whose summary reads like an essay. Stay punchy.
- **Hallucinated examples**: examples in `body` that don't trace to a per-video `_index_examples` item via `_index_supporting_examples`. The weaver enforces this.
- **Title paraphrase**: rewording the creator's name into your own (e.g. "task-oriented planning" instead of "Workflow-Based Thinking"). Preserve the verbatim name.
- **Wrong-voice attribution**: "the creator says…" anywhere in `rendered` fields. Hard fail.
- **Citation absence**: `body` without `[<segmentId>]` tokens. Hard fail.
- **Citation spam**: 3+ citations in one sentence. Reads as scaffolding, not teaching.
- **Body-as-outline**: a body that's just a bulleted list with no prose between. Bullets are part of the body, not the whole body.
- **All-multi_video**: setting `origin: 'multi_video'` when only one video taught the idea. Be honest.
- **Generic-everything scores**: `confidenceScore: 80` on every node. Spread the scores honestly.

## OUTPUT_FORMAT

```
You are <creatorName>, writing a chapter of your knowledge hub on "<canonNodeTitle>".

You teach in first person — "I", "you", "we" — as if you were writing your own
book or your own site. You are NOT an analyst describing what you say.

# Your voice (archetype: <archetype>)
<HUB_SOURCE_VOICE section spliced in from the creator-archetype skill file>

Voice fingerprint:
- profanityAllowed: <bool>
- tonePreset: <preset>   // canonical: blunt-tactical | analytical-detached | warm-coaching | reflective-thoughtful
- preserveTerms (use VERBATIM, never paraphrased): <comma-separated terms>

# Source material (yours)

## Transcript segments cited (use [<segmentId>] inline in body):
[<segId1>] (<m:ss>) "<full segment text>"
[<segId2>] (<m:ss>) "..."
...

## Examples from your videos (the weaver picked these for THIS canon node):
- (id=<exId1>) "<example text>"
- (id=<exId2>) "<example text>"

## Stories from your videos:
- (id=<storyId1>) "<story text>"

## Mistakes you've called out:
- (id=<mistakeId1>) <mistake>; the correction is: <correction>

## Contrarian takes:
- (id=<takeId1>) "<take>"

# Task
Write the canon node for "<canonNodeTitle>". Output ONE JSON object matching
CanonNode_v2 schema. The `body` field is 400-1500 words of first-person markdown
teaching with 8-15 inline `[<segmentId>]` citations, weaving in the examples,
stories, and mistakes above by reference (their text must appear in body).

# Voice rules (CRITICAL — hard-fail otherwise)
- First person only in rendered fields. NEVER "the creator", "<creatorName>",
  "she/he says", "the speaker" in `title`, `lede`, `body`.
- Verbatim preserveTerms — do not rephrase named concepts.
- profanityAllowed governs `body` and `lede`. `_internal_*` fields stay neutral.
- Markdown allowed in `body` only.

# Output format
ONE JSON object. No code fences. No preamble. First char `{`, last char `}`.

{
  "schemaVersion": "v2",
  "type": "...",
  "origin": "...",
  "title": "...",
  "lede": "...",
  "body": "<400-1500 word first-person markdown body with inline [<segmentId>] citations>",
  "_internal_summary": "...",
  "_internal_why_it_matters": "...",
  "_internal_when_to_use": "..." | null,
  "_internal_when_not_to_use": "..." | null,
  "_internal_common_mistake": "..." | null,
  "_internal_success_signal": "..." | null,
  "_internal_sequencing_rationale": "..." | null,
  "_index_evidence_segments": ["<segment-id>"],
  "_index_supporting_examples": ["<example-id>"],
  "_index_supporting_stories": ["<story-id>"],
  "_index_supporting_mistakes": ["<mistake-id>"],
  "_index_supporting_contrarian_takes": ["<take-id>"],
  "_index_cross_link_canon": ["cn_..."],
  "_index_source_video_ids": ["..."],
  "confidenceScore": 0,
  "pageWorthinessScore": 0,
  "specificityScore": 0,
  "creatorUniquenessScore": 0,
  "evidenceQuality": "high" | "medium" | "low"
}
```
