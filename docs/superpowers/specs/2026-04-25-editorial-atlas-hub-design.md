# Editorial Atlas Public Hub — v1 Design Spec

**Date:** 2026-04-25
**Status:** Draft (awaiting user sign-off)
**Owner:** Mario
**Scope target:** One implementation plan / single coherent project

## 1. Why this exists

CreatorCanon's public hub is the artifact a creator publishes — a source-grounded knowledge site generated from their YouTube archive. Today's renderer (`apps/web/src/components/hub/publicTemplates.tsx`) supports three loosely-defined themes (`paper` / `midnight` / `field`), renders a flat "page → blocks" structure, and lacks the specialized surfaces a real reference hub needs (topics, sources library, methodology, grounded chat, etc.).

This spec defines a single replacement template — **Editorial Atlas** — modeled on the 12 ChatGPT reference mockups the user provided. Editorial Atlas is the *only* public hub template for v1. The work in this spec is template-and-data-only: no DB migrations, no destructive cleanup, no pipeline rewrites.

## 2. Guiding principles

1. **Citation-backed creator claims.** Generated knowledge claims must be citation-backed wherever they assert *creator-specific* teaching, advice, frameworks, or factual claims drawn from the archive. UI labels, navigation copy, methodology copy, and generic explanatory framing do **not** require citations. The renderer surfaces citations prominently on every page and chat answer where they exist.
2. **Empty-state tolerance.** Every optional field must render gracefully if missing. The renderer never crashes on partial data — sections, illustrations, related pages, key moments, transcript excerpts can all be absent.
3. **Editorial restraint via layout.** Warm paper canvas, Inter throughout, hairline borders, generous whitespace, strong typographic hierarchy, citations visible inline. The editorial feel comes from layout / canvas / spacing / borders / hierarchy / citations — **not** from a serif typeface. No flashy SaaS dashboard chrome.
4. **Mock data is the contract.** The template is built against a typed `EditorialAtlasManifest`. The pipeline is wired to emit this contract in a separate, later session.
5. **Non-destructive in this session.** No automatic DB truncate, R2 deletion, enum migration, or pipeline rewrite. All cleanup is deferred behind explicit user approval.

## 3. Scope

### In scope (v1)

13 public hub surfaces, all live under `/h/[hubSlug]/…`:

| # | Surface | Route |
|---|---|---|
| 1 | Hub Home | `/h/[hubSlug]` |
| 2 | Start Here | `/h/[hubSlug]/start` |
| 3 | Topics Index | `/h/[hubSlug]/topics` |
| 4 | Topic Detail | `/h/[hubSlug]/topics/[topicSlug]` |
| 5 | All Pages Index | `/h/[hubSlug]/pages` |
| 6 | Lesson Page | `/h/[hubSlug]/pages/[pageSlug]` (`type === 'lesson'`) |
| 7 | Framework Page | `/h/[hubSlug]/pages/[pageSlug]` (`type === 'framework'`) |
| 8 | Playbook Page | `/h/[hubSlug]/pages/[pageSlug]` (`type === 'playbook'`) |
| 9 | Sources Library | `/h/[hubSlug]/sources` |
| 10 | Source Video Detail | `/h/[hubSlug]/sources/[videoId]` |
| 11 | Methodology / Trust | `/h/[hubSlug]/methodology` |
| 12 | Search Results | `/h/[hubSlug]/search?q=…` |
| 13 | Ask This Hub (Grounded Chat) | `/h/[hubSlug]/ask` + `POST /h/[hubSlug]/ask/api` |

**Naming note.** The path segment is `hubSlug`, not `subdomain`, because the value lives in the URL path — it is not a real DNS subdomain. The DB column `hub.subdomain` is left untouched in this session (non-destructive policy); the manifest layer maps `db.subdomain → manifest.hubSlug` so the URL semantics match the data semantics.

Backwards-compatibility redirect (best-effort, removed if it conflicts):

```
GET /h/[hubSlug]/[slug]   →  308  /h/[hubSlug]/pages/[slug]
```

The redirect lives at the existing route folder. If implementation runs into a conflict with one of the new dedicated segments (`pages`, `topics`, `sources`, `start`, `methodology`, `search`, `ask`), the implementer MAY remove the redirect — there is no public data depending on it (alpha environment, no live hubs).

### Out of scope (v1)

