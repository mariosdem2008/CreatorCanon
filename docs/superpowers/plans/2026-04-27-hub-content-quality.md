# Hub Content Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Editorial Atlas hub from "AI summary of two videos" into a hub that's actually useful — citations rendered, topics grouping pages, quotes timestamp-linked back to source video, sources page that doesn't crash, page bodies that aren't tautological.

**Architecture:** All fixes land in the editorial-atlas **adapter** layer (`packages/pipeline/src/adapters/editorial-atlas/*`) and the **hub renderer** (`apps/web/src/components/hub/EditorialAtlas/*`, `apps/web/src/app/h/[hubSlug]/...`). No pipeline-stage changes (no agent re-prompting), no DB schema changes. The existing `/h/trial` hub is left untouched as a regression baseline; verification runs on a freshly-generated hub from the same two source videos.

**Tech Stack:** TypeScript, Drizzle ORM, Zod, Next.js 14 App Router, node:test + tsx for unit tests, postgres-js for ad-hoc queries.

---

## File Map

### Modified — adapter layer (manifest builders)

- `packages/pipeline/src/adapters/editorial-atlas/index.ts` — orchestrator. Currently overwrites page citations with `[]`. Wire in the new citation-builder; pass page metadata into the source builder.
- `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts` — page projector. Add quote section enrichment (timestampStart + sourceVideoId from the segment that backs the quote finding). Stop using `summary` as the overview body; pull a distinct `overview` field from the page version.
- `packages/pipeline/src/adapters/editorial-atlas/project-sources.ts` — source projector. Drop the `https://placehold.co` placeholder; use a data-URL SVG for sources without thumbnails. Use the project's creator name in `channelName` instead of the literal `'Creator'`. Use `video.title` (now filename-defaulted) instead of `'Untitled'`.

### New — adapter layer

- `packages/pipeline/src/adapters/editorial-atlas/project-citations.ts` — pure builder that takes pages (with their `evidenceSegmentIds`) plus the segment → video lookup tables and returns a per-page `citations[]` matching `citationSchema`. Replaces the `citations: []` placeholder.
- `packages/pipeline/src/adapters/editorial-atlas/title-case.ts` — pure helper that title-cases framework/playbook titles for display.
- `packages/pipeline/src/adapters/editorial-atlas/source-thumbnail.ts` — pure helper that returns a thumbnail URL: `i.ytimg.com` for YouTube videos, a data-URL SVG for manual uploads (no network round-trip, no remote-pattern config needed).

### New tests — adapter layer

- `packages/pipeline/src/adapters/editorial-atlas/test/project-citations.test.ts`
- `packages/pipeline/src/adapters/editorial-atlas/test/title-case.test.ts`
- `packages/pipeline/src/adapters/editorial-atlas/test/source-thumbnail.test.ts`

### Modified — renderer layer

- `apps/web/src/components/hub/EditorialAtlas/blocks/SourceRail.tsx` — already has the empty-state branch ("No sources cited yet"). No code change; this just stops being shown once the manifest carries real citations.
- `apps/web/src/app/h/[hubSlug]/pages/[pageSlug]/page.tsx` (or whichever component renders page detail) — verify Related Pages list is shown beneath the section content. Add the RelatedPages block import + render if missing.
- `apps/web/src/components/hub/EditorialAtlas/blocks/RelatedPages.tsx` — already exists; confirm it consumes `manifest.pages` and `relatedPageIds`.

### Modified — public stat presentation

- `packages/pipeline/src/adapters/editorial-atlas/project-stats.ts` — add `totalDurationMinutes` to stats output (reframes "0 yrs of archive" for small archives).
- `apps/web/src/lib/hub/manifest/schema.ts` — extend `stats` schema to include `totalDurationMinutes: z.number().int().min(0)`.
- `apps/web/src/components/hub/EditorialAtlas/blocks/StatBar.tsx` (or wherever the home-page stat tiles render) — replace `archiveYears` with `totalDurationMinutes` when archive is < 1 year.

### Diagnostic only — no changes expected

- `packages/pipeline/src/agents/specialists/prompts.ts` (TOPIC_SPOTTER_PROMPT) — read-only investigation in Task 4.1.
- DB query against `archive_finding WHERE run_id = ? AND type = 'topic'` — confirms whether topics make it to the DB or get filtered downstream.

---

## Phase A: Citations Render End-to-End

The page detail right rail says "No sources cited yet" because the adapter writes `citations: []` on every page. The data exists — pages have `evidenceSegmentIds`, segments have `start_ms`/`end_ms`/`text`, segments have a `video_id` that joins to a `video` row with a `title`. We just need to project that into the manifest's `citationSchema`.

This is the single biggest visual fix. After this phase, every page shows a real "Evidence & sources" panel with clickable timestamps.

### Task A1: Pure citation-builder — failing test

**Files:**
- Create: `packages/pipeline/src/adapters/editorial-atlas/test/project-citations.test.ts`

- [ ] **Step 1: Create the test file with a single failing assertion**

```typescript
// packages/pipeline/src/adapters/editorial-atlas/test/project-citations.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPageCitations } from '../project-citations';

describe('buildPageCitations', () => {
  it('builds one citation per evidence segment, joined to video metadata', () => {
    const pages = [
      { id: 'pg_1', evidenceSegmentIds: ['seg_a', 'seg_b'] },
    ];
    const segments = [
      { id: 'seg_a', videoId: 'vid_1', startMs: 12_000, endMs: 18_000, text: 'first cited line' },
      { id: 'seg_b', videoId: 'vid_2', startMs: 90_000, endMs: 95_000, text: 'second cited line' },
    ];
    const videos = [
      { id: 'vid_1', title: 'Video One', youtubeVideoId: null },
      { id: 'vid_2', title: 'Video Two', youtubeVideoId: 'yt_xyz' },
    ];

    const result = buildPageCitations({ pages, segments, videos });

    assert.equal(result.size, 1);
    const cites = result.get('pg_1')!;
    assert.equal(cites.length, 2);
    assert.equal(cites[0]!.id, 'cite_seg_a');
    assert.equal(cites[0]!.sourceVideoId, 'vid_1');
    assert.equal(cites[0]!.videoTitle, 'Video One');
    assert.equal(cites[0]!.timestampStart, 12);
    assert.equal(cites[0]!.timestampEnd, 18);
    assert.equal(cites[0]!.timestampLabel, '0:12');
    assert.equal(cites[0]!.excerpt, 'first cited line');
    // Manual upload (no youtubeVideoId): no `url` field on the citation.
    assert.equal(cites[0]!.url, undefined);
    // YouTube source: `url` deep-links into the video at the start timestamp.
    assert.equal(cites[1]!.url, 'https://www.youtube.com/watch?v=yt_xyz&t=90s');
  });

  it('returns empty list for a page with no evidence segments', () => {
    const result = buildPageCitations({
      pages: [{ id: 'pg_empty', evidenceSegmentIds: [] }],
      segments: [],
      videos: [],
    });
    assert.deepEqual(result.get('pg_empty'), []);
  });

  it('skips evidence segments missing from the segments lookup (defensive)', () => {
    const result = buildPageCitations({
      pages: [{ id: 'pg_1', evidenceSegmentIds: ['seg_missing'] }],
      segments: [],
      videos: [],
    });
    assert.deepEqual(result.get('pg_1'), []);
  });

  it('skips segments whose video is missing (defensive)', () => {
    const result = buildPageCitations({
      pages: [{ id: 'pg_1', evidenceSegmentIds: ['seg_a'] }],
      segments: [{ id: 'seg_a', videoId: 'vid_missing', startMs: 0, endMs: 1000, text: 'x' }],
      videos: [],
    });
    assert.deepEqual(result.get('pg_1'), []);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/project-citations.test.ts
```

