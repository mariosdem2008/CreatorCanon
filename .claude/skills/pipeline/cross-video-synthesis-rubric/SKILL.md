---
name: cross-video-synthesis-rubric
description: Use when generating synthesis canon nodes (kind=synthesis) that connect 3+ existing canon nodes under a single unifying argument. v2 schema — synthesis nodes carry a body field (400-1200 words, first-person, weaving the unifying thread across child canon bodies). The synthesis IS publishable hub content, not analyst notes.
---

# Cross-Video Synthesis Rubric (v2)

## PURPOSE
Synthesis nodes are meta-claims that connect 3+ canon nodes under a single argument. In v2, each synthesis node carries its own publishable body — 400-1200 words of first-person teaching that weaves the unifying thread across the children. Synthesis nodes typically render as **pillar pages** because they tie together a topic cluster.

## SCHEMA

A synthesis is a CanonNode_v2 with `type: 'topic'` and `kind: 'synthesis'`. All standard CanonNode_v2 fields apply:

```json
{
  "schemaVersion": "v2",
  "type": "topic",
  "kind": "synthesis",
  "origin": "derived",

  "title": "string — 3-7 words, names the meta-claim",
  "lede": "string — 1-2 sentence first-person teaser",
  "body": "string — 400-1200 word first-person teaching weaving the unifying thread",

  "_internal_summary": "string — 1-2 sentences naming the unifying argument",
  "_internal_unifying_thread": "string — ONE sentence: the single thread connecting children",
  "_internal_why_it_matters": "string — why a hub reader benefits",

  "_index_evidence_segments": ["..."],
  "_index_supporting_examples": ["..."],
  "_index_supporting_stories": ["..."],
  "_index_supporting_mistakes": ["..."],
  "_index_cross_link_canon": ["cn_child1", "cn_child2", "cn_child3", "..."],
  "_index_source_video_ids": ["..."],

  "confidenceScore": 0,
  "pageWorthinessScore": 0,
  "specificityScore": 0,
  "creatorUniquenessScore": 0,
  "evidenceQuality": "high"
}
```

`_index_cross_link_canon` is mandatory (3+ child IDs). The body must reference these children by name.

## RUBRIC

### Voice rule
Body is first-person teaching. Same first-person discipline as framework-extraction-rubric. NEVER "the creator says X."

### Synthesis-specific rules

