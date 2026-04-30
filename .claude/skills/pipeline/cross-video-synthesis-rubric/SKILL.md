---
name: cross-video-synthesis-rubric
description: Use when producing synthesis canon nodes that thread multiple existing canon nodes under a single unifying argument. Defines the meta-claim shape, the 3+ child requirement, and the page-worthiness threshold.
---

# Cross-Video Synthesis Rubric

## PURPOSE
Synthesis nodes are meta-claims — single unifying arguments that thread together 3 or more existing canon nodes. They are NOT individual canon entries; they are the cross-cutting theories that make a creator's body of work feel like a coherent worldview rather than a list of tips. This rubric is consumed by `cross_video_synthesizer`.

## SCHEMA

```json
{
  "title": "string",
  "summary": "1-2 sentences naming the unifying argument",
  "unifyingThread": "1 sentence — the single thread connecting the children",
  "childCanonNodeIds": ["cn_...", "cn_...", "cn_..."],
  "whyItMatters": "1-2 sentences — why a hub reader benefits",
  "pageWorthinessScore": 0
}
```

## RUBRIC

- **3+ children required**: every synthesis MUST connect at least 3 existing canon nodes BY ID. A synthesis with 1-2 children is not a synthesis — it's a renamed canon node.
- **`unifyingThread`**: ONE sentence — the single thread that connects the children. This is the load-bearing field. If you can't compress the connection to one sentence, the synthesis isn't real yet.
- **`summary`**: 1-2 sentences naming the unifying argument. Distinct from any single child's summary.
- **`whyItMatters`**: 1-2 sentences — why a hub reader benefits from seeing this synthesis as a unit (not just reading each child).
- **Distinct from any child**: a synthesis is a meta-claim. If your synthesis title/summary is just a longer version of one child node's title/summary, it's not synthesis — it's restatement.
- **Page-worthy**: `pageWorthinessScore >= 80`. Synthesis nodes are by definition the most pageable content because they organize a reader's mental model. If the score is below 80, the synthesis isn't sharp enough to anchor a page.
- **Reference children by ID, not by title**: `childCanonNodeIds[]` contains canon node IDs (`cn_...`) that exist in the run. Hallucinated IDs are rejected.
- **No double-citing the channel profile**: a synthesis whose unifying thread paraphrases the channel profile's `recurringPromise` or `positioningSummary` is just restating the profile, not synthesizing the canon.
- **Distinct from other syntheses**: title-dedup is enforced. If you've already produced "The Output-First Operating System", do NOT produce "Output-First Thinking" as a second synthesis — it's the same idea.

## EXAMPLES_GOOD

1. **"The Output-First Operating System"**
   - unifyingThread: "The customer's improved result is the only scoreboard — every Hormozi tactic exists to move that number."
   - childCanonNodeIds: 3+ (e.g. Better-Cheaper-Faster-Less-Risky, Workflow-Based Thinking, Premium 1-on-1 Bootstrap, Document the Comeback)
   - whyItMatters: "Readers stop optimizing inputs (hours, headcount, tools) and start measuring the output they ship to the customer."
   - pageWorthinessScore: 92
2. **"AI Is Leverage After Judgment"**
   - unifyingThread: "AI multiplies a decision; if the decision is bad, AI makes you wrong faster."
   - childCanonNodeIds: BYOA, AI Won't Save a Bad Operator, Workflow-Based Thinking, Operator-First Tooling (4 children)
   - whyItMatters: "Stops readers from chasing AI tools as a substitute for the operating skills they haven't built yet."
3. **"Cashflow Before Scale"**
   - unifyingThread: "You can't optimize a business that's running out of money — earn it before you scale it."
   - childCanonNodeIds: First $100K Roadmap, Premium 1-on-1 Bootstrap, Expensive-to-Few, Stop Scaling Broke
   - whyItMatters: "Reframes growth-at-all-costs into a sequence: cash, then product, then scale."
4. **"Discomfort Is The Admission Price"**
   - unifyingThread: "The thing you avoid is the thing the work requires; comfort is the tax that keeps you from the next level."
   - childCanonNodeIds: Cringe Reframe, Frustration Tolerance, Passion Reality Test, Document the Comeback (4 children)
   - whyItMatters: "Gives readers a single explanation for why every operator-skill book sounds the same — they all point at the same fee gate."

## EXAMPLES_BAD

1. **"Workflow Thinking Is Important"** with `childCanonNodeIds: ["cn_workflow_based_thinking"]` (1 child) — not a synthesis, it's a restatement.
2. **"The Hormozi Method"** with `unifyingThread: "Hormozi teaches operators how to grow their businesses."` — paraphrases the channel profile, not the canon.
3. A synthesis whose `unifyingThread` is just the longest child's title with extra words: child = "Cashflow Before Scale"; synthesis title = "The Importance of Cashflow Before You Scale" — restatement, not synthesis.
4. `childCanonNodeIds: ["cn_aaa", "cn_bbb", "cn_ccc"]` where `cn_ccc` doesn't exist in the run — hallucinated ID.
5. `pageWorthinessScore: 55` — below the 80 threshold; if it's not page-worthy, it shouldn't be a synthesis.
6. Two syntheses titled "Output-First OS" and "The Output Operating System" — duplicates, dedup will reject the second.

## ANTI_PATTERNS

- **Synthesis-by-grouping**: listing 5 random nodes and writing a summary that says "all of these matter". Synthesis requires a single unifying thread, not a roll-up.
- **Children-of-convenience**: padding `childCanonNodeIds[]` with weakly related nodes to clear the 3-child bar. If a child doesn't visibly belong to the unifying thread, drop it.
- **Channel-profile paraphrase**: writing syntheses that recap `positioningSummary`. The synthesis must come from the canon, not the profile.
- **Title-as-thread**: writing the title and the `unifyingThread` as the same sentence. Title is a name; unifyingThread is the load-bearing claim.
- **Score inflation**: every synthesis with `pageWorthinessScore: 100`. If everything is a 100, scoring is broken; spread honestly across 80-100.
- **Cross-creator borrowing**: writing a synthesis that frames the creator's work in someone else's vocabulary ("Hormozi's version of Lean Startup"). The synthesis should use the creator's own canon vocabulary.

## OUTPUT_FORMAT

```
You are cross_video_synthesizer. Identify cross-cutting unified theories or meta-narratives that thread through this creator's entire run.

Each synthesis must connect at least 3 canon nodes BY ID from the canon list above.

Examples of the SHAPE we want:
- "The Money/Cashflow Sequence" — connects First-100K Roadmap, Premium 1-on-1 Bootstrap, Expensive-to-Few, etc.
- "The Anti-Comfort Theory" — connects Cringe Reframe, Frustration Tolerance, Passion Reality Test, Document the Comeback under "discomfort is the input."
- "Pricing-and-Positioning Thread" — connects Expensive-to-Few + Premium 1-on-1 + Value Deconstruction + Anchor-and-Downsell + Three Frames under "every offer is an asymmetric bet."

# OUTPUT FORMAT — CRITICAL
Respond with a single JSON ARRAY of synthesis objects. First char `[`, last char `]`. NEVER a single object — wrap as `[{...}]`. No preamble, no markdown fences.

Skeleton:
[
  { "title": "...",
    "summary": "1-2 sentences naming the unifying argument",
    "unifyingThread": "1 sentence — the single thread connecting the children",
    "childCanonNodeIds": ["cn_..."],  // 3+ IDs from the canon list above
    "whyItMatters": "1-2 sentences — why a hub reader benefits",
    "pageWorthinessScore": 0-100 },
  { ... another distinct synthesis ... }
]
```