- Paywall surfaces, comments, member accounts, bookmarks
- Newsletter archive detail pages
- Creator profile pages
- Any non–Editorial Atlas template (Studio Vault, Playbook OS variants are not migrated; their tokens stay in code dead until the cross-cutting cleanup session)
- Monetization pages
- Real RAG backend for grounded chat — UI only, mock API
- Pipeline integration — adapter is a stub with TODO
- Authenticated `/app/configure` template-picker UI changes
- DB schema migrations / enum changes
- DB or R2 data deletion of any kind
- Voice / audio / file-upload / multi-hub features in chat
- Cross-session chat persistence

## 4. Architecture

### 4.1 Layered component model

**Layer 1 — Chrome (always rendered):**
- `HubShell` — outer grid (sidebar + main + optional right rail). Sets canvas tokens, font tokens.
- `HubSidebar` — creator pill, primary nav, "Resources" secondary nav, source-backed footer card, "Built on CreatorCanon" link, sticky search input.
- `HubFooterTrustBar` — 3-column trust strip ("Source-grounded · Continuously updated · Made for learners") and About card.

**Layer 2 — Building blocks (reused across surfaces):**
- `HubHero` — eyebrow tag + headline + body + optional `LineIllustration`. Inter throughout; size and weight carry the editorial hierarchy.
- `StatsStrip` — 4–5 columns with vertical hairline dividers; tabular numerals (Inter `font-feature-settings: 'tnum'`).
- `PageCard`, `PageRow`, `PageTable` — page summaries in card / table-row / full-table form. Searchable, sortable, filterable.
- `TopicCard`, `TopicGrid` — topic with iconKey + accentColor + page count.
- `SourceCard`, `SourceRow` — video summary in card / row form.
- `CitationBlock` — single citation: video title, timestamp, transcript excerpt, "Open at hh:mm" link.
- `EvidenceQualityBadge` — pill for `strong | moderate | limited | none`.
- `RelatedPages` — right-rail or footer block.
- `SourceRail` — right-rail "Evidence & sources" stack.
- `SectionRenderer` — discriminated-union switch over `PageSection.kind` (single component, one renderer per kind).
- `Breadcrumb` — `Topic › Page` or `Sources › Video`.
- `MetaTagPill` — small pill (page type, topic name).
- `LineIllustration` — reusable SVG (books / desk / plant). Inline SVG, no network fetch.

**Layer 3 — Surface-specific (largely chat):**
- `AskHubPage`, `AskHubInput`, `SuggestedQuestions`
- `GroundedAnswer`, `AnswerCitationList`, `ChatSourceCard`
- `EmptyChatState`, `UnsupportedAnswerState`

### 4.2 File layout

```
apps/web/src/
  app/
    h/[hubSlug]/
      page.tsx                              ← Hub Home
      start/page.tsx
      topics/page.tsx
      topics/[topicSlug]/page.tsx
      pages/page.tsx
      pages/[pageSlug]/page.tsx
      sources/page.tsx
      sources/[videoId]/page.tsx
      methodology/page.tsx
      search/page.tsx
      ask/page.tsx
      ask/api/route.ts                      ← mock grounded answer JSON
      [slug]/page.tsx                       ← compat 308 redirect (best-effort)
      manifest.ts                           ← loadHubManifest (existing folder renamed [subdomain] → [hubSlug])
      opengraph-image.tsx                   ← unchanged
      twitter-image.tsx                     ← unchanged

  components/hub/
    EditorialAtlas/
      shell/
        HubShell.tsx
        HubSidebar.tsx
        HubFooterTrustBar.tsx
      blocks/
        HubHero.tsx
        StatsStrip.tsx
        PageCard.tsx
        PageRow.tsx
        PageTable.tsx
        TopicCard.tsx
        TopicGrid.tsx
        SourceCard.tsx
        SourceRow.tsx
        CitationBlock.tsx
        EvidenceQualityBadge.tsx
        RelatedPages.tsx
        SourceRail.tsx
        Breadcrumb.tsx
        MetaTagPill.tsx
        LineIllustration.tsx
        SectionRenderer.tsx
        sections/
          OverviewSection.tsx
          WhyItWorksSection.tsx
          StepsSection.tsx
          CommonMistakesSection.tsx
          AhaMomentsSection.tsx
          PrinciplesSection.tsx
          ScenesSection.tsx
          WorkflowSection.tsx
          FailurePointsSection.tsx
          CalloutSection.tsx
          ParagraphSection.tsx
          ListSection.tsx
          QuoteSection.tsx
      ask/
        AskHubInput.tsx
        SuggestedQuestions.tsx
        GroundedAnswer.tsx
        AnswerCitationList.tsx
        ChatSourceCard.tsx
        EmptyChatState.tsx
        UnsupportedAnswerState.tsx
      tokens.ts                             ← color/spacing/font constants
      illustrations/                        ← inline SVG fragments

  lib/hub/
    manifest/
      schema.ts                             ← zod + TS types for EditorialAtlasManifest
      mockManifest.ts                       ← realistic Ali-Abdaal-style mock
      adapter.ts                            ← TODO stub: buildEditorialAtlasManifestFromRelease()
      empty-state.ts                        ← helpers for missing-field tolerance
    chat/
      schema.ts                             ← zod + TS for chat API request/response
      mockAnswers.ts                        ← deterministic mock-answer dictionary
    routes.ts                               ← getHubRoute / getPageRoute / etc. helpers
```

