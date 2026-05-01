---
name: editorial-strategy-rubric
description: Use when generating page briefs from canon nodes. Defines the v2 PageBrief schema — pageTitle / hook / lede / body / cta as rendered fields, plus _internal_persona / _internal_seo / _internal_audience_question and _index_outline / _index_cluster_role / _index_voice_fingerprint as planning + indexing. The audit IS the hub source. The brief body IS the page intro that renders before the canon body.
---

# Editorial Strategy Rubric (v2)

## PURPOSE
Every hub page is composed of two rendered layers:
1. **Brief layer** — pageTitle, hook, lede, body (page intro), cta
2. **Canon layer** — the primary canon node's body (the page's main teaching content)

This rubric defines the brief layer. In v2, the brief carries first-person rendered fields (`pageTitle`, `hook`, `lede`, `body`, `cta`), planning fields (`_internal_persona`, `_internal_seo`, `_internal_audience_question`, `_internal_journey_phase`), and indexing fields (`_index_primary_canon_node_ids`, `_index_outline`, `_index_cluster_role`, `_index_voice_fingerprint`).

The brief's `body` field is a 200-400 word first-person page introduction that precedes the canon body. It frames the page (why this matters to me, what we're going to walk through). The canon body delivers the teaching.

## SCHEMA

```json
{
  "schemaVersion": "v2",
  "pageId": "string — stable identifier for the page",

  "pageTitle": "string — 4-10 words, the page H1, first-person feel",
  "hook": "string — 1 sentence, first-person, sticky opening line",
  "lede": "string — 1-2 sentences, first-person, sets up body",
  "body": "string — 200-400 word first-person page intro in creator voice",
  "cta": {
    "primary": "string — first-person CTA, e.g. 'Read my First $100K Roadmap next'",
    "secondary": "string — first-person fallback CTA"
  },

  "_internal_audience_question": "string — WHY this page exists. NEVER an H1.",
  "_internal_persona": {
    "name": "string",
    "context": "1 sentence behavioral state, NOT demographic",
    "objection": "1 sentence",
    "proofThatHits": "1 sentence — which credential/number/story will land"
  },
  "_internal_journey_phase": 1,
  "_internal_seo": {
    "primaryKeyword": "string",
    "intent": "informational | transactional | navigational | commercial",
    "titleTemplate": "60-70 char SEO title",
    "metaDescription": "150-160 char meta description"
  },
  "_internal_page_worthiness_score": 0,

  "_index_slug": "kebab-case-slug",
  "_index_page_type": "topic | framework | lesson | playbook | example_collection | definition | principle",
  "_index_primary_canon_node_ids": ["cn_..."],
  "_index_supporting_canon_node_ids": ["cn_..."],
  "_index_outline": [
    { "section_title": "string", "canon_node_ids": ["cn_..."], "intent": "string" }
  ],
  "_index_cluster_role": {
    "tier": "pillar | spoke",
    "parent_topic": "kebab-slug or null if pillar",
    "sibling_slugs": ["..."]
  },
  "_index_voice_fingerprint": {
    "profanityAllowed": true,
    "tonePreset": "blunt-tactical | analytical-detached | warm-coaching | reflective-thoughtful",
    "preserveTerms": ["..."]
  },
  "_index_position": 0
}
```

## RUBRIC

### Three field categories (same as framework-extraction)

- Plain field name = rendered
- `_internal_*` = planning (operator debug only, NEVER an H1 or page body)
- `_index_*` = indexing (powers nav/search/filters, never primary copy)

### Voice rule

`pageTitle`, `hook`, `lede`, `body`, `cta.primary`, `cta.secondary` are written in **first person** as if the creator wrote them. NOT "Jordan's Five Steps to Sign Clients" — write "Five Steps I Use to Sign Clients."

CTAs in particular: ❌ "Read the First $100K Roadmap" → ✅ "Read my First $100K Roadmap next" or ✅ "Next: my First $100K Roadmap"

### Field-by-field rules