Expected: FAIL with `Cannot find module '../project-citations'`.

- [ ] **Step 3: Create the implementation file**

Create `packages/pipeline/src/adapters/editorial-atlas/project-citations.ts`:

```typescript
// packages/pipeline/src/adapters/editorial-atlas/project-citations.ts
//
// Pure projector that turns each page's evidenceSegmentIds into a list of
// citation rows matching apps/web's citationSchema. Decoupled from drizzle
// so it's trivially unit-testable.

interface PageInput {
  id: string;
  evidenceSegmentIds: string[];
}

interface SegmentInput {
  id: string;
  videoId: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface VideoInput {
  id: string;
  title: string | null;
  youtubeVideoId: string | null;
}

export interface ProjectedCitation {
  id: string;
  sourceVideoId: string;
  videoTitle: string;
  timestampStart: number;
  timestampEnd: number;
  timestampLabel: string;
  excerpt: string;
  url?: string;
}

function formatTimestampLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function buildPageCitations(input: {
  pages: PageInput[];
  segments: SegmentInput[];
  videos: VideoInput[];
}): Map<string, ProjectedCitation[]> {
  const segById = new Map(input.segments.map((s) => [s.id, s]));
  const videoById = new Map(input.videos.map((v) => [v.id, v]));

  const out = new Map<string, ProjectedCitation[]>();
  for (const p of input.pages) {
    const cites: ProjectedCitation[] = [];
    for (const segId of p.evidenceSegmentIds) {
      const seg = segById.get(segId);
      if (!seg) continue;
      const video = videoById.get(seg.videoId);
      if (!video) continue;
      const startSec = Math.floor(seg.startMs / 1000);
      const endSec = Math.floor(seg.endMs / 1000);
      const url = video.youtubeVideoId
        ? `https://www.youtube.com/watch?v=${video.youtubeVideoId}&t=${startSec}s`
        : undefined;
      cites.push({
        id: `cite_${seg.id}`,
        sourceVideoId: seg.videoId,
        videoTitle: video.title ?? 'Untitled',
        timestampStart: startSec,
        timestampEnd: endSec,
        timestampLabel: formatTimestampLabel(startSec),
        excerpt: seg.text,
        url,
      });
    }
    out.set(p.id, cites);
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/project-citations.test.ts
```

Expected: PASS — all 4 test cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/project-citations.ts packages/pipeline/src/adapters/editorial-atlas/test/project-citations.test.ts
git commit -m "feat(adapter): pure citation builder for editorial-atlas pages"
```

### Task A2: Wire citation-builder into the adapter

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/index.ts`

- [ ] **Step 1: Read the current file**

```bash
cat packages/pipeline/src/adapters/editorial-atlas/index.ts
```

Note the lines that read `pagesWithInternal` and overwrite citations with `[]`.

- [ ] **Step 2: Add the import + DB lookup + assignment**

Edit `packages/pipeline/src/adapters/editorial-atlas/index.ts`. Add after the existing imports:

```typescript
import { inArray } from '@creatorcanon/db';
import { segment, video as videoTable } from '@creatorcanon/db/schema';
import { buildPageCitations } from './project-citations';
```

Replace the block that strips internal + zeros citations. Find:

```typescript
  // Strip _internal from pages and cast citations to the correct (empty) shape.
  const pages = pagesWithInternal.map(({ _internal: _dropped, ...rest }) => ({
    ...rest,
    citations: [] as EditorialAtlasManifest['pages'][number]['citations'],
  }));
```

Replace with:

```typescript
  // Build per-page citations from segment + video lookups so the manifest
  // carries real evidence references (matches the citationSchema in apps/web).
  const allSegmentIds = new Set<string>();
  for (const p of pagesWithInternal) {
    for (const id of p._internal.evidenceSegmentIds) allSegmentIds.add(id);
  }
  const segmentRows = allSegmentIds.size
    ? await db
        .select({
          id: segment.id,
          videoId: segment.videoId,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
        })
        .from(segment)
        .where(inArray(segment.id, [...allSegmentIds]))
    : [];
  const citationVideoIds = [...new Set(segmentRows.map((s) => s.videoId))];
  const citationVideoRows = citationVideoIds.length
    ? await db
        .select({ id: videoTable.id, title: videoTable.title, youtubeVideoId: videoTable.youtubeVideoId })
        .from(videoTable)
        .where(inArray(videoTable.id, citationVideoIds))
    : [];
  const citationsByPage = buildPageCitations({
    pages: pagesWithInternal.map((p) => ({
      id: p.id,
      evidenceSegmentIds: p._internal.evidenceSegmentIds,
    })),
    segments: segmentRows,
    videos: citationVideoRows,
  });
  const pages = pagesWithInternal.map(({ _internal: _dropped, ...rest }) => ({
    ...rest,
    citations: (citationsByPage.get(rest.id) ?? []) as EditorialAtlasManifest['pages'][number]['citations'],
  }));
```

- [ ] **Step 3: Build to verify the file typechecks**

```bash
cd packages/pipeline && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run all adapter tests to verify nothing regresses**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/
```

Expected: every existing test still passes.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/index.ts
git commit -m "fix(adapter): hydrate page.citations from segments instead of leaving empty"
```