The existing `apps/web/src/components/hub/{templates.ts,publicTemplates.tsx,EvidenceChips.tsx}` files are NOT deleted in this session — they stay until the renderer no longer imports them, and Phase 0 only removes them if a route conflict requires it. Rationale: the user explicitly forbade destructive cross-product cleanup in this session.

### 4.3 Route helpers (mandatory)

Every component that links between hub surfaces MUST use a helper from `lib/hub/routes.ts` — no string-template URLs in components.

```ts
export const getHubRoute         = (hubSlug: string)                              => `/h/${hubSlug}`;
export const getStartRoute       = (hubSlug: string)                              => `/h/${hubSlug}/start`;
export const getTopicsRoute      = (hubSlug: string)                              => `/h/${hubSlug}/topics`;
export const getTopicRoute       = (hubSlug: string, topicSlug: string)           => `/h/${hubSlug}/topics/${topicSlug}`;
export const getPagesRoute       = (hubSlug: string)                              => `/h/${hubSlug}/pages`;
export const getPageRoute        = (hubSlug: string, pageSlug: string)            => `/h/${hubSlug}/pages/${pageSlug}`;
export const getSourcesRoute     = (hubSlug: string)                              => `/h/${hubSlug}/sources`;
export const getSourceRoute      = (hubSlug: string, videoId: string)             => `/h/${hubSlug}/sources/${videoId}`;
export const getMethodologyRoute = (hubSlug: string)                              => `/h/${hubSlug}/methodology`;
export const getSearchRoute      = (hubSlug: string, query?: string)              => query ? `/h/${hubSlug}/search?q=${encodeURIComponent(query)}` : `/h/${hubSlug}/search`;
export const getAskRoute         = (hubSlug: string)                              => `/h/${hubSlug}/ask`;
export const getAskApiRoute      = (hubSlug: string)                              => `/h/${hubSlug}/ask/api`;
```

Lint rule (or convention enforced in code review): no inline `` `/h/${…}` `` strings outside `routes.ts`.

## 5. Data model

### 5.1 EditorialAtlasManifest (top-level, schemaVersion `editorial_atlas_v1`)

```ts
type EditorialAtlasManifest = {
  schemaVersion: 'editorial_atlas_v1';
  hubId: string;
  releaseId: string;
  hubSlug: string;                       // path segment value; renamed from `subdomain`
                                         // for v1. The DB column `hub.subdomain` is
                                         // unchanged; the adapter maps db.subdomain → hubSlug.
  templateKey: 'editorial_atlas';        // (5.A) future-proof; only this value in v1
  visibility: 'public' | 'unlisted';     // (5.B) renderer treats both identically; future
                                         // unlisted hubs add `noindex` meta + skip sitemap
  publishedAt: string | null;            // ISO; null when not yet published
  generatedAt: string;                   // ISO

  title: string;                         // "Editorial Atlas Hub"
  tagline: string;                       // hero subhead

  creator: {
    name: string;
    handle: string;                      // "@aliabdaal"
    avatarUrl: string;
    bio: string;
    youtubeChannelUrl: string;
  };

  stats: {
    videoCount: number;
    sourceCount: number;
    transcriptPercent: number;           // 0..1
    archiveYears: number;                // e.g. 9.4
    pageCount: number;
  };

  topics: Topic[];
  pages: Page[];
  sources: SourceVideo[];

  navigation: {
    primary: NavItem[];                  // Home, Start here, Topics, All pages, Frameworks, Playbooks, Sources, Methodology, Ask this hub
    secondary: NavItem[];                // Videos, Newsletter, Recommended (all optional)
  };

  trust: {
    methodologySummary: string;          // 1-paragraph plain text shown on Hub Home + Methodology
    qualityPrinciples: { title: string; body: string }[];
    creationProcess: { stepNumber: number; title: string; body: string }[];
    faq: { question: string; answer: string }[];
  };
};
```

