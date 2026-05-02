# Hub Source Document — Builder Handoff Contract

**Purpose:** This document is the contract between CreatorCanon's audit pipeline and any builder system (today: Codex CLI driven by an operator; tomorrow: an automated builder service). When a creator clicks **Copy Hub Source** on the audit page, they get a single JSON object that follows the shape described here. Anything in this document is what the builder is allowed to assume.

**Schema spec (canonical):** [`docs/superpowers/specs/2026-05-01-hub-source-document-schema.md`](../superpowers/specs/2026-05-01-hub-source-document-schema.md). The schema spec is the source of truth for field shapes; this document layers handoff guidance on top.

---

## TL;DR for builder authors

1. The JSON has five categories of payloads: `channelProfile`, `canonNodes[]`, `pageBriefs[]`, `videos[]` (with embedded VICs), `visualMoments[]`, plus a flat `segments[]` lookup table.
2. Every payload carries `schemaVersion: 'v2'`. A missing or different version means legacy data — fall back to the v1 contract.
3. Three field categories distinguished by prefix:
   - **No prefix** = rendered. Render verbatim.
   - **`_internal_*`** = planning. Inform writing, **never render as user-facing copy**.
   - **`_index_*`** = indexing. Use for cross-references, search, internal IDs. Never render as user-facing copy.
4. Citations are inline `[<UUID>]` tokens in body fields. Look up the UUID in `segments[]` and render as a YouTube timestamp link.
5. Voice is **first-person**. The audit pipeline already flipped voice at extraction time. Do not re-flip to third person under any circumstances.

