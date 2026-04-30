---
name: framework-extraction-rubric
description: Use when generating canon nodes (cross-video synthesis OR per-video extraction) from Video Intelligence Cards. Defines what counts as a canon-worthy named teachable unit and the exact payload shape every node must conform to.
---

# Framework Extraction Rubric

## PURPOSE
Define the editorial standard for canon nodes — the named, teachable units that form the spine of a creator's knowledge graph. Every canon node must be a distinct, citable, page-worthy idea the creator actually taught. This rubric is consumed by `canon_architect` (cross-video) and the per-video canon pass.

## SCHEMA

```json
{
  "type": "framework | lesson | playbook | principle | pattern | tactic | definition | aha_moment | quote | topic | example",
  "payload": {
    "title": "string — the EXACT name from the must-cover list when applicable",
    "summary": "1-2 sentences",
    "whenToUse": "1-2 sentences",
    "whenNotToUse": "1-2 sentences OR null",
    "commonMistake": "1 sentence OR null",
    "successSignal": "1 sentence",
    "preconditions": ["string", "..."],
    "steps": ["string", "..."],
    "sequencingRationale": "string OR null",
    "failureModes": ["string", "..."],
    "examples": ["string drawn from the VICs", "..."],
    "definition": "string — required for type=definition"
  },
  "sourceVideoIds": ["video-id-1", "..."],
  "origin": "multi_video | single_video | channel_profile | derived",
  "confidenceScore": 0,
  "pageWorthinessScore": 0,
  "specificityScore": 0,
  "creatorUniquenessScore": 0,
  "evidenceQuality": "high | medium | low"
}
```

## RUBRIC