- **Connect 3+ canon nodes by ID** in `_index_cross_link_canon`. Synthesis with <3 children is rejected by the validator.
- **`_internal_unifying_thread`** (planning): ONE sentence capturing the single argumentative thread. Drives the body.
- **`title`** (rendered): names the META-CLAIM, not the topic.
  - ✅ "Cashflow Before Scale" (it's a thesis)
  - ❌ "Money Management" (it's a category, not a meta-claim)
- **`body`** (rendered): 400-1200 words. Walks through the meta-claim by referencing the children. Recommended structure:
  1. State the meta-claim (1-2 sentences, the lede expanded)
  2. Show why the meta-claim is non-obvious (against what most people think)
  3. Walk through the children one at a time, naming them and showing how each is an instance of the meta-claim
  4. Cite transcript segments for the strongest examples (4-10 inline `[<segmentId>]` tokens)
  5. Close with the practical implication
- **Distinct from any single child canon body**. The synthesis must argue SOMETHING that no individual child argues. If the synthesis reads like a longer summary of one child, it isn't real synthesis.

## EXAMPLES_GOOD

### Hormozi: "AI Is Leverage After Judgment"

```json
{
  "schemaVersion": "v2",
  "type": "topic",
  "kind": "synthesis",
  "origin": "derived",
  "title": "AI Is Leverage After Judgment",
  "lede": "AI multiplies whatever you point it at. If your judgment is bad, AI makes you wrong faster.",
  "body": "Most operators are asking the wrong AI question. They're asking 'should we use AI?' The right question is 'where is my judgment already correct, so AI can multiply it?' [a1a6709f-...]\n\nThree pieces of my own thinking — when you put them together — make this concrete.\n\nFirst, **Workflow-Based Thinking**. Before AI is even on the table, you have to break job titles into named workflows you can see, edit, and replace. The operator who hasn't done this has no place to put AI. They're trying to bolt AI onto a 'role,' which is an abstraction. AI doesn't run abstractions; AI runs workflows.\n\nSecond, **Better, Cheaper, Faster, Less Risky**. Once you've named the workflows, the four-axis test tells you which workflows benefit from AI. If a workflow can't be made better, cheaper, faster, or less risky by adding AI, you don't add AI. You walk away.\n\nThird, **One Workflow, Soup to Nuts**. When you do find a workflow that benefits from AI on at least one axis, you don't sprinkle AI across 14 workflows. You take ONE end-to-end workflow and let AI run it from start to finish. The book launch where 90% of about 120,000 support tickets were resolved without a human in the loop [c5b6703e-...] — that's not 'we used AI.' That's one workflow run end-to-end by AI, with the human supervising exceptions. THAT is leverage.\n\nNotice what each step requires before AI gets involved. Step one requires that you can SEE your business as workflows. Step two requires that you can JUDGE which workflows are worth automating. Step three requires that you can OWN one workflow end-to-end before fragmenting it across tools.\n\nAll three are judgment calls. None of them are AI. AI is what you do AFTER you've made these calls correctly.\n\nThe operators who are eating their competitors right now are operators whose judgment was already sharp. AI just multiplied them. The operators who are losing are the ones who saw the AI wave and tried to skip the judgment step [233dd89a-...]. AI sharpened their wrong calls. They moved faster in the wrong direction.\n\nSo when you're evaluating an AI move, don't start with the AI. Start with the judgment behind it. If the judgment is right, AI will multiply you. If the judgment is wrong, AI will multiply your wrongness. Either way, leverage.",
  "_internal_summary": "Meta-claim: AI multiplies whatever judgment is already in place. Operators with good judgment win bigger; operators with bad judgment lose faster.",
  "_internal_unifying_thread": "AI is a multiplier of the operator's existing judgment, not a replacement for it.",
  "_internal_why_it_matters": "Operators are getting AI advice from people who confuse AI adoption with AI value. The synthesis gives them the filter: judgment first, AI second.",
  "_index_evidence_segments": ["a1a6709f-...", "c5b6703e-...", "233dd89a-..."],
  "_index_supporting_examples": ["ex_book_launch_ai_support"],
  "_index_supporting_stories": [],
  "_index_supporting_mistakes": ["mst_ai_branding_without_judgment"],
  "_index_cross_link_canon": ["cn_workflow_based_thinking", "cn_better_cheaper_faster_less_risky", "cn_one_workflow_soup_to_nuts"],
  "_index_source_video_ids": ["mu_19babea8dd50", "mu_d1874754ed57"],
  "confidenceScore": 92, "pageWorthinessScore": 95, "specificityScore": 88, "creatorUniquenessScore": 92, "evidenceQuality": "high"
}
```

The body NAMES each child canon node ("**Workflow-Based Thinking**", etc.) and weaves them into a single argument that none of them makes alone.

## EXAMPLES_BAD

### Bad 1: Synthesis body lists children without an argument

```json
{
  "body": "Hormozi has three frameworks for AI: Workflow-Based Thinking, Better Cheaper Faster Less Risky, and One Workflow Soup to Nuts. Workflow-Based Thinking is about breaking roles into workflows. Better Cheaper Faster Less Risky is about evaluating offers..."
}
```

Why bad: It's a list of summaries, not a synthesis. No unifying argument. Asks no question, answers no question.

### Bad 2: Synthesis with <3 children

```json
{ "_index_cross_link_canon": ["cn_workflow_based_thinking", "cn_better_cheaper_faster_less_risky"] }
```

Two children is comparison, not synthesis. Validator rejects.

### Bad 3: Title is a topic, not a meta-claim

```json
{ "title": "AI Strategy" }
```

A category, not an argument. Should be: "AI Is Leverage After Judgment", "Cashflow Before Scale", "Sleep Is a 24-Hour System."

### Bad 4: Body that's a longer version of one child

If you removed the names of the other two children and the body still made sense as a stand-alone teaching of child #1, the synthesis isn't real.

## ANTI_PATTERNS

- **Index disguised as synthesis**: body lists children without arguing anything
- **<3 children**: not enough to call it synthesis
- **Topic-title not thesis-title**: "AI Strategy" instead of "AI Is Leverage After Judgment"
- **Body summarizes one child**: synthesis body that's basically a longer version of one canon body
- **No citations**: synthesis bodies still need 4-10 `[<segmentId>]` tokens on concrete claims
- **Forced syntheses**: connecting 3 unrelated canon just to hit the minimum

## OUTPUT_FORMAT

```
You are <creatorName>, writing a synthesis chapter for your knowledge hub.
A synthesis names a META-CLAIM that connects 3+ of your individual frameworks
or lessons under a single argument.

You write in first person as the creator, not as an analyst.

# Your voice (archetype: <archetype>)
<HUB_SOURCE_VOICE section spliced from creator-archetype skill>

Voice fingerprint:
- profanityAllowed: <bool>
- tonePreset: <preset>
- preserveTerms (verbatim): <terms>

# Source material
## Existing canon nodes available to connect:
[<canonId1>] <title> — <type> — _internal_summary: <summary>
[<canonId2>] ...
...

## Already-generated syntheses (do NOT duplicate these):
- <title>

## Channel context:
- _internal_audience: <audience>
- _internal_dominant_tone: <tone>

# Task
Identify a META-CLAIM that ties 3+ canon nodes together under a unifying
argument. Output ONE JSON object matching CanonNode_v2 with kind='synthesis'.
The body is 400-1200 words of first-person teaching that NAMES each child
canon node and weaves them into the meta-claim's argument.

# Voice rules (CRITICAL)
- First person in title, lede, body. NEVER 'the creator says X' anywhere.
- Body must argue SOMETHING that no individual child argues. Not a list of summaries.
- 4-10 inline [<segmentId>] citations.

# Output format
ONE JSON object. No code fences. First char `{`, last char `}`.

{
  "schemaVersion": "v2",
  "type": "topic",
  "kind": "synthesis",
  "origin": "derived",
  "title": "...",
  "lede": "...",
  "body": "<400-1200 word first-person markdown body weaving 3+ child canon nodes>",
  "_internal_summary": "...",
  "_internal_unifying_thread": "<ONE sentence: the thread>",
  "_internal_why_it_matters": "...",
  "_index_evidence_segments": ["..."],
  "_index_supporting_examples": ["..."],
  "_index_supporting_stories": ["..."],
  "_index_supporting_mistakes": ["..."],
  "_index_cross_link_canon": ["cn_...", "cn_...", "cn_..."],
  "_index_source_video_ids": ["..."],
  "confidenceScore": 0,
  "pageWorthinessScore": 0,
  "specificityScore": 0,
  "creatorUniquenessScore": 0,
  "evidenceQuality": "high"
}
```
