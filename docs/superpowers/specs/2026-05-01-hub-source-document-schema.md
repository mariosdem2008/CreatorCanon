# Hub Source Document Schema (v2)

**Status:** Phase 5 contract. Locks the field shape across audit-gen → audit-page → builder-handoff.

**Discriminator:** Every payload includes `schemaVersion: 'v2'`. Legacy payloads without this field are treated as v1 (analyst-notes schema) and rendered through the legacy fallback path.

---

## Why this schema exists

The previous schema mixed three categories of fields without labeling them:

- **Rendered content** — appears verbatim in the published hub (`title`, `body`, `hook`)
- **Planning content** — informs how rendered content was written, never appears as primary copy (`_internal_summary`, `_internal_audience_question`, `_internal_persona`)
- **Indexing content** — IDs, cross-references, search aids, glossing inputs (`_index_evidence_segments`, `_index_terms_defined`, `_index_supporting_examples`)

The Jordan Platten hub failed because the builder rendered all three categories as if they were rendered content. Wikipedia-article voice. Glossary-as-public-route. Audience questions as page H1s. The fix is at the schema layer: make the three categories impossible to confuse.

---

## Field-naming convention

| Prefix | Category | Renders publicly? | Visible in operator debug? |
|---|---|---|---|
| (none) | rendered | ✅ yes | ✅ yes |
| `_internal_*` | planning | ❌ no | ✅ yes (collapsible) |
| `_index_*` | indexing | ❌ no, may power filters/search | ✅ yes (collapsible) |

The audit page renders only fields without a `_internal_*` or `_index_*` prefix. The Copy Audit button serializes ALL fields for builder handoff. The builder MUST NOT render `_internal_*` or `_index_*` as primary copy.

---

## Voice rules (apply to all `rendered` fields)

- **First-person.** "I", "you", "we". The creator wrote it.
- **NEVER** "the creator", "Jordan", "Matt Walker", "she/he says", "<creator> argues" in any rendered field. Third-person is allowed only in `_internal_*` planning fields.
- **Verbatim creator terminology preserved** — never rephrased. "Workflow-based thinking" stays "workflow-based thinking", not "task-oriented planning".
- **Profanity per archetype rule** — `_index_archetype` + voice fingerprint declare whether profanity is allowed. Body fields obey.

---

## ChannelProfile_v2

```ts
interface ChannelProfile_v2 {
  schemaVersion: 'v2';

  // ── RENDERED ──────────────────────────────────────────
  /** Creator's name (the on-camera person, or the brand). */
  creatorName: string;

  /** Hub homepage title. 4-10 words. First-person feel.
   *  e.g. "Jordan Platten — Agency Operating System" */
  hub_title: string;

  /** Positioning statement, 8-14 words, first-person.
   *  e.g. "Build an AI lead-gen agency you can run from a laptop." */
  hub_tagline: string;

  /** 5 stop-the-scroll hero lines. First-person. 6-14 words each.
   *  Each from a distinct angle: pain, aspiration, contrarian, specific number, curiosity.
   *  These are billboard-quality lines, not transcript fragments. */
  hero_candidates: string[];  // length === 5

  // ── _INTERNAL (planning, NOT rendered) ────────────────
  _internal_niche: string;
  _internal_audience: string;
  /** Use ONE of: 'blunt-tactical' | 'analytical-detached' | 'warm-coaching' | 'reflective-thoughtful'.
   *  Comma-separated descriptors are forbidden. */
  _internal_dominant_tone: string;
  _internal_recurring_themes: string[];   // 3-8 items
  _internal_recurring_promise: string;
  _internal_monetization_angle: string;
  _internal_positioning_summary: string;
  _internal_why_people_follow: string;

  // ── _INDEX ────────────────────────────────────────────
  /** Verbatim creator phrases. Used for inline glossing in body content
   *  and for keyword search. NOT a public glossary route. */
  _index_creator_terminology: string[];
  _index_content_formats: string[];
  _index_archetype: 'operator-coach' | 'science-explainer' | 'instructional-craft' | 'contemplative-thinker' | '_DEFAULT';
  _index_expertise_category: string;
  /** Voice register for body fields. Phase 8+. */
  _index_voice_mode: VoiceMode;
}
```

### `_index_voice_mode` (Phase 8+)

