# Creator Manual Hub Template Design Spec

> Skills used: `superpowers:using-superpowers`, `frontend-design`, and `superpowers:subagent-driven-development`.

## Goal

Build a reusable SaaS hub template that preserves the structure and product quality of the standalone Alex Hormozi hub while making every creator-specific choice data-driven: brand, copy, navigation, content records, evidence, glossary, claims, themes, sources, and workshop stages.

The implementation must be additive. Current public hub rendering, current pipeline adapters, current R2 manifests, and the audit-video pipeline must continue to work while this new template is introduced as a second manifest-backed surface.

## Current Product Understanding

CreatorCanon is moving toward a generated "creator hub" system:

- The audit/video engine extracts deep source material from creator videos.
- The hub generation engine will later convert those artifacts into publishable hubs.
- The existing SaaS already has public hub routing under `/h/[hubSlug]`, R2 manifest loading, Editorial Atlas rendering, pipeline adapters, and Author's Studio work.
- The existing Editorial Atlas implementation is useful infrastructure, but its current public hub shape should be treated as replaceable. The new template should not depend on today's exact Editorial Atlas page model.
- The Hormozi standalone hub is the strongest reference implementation so far and should become the canonical premium template shape, not a one-off hardcoded site.

## Source Hub Being Templated

Reference directory:

`C:\Users\mario\Desktop\Creator Canon Hub builder\Alex Hormozi`

Important source artifacts:

- `hub-build-context.json`
- `README.md`
- `CREATOR_NOTES.md`
- `site/scripts/import-audit.ts`
- `site/src/lib/content.ts`
- `site/src/components/*`
- `site/src/app/*`
- `site/output/import-report.json`
- `site/output/production-content-verification.json`
- `site/output/verification/browser-checks.json`

The Hormozi hub shipped:

- Home page
- Library of canon nodes
- Pillar pages
- Source pages
- Segment pages
- Claims
- Glossary
- Themes
- Workshop stages
- Search
- Evidence cards
- Citation drawer/player behavior
- Mobile navigation
- Static verification over hundreds of routes and multiple viewports

The reusable SaaS template should preserve those information surfaces, but not the hardcoded Hormozi voice, brand, colors, routes, or content.

## Product Shape

The template is a "creator manual": a field guide built from a creator's actual archive. It is not a blog, course, landing page, or generic knowledge base.

The reader should be able to:

- Understand the creator's worldview quickly.
- Browse the canon as discrete reusable ideas.
- Open a pillar and see source-backed explanation.
- Inspect source videos and cited segments.
- Search across claims, nodes, themes, glossary terms, sources, and segments.
- Use a workshop path as a guided operational sequence.
- Trust that claims are grounded in video evidence.

## Design Principles

Use the `frontend-design` skill as the bar:

1. The first screen is the actual hub, not a marketing hero.
2. The creator signal is immediate: name, thesis, visual identity, source-backed stats, and main navigation are visible in the first viewport.
3. Operational tools should feel dense, scannable, and durable. Avoid decorative cards that make the hub look like a landing page.
4. Cards are for repeated content records and drawers/modals, not for wrapping full page sections.
5. Evidence is a first-class UI primitive. Citations should be visible, clickable, and low-friction.
6. Video embeds are poster-first. Do not load iframes until the reader asks.
7. Responsive layout must be stable: no text overlap, no card-inside-card composition, no hero typography inside compact panels.
8. Color must be completely themeable, but the default visual system can preserve the Hormozi "brutalist field manual" feel.
9. The renderer must be template-driven, not creator-hardcoded.

## Non-Breaking Strategy

Add a second manifest family instead of rewriting the existing Editorial Atlas contract.

Existing:

```ts
schemaVersion: "editorial_atlas_v1"
```

New:

```ts
schemaVersion: "creator_manual_v1"
template: {
  id: "creator-manual",
  version: 1
}
```

The public hub loader should return a discriminated union:

```ts
type HubManifest = EditorialAtlasManifest | CreatorManualManifest;
```

Existing Editorial Atlas routes branch to the current renderer. Creator Manual routes branch to the new renderer. If a route is not supported by a manifest family, return a normal 404 instead of coercing shapes.

## Creator Manual Manifest

The SaaS template needs one stable input object that can be written by the future hub-generation engine.

Top-level shape:

```ts
type CreatorManualManifest = {
  schemaVersion: "creator_manual_v1";
  generatedAt: string;
  creator: CreatorManualCreator;
  brand: CreatorManualBrand;
  navigation: CreatorManualNavigation;
  home: CreatorManualHome;
  stats: CreatorManualStats;
  nodes: CreatorManualNode[];
  pillars: CreatorManualPillar[];
  sources: CreatorManualSourceVideo[];
  segments: CreatorManualSegment[];
  claims: CreatorManualClaim[];
  glossary: CreatorManualGlossaryEntry[];
  themes: CreatorManualTheme[];
  workshop: CreatorManualWorkshopStage[];
  search: CreatorManualSearchDocument[];
};
```

### Creator

Creator data controls all creator identity surfaces:

- `name`
- `handle`
- `avatarUrl`
- `portraitUrl`
- `canonicalUrl`
- `tagline`
- `thesis`
- `about`
- `voiceSummary`

### Brand

Brand data must allow a full redesign without code edits:

- `tokens.colors.background`
- `tokens.colors.foreground`
- `tokens.colors.muted`
- `tokens.colors.surface`
- `tokens.colors.elevated`
- `tokens.colors.border`
- `tokens.colors.accent`
- `tokens.colors.accentForeground`
- `tokens.colors.warning`
- `tokens.colors.success`
- `tokens.colors.typeMap`
- `tokens.typography.headingFamily`
- `tokens.typography.bodyFamily`
- `tokens.radius`
- `tokens.shadow`
- `assets.logoUrl`
- `assets.heroImageUrl`
- `assets.patternImageUrl`
- `style.mode`