- **`pageTitle`** (rendered): 4-10 words. The page H1. NEVER a question. Statement form. First-person feel.
  - ✅ "How I Find Clients Before I Have a Case Study"
  - ❌ "How do I find clients before I have proof?" (that's an `_internal_audience_question`, not a title)

- **`hook`** (rendered): 1 sentence. First-person. Sticky opening line. Goes BEFORE the body. Sets the page's argumentative stance.
  - ✅ "Stop drowning in niche debates. None of that gets you a client this month."
  - ❌ "This page covers how to find clients before you have proof." (that's _internal scaffolding)

- **`lede`** (rendered): 1-2 sentences. First-person teaser between the hook and the body. Sets up what the body will walk through.

- **`body`** (rendered): 200-400 word first-person page intro. Renders BEFORE the primary canon body on the page. Provides the framing the canon body assumes. Structure:
  1. Acknowledge the reader's actual problem (in your words, not theirs)
  2. State the move you're going to teach
  3. Tease the example or proof that will land in the canon body
  4. Hand off to the canon body

  Citation density in brief body is LOWER than canon body — 2-5 inline `[<segmentId>]` tokens, not 8-15. The brief body sets up; the canon body teaches.

- **`cta.primary` / `cta.secondary`** (rendered): First-person actions. Suggest the next page (typically a sibling spoke or the parent pillar) or a content asset (book, course, free download).

- **`_internal_audience_question`** (planning): WHY this page exists, in question form. ANSWERS what the reader is searching for. NEVER renders. Use to inform `body` writing — the body should answer this question without ever showing it.

- **`_internal_persona`** (planning): Behavioral profile of the reader. Used for tone calibration in body writing.
  - `context`: 1 sentence about what's TRUE about the reader RIGHT NOW. Not demographics.
    - ✅ "Operator stuck below $30K MRR who has tried 3 funnels"
    - ❌ "Men 25-45 who like business" (demographic, not behavioral)
  - `objection`: their biggest pushback to the page's thesis
  - `proofThatHits`: which specific creator credential / number / story will land for this persona

- **`_internal_journey_phase`** (planning): 1-5. Determines where this page sits in the reader journey. Informs `cta` choices (early-phase = read-more CTA, late-phase = buy CTA).

- **`_internal_seo`** (planning): SEO targeting. Renders in `<head>` via builder, NOT as page body.

- **`_index_slug`** (indexing): URL slug. Builder uses this for `/<slug>` route.

- **`_index_primary_canon_node_ids`** (indexing): 1-2 IDs. The primary canon node's `body` is THE main teaching content of this page. Builder renders brief.body, then primary canon body.

- **`_index_supporting_canon_node_ids`** (indexing): 0-6 IDs. Cross-link sidebar.

- **`_index_outline`** (indexing): Section structure for builder rendering. Each section maps to one or more canon nodes. Optional — builder can use this to break long pages into chapters.

- **`_index_cluster_role`** (indexing): Pillar/spoke topology. `parent_topic` MUST resolve to a real pillar's `_index_slug` (the cluster-normalize step enforces this).

- **`_index_voice_fingerprint`** (indexing): tonePreset MUST be one of the four canonical values. NO comma-separated descriptors. The body writer reads this to calibrate.

### Pillar vs spoke

- **Pillars** anchor a topic cluster. `cluster_role.tier = 'pillar'`, `cluster_role.parent_topic = null`. Pillar pages are usually the entry point from the homepage.
- **Spokes** point to a parent pillar via `cluster_role.parent_topic`. Sibling spokes share a parent. Spokes typically deep-dive a sub-topic of the pillar.

### CTA matching rules

- Phase 1 (Survival/Foundations) → CTA recommends a phase-1 sibling or the foundational pillar. Free content. No paywall asks yet.
- Phase 5 (Investing/Mastery) → CTA can recommend a paid offer (book, course, mastermind) since the reader is already deep in the funnel.

## EXAMPLES_GOOD

### Example 1: Hormozi pillar brief

```json
{
  "schemaVersion": "v2",
  "pageId": "pb_workflow_based_thinking",
  "pageTitle": "How I Stopped Hiring People and Started Hiring Workflows",
  "hook": "The job title is not the unit of work. The workflow is.",
  "lede": "Most failed hires aren't bad hires — they're a hire I made for a workflow I never designed. Here's how I think about it now.",
  "body": "Look, I've made every hiring mistake there is. I've hired people I liked, people who looked great on paper, people my friends recommended. They all failed for the same reason: I was hiring a job title — Marketing Manager, Operations Lead, Customer Success Director — when what I actually needed was a workflow. [a1a6709f-...]\n\nA job title is a category. A workflow is a specific sequence of inputs becoming a specific output that produces revenue or saves cost. 'Marketing Manager' is a category. 'A daily lead-qualification workflow that turns 50 raw inbound leads into 12 qualified appointments' is a workflow.\n\nWhen you start hiring workflows instead of titles, three things change immediately. You can SEE whether the workflow is broken before you hire someone to run it. You can REPLACE the person without rebuilding the whole role. And you can AUTOMATE pieces of the workflow without firing anyone — because the workflow exists independently of the human running it.\n\nI'll walk you through the test I run on every role I'm thinking about hiring. There are five repeatable workflows under any 'job title' you've ever posted. The four-axis filter — better, cheaper, faster, less risky — tells you which workflow to optimize first. And the AI question becomes obvious: not 'should we use AI?' but 'which of these five workflows can be partially or fully run by AI right now?' [c5b6703e-...]",
  "cta": {
    "primary": "Read 'AI Won't Save a Bad Operator' next — it's the test I run before I let anyone touch a workflow.",
    "secondary": "Or jump to my First $100K Roadmap if you're earlier-stage and need cash before scale."
  },

  "_internal_audience_question": "Why do my hires keep failing even when their resumes look perfect?",
  "_internal_persona": {
    "name": "Pre-Scale Operator",
    "context": "Founder running a sub-$1M ARR business who has hired 1-3 people and watched 1-2 of them not work out for reasons they can't articulate.",
    "objection": "I just need to find better people. The hiring market is broken right now.",
    "proofThatHits": "Hormozi's editor example — turning a 'social media manager' role into 5 named workflows and automating 3 of them — lands because it's a recognizable hire that the operator has either made or considered."
  },
  "_internal_journey_phase": 3,
  "_internal_seo": {
    "primaryKeyword": "workflow based hiring vs role based hiring",
    "intent": "informational",
    "titleTemplate": "Workflow-Based Thinking: Why Job Titles Are Costing You Hires",
    "metaDescription": "Stop hiring job titles. Hire workflows. Hormozi's framework for breaking roles into 5 repeatable workflows you can hire, replace, or automate independently."
  },
  "_internal_page_worthiness_score": 95,

  "_index_slug": "workflow-based-thinking",
  "_index_page_type": "principle",
  "_index_primary_canon_node_ids": ["cn_workflow_based_thinking"],
  "_index_supporting_canon_node_ids": ["cn_better_cheaper_faster_less_risky", "cn_ai_is_leverage_after_judgment"],
  "_index_outline": [
    { "section_title": "Why Job Titles Hide The Real Work", "canon_node_ids": ["cn_workflow_based_thinking"], "intent": "Reframe roles as workflows" },
    { "section_title": "The 5-Workflow Test For Any Hire", "canon_node_ids": ["cn_workflow_based_thinking"], "intent": "Concrete five-workflow breakdown" },
    { "section_title": "Where AI Fits", "canon_node_ids": ["cn_better_cheaper_faster_less_risky", "cn_ai_is_leverage_after_judgment"], "intent": "Cross-link to AI canon" }
  ],
  "_index_cluster_role": {
    "tier": "pillar",
    "parent_topic": null,
    "sibling_slugs": ["first-100k-roadmap", "ai-is-leverage-after-judgment", "cashflow-before-scale"]
  },
  "_index_voice_fingerprint": {
    "profanityAllowed": true,
    "tonePreset": "blunt-tactical",
    "preserveTerms": ["workflow-based thinking", "the unit of work", "better, cheaper, faster, less risky"]
  },
  "_index_position": 1
}
```

Note:
- `pageTitle` is a STATEMENT, not a question. The audience_question is its own internal field.
- `body` is ~280 words of first-person page intro that flows into the canon body without summarizing it.
- CTAs are first-person ("Read 'AI Won't Save a Bad Operator' next") with creator voice (the sentence after the recommendation explains why).
- `_internal_persona.context` is behavioral ("watched 1-2 hires not work out") not demographic.

### Example 2: Walker spoke brief (science-explainer voice)

```json
{
  "pageTitle": "The 25-Minute Rule That Saved My Sleep",
  "hook": "If you're awake in bed for 25 minutes, your brain is learning that bed means wakefulness. Get up.",
  "lede": "Stimulus control is the most underused tool in sleep medicine. I'll walk you through why it works mechanistically, and exactly what to do tonight if you're lying there frustrated.",
  "body": "There's a counterintuitive rule from sleep medicine that I think every adult should know. If you've been awake in bed for roughly 25 minutes — really awake, not drifting — get up. Leave the bed. Do something quiet, dim, and boring elsewhere. Return only when sleepiness genuinely returns.\n\nThe reason this works isn't psychological. It's conditioning. Your brain learns associations between contexts and states. When you spend an hour wide awake in bed every night, you're conditioning your bed to mean 'this is where I lie awake' instead of 'this is where I sleep.' The cortical wakefulness pattern strengthens. Sleep onset gets harder. The pattern compounds [a1a6709f-...].\n\nStimulus control therapy — the formal name in clinical sleep medicine — directly reverses this conditioning. By leaving the bed when wakefulness exceeds the 25-minute threshold, you preserve the bed-equals-sleep association. By returning only with genuine sleepiness, you reinforce it. Two to three weeks of this and the response becomes automatic [c5b6703e-...].\n\nThe practical protocol is straightforward, but the discipline is hard. I'll walk you through it: when to apply it, what 'something quiet and boring' actually looks like, why phones are off-limits, and what to do if you've been doing this wrong for years and bed already feels like a battleground.",
  "cta": {
    "primary": "Next: my Bad Night Do-Nothing Protocol — what to do the day AFTER you applied stimulus control.",
    "secondary": "If you're new to my sleep work, start with The Two-Process Sleep Model — it's the foundation everything else sits on."
  },
  "_internal_audience_question": "What should I do if I'm lying in bed wide awake at 2am for the third night in a row?",
  ...
}
```

## EXAMPLES_BAD

### Bad 1: pageTitle is the audience_question

```json
{
  "pageTitle": "How do I find clients before I have a case study?",
  "_internal_audience_question": "How do I find clients before I have a case study?"
}
```

Why bad: The audience question is internal scaffolding. The page title should be a statement that ANSWERS the question. The Jordan Platten hub had this exact pattern shipped as H1.

### Bad 2: brief body is third-person

```json
{
  "body": "This page covers Jordan's approach to finding clients without a case study. The creator argues that scattergun is better than niche down at this stage..."
}
```

Why bad: Third-person, scaffolding language ("this page covers"). Reads like a Wikipedia stub. Hard-fail.

### Bad 3: CTAs are third-person

```json
{
  "cta": {
    "primary": "Read the First $100K Roadmap",
    "secondary": "Buy the course"
  }
}
```

Why bad: No creator voice. Could be on any site. Should be: "Read my First $100K Roadmap next" + "If you want the full system: my Agency Operating System course".

### Bad 4: brief body summarizes the canon body

```json
{
  "body": "In this page I'll explain the 25-Minute Rule. The rule is to leave bed if you've been awake for 25 minutes. This works because of stimulus control conditioning..."
}
```

Why bad: The brief body should INTRODUCE the canon body, not summarize it. The canon body itself will explain the rule. The brief body should set up the WHY, the stakes, the framing — without delivering the punchline.

### Bad 5: missing or null `_index_cluster_role`

A spoke brief whose `parent_topic` doesn't match a real pillar's slug, or a pillar with non-null `parent_topic`. Cluster topology breaks downstream.

## ANTI_PATTERNS

- **Question-as-title**: shipping `_internal_audience_question` text as `pageTitle`
- **Third-person CTAs**: "Read the X" instead of "Read my X next"
- **Body summarizes canon**: brief body delivering the canon body's teaching instead of framing it
- **Persona-as-demographic**: `_internal_persona.context` as "men 25-45" instead of behavioral
- **Empty journey**: every brief at `_internal_journey_phase: 1`. The phase mix should reflect the canon graph.
- **Sibling-slug salad**: listing every other spoke as a sibling. Siblings share a parent AND are genuinely adjacent.
- **CTA mismatch**: phase-1 brief whose CTA is "buy the $1K course." Match CTA to journey phase.
- **SEO-first hooks**: hook that reads like a meta description. Hook is for HUMANS arriving on the page. Meta description is for SERPs.
- **Over-specific preserveTerms**: listing 30 generic words. Preserve only distinctive named terms.
- **Aspirational preserveTerms**: declaring 8 terms but the body uses only 1. Body must use ≥60% of declared preserveTerms verbatim.
- **Non-canonical tonePreset**: writing comma-separated tones. ONE of the four canonical values, verbatim.

## OUTPUT_FORMAT

```
You are <creatorName>, designing one page of your knowledge hub. The page features the canon node "<primaryCanonTitle>" as its main teaching content.

You write in first person — "I", "you", "we" — as the creator, not as an analyst describing the creator.

# Your voice (archetype: <archetype>)
<HUB_SOURCE_VOICE section spliced in from the creator-archetype skill file>

Voice fingerprint:
- profanityAllowed: <bool>
- tonePreset: <preset>   // canonical: blunt-tactical | analytical-detached | warm-coaching | reflective-thoughtful
- preserveTerms (use VERBATIM): <terms>

# Source material
## Primary canon node:
- title: <primary canon title>
- type: <type>
- already-rendered body (read this — your brief body should set up this teaching, not duplicate it):
<<<canon body>>>

## Supporting canon nodes (cross-link in body or sidebar):
- <id>: <title>
- <id>: <title>

## Channel context:
- _internal_dominant_tone: <tone>
- _internal_audience: <audience>
- _internal_monetization_angle: <angle>

# Task
Write the brief layer. Output ONE JSON object matching PageBrief_v2 schema.
Brief body is 200-400 words of first-person page intro that flows INTO the
canon body. Do not duplicate the canon body's teaching.

# Voice rules (CRITICAL)
- First person only in `pageTitle`, `hook`, `lede`, `body`, `cta.*`.
- `pageTitle` is a STATEMENT, not a question. Audience_question is internal.
- CTAs are first-person ("Read my X next", not "Read the X").
- Verbatim preserveTerms — never paraphrase named concepts.

# Output format
ONE JSON object. No code fences. First char `{`, last char `}`.

{
  "schemaVersion": "v2",
  "pageId": "...",
  "pageTitle": "...",
  "hook": "...",
  "lede": "...",
  "body": "<200-400 word first-person markdown page intro>",
  "cta": { "primary": "...", "secondary": "..." },
  "_internal_audience_question": "...",
  "_internal_persona": { "name": "...", "context": "...", "objection": "...", "proofThatHits": "..." },
  "_internal_journey_phase": 1,
  "_internal_seo": { "primaryKeyword": "...", "intent": "informational", "titleTemplate": "...", "metaDescription": "..." },
  "_internal_page_worthiness_score": 0,
  "_index_slug": "...",
  "_index_page_type": "...",
  "_index_primary_canon_node_ids": ["..."],
  "_index_supporting_canon_node_ids": ["..."],
  "_index_outline": [{ "section_title": "...", "canon_node_ids": ["..."], "intent": "..." }],
  "_index_cluster_role": { "tier": "pillar"|"spoke", "parent_topic": null, "sibling_slugs": [] },
  "_index_voice_fingerprint": { "profanityAllowed": true, "tonePreset": "...", "preserveTerms": [] },
  "_index_position": 0
}
```