### 5.2 Topic, Page, PageSection

```ts
type Topic = {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconKey: string;                       // maps to a Lucide icon set in tokens.ts
  accentColor:
    | 'mint' | 'peach' | 'lilac'
    | 'rose' | 'blue' | 'amber'
    | 'sage' | 'slate';
  pageCount: number;
};

type Page = {
  id: string;
  slug: string;
  type: 'lesson' | 'framework' | 'playbook';

  // (5.F) public renderer MUST filter to status === 'published'
  status: 'draft' | 'reviewed' | 'published';

  title: string;
  summary: string;
  summaryPlainText: string;              // (5.D) plain-text variant for SERP/search index
  searchKeywords: string[];              // (5.D) author/editor-supplied search hints

  topicSlugs: string[];
  estimatedReadMinutes: number;
  publishedAt: string;                   // ISO
  updatedAt: string;                     // ISO

  // (5.C) trust signals surfaced in UI
  citationCount: number;
  sourceCoveragePercent: number;         // 0..1 — share of sections with ≥1 citation
  evidenceQuality: 'strong' | 'moderate' | 'limited';

  // (5.E) optional editorial provenance
  reviewedBy?: string;
  lastReviewedAt?: string;               // ISO

  hero?: { illustrationKey: 'books' | 'desk' | 'plant' | 'open-notebook' };
  sections: PageSection[];
  citations: Citation[];                 // de-duplicated union of every citationId
                                         // referenced by sections on this page.
                                         // Section-level support lives on each
                                         // section's optional `citationIds`.
  relatedPageIds: string[];              // 0..N; renderer tolerant if empty
};

// Every section variant accepts an optional `citationIds: string[]` referencing
// entries in `Page.citations`. The renderer surfaces a "Supported by" footer
// on sections that have backing citations and degrades cleanly when absent.
// Empty array (`[]`) and undefined are equivalent — the renderer treats both
// as "no citation footer", and the no-claim-without-source rule applies only
// to creator-specific knowledge claims (see § 2 principle 1).

type SectionCitations = { citationIds?: string[] };

type PageSection =
  | ({ kind: 'overview';        body: string }                                                                       & SectionCitations)
  | ({ kind: 'why_it_works';    body: string; points?: string[] }                                                    & SectionCitations)
  | ({ kind: 'steps';           title: string; items: { title: string; body: string }[] }                            & SectionCitations)
  | ({ kind: 'common_mistakes'; items: { title: string; body: string }[] }                                           & SectionCitations)
  | ({ kind: 'aha_moments';     items: { quote: string; attribution?: string }[] }                                   & SectionCitations)
  | ({ kind: 'principles';      items: { title: string; body: string; iconKey?: string }[] }                         & SectionCitations)
  | ({ kind: 'scenes';          items: { title: string; body: string }[] }                                           & SectionCitations)
  | ({ kind: 'workflow';        schedule: { day: string; items: string[] }[] }                                       & SectionCitations)
  | ({ kind: 'failure_points';  items: { title: string; body: string }[] }                                           & SectionCitations)
  | ({ kind: 'callout';         tone: 'note' | 'warn' | 'success'; body: string }                                    & SectionCitations)
  | ({ kind: 'paragraph';       body: string }                                                                       & SectionCitations)
  | ({ kind: 'list';            ordered: boolean; items: string[] }                                                  & SectionCitations)
  | ({ kind: 'quote';           body: string; attribution?: string; sourceVideoId?: string; timestampStart?: number } & SectionCitations);
```

### 5.3 Citation, SourceVideo

```ts
type Citation = {
  id: string;
  sourceVideoId: string;
  videoTitle: string;
  timestampStart: number;                // seconds
  timestampEnd: number;                  // seconds
  timestampLabel: string;                // "04:21"; renderer formats from start if absent
  excerpt: string;                       // transcript snippet
  url?: string;                          // (5.H) auto-derived if missing — see § 5.5
};

type SourceVideo = {
  id: string;
  youtubeId: string;
  title: string;
  channelName: string;
  publishedAt: string;                   // ISO
  durationSec: number;
  thumbnailUrl: string;
  transcriptStatus: 'available' | 'partial' | 'unavailable';
  topicSlugs: string[];
  citedPageIds: string[];                // pages that cite this video
  keyMoments: { timestampStart: number; timestampEnd: number; label: string }[];
  transcriptExcerpts: { timestampStart: number; body: string }[];
};

type NavItem = {
  label: string;
  href: string;                          // produced via routes.ts helpers
  iconKey: string;
};
```

