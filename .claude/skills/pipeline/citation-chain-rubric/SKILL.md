---
name: citation-chain-rubric
description: v2 citation rules. Citations now appear inline in body prose (8-15 per canon body, 2-5 per brief body), not as 1-2 references on a summary. Defines the [<segmentId>] token format, the layered citation rules per artifact, and the density targets.
---

# Citation Chain Rubric (v2)

## PURPOSE
Every claim in the Hub Source Document ultimately answers to a transcript segment. v2 changes WHERE citations live: instead of 1-2 references attached to a summary, citations are woven inline through 400-1500 word `body` fields. The audit page renderer + the builder convert these brackets into clickable YouTube timestamps; without them the body reads as unsupported.

## SCHEMA

A citation token is a square-bracketed identifier embedded inline in a string field. Three legal forms:

```
[<segmentId>]                     // UUID — RECOMMENDED for transcript evidence in body
[cn_<canon_node_id>]              // canon node ID — for cross-references inside synthesis bodies
[m:ss-m:ss]                       // pure time range — fallback when no segmentId is available
```

ILLEGAL forms (break the linkifier):

```
[<startMs>ms-<endMs>ms]           // ms-range without videoId binding — cannot resolve
[12345-23456]                     // bare numbers, ambiguous
```

## RUBRIC

### v2 density targets per artifact

| Artifact | Field | Citations expected |
|---|---|---|
| Canon node | `body` | **8-15** inline `[<segmentId>]` tokens |
| Synthesis | `body` | **4-10** tokens (mix of `[<segmentId>]` and `[cn_<id>]`) |
| Reader journey phase | `body` | **2-5** tokens |
| Page brief | `body` | **2-5** tokens |
| VIC | `_index_*` items | each item carries `segments: string[]` linking to its evidence |
| ANY | `lede` / `hook` / `title` | **0** — these are hook fields, no IDs |
| ANY | `_internal_*` fields | **0** — planning fields don't carry citations |

### Layered citation rules

Each artifact cites the level immediately below it:

- **VIC items** (`_index_examples[].segments`, etc.) cite **segment IDs**
- **Canon node `body`** cites **segment IDs** (`[<segmentId>]` inline)
- **Synthesis `body`** cites **canon node IDs** for child references (`**Workflow-Based Thinking**` referenced by name) AND **segment IDs** for direct claims it makes itself
- **Page brief `body`** cites **segment IDs** when making setup claims, but lighter density (2-5)
- **Reader journey phase `body`** cites **segment IDs** when describing reader experience grounded in transcript

### Placement rules

Citations should follow CONCRETE claims:
- Specific numbers ("90% of about 120,000 tickets [c5b6703e-...]")
- Named entities ("the suprachiasmatic nucleus [a1a6709f-...]")
- Direct examples / mistakes / counter-cases ("operators who skipped this step [233dd89a-...]")
- Strong claims that need backing ("this is the most underused tool in sleep medicine [8b9a4c2d-...]")

Citations should NOT follow:
- Hedges ("might", "sometimes", "in some cases" — these are generic)
- Restatements ("as I said earlier")
- Hooks or rhetorical openers ("here's the thing")

### Forbidden patterns

- **Citation in `lede` or `hook`**: the lede is a teaser, no evidence yet. Putting a citation in lede creates a "wait, prove it" reaction before the body even starts.
- **Citation in `_internal_*` fields**: planning notes don't render. Citations in them are dead weight.
- **Citation spam**: `"[<id1>][<id2>][<id3>]"` consecutive. Reads as scaffolding. One per concrete claim, not three.
- **Naked URL**: `https://youtube.com/watch?v=...&t=42`. The renderer builds the URL from `[<segmentId>]`. Don't write URLs.
- **`[<startMs>ms-<endMs>ms]`** ranges. They lack video binding and can't linkify. Old runs may have these; the ms-rewriter cleans them up.

## EXAMPLES_GOOD

### Example 1: high-density canon body (Hormozi style)

```markdown
Customers don't care that you use AI [a1a6709f-...]. They care that they get
their stuff better, cheaper, faster, with less risk. Everything else is theater.

Here's the test I run on every offer or workflow change. The four levers are
simple:

- **Better** — does the customer get a higher-quality outcome?
- **Cheaper** — does it cost them less?
- **Faster** — do they get the outcome sooner?
- **Less risky** — is the outcome more likely?

If you're not improving on at least ONE of those, you're rebranding, not
innovating [c5b6703e-...]. If you're improving on TWO, you have an offer.
If you're improving on THREE, you have a 10x offer that doesn't need to
be sold — it gets bought.

The AI lead-generation example: a book launch's customer support team
handled 90% of about 120,000 tickets without a human in the loop
[233dd89a-...]. That's better, faster, cheaper, less risky. Four for four.
```

