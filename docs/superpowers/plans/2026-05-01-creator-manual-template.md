# Creator Manual Hub Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for implementation task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the standalone Hormozi-style hub as a reusable Creator Manual template inside the SaaS, ready for future audit-engine and agent integration, without breaking the existing Editorial Atlas hub renderer or the current SaaS workflow.

**Architecture:** Add a second manifest-backed hub family named `creator_manual_v1`. Keep the existing `editorial_atlas_v1` manifest and components intact. Introduce a typed Creator Manual schema, sample manifest, helper layer, CSS-module-based renderer, explicit `/h/[hubSlug]/*` routes, and a development preview slug. The future audit/hub generation engine will target this contract.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.6, Zod 3.23, CSS Modules, existing `node:test`/Vitest setup under `@creatorcanon/web`, no new runtime UI dependency unless a later task proves one is necessary.

**Spec:** `docs/superpowers/specs/2026-05-01-creator-manual-template-design.md`

**Worktree:** `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\creator-manual-template`

**Branch:** `feat/creator-manual-template`

---

## Scope

### In

- Creator Manual manifest schema and TypeScript types.
- Sample manifest modeled on the Hormozi hub structure, with generic safe preview content.
- Record lookup, routing, evidence, sanitation, and search helpers.
- Development preview at `/h/creator-manual-preview`.
- Creator Manual renderer and page surfaces:
  - Home
  - Library
  - Pillars index
  - Pillar detail
  - Sources index
  - Source detail
  - Segments index
  - Segment detail
  - Claims
  - Glossary
  - Themes index
  - Theme detail
  - Workshop index
  - Workshop detail
  - Search
- Branching public hub routes that do not break `editorial_atlas_v1`.
- Unit tests for schema, helpers, evidence, search, and route branching.
- Browser smoke check for the preview route at desktop and mobile sizes.

### Out

- Rewriting the audit/video pipeline.
- Replacing the Editorial Atlas renderer.
- Migrating existing published hubs.
- Dynamic custom domains.
- Auth-gated hub features.
- Chat on hubs.
- Full import of the entire Hormozi generated content set.
- Adding a third-party design system just to match the standalone hub.

---

## File Map

### Create

```txt
apps/web/src/lib/hub/creator-manual/
  schema.ts
  sampleManifest.ts
  routes.ts
  content.ts
  evidence.ts
  search.ts
  sanitize.ts
  schema.test.ts
  content.test.ts
  evidence.test.ts
  search.test.ts

apps/web/src/components/hub/CreatorManual/
  CreatorManual.module.css
  CreatorManualShell.tsx
  CreatorManualHome.tsx
  CreatorManualLibrary.tsx
  CreatorManualPillars.tsx
  CreatorManualPillarDetail.tsx
  CreatorManualSources.tsx
  CreatorManualSourceDetail.tsx
  CreatorManualSegments.tsx
  CreatorManualSegmentDetail.tsx
  CreatorManualClaims.tsx
  CreatorManualGlossary.tsx
  CreatorManualThemes.tsx
  CreatorManualThemeDetail.tsx
  CreatorManualWorkshop.tsx
  CreatorManualWorkshopDetail.tsx
  CreatorManualSearch.tsx
  EvidenceGrid.tsx
  MiniEvidenceVideo.tsx
  CitationDrawer.tsx
  index.ts

apps/web/src/app/h/[hubSlug]/
  library/page.tsx
  pillars/page.tsx
  pillars/[pillarSlug]/page.tsx
  sources/page.tsx
  sources/[sourceId]/page.tsx
  segments/page.tsx
  segments/[segmentId]/page.tsx
  claims/page.tsx
  glossary/page.tsx
  themes/page.tsx
  themes/[themeSlug]/page.tsx
  workshop/page.tsx
  workshop/[stageSlug]/page.tsx
  search/page.tsx
```

### Modify

```txt
apps/web/src/app/h/[hubSlug]/manifest.ts
apps/web/src/app/h/[hubSlug]/page.tsx
apps/web/src/app/h/[hubSlug]/[slug]/page.tsx
apps/web/src/lib/hub/manifest/schema.ts
```

### Optional Modify If Typecheck Must Be Fully Clean

```txt
packages/adapters/src/r2/client.ts
```

This file has a pre-existing typecheck failure in the baseline worktree. Fix only the type mismatch if needed for final readiness. Do not change R2 behavior.