Voice register for body fields produced by the audit pipeline. Defaults from
`_index_archetype` if not set:

- `operator-coach` + `instructional-craft` → `'first_person'`
- `science-explainer` → `'third_person_editorial'`
- `contemplative-thinker` → `'hybrid'`
- `_DEFAULT` → `'first_person'`

```ts
type VoiceMode = 'first_person' | 'third_person_editorial' | 'hybrid';

interface ChannelProfile_v2 {
  // ... existing fields ...
  /** Voice register for body fields. Phase 8+. */
  _index_voice_mode: VoiceMode;
}
```

---

## CanonNode_v2

The canonical unit. Each canon node renders as a hub page (or a section within one). The `body` field is THE page body — not a summary of the page.

```ts
interface CanonNode_v2 {
  schemaVersion: 'v2';

  type: 'framework' | 'lesson' | 'playbook' | 'principle' | 'pattern' | 'tactic'
      | 'definition' | 'aha_moment' | 'quote' | 'topic' | 'example';
  origin: 'multi_video' | 'single_video' | 'channel_profile' | 'derived';
  /** Discriminator for special canon kinds. */
  kind?: 'synthesis' | 'reader_journey'
       | 'reference_quotes' | 'reference_glossary' | 'reference_numbers'
       | 'reference_mistakes' | 'reference_tools';

  // ── RENDERED ──────────────────────────────────────────
  /** 2-6 word concept label. The page H1. */
  title: string;

  /** 1-2 sentence first-person teaser. Sets up the body. Hook quality.
   *  Renders as the page subtitle / lede paragraph. */
  lede: string;

  /** THE PAGE BODY. 400-1500 words for principle/topic/synthesis,
   *  600-1200 for framework, 800-1500 for playbook.
   *  First-person. Markdown allowed (## headings, **bold**, lists).
   *  Citation density: 8-15 inline `[<segmentId>]` tokens, woven naturally.
   *  Structure (recommended, not enforced):
   *    1. Punchy hook (1-2 sentences)
   *    2. Definition in creator's terms
   *    3. Mechanism / steps / how it works
   *    4. 1-2 concrete examples FROM THE TRANSCRIPTS, cited
   *    5. Common mistake / counter-case
   *    6. Practical "what to do now" close
   *  This field must read like a chapter the creator wrote, not a summary
   *  of the chapter. Pass the read-aloud test (the user's quality bar). */
  body: string;

  // ── _INTERNAL (planning) ──────────────────────────────
  /** 1-2 sentence editorial summary for operators reviewing the audit.
   *  Third-person OK here — this is internal. */
  _internal_summary: string;

  /** Why this canon node is in the graph. 1-2 sentences. */
  _internal_why_it_matters: string;

  /** For procedural types (framework / playbook / lesson / tactic). */
  _internal_when_to_use?: string;
  _internal_when_not_to_use?: string;
  _internal_common_mistake?: string;
  _internal_success_signal?: string;
  _internal_sequencing_rationale?: string;

  // ── _INDEX (cross-references, IDs, search aids) ───────
  /** Segment IDs cited in `body`. Must match the bracketed UUIDs in the markdown.
   *  Validators check density: aim for 1 citation per ~50-80 body words. */
  _index_evidence_segments: string[];

  /** Per-video example IDs woven into the body. Each ID's text MUST appear
   *  (paraphrased or verbatim) somewhere in the body. The weaver populates this. */
  _index_supporting_examples: string[];

  /** Per-video story IDs woven into the body. Same rule as examples. */
  _index_supporting_stories: string[];

  /** Per-video mistake IDs woven into the body (typically as the "common mistake" section). */
  _index_supporting_mistakes: string[];

  /** Per-video contrarian-take IDs woven in (typically as counter-case). */
  _index_supporting_contrarian_takes: string[];

  /** Other canon node IDs to cross-link from this body. Builder renders as sidebar links. */
  _index_cross_link_canon: string[];

  /** Source video IDs this canon node was derived from. */
  _index_source_video_ids: string[];

  // ── Quality scores (legacy, retained) ─────────────────
  confidenceScore: number;          // 0-100
  pageWorthinessScore: number;       // 0-100, ≥60 → eligible for own page
  specificityScore: number;          // 0-100
  creatorUniquenessScore: number;    // 0-100
  evidenceQuality: 'high' | 'medium' | 'low';
}
```

