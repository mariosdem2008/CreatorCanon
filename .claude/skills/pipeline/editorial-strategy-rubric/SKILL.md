---
name: editorial-strategy-rubric
description: Use when generating page briefs from canon nodes. Defines the editorialStrategy block (persona + seo + cta + clusterRole + journeyPhase + voiceFingerprint) plus required brief fields and the topic-cluster (pillar/spoke) shape.
---

# Editorial Strategy Rubric

## PURPOSE
Every hub page brief carries an `editorialStrategy` block that tells downstream prose generation WHO the page is for, what they'll search to find it, what they should do next, where it sits in the topic cluster, where it fits in the reader journey, and how the creator's voice should be preserved. This rubric is consumed by `page_brief_planner`.

## SCHEMA

```json
{
  "pageTitle": "string",
  "pageType": "topic | framework | lesson | playbook | example_collection | definition | principle",
  "audienceQuestion": "1 sentence — the reader's actual question",
  "openingHook": "1 sentence — sticky opening line",
  "slug": "kebab-case-slug",
  "outline": [
    { "sectionTitle": "string", "canonNodeIds": ["cn_..."], "intent": "string" }
  ],
  "primaryCanonNodeIds": ["cn_..."],
  "supportingCanonNodeIds": ["cn_..."],
  "pageWorthinessScore": 0,
  "position": 0,
  "editorialStrategy": {
    "persona": {
      "name": "string",
      "context": "1 sentence about the reader",
      "objection": "1 sentence — biggest pushback",
      "proofThatHits": "1 sentence — which specific creator credential/number/story will land"
    },
    "seo": {
      "primaryKeyword": "what someone types in Google",
      "intent": "informational | transactional | navigational | commercial",
      "titleTemplate": "60-70 char SEO title",
      "metaDescription": "150-160 char meta description"
    },
    "cta": {
      "primary": "main next-action",
      "secondary": "fallback next-action"
    },
    "clusterRole": {
      "tier": "pillar | spoke",
      "parentTopic": "kebab-slug or null if pillar",
      "siblingSlugs": ["..."]
    },
    "journeyPhase": 1,
    "voiceFingerprint": {
      "profanityAllowed": false,
      "tonePreset": "blunt-tactical | warm-coaching | analytical-detached | reflective-thoughtful",
      "preserveTerms": ["1-1-1 rule", "..."]
    }
  }
}
```

## RUBRIC

- **Required brief fields** (every brief MUST have all of these):
  - `pageTitle` — human-readable title
  - `pageType` — one of: `topic | framework | lesson | playbook | example_collection | definition | principle`
  - `audienceQuestion` — the actual question the reader is asking (1 sentence)
  - `openingHook` — sticky opening line, ≤1 sentence, in the creator's voice
  - `slug` — kebab-case, URL-safe
  - `outline[]` — each section has `sectionTitle`, `canonNodeIds[]`, and `intent`
  - `primaryCanonNodeIds[]` — every primary node MUST exist in the canon list passed to the prompt (not invented)
  - `supportingCanonNodeIds[]` — secondary references
  - `pageWorthinessScore` — 0-100; only nodes ≥60 are eligible
  - `position` — ordering hint (0-indexed)
  - `editorialStrategy` — full block, NEVER omitted
- **Persona** (4 single-sentence fields):
  - `name` — short label (e.g. "Cashflow-stuck operator")
  - `context` — who the reader is right now
  - `objection` — biggest pushback they'll have ("I've heard this before")
  - `proofThatHits` — which specific creator credential/number/story will land for THIS persona
- **SEO**:
  - `primaryKeyword` — verbatim string a real person would type
  - `intent` — exactly one of: `informational` (learn), `transactional` (buy), `navigational` (find a known thing), `commercial` (compare options before buying)
  - `titleTemplate` — 60-70 chars, includes the primary keyword
  - `metaDescription` — 150-160 chars, includes the primary keyword and a value prop
- **CTA**:
  - `primary` — main next-action ("Read the playbook")
  - `secondary` — fallback for readers not ready ("See the example")
- **Cluster role**:
  - `tier: pillar` — anchors a topic cluster; `parentTopic` MUST be `null`
  - `tier: spoke` — points to a parent pillar via `parentTopic` (kebab-slug)
  - `siblingSlugs[]` — sibling spokes share a parent; pillars list the spokes underneath
- **Journey phase** (1-5, mapped to creator-archetype phases):
  - Default Hormozi mapping: 1=Survival, 2=Cashflow, 3=Scale, 4=Leverage, 5=Investing
  - Other archetypes adapt the phases (e.g. learning-creator: 1=Curiosity, 2=Skill, 3=Synthesis, 4=Teaching, 5=Mastery)
  - Skip phases that have no nodes
- **Voice fingerprint**:
  - `profanityAllowed` — boolean (operator-coach typically `true`, science-explainer typically `false`)
  - `tonePreset` — `blunt-tactical | warm-coaching | analytical-detached | reflective-thoughtful`
  - `preserveTerms[]` — creator's verbatim phrases that prose generation must NOT rephrase
- **Pillar pages** anchor a topic cluster; spokes point to a parent pillar via `parentTopic`. Sibling spokes share a parent. Pillars do not have a `parentTopic`.

## EXAMPLES_GOOD