---

## Phase 0: Baseline And Guardrails

- [x] Create isolated worktree from the current SaaS HEAD.
- [x] Install dependencies with `pnpm install --frozen-lockfile`.
- [x] Run `pnpm --filter @creatorcanon/web test`.
- [x] Run `pnpm --filter @creatorcanon/web typecheck` and record the pre-existing R2 typing failure.
- [ ] Commit this spec and plan before code changes.

Verification already observed:

```txt
pnpm --filter @creatorcanon/web test
168 passed, 0 failed
```

Known baseline typecheck failure:

```txt
packages/adapters/src/r2/client.ts
Buffer is not assignable to the SDK body type.
```

---

## Phase 1: Schema And Sample Manifest

### Task 1.1: Creator Manual schema

**Files:**

- Create `apps/web/src/lib/hub/creator-manual/schema.ts`
- Create `apps/web/src/lib/hub/creator-manual/schema.test.ts`

**Steps:**

- [ ] Define `creatorManualManifestSchema` with `schemaVersion: z.literal("creator_manual_v1")`.
- [ ] Define record schemas for creator, brand, nav, home, stats, nodes, pillars, sources, segments, claims, glossary, themes, workshop, and search docs.
- [ ] Export inferred TypeScript types.
- [ ] Add tests that parse a minimal valid manifest and reject an invalid schema version.

**Acceptance:**

- The schema is strict enough for future generated manifests.
- Optional fields are intentional and renderer-safe.
- Tests cover both valid and invalid parse behavior.

### Task 1.2: Sample manifest

**Files:**

- Create `apps/web/src/lib/hub/creator-manual/sampleManifest.ts`
- Update `schema.test.ts`

**Steps:**

- [ ] Build a compact preview manifest with the same structural families as the Hormozi hub.
- [ ] Include at least:
  - 6 nodes
  - 3 pillars
  - 3 source videos
  - 8 segments
  - 6 claims
  - 8 glossary entries
  - 4 themes
  - 4 workshop stages
  - search docs across every record family
- [ ] Keep content generic enough for SaaS preview while still matching the field-manual structure.
- [ ] Assert the sample manifest parses through `creatorManualManifestSchema`.

**Acceptance:**

- Sample data is rich enough to render every page state.
- Sample brand tokens can be swapped without code changes.

---

## Phase 2: Helper Layer

### Task 2.1: Routes and lookup helpers

**Files:**

- Create `apps/web/src/lib/hub/creator-manual/routes.ts`
- Create `apps/web/src/lib/hub/creator-manual/content.ts`
- Create `apps/web/src/lib/hub/creator-manual/content.test.ts`

**Steps:**

- [ ] Add route builders for every public Creator Manual route.
- [ ] Add `buildCreatorManualIndex(manifest)` that maps ids/slugs to records.
- [ ] Add `getPillarBySlug`, `getThemeBySlug`, `getSourceById`, `getSegmentById`, and `getWorkshopStageBySlug`.
- [ ] Add related-record helpers used by components.
- [ ] Test successful lookup and missing lookup behavior.

**Acceptance:**

- Components never hand-build route strings.
- Missing records return `null` or a typed empty state, not thrown runtime errors unless the caller explicitly asks for `assert`.

### Task 2.2: Evidence and sanitizer helpers

**Files:**

- Create `apps/web/src/lib/hub/creator-manual/evidence.ts`
- Create `apps/web/src/lib/hub/creator-manual/sanitize.ts`
- Create `apps/web/src/lib/hub/creator-manual/evidence.test.ts`

**Steps:**

- [ ] Add timestamp formatting and YouTube timestamp URL helpers.
- [ ] Add `resolveEvidenceReferences(manifest, refs)` returning source/segment pairs.
- [ ] Add a public-text sanitizer/checker for UUID tokens and internal review language.
- [ ] Test missing evidence, timestamp formatting, URL generation, and sanitizer matches.

**Acceptance:**

- Evidence UI can render without loading iframes.
- Bad generated text can be caught before publishing.

### Task 2.3: Search helper

**Files:**

- Create `apps/web/src/lib/hub/creator-manual/search.ts`
- Create `apps/web/src/lib/hub/creator-manual/search.test.ts`

**Steps:**

- [ ] Implement deterministic local search over `manifest.search`.
- [ ] Score title matches above summary/body matches.
- [ ] Support filtering by record type.
- [ ] Return routes through the route helper.
- [ ] Test search across nodes, pillars, sources, claims, glossary, themes, and segments.