- **Named-thing test**: if the creator gave the idea a NAME in the videos, it deserves its own canon node. "Workflow-Based Thinking" qualifies; "thinking about your business" does not. Use the EXACT name from the must-cover list when it applies — do not paraphrase.
- **Distinct teachable unit**: each node must teach something specific — a framework, a lesson, a playbook, a principle, a definition, a pattern, or a tactic. Avoid generic concepts.
- **Cross-reference rule**: if multiple videos teach the same idea, that's ONE `multi_video` node (do NOT duplicate). Title-dedup is enforced downstream — same title (case-insensitive) is rejected as a duplicate.
- **Required payload fields** (use `null` only when the source genuinely doesn't address it):
  - `title` — name the creator actually used
  - `summary` — 1-2 sentences naming what this is
  - `whenToUse` — 1-2 sentences on the trigger condition
  - `whenNotToUse` — 1-2 sentences OR `null`
  - `commonMistake` — 1 sentence OR `null`
  - `successSignal` — 1 sentence on how the user knows it worked
  - `preconditions[]` — required for frameworks/playbooks/lessons
  - `steps[]` — required for frameworks/playbooks (ordered)
  - `sequencingRationale` — string OR `null`; required when steps must run in order
  - `failureModes[]` — concrete ways this goes wrong
  - `examples[]` — must be drawn from the VICs (not invented)
  - `definition` — required when `type = definition`
- **Type taxonomy** (pick the most specific):
  - `framework` — named procedure with steps
  - `playbook` — multi-step end-to-end system
  - `lesson` — self-contained mental model
  - `principle` — invariant rule
  - `pattern` — recurring shape across cases
  - `tactic` — single-move technique
  - `definition` — term + definition
  - `aha_moment` — reframe that crystallizes a felt-but-unspoken idea
  - `quote` — pull-quote-worthy passage
  - `topic` — recurring teaching theme
  - `example` — concrete case
- **Origin enum**:
  - `multi_video` — taught across 2+ videos in the run
  - `single_video` — taught in only one video (per-video canon pass)
  - `channel_profile` — derived from creator profile, not a specific video
  - `derived` — composed from other canon nodes
- **Quality scores (0-100, integer)**:
  - `confidenceScore` — how sure are we this is what the creator taught
  - `pageWorthinessScore` — would a hub reader want a dedicated page on this (>=60 → eligible for brief)
  - `specificityScore` — how concrete vs. abstract
  - `creatorUniquenessScore` — how much this carries the creator's voice/lens vs. generic advice
- **Evidence quality**: `high` (every claim cited, multi-segment), `medium` (cited but thin), `low` (asserted, weak segment support)

## EXAMPLES_GOOD

1. **"Better, Cheaper, Faster, Less Risky"** — type: `framework`, origin: `multi_video`. Hormozi's four-axis offer test. payload.steps = ["Frame the offer against status quo on each axis", "Beat status quo on at least one without losing on another", "If you can win on three, you have a 10x offer"]. successSignal = "Customer can articulate why your offer beats their current option without you prompting."
2. **"Workflow-Based Thinking"** — type: `principle`, origin: `multi_video`. The job title is not the unit of work; the workflow is. preconditions = ["You're hiring or designing roles around tasks rather than outcomes"]. failureModes = ["Hiring a 'social media manager' instead of designing the content workflow first"].
3. **"First $100K Roadmap"** — type: `playbook`, origin: `multi_video`. The Survival → Cashflow ladder. steps = ["Sell something premium 1-on-1", "Document what worked", "Productize the winning workflow"]. sequencingRationale = "Cash before scale — premium 1-on-1 forces you to learn what people actually pay for before you build infrastructure."
4. **"The Cringe Reframe"** — type: `lesson`, origin: `single_video`. Discomfort is the admission price. commonMistake = "Treating cringe as a stop signal instead of a forward-motion signal."
5. **"BYOA (Bring Your Own Agent)"** — type: `definition`, origin: `multi_video`. definition = "Operators who deploy AI tooling on top of their own judgment, rather than relying on packaged AI products."

## EXAMPLES_BAD

1. **"Marketing tips"** — generic concept, no name, no procedure. Fails the named-thing test.
2. **"Be more strategic"** — vague title, no `whenToUse`, no `successSignal`. Not teachable.
3. Two nodes both titled "Cashflow First" — duplicate; should be a single `multi_video` node.
4. **"The 17-Step Customer Acquisition Framework"** — invented name not present in transcripts. Hallucinated content.
5. A `framework` node with `steps: []` and `sequencingRationale: null` — frameworks must have steps.
6. A `definition` node with `definition: null` — required field for the type.

## ANTI_PATTERNS

- **Tip-promotion**: turning a one-liner ("write more") into a "framework". Frameworks have a name AND a procedure.
- **Concept-bloat**: nodes whose `summary` reads like an essay. Summary is 1-2 sentences max.
- **Hallucinated examples**: `examples[]` items that don't appear in the source VICs. Only use what's in the cards.
- **Title paraphrase**: rewording the creator's name into your own (e.g. "task-oriented planning" instead of "Workflow-Based Thinking"). PRESERVE the verbatim name.
- **All-multi_video**: if a node only appears in one video's VIC, set `origin: single_video`. Don't fake multi-video provenance.
- **Generic-everything scores**: `confidenceScore: 80` on every node is a sign you didn't actually score. Spread the scores honestly — a thin one-segment finding is `confidenceScore: 50`, not `80`.
- **Skipping null vs []**: `null` means "not applicable to this type"; `[]` means "applicable but empty". A `lesson` node has `steps: []` (or omitted), not `steps: null`.

## OUTPUT_FORMAT

```
You are canon_architect. Extract DISTINCT canon nodes from the run's intelligence cards.

For EACH node, the payload MUST include these editorial fields (use null where the source genuinely doesn't address it):
- title (string) — use the EXACT name from the must-cover list when it applies
- summary (1-2 sentences)
- whenToUse (1-2 sentences)
- whenNotToUse (1-2 sentences OR null)
- commonMistake (1 sentence OR null)
- successSignal (1 sentence)
- preconditions (string[]): for frameworks/playbooks/lessons
- steps (string[]): for frameworks/playbooks
- sequencingRationale (string OR null): for frameworks/playbooks
- failureModes (string[])
- examples (string[]) drawn from the VICs
- definition (string): for definition-type nodes

Cross-reference rule: if multiple videos teach the same idea, that's ONE multi_video node.
Named-thing test: if the creator gave it a name in the videos, it deserves its own canon node.

# OUTPUT FORMAT — CRITICAL
Respond with a single JSON ARRAY of distinct canon node objects. First char `[`, last char `]`. NEVER a single object — wrap as `[{...}]`. No preamble, no markdown fences.

Skeleton:
[
  { "type": "framework"|"lesson"|"playbook"|"principle"|"pattern"|"tactic"|"definition"|"aha_moment"|"quote"|"topic"|"example",
    "payload": { "title": "...", "summary": "...", "whenToUse": "...", "whenNotToUse": null, "commonMistake": null, "successSignal": "...", "preconditions": [], "steps": [], "sequencingRationale": null, "failureModes": [], "examples": [] },
    "sourceVideoIds": ["..."],
    "origin": "multi_video"|"single_video"|"channel_profile"|"derived",
    "confidenceScore": 0-100, "pageWorthinessScore": 0-100, "specificityScore": 0-100, "creatorUniquenessScore": 0-100,
    "evidenceQuality": "high"|"medium"|"low" },
  { ... another distinct node ... }
]
```