5 citations in ~150 words = 1 per ~30 words. Inside the v2 target band.

### Example 2: medium-density synthesis body

```markdown
Three pieces of my own thinking — when you put them together — make this
concrete.

First, **Workflow-Based Thinking** [cn_workflow_based_thinking]. Before AI
is even on the table, you have to break job titles into named workflows.

Second, **Better, Cheaper, Faster, Less Risky** [cn_better_cheaper_faster_less_risky].
The four-axis test tells you which workflows benefit from AI.

The book launch where 90% of about 120,000 support tickets were resolved
without a human in the loop [c5b6703e-...] — that's not 'we used AI.'
That's one workflow run end-to-end by AI.
```

Mix of `[cn_<id>]` references for child canon and `[<segmentId>]` for direct evidence.

### Example 3: light-density brief body

```markdown
I've made every hiring mistake there is. I've hired people I liked, people
who looked great on paper, people my friends recommended. They all failed
for the same reason: I was hiring a job title when what I actually needed
was a workflow [a1a6709f-...].

A job title is a category. A workflow is a specific sequence of inputs
becoming a specific output. 'Marketing Manager' is a category. 'A daily
lead-qualification workflow that turns 50 raw inbound leads into 12 qualified
appointments' is a workflow.
```

2 citations in ~100 words. Brief body sets up; canon body teaches.

## EXAMPLES_BAD

### Bad 1: Body without citations

```markdown
Customers don't care that you use AI. They care about results. The four
levers are better, cheaper, faster, less risky. If you're not moving any
of those, you're rebranding.
```

Why bad: 0 citations. Reader has no path back to the source. Hard-fail.

### Bad 2: ms-range citation

```markdown
Customers don't care that you use AI [12345ms-23456ms].
```

Why bad: ms-ranges can't linkify (no videoId binding). The ms-rewriter cleans these up after the fact, but they shouldn't be generated in the first place.

### Bad 3: Citation spam

```markdown
The four levers [a1][b2][c3][d4] are simple [e5][f6][g7].
```

Why bad: 7 citations in 8 words. Reads as scaffolding, not teaching.

### Bad 4: Citation in `_internal_summary`

```json
{ "_internal_summary": "Hormozi's four-axis test for evaluating offers [a1a6709f-...]" }
```

Why bad: `_internal_*` fields don't render. The citation is dead weight. Move it to body.

### Bad 5: Citation in `lede`

```json
{ "lede": "Customers don't care that you use AI [a1a6709f-...]." }
```

Why bad: Lede is a teaser. Citation undermines the hook. Cite in body, not lede.

## ANTI_PATTERNS

- **0 citations in body**: hard-fail, the body has no evidence chain
- **<5 citations in canon body**: soft-fail, operator review needed
- **Citation in lede/hook/title**: violates the role of those fields
- **Citation in `_internal_*` fields**: dead weight, citations only in rendered fields
- **Citation spam (3+ in one sentence)**: scaffolding, not teaching
- **ms-range citations**: can't linkify, prefer `[<segmentId>]`
- **Hallucinated segment IDs**: every UUID/cn-id must exist; the validator checks every reference
- **Naked URLs**: don't write YouTube URLs, write segment ID brackets and let the renderer handle it
- **Cross-level citations**: synthesis citing segment IDs as `_index_cross_link_canon`. Match level: synthesis→canon, canon→segment.

## OUTPUT_FORMAT

```
# Citation rules (v2)

When writing canon node `body` fields, weave 8-15 inline `[<segmentId>]`
citations naturally — after concrete claims, numbers, named entities,
direct examples, mistakes/corrections, contrarian takes.

When writing synthesis `body`, mix `[cn_<canon_id>]` for child references
and `[<segmentId>]` for direct evidence. Total 4-10 citations.

When writing brief `body`, lighter density: 2-5 `[<segmentId>]` tokens
on the most concrete setup claims.

When writing reader journey phase `body`, 2-5 `[<segmentId>]` tokens
where reader experience is grounded in transcript.

NEVER cite in:
  - lede, hook, title (hook fields, no evidence yet)
  - any _internal_* field (planning, doesn't render)

NEVER use:
  - [<startMs>ms-<endMs>ms] ranges (can't linkify)
  - Naked YouTube URLs (renderer handles construction)
  - Bare numbers / partial UUIDs

Use the EXACT segment ID format provided in the source material — UUID
form, brackets, no spaces.
```