**Acceptance:**

- No new search dependency is needed for v1.
- Search behavior is deterministic and easy for agents to validate.

---

## Phase 3: Manifest Union And Preview Loader

### Task 3.1: Manifest union

**Files:**

- Modify `apps/web/src/lib/hub/manifest/schema.ts`

**Steps:**

- [ ] Import the Creator Manual schema.
- [ ] Export `hubManifestSchema` as a discriminated union of `editorial_atlas_v1` and `creator_manual_v1`.
- [ ] Preserve existing `editorialAtlasManifestSchema` exports and type names.
- [ ] Add `isCreatorManualManifest` and `isEditorialAtlasManifest` type guards if the existing code benefits from them.
- [ ] Run existing manifest tests.

**Acceptance:**

- Current imports expecting `EditorialAtlasManifest` still compile.
- New code can parse either manifest family.

### Task 3.2: Development preview loader

**Files:**

- Modify `apps/web/src/app/h/[hubSlug]/manifest.ts`

**Steps:**

- [ ] Add a development preview branch for `hubSlug === "creator-manual-preview"`.
- [ ] Return `sampleCreatorManualManifest` only when `NODE_ENV !== "production"` or an explicit preview env flag is enabled.
- [ ] Keep all current R2 behavior intact for normal hub slugs.
- [ ] If loader tests exist, update them; otherwise add a focused test for the preview branch if practical.

**Acceptance:**

- `/h/creator-manual-preview` can render locally without DB/R2.
- Production does not serve sample content by accident.

---

## Phase 4: Shell And Core Components

### Task 4.1: CSS module and shell

**Files:**

- Create `apps/web/src/components/hub/CreatorManual/CreatorManual.module.css`
- Create `apps/web/src/components/hub/CreatorManual/CreatorManualShell.tsx`
- Create `apps/web/src/components/hub/CreatorManual/index.ts`

**Steps:**

- [ ] Create a scoped template root with CSS variables from `manifest.brand.tokens`.
- [ ] Build header, desktop nav, mobile nav, footer, and page frame.
- [ ] Keep cards at 8px radius or less unless tokens override.
- [ ] Ensure typography does not scale with viewport width.
- [ ] Make the mobile nav complete and accessible.

**Acceptance:**

- Branding is entirely manifest-driven.
- No global CSS is required except what already exists in the app.

### Task 4.2: Shared record and evidence components

**Files:**

- Create `EvidenceGrid.tsx`
- Create `MiniEvidenceVideo.tsx`
- Create `CitationDrawer.tsx`
- Use or create a small internal record card component as needed.

**Steps:**

- [ ] Render evidence cards from source/segment references.
- [ ] Use poster-first video previews and only mount iframe after click.
- [ ] Provide direct source links.
- [ ] Avoid rendering empty evidence panels as broken UI.

**Acceptance:**

- Evidence behavior matches the spirit of the Hormozi hub.
- Missing evidence degrades cleanly.

---

## Phase 5: Page Surfaces

### Task 5.1: Home and library

**Files:**

- Create `CreatorManualHome.tsx`
- Create `CreatorManualLibrary.tsx`
- Modify `apps/web/src/app/h/[hubSlug]/page.tsx`
- Create `apps/web/src/app/h/[hubSlug]/library/page.tsx`

**Steps:**

- [ ] Branch home page rendering by manifest schema version.
- [ ] Render existing Editorial Atlas home exactly as before for old manifests.
- [ ] Render Creator Manual home for `creator_manual_v1`.
- [ ] Render library with filters or grouped sections based on node type.

**Acceptance:**

- Existing hubs are not visually changed.
- Preview home and library render from sample manifest.

### Task 5.2: Pillars

**Files:**

- Create `CreatorManualPillars.tsx`
- Create `CreatorManualPillarDetail.tsx`
- Create route files under `pillars/`

**Steps:**

- [ ] Render pillar index cards.
- [ ] Render pillar detail with structured sections and evidence.
- [ ] Show related nodes, themes, claims, or sources where present.
- [ ] Return 404 for missing pillar slug.

**Acceptance:**

- Pillars are usable as the main long-form reading path.

### Task 5.3: Sources and segments

**Files:**