### 5.4 Validation

All types are mirrored as `zod` schemas in `lib/hub/manifest/schema.ts`. The hub route uses `manifest.parse(...)` at the boundary — if validation fails, render a friendly "release manifest is malformed" surface and Sentry-capture the failure. The renderer never trusts unparsed input.

### 5.5 Empty-state tolerance (5.G) and citation URL synthesis (5.H)

**Empty-state contract.** For each optional field, the renderer behavior is documented in `lib/hub/manifest/empty-state.ts`:

| Missing field | Renderer behavior |
|---|---|
| `page.hero.illustrationKey` | Hero block renders without illustration; headline left-aligned full-width |
| `page.relatedPageIds` empty | "Related" rail/section omitted entirely (no empty header) |
| `page.citations` empty | Page body renders, but `EvidenceQualityBadge` shows `limited` and the SourceRail is replaced with a "No sources cited yet" small panel |
| `pageSection.citationIds` empty / undefined | Section renders without a "Supported by" footer. No warning style on a *page* section (unlike chat bullets), since pages are author-curated and may legitimately include a framing paragraph or callout. The page-level `EvidenceQualityBadge` reflects overall coverage. |
| `page.summaryPlainText` missing | Falls back to `summary` stripped of inline markup |
| `page.searchKeywords` empty | Page is still indexed by `title + summaryPlainText`; no UI difference |
| `page.reviewedBy` / `page.lastReviewedAt` missing | Methodology/page-meta omits the "Reviewed by" line |
| `sourceVideo.keyMoments` empty | "Key moments" block on Source Detail is hidden |
| `sourceVideo.transcriptExcerpts` empty | "Transcript excerpts" block on Source Detail is hidden; "Transcript" status pill shows `unavailable` |
| `topic.iconKey` unknown | Falls back to a generic `LucideBook` icon |
| Any `accentColor` outside the documented palette | Falls back to `slate` |
| `citation.url` missing | **Synthesized** per (5.H), see below |
| `citation.timestampLabel` missing | Computed from `timestampStart` (`mm:ss` or `h:mm:ss`) |

**Citation URL synthesis.** When `citation.url` is absent, the renderer builds one from `youtubeId + timestampStart`:

```ts
function citationUrl(c: Citation, video: SourceVideo): string {
  if (c.url) return c.url;
  return `https://www.youtube.com/watch?v=${video.youtubeId}&t=${Math.floor(c.timestampStart)}s`;
}
```

This is a single function in `lib/hub/manifest/empty-state.ts` and used everywhere a citation needs a link.

### 5.6 Mock manifest

`lib/hub/manifest/mockManifest.ts` exports one realistic `EditorialAtlasManifest`:

- 1 hub ("Editorial Atlas Hub" by "Ali Abdaal")
- 8 topics matching the references (Productivity, Learning, Writing, Career & Business, Systems, Mindset, Health & Habits, Creator Growth)
- 14 pages: 6 lessons, 4 frameworks, 4 playbooks — with at least one of each containing every section kind so `SectionRenderer` is exercised end-to-end
- 20 source videos with 5+ key moments and 3+ transcript excerpts each
- 60+ citations distributed across pages
- Trust block with 4 quality principles and 5 FAQ items
- `evidenceQuality` mix: ~60% `strong`, ~30% `moderate`, ~10% `limited` so the badges render with realistic distribution

The mock is the *visual contract*. Any layout decision is validated against it.

### 5.7 Adapter stub (Phase 7)

`lib/hub/manifest/adapter.ts` exports:

```ts
/**
 * TODO: buildEditorialAtlasManifestFromRelease
 *
 * Maps the existing pipeline release output (release_manifest_v0 +
 * draft_pages_v0 + source/transcript artifacts) to EditorialAtlasManifest.
 *
 * Not implemented in this session. The template is the contract; the
 * pipeline will be wired in a separate session after visual approval.
 *
 * Until then, the public hub route uses mockManifest.ts.
 */