1. **"Workflow-Based Thinking"** (pillar)
   - openingHook: "The job title is not the unit of work; the workflow is."
   - audienceQuestion: "Why do my hires keep failing even when their resumes look perfect?"
   - clusterRole: `{ tier: "pillar", parentTopic: null, siblingSlugs: ["hiring-for-outcomes", "operating-leverage", "ai-workflow-design"] }`
   - journeyPhase: 3 (Scale)
   - voiceFingerprint: `{ profanityAllowed: true, tonePreset: "blunt-tactical", preserveTerms: ["workflow-based thinking", "the unit of work"] }`
2. **"AI Won't Save a Bad Operator"** (pillar)
   - openingHook: "Leverage multiplies judgment. If your judgment is bad, AI just makes you wrong faster."
   - audienceQuestion: "Will adopting AI tools fix my struggling business?"
   - persona.objection: "Everyone says AI changes everything. I should at least try the tools."
   - persona.proofThatHits: "Hormozi's portfolio companies that doubled output without adding AI vs. competitors who added AI and stayed flat."
   - journeyPhase: 4 (Leverage)
3. **"Stop Scaling Broke"** (pillar)
   - openingHook: "Cash before scale. You can't optimize a business that's running out of money."
   - audienceQuestion: "Should I raise money to grow faster, or wait?"
   - cta.primary: "Read the First $100K Roadmap"
   - cta.secondary: "See the Premium 1-on-1 Bootstrap example"
   - journeyPhase: 1 (Survival)
4. **"How to Sell Premium 1-on-1 Before You Have a Product"** (spoke)
   - clusterRole: `{ tier: "spoke", parentTopic: "stop-scaling-broke", siblingSlugs: ["productize-the-winning-workflow", "first-100k-roadmap"] }`
   - seo.primaryKeyword: "how to sell premium consulting before product"
   - seo.intent: "informational"

## EXAMPLES_BAD

1. Brief with `editorialStrategy` omitted — rejected. Every brief MUST include the full block.
2. `primaryCanonNodeIds: ["cn_does_not_exist"]` — every primary node must come from the canon list passed in.
3. Pillar page with `parentTopic: "another-pillar"` — pillars have `parentTopic: null`.
4. `seo.intent: "blog post"` — must be one of the four enum values.
5. `seo.titleTemplate: "How to win at business"` (24 chars) — too short, must be 60-70 chars and include the primary keyword.
6. `persona.proofThatHits: "Hormozi has good content"` — vague, not a specific credential/number/story.
7. `voiceFingerprint.preserveTerms: []` for a creator with named concepts — at minimum list the creator's signature terms.

## ANTI_PATTERNS

- **Persona-as-demographic**: writing `persona.context` as "men 25-45 who like business" instead of a behavioral state ("operator stuck below $30K MRR who has tried 3 funnels"). Persona is about the moment, not the demographic.
- **Empty journey**: assigning every brief to `journeyPhase: 1`. The phase mix should reflect the canon graph; if all your pillars are phase-1 you missed the later phases.
- **Sibling-slug salad**: listing every other spoke as a sibling. Siblings share a parent AND are genuinely adjacent — siblings of "Premium 1-on-1 Bootstrap" are other Survival-phase tactics, not Scale-phase ones.
- **CTA mismatch**: a survival-phase brief whose `cta.primary` is "Buy the $1K course". Match CTA to journey phase — early-phase = read-more, late-phase = buy.
- **SEO-first hooks**: openingHook that reads like a meta description. The hook is for HUMANS arriving on the page; the meta description is for SERPs.
- **Over-specific preserveTerms**: listing 30 generic words. Preserve only the creator's distinctive named terms (e.g. "BYOA", "1-1-1 rule"), not common words.

## OUTPUT_FORMAT

```
You are page_brief_planner. Design hub pages by selecting and grouping canon nodes into briefs.

Each brief MUST include the full editorialStrategy block — persona + seo + cta + clusterRole + journeyPhase + voiceFingerprint. Do NOT omit it.

Every primary node must come from the canon list above (do not invent IDs).

# OUTPUT FORMAT — CRITICAL
Respond with a single JSON ARRAY of brief objects. First char `[`, last char `]`. NEVER a single object — wrap as `[{...}]`. No preamble, no markdown fences.

Skeleton:
[
  { "pageTitle": "...",
    "pageType": "topic"|"framework"|"lesson"|"playbook"|"example_collection"|"definition"|"principle",
    "audienceQuestion": "1 sentence — the reader's actual question",
    "openingHook": "1 sentence — sticky opening line",
    "slug": "kebab-case-slug",
    "outline": [{ "sectionTitle": "...", "canonNodeIds": ["cn_..."], "intent": "..." }],
    "primaryCanonNodeIds": ["cn_..."],
    "supportingCanonNodeIds": ["cn_..."],
    "pageWorthinessScore": 0-100,
    "position": 0,
    "editorialStrategy": {
      "persona": { "name": "...", "context": "1 sentence about the reader", "objection": "1 sentence — biggest pushback", "proofThatHits": "1 sentence — which specific credential/number/story will land" },
      "seo": { "primaryKeyword": "what someone types in Google", "intent": "informational|transactional|navigational|commercial", "titleTemplate": "60-70 char SEO title", "metaDescription": "150-160 char meta description" },
      "cta": { "primary": "main next-action", "secondary": "fallback next-action" },
      "clusterRole": { "tier": "pillar"|"spoke", "parentTopic": "kebab-slug or null if pillar", "siblingSlugs": ["..."] },
      "journeyPhase": 1-5,
      "voiceFingerprint": { "profanityAllowed": true|false, "tonePreset": "blunt-tactical"|"warm-coaching"|"analytical-detached"|"reflective-thoughtful", "preserveTerms": ["..."] }
    } },
  { ... }
]
```