- Create `CreatorManualSources.tsx`
- Create `CreatorManualSourceDetail.tsx`
- Create `CreatorManualSegments.tsx`
- Create `CreatorManualSegmentDetail.tsx`
- Create route files under `sources/` and `segments/`

**Steps:**

- [ ] Render source-video cards with poster-first preview.
- [ ] Render source detail with cited segments.
- [ ] Render segment index with source/title/timestamp context.
- [ ] Render segment detail with transcript excerpt and related claims/nodes.

**Acceptance:**

- A reader can inspect source evidence without leaving the hub.

### Task 5.4: Claims, glossary, themes

**Files:**

- Create `CreatorManualClaims.tsx`
- Create `CreatorManualGlossary.tsx`
- Create `CreatorManualThemes.tsx`
- Create `CreatorManualThemeDetail.tsx`
- Create route files under `claims/`, `glossary/`, and `themes/`

**Steps:**

- [ ] Render claims with evidence references.
- [ ] Render glossary as compact scannable entries.
- [ ] Render themes and theme detail pages with linked nodes/pillars/evidence.

**Acceptance:**

- Trust and vocabulary surfaces are complete enough for future generated hubs.

### Task 5.5: Workshop and search

**Files:**

- Create `CreatorManualWorkshop.tsx`
- Create `CreatorManualWorkshopDetail.tsx`
- Create `CreatorManualSearch.tsx`
- Create route files under `workshop/` and `search/`

**Steps:**

- [ ] Render workshop stage index and detail.
- [ ] Render search page with query param support.
- [ ] Keep search usable without JS where possible; client enhancement is acceptable for instant search.

**Acceptance:**

- The guided implementation path and discovery path are both present.

---

## Phase 6: Route Compatibility

### Task 6.1: Existing dynamic page route

**Files:**

- Modify `apps/web/src/app/h/[hubSlug]/[slug]/page.tsx`

**Steps:**

- [ ] Preserve existing Editorial Atlas page behavior.
- [ ] For Creator Manual manifests, redirect or 404 reserved unsupported dynamic routes deliberately.
- [ ] Do not let Creator Manual slugs accidentally hit Editorial Atlas page assumptions.

**Acceptance:**

- Route collisions are explicit.
- Current hubs are not broken.

---

## Phase 7: Browser And Test Verification

### Task 7.1: Automated tests

**Commands:**

```bash
pnpm --filter @creatorcanon/web test
pnpm --filter @creatorcanon/web typecheck
```

**Steps:**

- [ ] Run all web tests.
- [ ] Run typecheck.
- [ ] If typecheck fails only because of the baseline R2 typing issue, decide whether to fix the small type mismatch in this branch.
- [ ] Re-run typecheck after any R2 fix.

**Acceptance:**

- Web tests pass.
- Typecheck either passes or reports only a documented pre-existing issue.

### Task 7.2: Local browser smoke

**Commands:**

```bash
pnpm --filter @creatorcanon/web dev
```

**Steps:**

- [ ] Open `/h/creator-manual-preview`.
- [ ] Check desktop viewport.
- [ ] Check mobile viewport.
- [ ] Visit home, library, pillar detail, source detail, segment detail, claims, glossary, theme detail, workshop detail, and search.
- [ ] Confirm there is no obvious text overlap or broken navigation.
- [ ] Confirm poster-first video behavior does not mount iframes until click.

**Acceptance:**

- Preview route is usable and visually stable.

---

## Phase 8: Review And Finish

### Task 8.1: Subagent code review

**Steps:**

- [ ] Request a focused code review from a subagent after implementation.
- [ ] Address P0/P1/P2 findings.
- [ ] Re-run tests touched by fixes.

### Task 8.2: Final branch state

**Steps:**

- [ ] Check `git status --short`.
- [ ] Commit coherent changes.
- [ ] Summarize changed files, verification, known residual risk, and the preview URL.

---

## Implementation Order

1. Commit spec and plan.
2. Use a worker subagent for Phase 1 and Phase 2 because schema/helper work is self-contained.
3. Locally integrate and review that patch.
4. Use a worker subagent for Phase 3 because route loader branching is sensitive and small.
5. Locally implement or delegate Phase 4 and Phase 5 in slices, keeping write scopes disjoint.
6. Use a review subagent before final verification.
7. Run tests and browser checks.

 The controller keeps route compatibility and final integration local because those are the highest-risk parts for breaking existing SaaS behavior.