### `_index_evidence_registry` (Phase 7+)

Every body-bearing entity (`CanonNode_v2`, `PageBrief_v2`, and each `ReaderJourneyPhase_v2`) carries an evidence registry overlaying each inline `[<UUID>]` token in its `body` field. The registry is keyed by segment UUID and maps to a structured `EvidenceEntry`.

```ts
interface EvidenceEntry {
  segmentId: string;
  /** Tighter substring of segment.text — guaranteed literal substring of source. */
  supportingPhrase: string;
  evidenceType: 'claim' | 'framework_step' | 'example' | 'caveat'
              | 'mistake' | 'tool' | 'story' | 'proof';
  /** Short prose summary of what this evidence supports. */
  supports: string;
  relevanceScore: number;             // 0-100
  confidence: 'high' | 'medium' | 'low';
  /** Reasoning trace — why this evidenceType was chosen. */
  roleEvidence: string;
  /** Why this segment supports the claim. */
  whyThisSegmentFits: string;
  whyThisSegmentMayNotFit?: string;
  /** Computed by validator (not Codex):
   *  - 'unsupported': supportingPhrase NOT substring OR score < 40
   *  - 'verified': substring match AND score ≥ 70 AND confidence ≠ 'low'
   *  - 'needs_review': otherwise */
  verificationStatus: 'verified' | 'needs_review' | 'unsupported';
}
```

The registry sidecars the inline `[<UUID>]` tokens in the body. The body markdown is unchanged; the registry adds role/relevance/why metadata that builders use to render rich evidence chips.

### Special: synthesis nodes (`kind: 'synthesis'`)

Synthesis nodes get the same v2 schema. The body field weaves the unifying thread across child canon nodes (referenced via `_index_cross_link_canon`).

### Special: reader journey (`kind: 'reader_journey'`)

The reader journey is a single canon node of type `'playbook'` with `kind: 'reader_journey'`. Its `body` field is a structured list of phases:

```ts
interface ReaderJourney_v2 extends CanonNode_v2 {
  kind: 'reader_journey';
  /** Replaces the old `phases` array with v2-shaped phases. */
  _index_phases: ReaderJourneyPhase_v2[];
}

interface ReaderJourneyPhase_v2 {
  // RENDERED
  title: string;          // 2-6 words
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

---

## PageBrief_v2

A page brief is a hub page's framing layer. It declares which canon nodes the page primarily features and gives the page its title/hook/lede/CTA. The page's bulk content is the `body` of the primary canon node.

```ts
interface PageBrief_v2 {
  schemaVersion: 'v2';
  /** Stable identifier for the brief — used by the builder. */
  pageId: string;

  // ── RENDERED ──────────────────────────────────────────
  pageTitle: string;
  /** First-person, 1 sentence. Sticky opening line. */
  hook: string;
  /** First-person, 1-2 sentences. Sets up the page body. */
  lede: string;
  /** 200-400 word page intro in creator voice. Renders BEFORE the primary
   *  canon node body. Provides the framing the canon body assumes. */
  body: string;
  /** First-person CTAs. Builder renders both. */
  cta: { primary: string; secondary: string };

  // ── _INTERNAL ─────────────────────────────────────────
  /** WHY this page exists. Used to inform body writing. NEVER an H1. */
  _internal_audience_question: string;
  _internal_persona: {
    name: string;
    context: string;        // 1 sentence behavioral state, NOT demographic
    objection: string;
    proofThatHits: string;
  };
  _internal_journey_phase: 1 | 2 | 3 | 4 | 5;
  _internal_seo: {
    primaryKeyword: string;
    intent: 'informational' | 'transactional' | 'navigational' | 'commercial';
    titleTemplate: string;       // 60-70 char SEO title
    metaDescription: string;     // 150-160 char
  };
  _internal_page_worthiness_score: number;