### Task A3: Confirm citationCount aligns with citations.length

`page.citationCount` is computed from the composer's `atlasMeta`, while `page.citations.length` now comes from `evidenceSegmentIds.length`. If they diverge the right rail will look honest, but the page header ("3 citations") could lie.

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`

- [ ] **Step 1: Locate the citationCount assignment**

```bash
grep -n citationCount packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
```

You should see `citationCount: meta.citationCount,` on the projected return.

- [ ] **Step 2: Update to use evidenceSegmentIds.length**

In `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`, find:

```typescript
        citationCount: meta.citationCount,
```

Replace with:

```typescript
        // citationCount mirrors what's actually rendered in the right rail
        // (one citation per evidence segment), so this matches citations.length.
        citationCount: meta.evidenceSegmentIds.length,
```

- [ ] **Step 3: Build + test**

```bash
cd packages/pipeline && pnpm typecheck && pnpm test src/adapters/editorial-atlas/test/
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "fix(adapter): align page.citationCount with rendered citations.length"
```

---

## Phase B: Quote Sections Link to Source Video

The manifest's quote section schema accepts `timestampStart` and `sourceVideoId`. The adapter never populates them, so quotes in pages can't link back to the moment in the video. With Phase A landed, the right rail shows real citations — but inline quotes still look like decoration.

### Task B1: Find the segment behind each quote — failing test

The composer stores quote findings in `pageVersion.blockTreeJson.blocks` with `b.citations: string[]` — those are the citation IDs (which we now know map 1:1 to segment IDs via Phase A). For a quote section, the first citation is the quote's own segment.

**Files:**
- Create: `packages/pipeline/src/adapters/editorial-atlas/test/quote-enrichment.test.ts`

- [ ] **Step 1: Create the test**

```typescript
// packages/pipeline/src/adapters/editorial-atlas/test/quote-enrichment.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { enrichQuoteSection } from '../quote-enrichment';

describe('enrichQuoteSection', () => {
  it('attaches sourceVideoId + timestampStart from the first citation segment', () => {
    const segments = new Map([
      ['seg_a', { id: 'seg_a', videoId: 'vid_1', startMs: 90_500 }],
    ]);
    const enriched = enrichQuoteSection(
      { kind: 'quote', body: 'A real quote', citationIds: ['seg_a'] },
      segments,
    );
    assert.equal(enriched.sourceVideoId, 'vid_1');
    assert.equal(enriched.timestampStart, 90); // floor(90.5)
  });

  it('leaves the section unchanged when no citation IDs present', () => {
    const segments = new Map([['seg_a', { id: 'seg_a', videoId: 'vid_1', startMs: 0 }]]);
    const original = { kind: 'quote', body: 'Orphan quote', citationIds: [] };
    const enriched = enrichQuoteSection(original, segments);
    assert.equal(enriched.sourceVideoId, undefined);
    assert.equal(enriched.timestampStart, undefined);
    assert.equal(enriched.body, 'Orphan quote');
  });

  it('leaves non-quote sections completely untouched', () => {
    const segments = new Map([['seg_a', { id: 'seg_a', videoId: 'vid_1', startMs: 0 }]]);
    const overview = { kind: 'overview', body: 'A summary', citationIds: ['seg_a'] };
    const enriched = enrichQuoteSection(overview, segments);
    assert.deepEqual(enriched, overview);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/quote-enrichment.test.ts
```

Expected: FAIL with `Cannot find module '../quote-enrichment'`.

- [ ] **Step 3: Create the implementation**

Create `packages/pipeline/src/adapters/editorial-atlas/quote-enrichment.ts`:

```typescript
// packages/pipeline/src/adapters/editorial-atlas/quote-enrichment.ts
//
// For 'quote' page sections, attach sourceVideoId + timestampStart so the
// renderer can deep-link to the moment in the source video. Non-quote
// sections pass through unchanged.

interface SegmentRef {
  id: string;
  videoId: string;
  startMs: number;
}

interface SectionLike {
  kind: string;
  body?: string;
  citationIds?: string[];
  sourceVideoId?: string;
  timestampStart?: number;
  [key: string]: unknown;
}

export function enrichQuoteSection(
  section: SectionLike,
  segments: Map<string, SegmentRef>,
): SectionLike {
  if (section.kind !== 'quote') return section;
  const firstCitation = section.citationIds?.[0];
  if (!firstCitation) return section;
  const seg = segments.get(firstCitation);
  if (!seg) return section;
  return {
    ...section,
    sourceVideoId: seg.videoId,
    timestampStart: Math.floor(seg.startMs / 1000),
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/quote-enrichment.test.ts
```

Expected: PASS — all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/quote-enrichment.ts packages/pipeline/src/adapters/editorial-atlas/test/quote-enrichment.test.ts
git commit -m "feat(adapter): pure quote-section enricher (timestampStart + sourceVideoId)"
```

### Task B2: Wire quote-enricher into projectPages

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`

- [ ] **Step 1: Pass segments map down through projectPages**

The function currently signs as `projectPages({ runId, db, topics })`. We need a segment lookup. The cleanest way: load the segments inside projectPages (it already fans out from runId). Add to the top of the function body, after `pageRows` is loaded:

In `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`, find the `pageRows` and `versionRows` declarations and add right after them:

```typescript
  // Load every segment referenced by any page so we can attach
  // sourceVideoId + timestampStart to quote sections.
  const allSegmentIds = new Set<string>();
  for (const v of versionRows) {
    const tree = v.blockTreeJson as { atlasMeta?: { evidenceSegmentIds?: string[] } };
    for (const id of tree.atlasMeta?.evidenceSegmentIds ?? []) allSegmentIds.add(id);
  }
  const segmentRows = allSegmentIds.size
    ? await db
        .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs })
        .from(segment)
        .where(inArray(segment.id, [...allSegmentIds]))
    : [];
  const segmentLookup = new Map(segmentRows.map((s) => [s.id, s]));
```

Add the imports at the top of the file:

```typescript
import { eq, inArray } from '@creatorcanon/db';
import { page, pageVersion, segment } from '@creatorcanon/db/schema';
```

(Replace the existing single-import line. The current file has `import { eq } from '@creatorcanon/db';` and `import { page, pageVersion } from '@creatorcanon/db/schema';`.)

- [ ] **Step 2: Apply enrichQuoteSection in the section transform**

Find the section-mapping block. After this block:

```typescript
        return {
          kind: b.type,
          ...titleFallback,
          ...normalizedContent,
          citationIds: b.citations,
        };
      });
```

Replace with (note the wrap with `enrichQuoteSection`):

```typescript
        return {
          kind: b.type,
          ...titleFallback,
          ...normalizedContent,
          citationIds: b.citations,
        };
      }).map((s) => enrichQuoteSection(s as SectionLike, segmentLookup));