The first implementation should apply these values through scoped CSS variables on the Creator Manual shell.

### Content Records

The core record families map directly to the Hormozi hub:

- Nodes: canon ideas, frameworks, rules, tactics, beliefs, warnings, and mental models.
- Pillars: long-form pages that organize the creator's system.
- Sources: videos or source assets used as evidence.
- Segments: timestamped source moments.
- Claims: precise source-backed statements.
- Glossary: creator vocabulary.
- Themes: cross-archive patterns.
- Workshop: guided sequence or implementation curriculum.
- Search documents: normalized search index rows.

The schema should support unknown future record tags, but the renderer should gracefully display only known public fields.

## Public Routes

The target SaaS route family is scoped under `/h/[hubSlug]`:

- `/h/[hubSlug]`
- `/h/[hubSlug]/library`
- `/h/[hubSlug]/pillars`
- `/h/[hubSlug]/pillars/[pillarSlug]`
- `/h/[hubSlug]/sources`
- `/h/[hubSlug]/sources/[sourceId]`
- `/h/[hubSlug]/segments`
- `/h/[hubSlug]/segments/[segmentId]`
- `/h/[hubSlug]/claims`
- `/h/[hubSlug]/glossary`
- `/h/[hubSlug]/themes`
- `/h/[hubSlug]/themes/[themeSlug]`
- `/h/[hubSlug]/workshop`
- `/h/[hubSlug]/workshop/[stageSlug]`
- `/h/[hubSlug]/search`

The first version should avoid fighting the existing `/h/[hubSlug]/[slug]` Editorial Atlas page route. Creator Manual canon-node detail pages can be introduced later as either:

- `/h/[hubSlug]/library/[nodeSlug]`, or
- `/h/[hubSlug]/canon/[type]/[slug]`

The renderer can still expose node cards, related nodes, and evidence without shipping node-detail routes in the first pass.

## Rendering Architecture

New files should live under:

```txt
apps/web/src/lib/hub/creator-manual/
apps/web/src/components/hub/CreatorManual/
```

The renderer should be a server-first React implementation with small client islands only where interaction requires it:

- Mobile navigation toggle
- Search client
- Citation drawer
- Poster-first video embed

Do not add a new design dependency unless necessary. Use CSS modules and scoped CSS variables for the template visual system. This keeps the implementation portable and avoids leaking template styles into current SaaS surfaces.

## Component System

Core components:

- `CreatorManualShell`
- `CreatorManualHeader`
- `CreatorManualHome`
- `CreatorManualGrid`
- `CreatorManualRecordCard`
- `CreatorManualPillarPage`
- `CreatorManualSourcePage`
- `CreatorManualSegmentPage`
- `CreatorManualClaimsPage`
- `CreatorManualGlossaryPage`
- `CreatorManualThemesPage`
- `CreatorManualWorkshopPage`
- `CreatorManualSearchPage`
- `EvidenceGrid`
- `MiniEvidenceVideo`
- `CitationButton`
- `CitationDrawer`

The first pass can consolidate some page components if the data contracts stay clean.

## Evidence Rules

The Hormozi import script has the right instincts and should be carried forward:

- Remove raw UUID citation tokens from public text.
- Keep internal/manual-review/tagger text out of public surfaces.
- Prefer public source references.
- Do not render source evidence if the source record is missing.
- Avoid loading third-party iframe embeds by default.
- Make direct YouTube links available for source inspection.
- Make citation UI work without requiring a chat or auth context.

The reusable template should include validation helpers that can be run against any generated manifest before publishing.

## Preview Harness

Add a development-only preview manifest:

```txt
/h/creator-manual-preview
```

The loader can return the sample Creator Manual manifest for that slug only when development preview is enabled. This gives design, browser, and Playwright checks a stable target without requiring a real R2 upload or DB row.

Production must not accidentally serve the sample hub unless an explicit env flag is set.

## Pipeline Integration Boundary

This plan should make the renderer ready for future integration, but it should not rewrite the audit engine.

The near-term adapter boundary should be a pure projector:

```ts
buildCreatorManualManifest(input: CreatorManualAdapterInput): CreatorManualManifest
```

It can live in the pipeline package or a shared package later. The first implementation can keep the production renderer independent while providing fixtures and schema contracts that the future agents can target.

## Verification

Minimum readiness gates:

- Existing web tests still pass.
- Creator Manual schema accepts the sample manifest.
- Helper tests prove routes, record lookup, and evidence references.
- Public text sanitizer catches UUID tokens and internal review language.
- Search helper returns relevant records across at least nodes, pillars, sources, claims, glossary, themes, and segments.
- Development preview renders at desktop and mobile sizes without overlap.
- Existing Editorial Atlas hub tests still pass.

Known baseline issue:

- `pnpm --filter @creatorcanon/web typecheck` currently fails in `packages/adapters/src/r2/client.ts` before this work begins. The implementation should either fix that small typing issue or report it as the only remaining pre-existing blocker.

## Risks

1. Existing hub route collisions:
   Use explicit Creator Manual routes first. Defer canon-node dynamic routes until the public route model is cleaned up.

2. Over-customization:
   Make brand/theme data flexible, but keep layout slots finite. The generator can choose values; it should not produce arbitrary React.

3. Huge manifests:
   Keep lookup helpers linear for generation-time checks but use maps inside render helpers where repeated lookup matters.

4. Design drift:
   Preserve the Hormozi structure and density in the default sample, but route all creator-specific surface through manifest data.

5. Pipeline coupling:
   Do not force the audit engine to emit final hub JSON yet. The contract should be ready, not welded into an engine still being improved.