  // ── _INDEX ────────────────────────────────────────────
  _index_slug: string;
  _index_page_type: 'topic' | 'framework' | 'lesson' | 'playbook'
                  | 'example_collection' | 'definition' | 'principle';
  _index_primary_canon_node_ids: string[];   // 1-2 IDs; the page leads with these bodies
  _index_supporting_canon_node_ids: string[]; // 0-6 IDs; cross-link sidebar
  _index_outline: Array<{
    section_title: string;
    canon_node_ids: string[];
    intent: string;             // editorial intent for the section
  }>;
  _index_cluster_role: {
    tier: 'pillar' | 'spoke';
    parent_topic: string | null;     // pillar slug; null if this brief is a pillar
    sibling_slugs: string[];
  };
  _index_voice_fingerprint: {
    profanityAllowed: boolean;
    /** ONE of: 'blunt-tactical' | 'analytical-detached' | 'warm-coaching' | 'reflective-thoughtful' */
    tonePreset: string;
    preserveTerms: string[];
  };
  _index_position: number;
}
```

---

## WorkshopStage (Phase 7+)

Hub-level entity. Workshops mirror the reader journey (one stage per phase, 3-5 stages per hub) and contain 2-4 clips per stage that reference canonical segments with optional tighter time bounds.

```ts
interface WorkshopStage {
  /** Stable ID, format: wks_<12-char hex>. */
  id: string;
  /** Kebab-case slug derived from title. */
  slug: string;
  /** Public route (e.g., "/workshop/foundation-and-roadmap"). */
  route: string;
  /** 1-based ordinal — mirrors the corresponding journey phase number. */
  order: number;
  /** Short eyebrow above the title (e.g., "Phase 1 · Foundation"). */
  eyebrow: string;
  /** 2-6 word title. First-person feel. */
  title: string;
  /** 1-sentence first-person promise. */
  promise: string;
  /** 50-100 word framing — what the reader does in this stage. */
  brief: string;
  /** 1-sentence behavioral outcome. */
  outcome: string;
  /** 2-4 clips. */
  clips: WorkshopClip[];

  // INDEX
  _index_related_node_ids: string[];
  _index_source_phase_number: number;
}

interface WorkshopClip {
  /** Stable ID, format: wkc_<12-char hex>. */
  id: string;
  /** Reference to canonical segment. */
  segmentId: string;
  /** 2-6 word clip title. */
  title: string;
  /** 1-sentence first-person what-to-do. */
  instruction: string;
  /** 30-60 word context. */
  brief: string;
  /** Imperative verb-led action. */
  action: string;
  /** Tighter time range; defaults to segment.startMs/1000 if omitted. */
  startSeconds?: number;
  /** Defaults to segment.endMs/1000 if omitted. Validator caps duration at 180s. */
  endSeconds?: number;

  // INDEX
  /** 0-100. Validator hard-fails clips with score < 80. */
  _index_relevance_score: number;
  _index_confidence: 'high' | 'medium';
  /** Why this clip teaches this exact step. */
  _index_why_this_clip_teaches_this_step: string;
  /** 1-3 canon node IDs this clip relates to. */
  _index_related_canon_node_ids: string[];
}
```

---

## VIC_v2 (per-video intelligence)

Per-video intelligence is now mostly **planning + indexing** — it informs the canon body writing step, but the items themselves don't render as standalone pages. The only `rendered` field is `video_summary` (used on per-video pages if the builder chooses to render them).

Every array item gets a stable `id` so the per-video weaver (Task 5.8) can reference it from canon nodes.

```ts
interface VIC_v2 {
  schemaVersion: 'v2';
  videoId: string;

  // ── RENDERED ──────────────────────────────────────────
  /** 100-200 word first-person intro to the video. Used on /videos/<id>
   *  pages if the builder renders them. Optional. */
  video_summary: string;

  // ── _INTERNAL ─────────────────────────────────────────
  _internal_creator_voice_notes: string[];