```

Add the import + helper-shape at the top:

```typescript
import { enrichQuoteSection } from './quote-enrichment';

type SectionLike = {
  kind: string;
  body?: string;
  citationIds?: string[];
  sourceVideoId?: string;
  timestampStart?: number;
  [key: string]: unknown;
};
```

- [ ] **Step 3: Typecheck**

```bash
cd packages/pipeline && pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 4: Run adapter tests to confirm no regression**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "fix(adapter): enrich quote sections with sourceVideoId + timestampStart"
```

### Task B3: Render quote timestamp link in QuoteBlock

`apps/web/src/components/hub/EditorialAtlas/blocks/QuoteBlock.tsx` is the renderer for quote sections. Currently it shows body + attribution only; we want a small "0:42 → in source video" affordance.

**Files:**
- Modify: `apps/web/src/components/hub/EditorialAtlas/blocks/QuoteBlock.tsx`

- [ ] **Step 1: Locate the file (it may have a different name)**

```bash
grep -rln "kind === 'quote'\|kind: 'quote'\|QuoteBlock" apps/web/src/components/hub/EditorialAtlas
```

If a file like `QuoteBlock.tsx` exists, modify it. If quote rendering is inline in `PageSection.tsx`, modify that.

- [ ] **Step 2: Add the timestamp affordance**

Find the JSX that renders the quote body. Below the body (and above any attribution), add:

```tsx
{section.sourceVideoId && typeof section.timestampStart === 'number' ? (
  <a
    href={`/h/${hubSlug}/sources/${section.sourceVideoId}#t=${section.timestampStart}`}
    className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6B5F50] hover:text-[#1A1612]"
  >
    <span aria-hidden>↳</span>
    <span>Open at {Math.floor(section.timestampStart / 60)}:{String(section.timestampStart % 60).padStart(2, '0')}</span>
  </a>
) : null}
```

The component must receive `hubSlug` in props. If it doesn't, plumb it down from the page-detail route.

- [ ] **Step 3: Reload page in browser and visually confirm a quote shows the link**

```bash
# user's pnpm dev is running; just navigate
```

Open `http://localhost:3000/h/trial/pages/automation-is-a-client-experience-layer` (or any lesson) and confirm one of the quotes now has a "Open at M:SS" affordance.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/hub/EditorialAtlas/blocks/QuoteBlock.tsx
git commit -m "feat(hub): render source-video timestamp link on quote sections"
```

---

## Phase C: Source Page No Longer Crashes

The Sources page throws `Invalid src prop "https://placehold.co/..."` because the adapter emits a placeholder URL that isn't in `next.config.mjs` `images.remotePatterns`. Easier than expanding the allowlist: stop emitting placeholder URLs. For manual uploads with no thumbnail, render a built-in SVG via a data: URL — Next.js Image accepts data URLs without remote-pattern config.

### Task C1: Pure thumbnail builder — failing test

**Files:**
- Create: `packages/pipeline/src/adapters/editorial-atlas/test/source-thumbnail.test.ts`

- [ ] **Step 1: Create the test**

```typescript
// packages/pipeline/src/adapters/editorial-atlas/test/source-thumbnail.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sourceThumbnail } from '../source-thumbnail';