If you only read one section, read [Field categories](#field-categories) and [Citation rendering](#citation-rendering).

---

## Top-level envelope

```ts
interface HubSourceDocument {
  metadata: {
    runId: string;
    projectId: string;
    creatorName: string | null;
    generatedAt: string;            // ISO timestamp
    schemaVersion: 'v2' | 'v1-legacy';
    quality: {
      canonNodeCount: number;
      canonWithBodies: number;
      avgBodyWordCount: number;
      thirdPersonLeak: boolean;     // pre-flagged by validator; do not re-render if true
    };
  };
  channelProfile: ChannelProfile_v2 | null;
  canonNodes: CanonNode_v2[];
  pageBriefs: PageBrief_v2[];
  videos: Array<{
    videoId: string;
    title: string | null;
    durationSec: number | null;
    youtubeId: string | null;
    vic: VIC_v2 | null;
  }>;
  visualMoments: VisualMoment[];
  segments: Array<{
    id: string;
    videoId: string;
    startMs: number;
    endMs: number;
    text: string;
  }>;
}
```

`metadata.quality.thirdPersonLeak === true` means the audit's third-person-leak validator flagged a rendered field. Treat this as a **hard error**; refuse to render until the audit is regenerated. Do not attempt to fix at the builder layer.

---

## Field categories

The schema enforces three categories with prefix conventions. Every consumer of this document must respect them.

| Prefix | Category | Renders publicly? | Builder action |
|---|---|---|---|
| (none) | rendered | yes | Render verbatim |
| `_internal_*` | planning | **no** | Use only as input to your writing. Do not surface as primary copy. |
| `_index_*` | indexing | **no** | Use for IDs, search filters, cross-references. Do not surface as primary copy. |

**Common mistakes the v1 builder made (do not repeat):**
- Rendering `_internal_audience_question` as a page H1 (it's a planning prompt, not a headline)
- Creating a `/glossary` route from `_index_creator_terminology` (terminology is for inline glossing, not a public page)
- Rendering `_internal_summary` as the page lede (it's a third-person operator note)
- Pulling hero copy from `_index_quotes_verbatim` (verbatim contains stutters; use `hero_candidates` from the channel profile)

---

## Channel profile → homepage

`channelProfile` is the only entity rendered on the hub homepage.

**Render:**
- `hub_title` → `<h1>`
- `hub_tagline` → subtitle paragraph
- `hero_candidates` → 5-line carousel or rotation. Each line is a stop-the-scroll billboard from a distinct angle (pain, aspiration, contrarian, specific number, curiosity).

**Do NOT render:**
- `_internal_niche`, `_internal_audience`, `_internal_dominant_tone`, `_internal_positioning_summary`, etc. → these inform copy choices, never appear as copy.
- `_index_creator_terminology` → use to drive inline glossing inside body content (e.g., wrap matched terms in a tooltip). Never expose as a glossary page.
- `_index_archetype` → drives style choices in the builder's design system, not a label printed on the page.

---

## Canon nodes → hub pages

Each `CanonNode_v2` is a unit of teaching content. The `body` field is the page body, not a summary of the page.

**Render:**
- `title` → page H1 (also used as nav label)
- `lede` → subtitle / page lede paragraph
- `body` → main markdown body. Render markdown (`##` subheadings, `**bold**`, lists, blockquotes). Inline `[<UUID>]` tokens are citations — see [Citation rendering](#citation-rendering).

**Do NOT render:**
- `_internal_summary` (operator note, third-person)
- `_internal_why_it_matters` (planning note)
- `_internal_when_to_use`, `_internal_when_not_to_use`, `_internal_common_mistake`, `_internal_success_signal` (mechanism notes — body already incorporates them)
- `_index_evidence_segments` (use to validate citations, not to render)
- `_index_supporting_examples` / `stories` / `mistakes` / `contrarian_takes` (already woven into the body)

### Special canon kinds

The `kind` field discriminates special canon types:

- `kind === 'synthesis'` → render as a **pillar page**. The body names 3+ child canon by title; each child should also be linkable via `_index_cross_link_canon`. Pillars sit at the top of the navigation.
- `kind === 'reader_journey'` → render as the **journey spine**. The page body is structured (`## Phase N: Title` sections), but the canonical structured form is `_index_phases`. Prefer rendering each phase as a discrete card or step in a horizontal timeline. Each phase has its own `title`, `hook`, `body` (rendered), and `_internal_reader_state` / `_internal_next_step_when` (planning, not rendered).
- `kind === 'reference_*'` (quotes, glossary, numbers, mistakes, tools) → reference collections. Render as compact list pages, not full editorial pages.

If `kind` is `undefined`, treat the node as a standard canon page.

---

## Page briefs → page wrappers

A `PageBrief_v2` is the framing layer for a hub page. It supplies title/hook/lede/CTA + the 200-400 word page intro that renders **before** the primary canon body.

**Render:**
- `pageTitle` → page `<title>` and H1
- `hook` → sticky opening line, often above the fold
- `lede` → the lede paragraph
- `body` → the page intro that frames the canon body (renders before the primary canon body block)
- `cta.primary` → primary call-to-action button label
- `cta.secondary` → secondary CTA

**Do NOT render:**
- `_internal_audience_question` → planning prompt; never an H1
- `_internal_persona` (name, context, objection, proofThatHits) → reader-mind-state notes; inform copy choices only
- `_internal_journey_phase` → input for sequencing logic, not a label
- `_internal_seo` (primaryKeyword, intent, titleTemplate, metaDescription) → use `titleTemplate` for `<meta>` tags only; do not render in body. `metaDescription` goes in `<meta name="description">`.

**Use for routing/linking (`_index_*`):**
- `_index_slug` → URL slug (no `/pages/` prefix unless your route layout requires it)
- `_index_page_type` → drives template selection in your design system
- `_index_primary_canon_node_ids` → the canon body or bodies that follow this brief's intro
- `_index_supporting_canon_node_ids` → sidebar cross-links
- `_index_outline` → optional section structure for long pages
- `_index_cluster_role.tier` (`pillar` or `spoke`) → drives nav placement
- `_index_cluster_role.parent_topic` → if `tier === 'spoke'`, this is the slug of the parent pillar
- `_index_voice_fingerprint` → use for any inline tone-aware UI (e.g., quote pulls from voiced segments)

### Page composition

A typical page renders top-to-bottom as:

1. `pageTitle` (H1)
2. `hook` (sticky line)
3. `lede`
4. `body` (the brief's 200-400 word page intro)
5. **Primary canon body** — looked up via `_index_primary_canon_node_ids[0]`. This is the bulk content.
6. (Optional) Additional canon bodies if `_index_primary_canon_node_ids` has length 2.
7. (Optional) Section navigation generated from `_index_outline`.
8. `cta.primary` and `cta.secondary` rendered as buttons.
9. (Optional) Sidebar with cross-links from `_index_supporting_canon_node_ids`.

---

## Videos and VICs

`videos[]` contains per-video metadata. Each video may have an embedded `vic` (Video Intelligence Card). The `vic.video_summary` is the only rendered field — use it on a `/videos/<id>` page if you render per-video pages.

Everything else in the VIC is `_index_*` and is meant for the audit pipeline / search layer / inline glossing — not for rendering.

If your hub does **not** render per-video pages, ignore `videos[]` entirely.

---

## Citation rendering

Body fields contain inline citations of the form `[<UUID>]` where `<UUID>` is a 36-character RFC-4122 segment ID (e.g. `[a1a6709f-a2a7-48f4-839b-82687165fbdd]`).

**Resolution flow:**

1. Parse `body` for `\[([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\]`.
2. For each match, look up the segment in the top-level `segments[]` array by `id`.
3. Cross-reference the segment's `videoId` against the top-level `videos[]` to get `youtubeId`.
4. Render as a clickable YouTube link: `https://youtube.com/watch?v=<youtubeId>&t=<startSec>s`.
5. The visible link text should be the citation marker (e.g., a small superscript number) **not the UUID**.

**Validation:**

- Every UUID in any body field MUST resolve to a real segment. If a UUID does not resolve, treat as a hard error and surface to the operator.
- Citations density is pre-validated by the audit pipeline (`tsx ./src/scripts/validate-citation-chain.ts <runId>`). The builder does not need to re-validate.

**Forbidden citation forms:**

- `[1234ms-5678ms]` — these are legacy ms-range citations from v1 audits. v2 should not produce them. If found in a v2 payload, surface as an error.
- `[ex_xxx]`, `[mst_xxx]`, `[take_xxx]` — these are internal labels for woven items, never citations. If found in a body, surface as an error.

---

## Citation rendering with evidence registry (Phase 7)

Every body field's inline `[<UUID>]` token resolves against the body's `_index_evidence_registry`. Render each citation as a small role-coded pill (color by `evidenceType`); on hover/click, surface:

- `supportingPhrase` as a pull-quote
- `whyThisSegmentFits` as a short caption
- `confidence` and `relevanceScore` as a badge
- A YouTube link constructed from the segment's `videoId` → `videos[].youtubeId` and `startSeconds`

Citations with `verificationStatus === 'unsupported'` MUST be hidden from end users by default; surface only in operator/debug mode.

Reader journey phases carry their own per-phase `_index_evidence_registry` inside each phase object (NOT at the journey canon root). Look up `phase._index_evidence_registry`, not the journey's top-level field.

## Workshop pages (Phase 7)

`workshop_stages[]` is a top-level entity in the Hub Source Document, sibling to `canonNodes` and `pageBriefs`. Render as a top-level navigation section. Each stage gets its own page at `route` (e.g., `/workshop/foundation-and-roadmap`).

Stage page composition (top-to-bottom):
1. `eyebrow` + `title` + `promise` (above the fold)
2. `brief` (introducing the work)
3. `clips[]` rendered as horizontal cards. Each clip card shows:
   - `title`
   - Duration pill (`startSeconds` to `endSeconds`)
   - `instruction` (bold, 1-line)
   - `brief` (3-5 lines)
   - `action` (imperative bullet)
   - YouTube embed/link constructed from `segmentId` → segments[<id>].videoId → videos[].youtubeId, plus `startSeconds`

Clips with `_index_relevance_score < 80` SHOULD NOT exist in the published workshop_stages array — the validator enforces this — but if you encounter one, hide from end users.

The `_index_related_canon_node_ids` on each clip can drive "Read the canon" cross-links to the corresponding canon node pages.

---

## Voice rules

The audit pipeline writes everything in **first person**. The builder must not re-flip to third person under any condition.

**Forbidden patterns in any rendered field:**
- "the creator", "the speaker", "the host", "the author", "the narrator"
- "<creator name> says/argues/explains/notes/claims/believes"
- "she says", "he says"
- "in this episode", "in this video"

If the builder ever generates copy that wraps the rendered fields (e.g., a "Why this matters" sidebar pulled from `_internal_why_it_matters`), it must produce **first-person** copy too. Use the `_internal_*` source as input but rewrite voice on output.

The audit page already runs a third-person leak detector (`tsx ./src/scripts/check-third-person-leak.ts <runId>`). The builder may rerun this on its output before publish.

---

## Voice mode (Phase 8+)

`channelProfile._index_voice_mode` declares the register the audit's body
fields were written in. Builders should respect this when generating
wrapper copy (callouts, summaries, hover tooltips, suggested questions):

- `'first_person'`: Match the body's first-person register. Wrapper copy
  reads as if the creator wrote it.
- `'third_person_editorial'`: Stay in third-person editorial register.
  Quote the creator directly when needed; never paraphrase as the creator.
- `'hybrid'`: Default to third-person framing; first-person aphorisms
  should remain in blockquote markdown.

If `_index_voice_mode` is missing, treat as `'first_person'` (Phase 5/7 default).

---

## Tone, archetype, and design system hooks

The channel profile carries:

- `_index_archetype` ∈ `operator-coach | science-explainer | instructional-craft | contemplative-thinker | _DEFAULT`
- `_internal_dominant_tone` ∈ `blunt-tactical | analytical-detached | warm-coaching | reflective-thoughtful`

These drive design system choices: typography weight, line length, accent color saturation, spacing rhythm. The builder is free to map archetype + tone to its own design tokens, but the values themselves are **never rendered as labels**.

Brief-level voice is in `_index_voice_fingerprint` — same tonePreset values, plus `preserveTerms` (verbatim creator phrases) and `profanityAllowed`. If a brief overrides the channel-level voice, prefer the brief.

---

## Quality flags and operator handoff

`metadata.quality` carries pre-computed signals:

- `canonNodeCount` — total canon in this hub
- `canonWithBodies` — count whose `body` is non-empty and ≥ 100 chars (the threshold the audit page uses)
- `avgBodyWordCount` — average across canon bodies (a low number suggests the audit needs regeneration)
- `thirdPersonLeak` — true if the validator flagged any rendered field. **Do not render** if true.

These are signals for the builder to decide whether to render the hub at all. A hub with `canonWithBodies === 0` is not ready; surface to the operator.

---

## Migration: v1 → v2

If `metadata.schemaVersion === 'v1-legacy'`, the payload follows the legacy analyst-notes schema (no `body` field on canon, audience-question-as-headline, etc.). The builder must use the v1 contract for these payloads. Going forward, only v2 audits should be handed off; operators are encouraged to regenerate v1 hubs through the v2 pipeline.

---

## Change log

- **2026-05-01** — initial v2 contract published. Replaces the v1 analyst-notes handoff that produced the Jordan Platten / Wikipedia-voice failure mode.