export function buildEditorialAtlasManifestFromRelease(
  _input: never,
): never {
  throw new Error('Not implemented — Phase 7. See spec.');
}
```

The route handler at `app/h/[hubSlug]/manifest.ts` is updated to read from `mockManifest` for now, with a guarded TODO comment noting the swap path.

## 6. Grounded Chat (surface 13)

### 6.1 UX rules (carried verbatim from user spec)

- Chat is **not** a search replacement.
- Sidebar label: "Ask this hub"
- Page title: "Ask this hub"
- Hero copy: *"Ask questions and get answers grounded only in [creator]'s videos, transcripts, and published hub pages."*
- Input placeholder: *"Ask about productivity, learning, systems, focus, or anything covered in this hub…"*
- 5 suggested questions visible in `EmptyChatState` (sourced from mock).
- Compact ask box on Hub Home navigates to `/ask` — does **not** run the answer inline.
- Every answer must contain: direct answer paragraph(s), 3–5 bullet key points (each with `citationIds`), citations block, related pages, evidence-quality badge.
- Hard rule: **no citation, no creator claim**. The bullet schema (`{ text, citationIds }`, see § 6.3) makes this enforceable in the UI: any bullet with `citationIds: []` renders with a visible warning style. Pure framing belongs in `answer.summary`, not in `bullets`. The rule applies to creator-specific knowledge claims; UI labels and framing prose are exempt (see § 2 principle 1).

### 6.2 Evidence-quality labels

| Label | Trigger | UI tone |
|---|---|---|
| Strong evidence | 3+ citations from ≥2 distinct sources | sage |
| Moderate evidence | 1–2 citations | amber |
| Limited evidence | citations present but coverage < 50% of bullets | rose-light |
| No evidence | no citations | render `UnsupportedAnswerState` instead |

### 6.3 API contract

`POST /h/[hubSlug]/ask/api` — JSON in, JSON out. Both shapes mirrored in `lib/hub/chat/schema.ts` as zod.

**Request**
```json
{
  "hubId": "hub_123",
  "question": "How does Ali plan his week?",
  "filters": {
    "topicSlugs": [],
    "sourceVideoIds": [],
    "pageIds": []
  }
}
```

**Successful response**

Each bullet is `{ text, citationIds }` so the UI can enforce that creator-specific bullets are citation-backed (the no-claim-without-source rule from § 2 principle 1). `citationIds` references entries in the response's top-level `citations` array. Bullets that are pure framing (rare; e.g. "Here's the gist:") may have `citationIds: []`.

```json
{
  "answer": {
    "summary": "...",
    "bullets": [
      { "text": "Review what happened last week before planning the next one.",
        "citationIds": ["cit_001", "cit_002"] },
      { "text": "Choose 1–3 meaningful outcomes for the week.",
        "citationIds": ["cit_002"] },
      { "text": "Time-block deep work and admin separately.",
        "citationIds": ["cit_003"] }
    ],
    "confidence": "strong",
    "evidenceQuality": "strong",
    "limitations": null
  },
  "citations": [
    { "id": "cit_001",
      "sourceVideoId": "...", "videoTitle": "...",
      "timestampStart": 261, "timestampEnd": 318,
      "timestampLabel": "04:21", "url": "...",
      "excerpt": "..." }
  ],
  "relatedPages": [{ "id": "...", "title": "...",
                     "type": "lesson", "slug": "..." }],
  "suggestedFollowups": ["...", "..."]
}
```

**Renderer rule for bullets:** If a creator-specific bullet has `citationIds: []`, the renderer must either (a) hide the bullet, or (b) render it with a visible "no source attached" warning style. Pure framing bullets are an explicit author choice and the renderer has no way to distinguish them from missing-citation bugs — therefore the safest rule for v1 is to render every empty-citation bullet with the warning style and let the chat backend tag truly source-free framing as `summary` text rather than as a bullet.

**Unsupported response**
```json
{
  "answer": null,
  "unsupported": true,
  "message": "I couldn't find enough source support in this hub to answer that confidently.",
  "partialMatches": [{ "type": "topic", "title": "Productivity", "slug": "productivity" }],
  "suggestedSearches": ["weekly planning", "deep work", "time blocking"]
}
```

### 6.4 Mock behavior

`lib/hub/chat/mockAnswers.ts` is a deterministic dictionary:

- 5 hard-coded questions matching the spec's example list — return rich `answer` responses with real citations from the mock manifest.
- Any other question — returns the `unsupported` response with `partialMatches` derived from naive keyword overlap with topic titles.

The route handler at `app/h/[hubSlug]/ask/api/route.ts`:

1. Parses request body via zod (rejects malformed with 400).
2. Looks up the question in `mockAnswers` (case-insensitive, trimmed).
3. Returns the matching response, or the unsupported fallback.
4. Always returns within ~500ms (no artificial delay; this is a stub).

### 6.5 Future RAG note (informational; not in v1 scope)

System prompt and retrieval rules from the user's spec are recorded in `lib/hub/chat/RAG-NOTES.md` for the future implementer. **Not built in this session.** The mock handler is what ships.

## 7. Build order

7 phases, all non-destructive, no DB or R2 changes.

**Phased delivery gate.** The user has approved **Phase 0 + Phase 1 only** for the first implementation pass. Implementation must stop after Phase 1 and present the chrome (HubShell, HubSidebar, HubFooterTrustBar) plus the shell-only home stub for visual review before any of Phases 2–7 begin. This gate is enforced in the implementation plan, not in the code.

### Phase 0 — Foundation (non-destructive)
- Define `EditorialAtlasManifest` types + zod schemas in `lib/hub/manifest/schema.ts`.
- Build `mockManifest.ts` (1 hub, 8 topics, 14 pages, 20 sources, full coverage of section kinds).
- Add `lib/hub/manifest/empty-state.ts` (citation URL synthesis, illustration fallback, etc.).
- Add `lib/hub/manifest/adapter.ts` with the TODO stub.
- Add `lib/hub/routes.ts` (route helpers).
- Add `lib/hub/chat/schema.ts` + `lib/hub/chat/mockAnswers.ts`.
- Old `templates.ts` / `publicTemplates.tsx` / `EvidenceChips.tsx` are kept on disk; only deleted later if a route conflict requires it.

### Phase 1 — Chrome
- `tokens.ts` (paper canvas, accent palette, font weights).
- `HubShell`, `HubSidebar`, `HubFooterTrustBar`.
- `LineIllustration` (3–4 inline SVGs).
- Rename existing route folder `app/h/[subdomain]/` → `app/h/[hubSlug]/` (single dir rename; updates `manifest.ts`, `opengraph-image.tsx`, `twitter-image.tsx` param references).
- New route file `app/h/[hubSlug]/page.tsx` reads mock manifest, renders shell-only stub.
- Compat redirect at `app/h/[hubSlug]/[slug]/page.tsx` issues 308 → `/pages/[slug]`.

### Phase 2 — Core content surfaces (Hub Home is the visual anchor)
- `PageCard`, `PageRow`, `PageTable`, `MetaTagPill`, `EvidenceQualityBadge`, `Breadcrumb`.
- `SectionRenderer` + all 13 section components.
- **Surface 1 (Hub Home) first** — establishes the visual anchor of the template (`StatsStrip`, `PageCard` grid, `TopicGrid` preview, compact ask box linking to `/ask`). Done first because the rest of the surfaces are read in its visual context.
- Surface 6 (Lesson Page) second — proves the section system works end-to-end.
- Surface 5 (All Pages Index) third — exercises `PageTable` at scale, ready for reuse in Topic Detail and Search.

### Phase 3 — Topics + specialized page types
- `TopicCard`, `TopicGrid`.
- Surface 3 (Topics Index).
- Surface 4 (Topic Detail) — reuses `PageTable` filtered by topic.
- Surface 7 (Framework Page) — same renderer, different hero accent + section ordering.
- Surface 8 (Playbook Page) — exercises `principles`, `scenes`, `workflow`, `failure_points` section kinds.
- Surface 2 (Start Here).

### Phase 4 — Sources
- `SourceCard`, `SourceRow`, `SourceRail`, `CitationBlock`.
- Surface 9 (Sources Library) — table form, filters by transcript status & topic.
- Surface 10 (Source Video Detail) — key-moments timeline, transcript excerpts, "Pages that cite this video", evidence summary.

### Phase 5 — Discovery + trust
- Surface 11 (Methodology / Trust) — renders from `manifest.trust` (creation process, quality principles, FAQ).
- Surface 12 (Search Results) — composes `PageRow`, `SourceRow`, `TopicCard`. Search index is `title + summaryPlainText + searchKeywords` (in-memory over the mock manifest for v1).

### Phase 6 — Grounded Chat UI
- `AskHubInput`, `SuggestedQuestions`, `ChatSourceCard`, `AnswerCitationList`, `GroundedAnswer`, `EmptyChatState`, `UnsupportedAnswerState`.
- Surface 13 (Ask This Hub).
- Mock route handler `ask/api/route.ts`.
- Compact ask box on Hub Home (form action posts to `/ask` with prefilled query, doesn't render answers inline).

### Phase 7 — Adapter stub only
- Confirm `adapter.ts` TODO is in place with documented signature and the comment block from § 5.7.
- Document follow-up project in `docs/superpowers/specs/` (separate spec, separate session).

## 8. Compatibility & migration policy

| Concern | Policy |
|---|---|
| Old `/h/[hubSlug]/[slug]` URLs | 308 redirect to `/pages/[slug]`. Removed only if a route conflict surfaces during Phase 0–1. |
| Old `templates.ts` / `publicTemplates.tsx` / `EvidenceChips.tsx` | Kept on disk. Their imports are removed only as routes get rewritten. Final deletion is out-of-scope for this session. |
| `hub.theme` enum (`paper` / `midnight` / `field`) | Untouched. New hubs default to `paper` at the data layer; the manifest layer adds `templateKey: 'editorial_atlas'` which the renderer reads instead. Cross-product enum cleanup happens later. |
| `/app/configure` template-picker UI | Untouched. **This session does not modify `/app/configure`.** Any mismatch between the picker's three options and the public hub's single Editorial Atlas template is intentionally left to the separate app-redesign session — this spec does not introduce new dead UI or conflicting copy. |
| DB data (`hub`, `release`, `hub_visit`, `hub_subscriber`) | NOT truncated. NOT modified. The user must explicitly approve a separate data reset before any TRUNCATE runs. |
| R2 manifest blobs | NOT deleted. NOT modified. |
| `release_manifest_v0` zod schema | Stays. New schema is additive. Pipeline keeps emitting v0 until the adapter project lands. |

A reset script `scripts/reset-hubs.ts` MAY be created in this session as a documented utility, but it MUST NOT execute by default and MUST require an explicit `--confirm` flag plus a printed row count + R2 key list before deleting anything. Even with the script in place, **running it is out of scope.**

## 9. Performance

Public hub pages already use `revalidate = 60` ISR (set in the parallel perf session). Editorial Atlas inherits this:

- All 13 surfaces render server-side with `export const revalidate = 60`.
- `loadManifest` (or its mock equivalent) is wrapped in `React.cache()` so `generateMetadata` and the page render share one read.
- The chat API route is `runtime = 'nodejs'` and is **not** ISR-cached — every POST is fresh.
- Search page reads `?q=` — opted out of ISR via `dynamic = 'force-dynamic'` since results vary per query.

## 10. Accessibility & SEO

- Sidebar nav uses `<nav aria-label="Hub navigation">`.
- Right rail is `<aside aria-label="Evidence and related">`.
- Section headings are h2; nested step/principle titles are h3. The page-level title is the only h1.
- Citations are `<cite>` wrapping the video title.
- Each surface emits `generateMetadata` with canonical URL via `getXxxRoute` helpers.
- `manifest.visibility === 'unlisted'` adds `robots: 'noindex'` and skips the (future) sitemap.
- Methodology and Hub Home pages emit `Article` JSON-LD with creator + datePublished from the manifest.

## 11. Risks & open questions

1. **Mock-vs-real divergence.** The mock manifest may include section kinds (`aha_moments`, `failure_points`) that the current pipeline cannot synthesize. Adapter project must reconcile this — listed as the first item in the follow-up spec.
2. **Search ergonomics.** v1 search is naive in-memory keyword match. Acceptable for ~14 mock pages; will need real indexing once the pipeline emits more data. Out of scope for v1.
3. **Suggested-questions personalization.** The 5 suggested questions are creator-specific (refer to "Ali"). The mock hardcodes Ali; the real adapter must derive these from manifest content. Listed in adapter spec.
4. **Compat redirect catch-all.** If `[slug]` matches `pages` / `topics` / `sources` / etc. before they're added, Next.js will pick the more-specific segment first. This SHOULD work, but Phase 1 acceptance includes a manual smoke test against `/h/test/start`, `/h/test/topics`, etc. to confirm no shadowing.
5. **Visibility field is a partial implementation.** v1 wires up the type and the noindex tag but does not implement an authenticated unlisted flow. Documented in the Out-of-scope list above.

## 12. Definition of done

A reviewer can navigate to `http://localhost:3000/h/<any-mock-hubslug>` and:

- See all 13 surfaces render without errors.
- All optional fields can be removed from the mock manifest one at a time without breaking any surface.
- `pnpm typecheck` and `pnpm lint` pass for `apps/web`.
- The grounded-chat surface accepts the 5 example questions and returns the documented citation-bearing JSON; any other question returns the unsupported fallback shape.
- All inline `/h/${…}` URLs in components route through `lib/hub/routes.ts`.
- No DB schema, DB data, R2 data, `/app/configure` UI, or pipeline source files have been modified.
- The compat redirect serves a 308 for `/h/test/some-old-slug` → `/h/test/pages/some-old-slug` (or has been documented as removed due to conflict, with reason in the implementation PR).