describe('sourceThumbnail', () => {
  it('uses YouTube hqdefault when youtubeVideoId is set', () => {
    const url = sourceThumbnail({ youtubeVideoId: 'abc123', thumbnails: null });
    assert.equal(url, 'https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('prefers an explicit thumbnails.medium url when present', () => {
    const url = sourceThumbnail({
      youtubeVideoId: null,
      thumbnails: { medium: 'https://cdn.example/x.jpg' },
    });
    assert.equal(url, 'https://cdn.example/x.jpg');
  });

  it('returns a data: URL SVG fallback when nothing else available', () => {
    const url = sourceThumbnail({ youtubeVideoId: null, thumbnails: null });
    assert.match(url, /^data:image\/svg\+xml;base64,/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/source-thumbnail.test.ts
```

Expected: FAIL with `Cannot find module '../source-thumbnail'`.

- [ ] **Step 3: Create the implementation**

Create `packages/pipeline/src/adapters/editorial-atlas/source-thumbnail.ts`:

```typescript
// packages/pipeline/src/adapters/editorial-atlas/source-thumbnail.ts
//
// Pure helper: pick the best thumbnail URL for a source row. For manual
// uploads without metadata, return a built-in SVG via data: URL — Next.js
// Image accepts data URLs without an entry in next.config.mjs images.

const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice"><rect width="480" height="270" fill="#E5DECF"/><g fill="#3D352A"><rect x="200" y="105" width="80" height="60" rx="6" opacity="0.3"/><polygon points="225,120 225,150 255,135"/></g></svg>`;

const FALLBACK_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(FALLBACK_SVG).toString('base64')}`;

export function sourceThumbnail(input: {
  youtubeVideoId: string | null;
  thumbnails: { medium?: string; small?: string } | null;
}): string {
  if (input.thumbnails?.medium) return input.thumbnails.medium;
  if (input.thumbnails?.small) return input.thumbnails.small;
  if (input.youtubeVideoId) return `https://i.ytimg.com/vi/${input.youtubeVideoId}/hqdefault.jpg`;
  return FALLBACK_DATA_URL;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/source-thumbnail.test.ts
```

Expected: PASS — all 3 cases.

- [ ] **Step 5: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/source-thumbnail.ts packages/pipeline/src/adapters/editorial-atlas/test/source-thumbnail.test.ts
git commit -m "feat(adapter): pure thumbnail builder with SVG data-URL fallback"
```

### Task C2: Use thumbnail builder + real channel name + real title in projectSources

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-sources.ts`
- Modify: `packages/pipeline/src/adapters/editorial-atlas/index.ts`

- [ ] **Step 1: Update projectSources to take `creatorName` + use thumbnail helper**

Replace the entire body of `projectSources` in `packages/pipeline/src/adapters/editorial-atlas/project-sources.ts` with:

```typescript
import { inArray } from '@creatorcanon/db';
import { segment, video, transcriptAsset } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';
import { sourceThumbnail } from './source-thumbnail';

export async function projectSources({
  db,
  pages,
  creatorName,
}: {
  runId: string;
  db: AtlasDb;
  pages: Array<{
    id: string;
    _internal?: { evidenceSegmentIds: string[] };
  }>;
  creatorName: string;
}) {
  const allSegmentIds = new Set<string>();
  for (const p of pages) {
    for (const id of p._internal?.evidenceSegmentIds ?? []) allSegmentIds.add(id);
  }
  if (allSegmentIds.size === 0) return [];

  const segmentRows = await db
    .select({
      id: segment.id,
      videoId: segment.videoId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      text: segment.text,
    })
    .from(segment)
    .where(inArray(segment.id, [...allSegmentIds]));

  const videoIds = [...new Set(segmentRows.map((s) => s.videoId))];
  if (videoIds.length === 0) return [];

  const videoRows = await db
    .select()
    .from(video)
    .where(inArray(video.id, videoIds));
  const transcripts = await db
    .select({ videoId: transcriptAsset.videoId, isCanonical: transcriptAsset.isCanonical })
    .from(transcriptAsset)
    .where(inArray(transcriptAsset.videoId, videoIds));
  const canonicalSet = new Set(
    transcripts.filter((t) => t.isCanonical).map((t) => t.videoId),
  );

  const segByVideo = new Map<string, typeof segmentRows>();
  for (const s of segmentRows) {
    const list = segByVideo.get(s.videoId) ?? [];
    list.push(s);
    segByVideo.set(s.videoId, list);
  }

  return videoRows.map((v) => {
    const segs = segByVideo.get(v.id) ?? [];
    const citedPageIds = pages
      .filter((p) =>
        (p._internal?.evidenceSegmentIds ?? []).some((id) => segs.some((s) => s.id === id)),
      )
      .map((p) => p.id);

    return {
      id: v.id,
      youtubeId: v.youtubeVideoId,
      // Use the upload's title (filename-defaulted via /api/upload/init) or
      // fall back to YT-style "Untitled" only if truly absent.
      title: v.title ?? 'Untitled',
      // Real creator name (passed in from the adapter root) so manual uploads
      // don't show a placeholder "Creator" string.
      channelName: creatorName,
      publishedAt: v.publishedAt ? v.publishedAt.toISOString() : new Date().toISOString(),
      durationSec: v.durationSeconds ?? null,
      thumbnailUrl: sourceThumbnail({
        youtubeVideoId: v.youtubeVideoId,
        thumbnails: v.thumbnails as { medium?: string; small?: string } | null,
      }),
      transcriptStatus: canonicalSet.has(v.id) ? ('available' as const) : ('unavailable' as const),
      topicSlugs: [] as string[],
      citedPageIds,
      keyMoments: segs.slice(0, 5).map((s) => ({
        timestampStart: Math.floor(s.startMs / 1000),
        timestampEnd: Math.floor(s.endMs / 1000),
        label: s.text.slice(0, 80),
      })),
      transcriptExcerpts: segs.slice(0, 3).map((s) => ({
        timestampStart: Math.floor(s.startMs / 1000),
        body: s.text,
      })),
    };
  });
}
```

- [ ] **Step 2: Update the adapter root to pass creatorName**

In `packages/pipeline/src/adapters/editorial-atlas/index.ts`, find the `projectSources` call:

```typescript
  const sources = await projectSources({ runId, db, pages: pagesWithInternal });
```

Replace with:

```typescript
  const sources = await projectSources({
    runId,
    db,
    pages: pagesWithInternal,
    creatorName: creator.name,
  });
```

- [ ] **Step 3: Typecheck + tests**

```bash
cd packages/pipeline && pnpm typecheck && pnpm test src/adapters/editorial-atlas/test/
```

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/project-sources.ts packages/pipeline/src/adapters/editorial-atlas/index.ts
git commit -m "fix(adapter): real channel name + filename title + svg fallback in sources"
```

---

## Phase D: Topics Actually Group Pages

The user's run has zero topics in the manifest. Either the discovery stage didn't produce topic-type findings, or the projection drops them. Either way, the Topics page is empty and `topicSlugs[]` on every page is empty.

The fix is incremental: first **diagnose** (Task D1), then act based on what we find.

### Task D1: Diagnose where topics get lost

**Files:**
- Create: `packages/pipeline/diagnose-topics.mjs` (temporary; deleted at end of task)

- [ ] **Step 1: Write a one-off diagnostic script**

Create `packages/pipeline/diagnose-topics.mjs`:

```javascript
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const f of ['../../.env']) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
const runId = 'b7db367a-c72f-4acd-b965-dd296ebbd1f7'; // user's Trial run
const sql = postgres(process.env.DATABASE_URL);
const counts = await sql`SELECT type, status, COUNT(*) FROM archive_finding WHERE run_id = ${runId} GROUP BY type, status ORDER BY type, status`;
console.log('archive_finding by type/status:');
for (const row of counts) console.log(`  ${row.type}/${row.status}: ${row.count}`);
const topicSample = await sql`SELECT id, type, status, payload FROM archive_finding WHERE run_id = ${runId} AND type = 'topic' LIMIT 3`;
console.log('\ntopic findings sample:', JSON.stringify(topicSample, null, 2));
await sql.end();
```

(Note: postgres is in `@creatorcanon/db`'s deps. Move the script to `packages/db/diagnose-topics.mjs` if it errors.)

- [ ] **Step 2: Run the diagnostic from the package that has postgres**

```bash
cp packages/pipeline/diagnose-topics.mjs packages/db/diagnose-topics.mjs
cd packages/db && node ./diagnose-topics.mjs
```

Look for one of three outcomes:

- **Outcome 1:** No `topic` rows at all — topic_spotter isn't producing findings. Fix in Phase E.
- **Outcome 2:** `topic` rows exist with status `failed_verify` or `merged_out` — verify or merge is dropping them. Fix in Task D3.
- **Outcome 3:** `topic` rows exist with status `published` — the projection or page-mapping logic is dropping them. Fix in Task D4.

Record the outcome.

- [ ] **Step 3: Clean up the diagnostic file**

```bash
rm packages/pipeline/diagnose-topics.mjs packages/db/diagnose-topics.mjs
```

- [ ] **Step 4: Commit nothing — diagnostic only**

(No commit; diagnostic was scratch work.)

### Task D2: If outcome 1 — topic_spotter not producing findings

This is the most likely case for small archives (2 short videos). The topic_spotter prompt asks for cross-video themes and refuses on insufficient evidence. With only 2 videos there's nothing for it to grasp.

**Strategy:** lower the topic_spotter threshold for small archives by passing `videoCount` into the prompt and adjusting the spec.

**Files:**
- Modify: `packages/pipeline/src/agents/specialists/prompts.ts` — TOPIC_SPOTTER_PROMPT
- Modify: `packages/pipeline/src/agents/specialists/index.ts` — registration if needed

- [ ] **Step 1: Read the current prompt**

```bash
grep -A 80 'TOPIC_SPOTTER_PROMPT' packages/pipeline/src/agents/specialists/prompts.ts | head -100
```

- [ ] **Step 2: Lower the cross-video requirement**

Find the section that says something like "topics must appear in 3+ videos" or "themes must span the archive". Replace the threshold so it permits topics with 2+ supporting findings (not 3+ videos), since for tiny archives a recurring theme inside one or two videos is still a topic.

Concrete edit: in `TOPIC_SPOTTER_PROMPT`, find:

```
A topic must be supported by findings from MULTIPLE videos to count.
```

Replace with:

```
A topic must be supported by at least 2 distinct findings (different segments and ideally different videos). For small archives (under 5 source videos), 2 findings within one video is acceptable when they cite different segments and represent a recurring theme.
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/agents/specialists/prompts.ts
git commit -m "fix(topic-spotter): allow topics from small archives (2+ findings)"
```

### Task D3: If outcome 2 — verify or merge dropping topics

This needs a different fix path. Find the verify/merge filter.

**Files:**
- Modify: `packages/pipeline/src/stages/verify.ts` and/or `packages/pipeline/src/stages/merge.ts`

- [ ] **Step 1: Locate the type filter for topic findings**

```bash
grep -rn "type === 'topic'\|type: 'topic'" packages/pipeline/src/stages/
```

- [ ] **Step 2: Check the threshold for keeping a topic**

Read the merge logic for topics. If it requires `evidenceCount >= 3` or similar, lower it to `>= 2`.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/stages/merge.ts
git commit -m "fix(merge): lower minimum evidence for topic findings (2+)"
```

### Task D4: If outcome 3 — projection drops topics

`projectTopics` queries `archive_finding WHERE type = 'topic'` without filtering by status. If topic findings are present but the page-tagging logic doesn't link them, the topic appears with `pageCount = 0`.

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`

- [ ] **Step 1: Check projectPages topic-tagging logic**

The current code:

```typescript
      const pageSegSet = new Set(meta.evidenceSegmentIds);
      const topicSlugs = topics
        .filter((t) => t.evidenceSegmentIds.some((s) => pageSegSet.has(s)))
        .map((t) => t.slug);
```

If a topic's `evidenceSegmentIds` don't overlap with any page's segments, the topic is orphaned. Fall back to a topic-keyword match in the page summary if segment overlap fails.

- [ ] **Step 2: Add the fallback**

In `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`, replace the `topicSlugs` block with:

```typescript
      const pageSegSet = new Set(meta.evidenceSegmentIds);
      const topicSlugs = topics
        .filter((t) => {
          // Primary: segment overlap.
          if (t.evidenceSegmentIds.some((s) => pageSegSet.has(s))) return true;
          // Fallback: title or summary keyword match.
          const haystack = `${v.title} ${v.summary ?? ''}`.toLowerCase();
          const needle = t.title.toLowerCase();
          return needle.length > 3 && haystack.includes(needle);
        })
        .map((t) => t.slug);
```

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "fix(adapter): topic-keyword fallback when segment overlap is empty"
```

---

## Phase E: Page Body Substance — Overview ≠ Summary

Every lesson's "Overview" section body is verbatim the page summary. The composer treats them as the same field. Fix: make the overview a DISTINCT first paragraph from the page version, falling back to summary only if explicitly absent.

### Task E1: Detect duplicate overview/summary in adapter

The page composer writes blocks; the first block is usually `overview` and currently echoes the summary. Easiest fix: when the overview body equals the summary, drop the overview section (the renderer already shows the summary prominently above the sections).

**Files:**
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`

- [ ] **Step 1: Add a deduplication step in the section transform**

In `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`, find the `.map((s) => enrichQuoteSection(...))` chain (added in Task B2). Append a `.filter(...)` that drops the overview when it matches summary:

```typescript
      }).map((s) => enrichQuoteSection(s as SectionLike, segmentLookup))
        .filter((s, i) => {
          if (i !== 0) return true;
          if (s.kind !== 'overview') return true;
          // Drop the leading overview section when its body is just a copy of
          // the page summary — the renderer already shows summary in the
          // header, so keeping a duplicate "Overview" tile wastes the slot.
          const overviewBody = (s as { body?: string }).body?.trim() ?? '';
          const summary = (v.summary ?? '').trim();
          return overviewBody.length > 0 && overviewBody !== summary;
        });
```

- [ ] **Step 2: Confirm the manifest schema accepts pages with no overview section**

Check `pageSchema.sections`:

```bash
grep -A 2 'sections:' apps/web/src/lib/hub/manifest/schema.ts | head -5
```

The schema requires `min(1)` sections — confirm the dedup never empties the list. If a page only has overview + summary-duplicate scenario, the page would have just principles/steps/quotes left, which is still > 0.

- [ ] **Step 3: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "fix(adapter): drop overview section when body duplicates summary"
```

---

## Phase F: Polish — Title Casing + Stats Reframing

### Task F1: Title-case framework/playbook titles

Lowercase titles like "automatic email responder" come from agent output. Fix at projection time so display is consistent.

**Files:**
- Create: `packages/pipeline/src/adapters/editorial-atlas/title-case.ts`
- Create: `packages/pipeline/src/adapters/editorial-atlas/test/title-case.test.ts`
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`

- [ ] **Step 1: Create the test**

```typescript
// packages/pipeline/src/adapters/editorial-atlas/test/title-case.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { titleCase } from '../title-case';

describe('titleCase', () => {
  it('capitalizes the first letter of each word', () => {
    assert.equal(titleCase('automatic email responder'), 'Automatic Email Responder');
  });
  it('preserves common acronyms', () => {
    assert.equal(titleCase('ai-powered crm system'), 'AI-Powered CRM System');
  });
  it('keeps short connecting words lowercase except the first word', () => {
    assert.equal(titleCase('the art of the deal'), 'The Art of the Deal');
  });
  it('handles empty + single word inputs', () => {
    assert.equal(titleCase(''), '');
    assert.equal(titleCase('hello'), 'Hello');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/title-case.test.ts
```

- [ ] **Step 3: Create the implementation**

```typescript
// packages/pipeline/src/adapters/editorial-atlas/title-case.ts
const ACRONYMS = new Set(['ai', 'api', 'crm', 'cms', 'cli', 'cdn', 'kpi', 'roi', 'ui', 'ux', 'sql', 'json', 'pdf', 'csv', 'http', 'https', 'url']);
const LOWERCASE_WORDS = new Set(['a', 'an', 'and', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'as', 'by', 'or']);

export function titleCase(input: string): string {
  if (!input) return '';
  const parts = input.split(/(\s+|-)/);
  return parts
    .map((part, i) => {
      if (/^\s+$/.test(part) || part === '-') return part;
      const lower = part.toLowerCase();
      if (ACRONYMS.has(lower)) return lower.toUpperCase();
      if (i > 0 && LOWERCASE_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd packages/pipeline && pnpm test src/adapters/editorial-atlas/test/title-case.test.ts
```

Expected: PASS — all 4 cases.

- [ ] **Step 5: Apply in projectPages**

In `packages/pipeline/src/adapters/editorial-atlas/project-pages.ts`, find:

```typescript
        title: v.title,
```

Replace with:

```typescript
        // Framework/playbook titles often arrive lowercase from the agent.
        // Title-case lessons too — composer occasionally produces sentence-case
        // titles which look out of place next to formally-capitalized peers.
        title: titleCase(v.title),
```

Add the import at the top:

```typescript
import { titleCase } from './title-case';
```

- [ ] **Step 6: Commit**

```bash
git add packages/pipeline/src/adapters/editorial-atlas/title-case.ts packages/pipeline/src/adapters/editorial-atlas/test/title-case.test.ts packages/pipeline/src/adapters/editorial-atlas/project-pages.ts
git commit -m "feat(adapter): title-case page titles with acronym + connecting-word rules"
```

### Task F2: Add totalDurationMinutes to stats

For small archives, `archiveYears: 0` reads as zero coverage. Add a minutes count and let the renderer display whichever is meaningful.

**Files:**
- Modify: `apps/web/src/lib/hub/manifest/schema.ts`
- Modify: `packages/pipeline/src/adapters/editorial-atlas/project-stats.ts`

- [ ] **Step 1: Extend the schema**

In `apps/web/src/lib/hub/manifest/schema.ts`, find the `stats` block:

```typescript
  stats: z.object({
    videoCount: z.number().int().min(0),
    sourceCount: z.number().int().min(0),
    transcriptPercent: z.number().min(0).max(1),
    archiveYears: z.number().min(0),
    pageCount: z.number().int().min(0),
  }),
```

Replace with:

```typescript
  stats: z.object({
    videoCount: z.number().int().min(0),
    sourceCount: z.number().int().min(0),
    transcriptPercent: z.number().min(0).max(1),
    archiveYears: z.number().min(0),
    totalDurationMinutes: z.number().int().min(0),
    pageCount: z.number().int().min(0),
  }),
```

- [ ] **Step 2: Update projectStats**

```bash
cat packages/pipeline/src/adapters/editorial-atlas/project-stats.ts
```

Find where the stats object is built. Add `totalDurationMinutes` to the return. Sum video.duration_seconds across the run's videos and divide by 60 (round to int).

If the function doesn't currently load videos, add a single query against `video_set_item` joined to `video` to get durations. Concretely, prepend to the function body:

```typescript
import { eq, inArray } from '@creatorcanon/db';
import { generationRun, video, videoSetItem } from '@creatorcanon/db/schema';

// ... inside projectStats({ runId, db, pageCount, sourceCount }):
const run = (await db.select({ videoSetId: generationRun.videoSetId }).from(generationRun).where(eq(generationRun.id, runId)).limit(1))[0];
const itemRows = run
  ? await db.select({ videoId: videoSetItem.videoId }).from(videoSetItem).where(eq(videoSetItem.videoSetId, run.videoSetId))
  : [];
const videoIds = itemRows.map((r) => r.videoId);
const videoRows = videoIds.length
  ? await db.select({ d: video.durationSeconds }).from(video).where(inArray(video.id, videoIds))
  : [];
const totalDurationMinutes = Math.round(videoRows.reduce((sum, v) => sum + (v.d ?? 0), 0) / 60);
```

Then return:

```typescript
return {
  videoCount: ...,
  sourceCount: ...,
  transcriptPercent: ...,
  archiveYears: ...,
  totalDurationMinutes,
  pageCount: ...,
};
```

- [ ] **Step 3: Render minutes when years === 0**

Find the stat tile renderer:

```bash
grep -rln 'archiveYears' apps/web/src/components/hub
```

In whichever file shows "yrs of archive", replace with:

```tsx
{stats.archiveYears >= 1 ? (
  <p className="text-[24px] font-bold">{stats.archiveYears} yrs</p>
) : (
  <p className="text-[24px] font-bold">{stats.totalDurationMinutes} min</p>
)}
<p className="text-[10px] uppercase tracking-wider text-[#9A8E7C]">{stats.archiveYears >= 1 ? 'years of archive' : 'minutes of footage'}</p>
```

- [ ] **Step 4: Build + test**

```bash
cd packages/pipeline && pnpm typecheck
cd ../../apps/web && pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/hub/manifest/schema.ts packages/pipeline/src/adapters/editorial-atlas/project-stats.ts apps/web/src/components/hub/EditorialAtlas/blocks/StatBar.tsx
git commit -m "feat(stats): show minutes-of-footage for small archives instead of '0 yrs'"
```

---

## Phase G: End-to-End Verification on a Fresh Hub

Don't override the existing `/h/trial` hub — it stays as a baseline. Generate a brand-new project from the same two ready uploads and compare.

### Task G1: Create a fresh project + run

**Files:**
- Create: `packages/db/spawn-fresh-trial.mjs` (temporary)

- [ ] **Step 1: Write the seeder**

Create `packages/db/spawn-fresh-trial.mjs`:

```javascript
import postgres from 'postgres';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const f of ['../../.env']) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
const workspaceId = 'e1ad6446-d463-4ee9-9451-7be5ac76f187';
const userId = 'YOUR_USER_ID'; // fill in from a quick query if needed
const videoIds = ['mu_9d970d091c38', 'mu_e0787f2f4a95'];
const sql = postgres(process.env.DATABASE_URL);
const u = await sql`SELECT id FROM "user" WHERE email = 'mariosdemosthenous11@gmail.com' LIMIT 1`;
const realUserId = u[0]?.id;

const videoSetId = crypto.randomUUID();
await sql`INSERT INTO video_set (id, workspace_id, name, created_by, total_duration_seconds, status) VALUES (${videoSetId}, ${workspaceId}, 'Quality Test', ${realUserId}, 2522, 'locked')`;
for (let i = 0; i < videoIds.length; i++) {
  await sql`INSERT INTO video_set_item (id, video_set_id, video_id, position) VALUES (${crypto.randomUUID()}, ${videoSetId}, ${videoIds[i]}, ${i})`;
}
const projectId = crypto.randomUUID();
await sql`INSERT INTO project (id, workspace_id, video_set_id, title, config) VALUES (${projectId}, ${workspaceId}, ${videoSetId}, 'Quality Test', ${'{"audience":"a","tone":"conversational","length_preset":"standard","chat_enabled":true,"presentation_preset":"paper"}'}::jsonb)`;
const runId = crypto.randomUUID();
await sql`INSERT INTO generation_run (id, workspace_id, project_id, video_set_id, pipeline_version, config_hash, status, selected_duration_seconds, price_cents) VALUES (${runId}, ${workspaceId}, ${projectId}, ${videoSetId}, 'v1.0.0', 'qualitytest', 'queued', 2522, 0)`;
await sql`UPDATE project SET current_run_id = ${runId} WHERE id = ${projectId}`;
const hubId = crypto.randomUUID();
await sql`INSERT INTO hub (id, workspace_id, project_id, subdomain, template_key, metadata) VALUES (${hubId}, ${workspaceId}, ${projectId}, 'quality-test', 'editorial_atlas', '{}'::jsonb)`;
console.log(JSON.stringify({ projectId, runId, workspaceId, videoSetId, hubId }));
await sql.end();
```

- [ ] **Step 2: Run the seeder**

```bash
cd packages/db && node ./spawn-fresh-trial.mjs
```

Capture the JSON output — note projectId, runId, workspaceId, videoSetId.

- [ ] **Step 3: Run the pipeline against the fresh run**

Create `packages/pipeline/run-quality-test.ts` (similar to the dispatch-trial.ts I used earlier; substitute the new IDs):

```typescript
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
for (const f of ['../../.env']) {
  try {
    for (const line of readFileSync(resolve(process.cwd(), f), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}
import { runGenerationPipeline } from './src/run-generation-pipeline.ts';
const result = await runGenerationPipeline({
  runId: 'PASTE_FROM_STEP_2',
  projectId: 'PASTE_FROM_STEP_2',
  workspaceId: 'e1ad6446-d463-4ee9-9451-7be5ac76f187',
  videoSetId: 'PASTE_FROM_STEP_2',
  pipelineVersion: 'v1.0.0',
});
console.log(JSON.stringify(result, null, 2));
process.exit(0);
```

```bash
cd packages/pipeline && npx tsx ./run-quality-test.ts
```

Expected: result with videoCount=2, pageCount > 0, manifestR2Key set.

- [ ] **Step 4: Publish the fresh run**

Adapt the publish.ts script to point at the new runId:

```bash
cd packages/pipeline && # edit publish.ts in place to use new IDs, then:
npx tsx ./publish.ts
```

Capture the public path (e.g. `/h/quality-test`).

- [ ] **Step 5: Audit the new manifest**

Re-run the audit-trial.mjs script pointing at the new manifest key:

```bash
cd packages/adapters && node ./audit-trial.mjs # adjusted for new release
```

Verify in the output:

- `topics.length > 0` (Phase D)
- `pages[0].citations.length > 0` (Phase A)
- At least one quote section has `sourceVideoId` + `timestampStart` (Phase B)
- `sources[0].title !== 'Untitled'` (Phase C — uploads have titles now)
- `sources[0].channelName === 'KeyBooks'` (Phase C)
- `sources[0].thumbnailUrl` does not contain `placehold.co` (Phase C)
- `stats.totalDurationMinutes > 0` (Phase F)
- Sample lesson page has no `overview` section duplicating summary (Phase E)
- Page titles are Title Case (Phase F)

- [ ] **Step 6: Visual regression in browser**

Open in browser:

```
http://localhost:3000/h/quality-test
http://localhost:3000/h/quality-test/topics
http://localhost:3000/h/quality-test/sources
http://localhost:3000/h/quality-test/pages/<any-slug>
```

Confirm:

- Topics page shows topic cards (not "Browse ideas and pages by theme" empty-state)
- Sources page renders without runtime error
- Page detail right rail shows "Evidence & sources" with real timestamps + excerpts (not "No sources cited yet")
- A quote in the page body shows "Open at M:SS" link

Compare against the existing `/h/trial` hub (which still has all the bugs, as designed).

- [ ] **Step 7: Clean up scratch files**

```bash
rm -f packages/db/spawn-fresh-trial.mjs packages/pipeline/run-quality-test.ts packages/pipeline/publish.ts packages/adapters/audit-trial.mjs
```

- [ ] **Step 8: No commit needed for verification**

Verification artifacts are ephemeral.

---

## Self-Review Notes

After writing the plan, I scanned for issues:

**Spec coverage:**

- ✅ Citation rendering on every page → Phase A
- ✅ Topics generated and shown → Phase D (with diagnostic-driven branching)
- ✅ Quote sections link to source video → Phase B
- ✅ Sources page no longer crashes → Phase C (data-URL SVG fallback, no remote-pattern allowlist change)
- ✅ Sources show real title + channel → Phase C
- ✅ Overview ≠ summary duplication → Phase E
- ✅ Title casing → Phase F
- ✅ Stats reframe for small archives → Phase F

Out of scope on purpose (acknowledged limitations):

- Page substance — frameworks need actual prompts/code blocks. Requires composer prompt changes; punt to a follow-up plan.
- Methodology page surfacing real run stats — requires a different rendering pass; punt.
- Tagline derived from creator bio — requires LLM call at publish time; punt.
- Reading time honesty — minor; skip.
- Search + Ask validation — separate testing scope.

**Placeholder scan:** No "TBD" or "implement later" found. Each step has runnable code.

**Type consistency:** `buildPageCitations` returns `Map<string, ProjectedCitation[]>` — used as `citationsByPage.get(rest.id)` in Task A2 (consistent). `enrichQuoteSection` returns `SectionLike` — same shape used in projectPages mapping (consistent). `sourceThumbnail` returns `string` — assigned to `thumbnailUrl` in projectSources (consistent). `titleCase` returns `string` — assigned to `title` in projectPages (consistent). `totalDurationMinutes` is `number` in both schema and projectStats (consistent).