  // ── _INDEX ────────────────────────────────────────────
  _index_main_ideas: Array<{ id: string; text: string; segments: string[] }>;
  _index_lessons: Array<{ id: string; text: string; segments: string[] }>;
  _index_examples: Array<{ id: string; text: string; segments: string[] }>;
  _index_stories: Array<{ id: string; text: string; segments: string[] }>;
  _index_mistakes_to_avoid: Array<{
    id: string;
    mistake: string;
    why: string;
    correction: string;
    segments: string[];
  }>;
  _index_failure_modes: Array<{ id: string; text: string; segments: string[] }>;
  _index_counter_cases: Array<{ id: string; text: string; segments: string[] }>;
  /** Verbatim from transcript — preserves stutters, fragments. */
  _index_quotes_verbatim: Array<{ id: string; text: string; segment: string }>;
  /** Cleaned versions — fixes spoken stutters but preserves voice + meaning. */
  _index_quotes_cleaned: Array<{ id: string; text: string; verbatim_id: string }>;
  _index_strong_claims: Array<{ id: string; text: string; segments: string[] }>;
  _index_contrarian_takes: Array<{ id: string; text: string; segments: string[] }>;
  _index_terms_defined: Array<{
    id: string;
    term: string;
    definition: string;
    segment: string;
  }>;
  _index_tools_mentioned: string[];
  _index_recommended_hub_uses: string[];
}
```

---

## Visual moment (unchanged)

Visual moments stay as-is. They are pure indexing — referenced by canon body for inline image embeds, cited via `segmentId`, but never rendered as standalone pages.

---

## What the audit page renders (creator preview)

When a creator opens `/app/projects/<id>/runs/<runId>/audit` they see, top to bottom:

1. **Hero section.** `hub_title`, `hub_tagline`, then `hero_candidates` displayed as a swipeable carousel ("here are 5 hooks for your hub homepage").
2. **Reader journey.** Horizontal timeline of phases. Each phase shows `title`, `hook`, and a 1-line excerpt of `body`.
3. **Pillar pages preview.** Each pillar brief shows `pageTitle`, `hook`, `lede`, and the first 200 words of the primary canon's `body`.
4. **Spoke pages.** Compact cards: `pageTitle` + `lede`.
5. **Per-video pages preview.** Each video shows `video_summary` + a count of canon nodes derived.

What the creator does NOT see:
- `_internal_*` fields (audience questions, personas, SEO, reader states)
- `_index_*` fields (segment IDs, cluster topology, terminology lists)
- Quality scores

These are visible behind `?debug=1` for the operator.

## What the Copy Audit button outputs (builder handoff)

A single JSON object containing:

```ts
{
  metadata: {
    runId: string;
    projectId: string;
    creatorName: string;
    generatedAt: string;
    schemaVersion: 'v2';
  },
  channelProfile: ChannelProfile_v2,
  canonNodes: CanonNode_v2[],
  pageBriefs: PageBrief_v2[],
  workshop_stages: WorkshopStage[],
  videos: Array<{ videoId: string; title: string; durationSec: number; vic: VIC_v2 }>,
  visualMoments: VisualMoment[],
  segments: Array<{ id: string; videoId: string; startMs: number; endMs: number; text: string }>,
}
```

Builder consumes this directly. No additional API call needed. The full document is the contract.

---

## Validation rules (enforced by validators in Task 5.13)

1. **No third-person leak in rendered fields.** `body`, `lede`, `hook`, `hub_tagline`, `hero_candidates`, `cta.*`, `video_summary` are scanned for "the creator", "<creatorName> says", "she/he says", "they (the creator) ", "the speaker", "the host". Hard fail on detection.

2. **Citation density in canon bodies.** Each canon `body` field has 8-15 `[<segmentId>]` tokens. `< 5` is a soft fail (operator review). `0` is a hard fail.

3. **Per-video weaving completeness.** Every ID in `_index_supporting_examples` / `_index_supporting_stories` / `_index_supporting_mistakes` must reference an item in some VIC's `_index_*` arrays. Missing refs = hard fail.

4. **No `_internal_*` or `_index_*` field appears as the value of a rendered field.** A body field whose text equals the brief's `_internal_audience_question` value = leak detected.

5. **Tone preset is canonical.** `_internal_dominant_tone` and `_index_voice_fingerprint.tonePreset` MUST be one of the four canonical values (no comma-separated variants).

6. **schemaVersion stamp.** Every payload is `'v2'`. Missing = legacy data, route to fallback renderer.

---

## Migration

- New runs write v2 payloads.
- Legacy runs (Hormozi v1, Jordan v1, Walker v1) keep their v1 payloads unchanged.
- Audit page renderer dispatches on `schemaVersion`:
  - `v1` → render legacy fields as-is, surface a "Legacy audit — re-run for v2 quality" badge
  - `v2` → render v2 fields per "What the audit page renders" above
- Operator can opt to regen any creator with the v2 pipeline. Regen creates new canon/brief/profile rows; old ones can be archived (soft-delete) or deleted.
