# Editorial Atlas Hub — End-to-End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Editorial Atlas public hub template — data foundation, visual chrome, all 13 surfaces, and the grounded-chat surface — with the existing pipeline emitting the new manifest contract via a stubbed adapter. At the end of Phase 7, a creator's hub renders end-to-end at `/h/[hubSlug]` against the mock, ready for the (separate) pipeline-integration session.

**Architecture:** Data-first, then chrome, then surfaces. Phase 0 produces typed, zod-validated helpers + comprehensive mock data under `apps/web/src/lib/hub/`. Phase 1 builds persistent layout under `apps/web/src/components/hub/EditorialAtlas/` and rewires `/h/[hubSlug]`. Phases 2–6 add the 13 surfaces in dependency order. Phase 7 documents the pipeline-adapter handoff. No DB schema writes, no R2 deletion, no pipeline rewrites, no `/app/configure` changes anywhere.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5.6, Tailwind 3.4, zod 3.23, `node:test` + tsx for unit tests.

**Spec:** [`docs/superpowers/specs/2026-04-25-editorial-atlas-hub-design.md`](../specs/2026-04-25-editorial-atlas-hub-design.md)

**Phases at a glance:**
| # | Phase | Tasks | Output |
|---|---|---|---|
| 0 | Foundation | 1–7 | Schemas, mocks, helpers |
| 1 | Chrome (✱ stop gate) | 8–16 | Sidebar + shell + home stub at `/h/[hubSlug]` |
| 2 | Core content | 17–24 | PageCard/Table, SectionRenderer, real Hub Home, Lesson Page, All Pages |
| 3 | Topics + specialized pages | 25–30 | Topics Index, Topic Detail, Framework Page, Playbook Page, Start Here |
| 4 | Sources | 31–34 | Sources Library, Source Detail, citation blocks |
| 5 | Discovery + trust | 35–37 | Methodology, Search Results |
| 6 | Grounded chat | 38–43 | Ask This Hub UI + mock /ask/api + compact ask box on Home |
| 7 | Adapter handoff | 44 | Verify stub + write follow-up spec pointer |

**Stop gate (✱):** After Task 16 completes, halt and hand back for visual review of `/h/<mock-slug>`. The user reviews the chrome, then approves Phase 2. Phases 2–7 do **not** start until that approval. Once Phase 2 begins, the remaining phases run sequentially without further gates unless explicitly added by the user.

---

## File structure

### Phase 0 — created
```
apps/web/src/lib/hub/
  routes.ts                       # 12 route helpers, no inline /h/${} elsewhere
  routes.test.ts
  manifest/
    schema.ts                     # zod + TS types: EditorialAtlasManifest, Page, …
    schema.test.ts
    empty-state.ts                # citationUrl(), formatTimestamp(), illustration fallback
    empty-state.test.ts
    mockManifest.ts               # 1 hub, 8 topics, 14 pages, 20 sources
    mockManifest.test.ts          # asserts mock parses against schema
    adapter.ts                    # documented TODO stub
  chat/
    schema.ts                     # zod + TS for /ask/api request/response
    schema.test.ts
    mockAnswers.ts                # deterministic dictionary
    mockAnswers.test.ts
    RAG-NOTES.md                  # future implementer notes (not built in v1)
```

### Phase 1 — created
```
apps/web/src/components/hub/EditorialAtlas/
  tokens.ts                       # palette, fonts, spacing constants
  illustrations/
    BooksIllustration.tsx
    DeskIllustration.tsx
    PlantIllustration.tsx
    OpenNotebookIllustration.tsx
    LineIllustration.tsx          # picks by illustrationKey
    index.ts                      # barrel
  shell/
    HubShell.tsx
    HubSidebar.tsx
    HubFooterTrustBar.tsx
    index.ts                      # barrel
```

### Phase 1 — modified / renamed
```
apps/web/src/app/h/
  [subdomain]/   →   [hubSlug]/   # folder rename
    page.tsx                      # replaced: shell-only home stub
    [slug]/page.tsx               # replaced: 308 redirect to /pages/[slug]
    manifest.ts                   # rename param subdomain → hubSlug
    opengraph-image.tsx           # rename params.subdomain → params.hubSlug
    twitter-image.tsx             # rename params.subdomain → params.hubSlug
    loading.tsx                   # update to paper canvas
```

### Phase 1 — left untouched
- `apps/web/src/components/hub/templates.ts`
- `apps/web/src/components/hub/publicTemplates.tsx`
- `apps/web/src/components/hub/EvidenceChips.tsx`
- All DB schema files
- `/app/configure/*`
- `packages/pipeline/src/publish-run-as-hub.ts`
- `packages/db/src/schema/enums.ts`

---

## Phase 0 — Data foundation

All Phase 0 code is plain TypeScript / zod, fully unit-tested with `node:test`. No JSX, no Next.js dependencies.

### Task 1: Route helpers

**Files:**
- Create: `apps/web/src/lib/hub/routes.ts`
- Create: `apps/web/src/lib/hub/routes.test.ts`

- [ ] **Step 1.1: Write the failing test**

```ts
// apps/web/src/lib/hub/routes.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  getHubRoute, getStartRoute, getTopicsRoute, getTopicRoute,
  getPagesRoute, getPageRoute, getSourcesRoute, getSourceRoute,
  getMethodologyRoute, getSearchRoute, getAskRoute, getAskApiRoute,
} from './routes';

test('hub root', () => {
  assert.equal(getHubRoute('ali'), '/h/ali');
});

test('start, topics, pages, sources, methodology, ask roots', () => {
  assert.equal(getStartRoute('ali'),       '/h/ali/start');
  assert.equal(getTopicsRoute('ali'),      '/h/ali/topics');
  assert.equal(getPagesRoute('ali'),       '/h/ali/pages');
  assert.equal(getSourcesRoute('ali'),     '/h/ali/sources');
  assert.equal(getMethodologyRoute('ali'), '/h/ali/methodology');
  assert.equal(getAskRoute('ali'),         '/h/ali/ask');
  assert.equal(getAskApiRoute('ali'),      '/h/ali/ask/api');
});

test('parameterized routes', () => {
  assert.equal(getTopicRoute('ali', 'productivity'),       '/h/ali/topics/productivity');
  assert.equal(getPageRoute('ali', 'feynman-technique'),   '/h/ali/pages/feynman-technique');
  assert.equal(getSourceRoute('ali', 'vid_001'),           '/h/ali/sources/vid_001');
});

test('search route encodes query', () => {
  assert.equal(getSearchRoute('ali'),                  '/h/ali/search');
  assert.equal(getSearchRoute('ali', 'deep work'),     '/h/ali/search?q=deep%20work');
  assert.equal(getSearchRoute('ali', 'a&b=c'),         '/h/ali/search?q=a%26b%3Dc');
});
```

- [ ] **Step 1.2: Run the test to verify it fails**

Run: `cd apps/web && pnpm test --test-name-pattern routes`
Expected: FAIL with module-not-found errors on `./routes`.

- [ ] **Step 1.3: Implement routes.ts**

```ts
// apps/web/src/lib/hub/routes.ts
//
// Centralised hub URL builders. Components MUST NOT inline /h/${...} strings.

export const getHubRoute         = (hubSlug: string)                              => `/h/${hubSlug}`;
export const getStartRoute       = (hubSlug: string)                              => `/h/${hubSlug}/start`;
export const getTopicsRoute      = (hubSlug: string)                              => `/h/${hubSlug}/topics`;
export const getTopicRoute       = (hubSlug: string, topicSlug: string)           => `/h/${hubSlug}/topics/${topicSlug}`;
export const getPagesRoute       = (hubSlug: string)                              => `/h/${hubSlug}/pages`;
export const getPageRoute        = (hubSlug: string, pageSlug: string)            => `/h/${hubSlug}/pages/${pageSlug}`;
export const getSourcesRoute     = (hubSlug: string)                              => `/h/${hubSlug}/sources`;
export const getSourceRoute      = (hubSlug: string, videoId: string)             => `/h/${hubSlug}/sources/${videoId}`;
export const getMethodologyRoute = (hubSlug: string)                              => `/h/${hubSlug}/methodology`;
export const getSearchRoute      = (hubSlug: string, query?: string)              =>
  query ? `/h/${hubSlug}/search?q=${encodeURIComponent(query)}` : `/h/${hubSlug}/search`;
export const getAskRoute         = (hubSlug: string)                              => `/h/${hubSlug}/ask`;
export const getAskApiRoute      = (hubSlug: string)                              => `/h/${hubSlug}/ask/api`;
```

- [ ] **Step 1.4: Run the test to verify it passes**

Run: `cd apps/web && pnpm test --test-name-pattern routes`
Expected: 4 tests, all PASS.

- [ ] **Step 1.5: Commit**

```bash
git add apps/web/src/lib/hub/routes.ts apps/web/src/lib/hub/routes.test.ts
git commit -m "feat(hub): add Editorial Atlas route helpers"
```

---

### Task 2: Manifest zod schema

**Files:**
- Create: `apps/web/src/lib/hub/manifest/schema.ts`
- Create: `apps/web/src/lib/hub/manifest/schema.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// apps/web/src/lib/hub/manifest/schema.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import {
  editorialAtlasManifestSchema,
  pageSectionSchema,
  citationSchema,
} from './schema';

test('citation schema: minimal valid', () => {
  const result = citationSchema.safeParse({
    id: 'cit_1', sourceVideoId: 'vid_1', videoTitle: 'How I plan',
    timestampStart: 261, timestampEnd: 318, timestampLabel: '04:21',
    excerpt: 'Planning your week removes decision fatigue.',
  });
  assert.equal(result.success, true);
});

test('citation schema: rejects negative timestamp', () => {
  const result = citationSchema.safeParse({
    id: 'c', sourceVideoId: 'v', videoTitle: 't',
    timestampStart: -1, timestampEnd: 10, timestampLabel: '0:00',
    excerpt: 'x',
  });
  assert.equal(result.success, false);
});

test('page section: overview kind round-trips', () => {
  const result = pageSectionSchema.safeParse({
    kind: 'overview',
    body: 'A quick mental model.',
    citationIds: ['cit_1', 'cit_2'],
  });
  assert.equal(result.success, true);
});

test('page section: workflow schedule round-trips', () => {
  const result = pageSectionSchema.safeParse({
    kind: 'workflow',
    schedule: [
      { day: 'Monday', items: ['Plan the week', 'Review priorities'] },
      { day: 'Friday', items: ['Wrap-up review'] },
    ],
  });
  assert.equal(result.success, true);
});

test('page section: rejects unknown kind', () => {
  const result = pageSectionSchema.safeParse({ kind: 'mystery', body: 'x' });
  assert.equal(result.success, false);
});

test('top-level manifest: schemaVersion is fixed', () => {
  const result = editorialAtlasManifestSchema.safeParse({
    schemaVersion: 'wrong_version',
    hubId: 'h', releaseId: 'r', hubSlug: 'ali',
    templateKey: 'editorial_atlas', visibility: 'public',
    publishedAt: null, generatedAt: '2026-04-25T10:00:00Z',
    title: 'x', tagline: 'y',
    creator: { name: 'A', handle: '@a', avatarUrl: '', bio: '', youtubeChannelUrl: '' },
    stats: { videoCount: 0, sourceCount: 0, transcriptPercent: 0, archiveYears: 0, pageCount: 0 },
    topics: [], pages: [], sources: [],
    navigation: { primary: [], secondary: [] },
    trust: { methodologySummary: '', qualityPrinciples: [], creationProcess: [], faq: [] },
  });
  assert.equal(result.success, false);
});
```

- [ ] **Step 2.2: Run the test to verify it fails**

Run: `cd apps/web && pnpm test --test-name-pattern "(citation|page section|manifest)"`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement schema.ts**

```ts
// apps/web/src/lib/hub/manifest/schema.ts
//
// Zod runtime + TypeScript types for the Editorial Atlas public hub manifest.
// This is the contract every route handler MUST validate against before render.

import { z } from 'zod';

// Discriminated-union for page sections. Every variant accepts an optional
// citationIds[] referencing the page's de-duplicated citations array.
const sectionCitations = { citationIds: z.array(z.string().min(1)).optional() };

export const pageSectionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('overview'),        body: z.string().min(1),                                                  ...sectionCitations }),
  z.object({ kind: z.literal('why_it_works'),    body: z.string().min(1), points: z.array(z.string().min(1)).optional(),    ...sectionCitations }),
  z.object({ kind: z.literal('steps'),           title: z.string().min(1),
             items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1),                        ...sectionCitations }),
  z.object({ kind: z.literal('common_mistakes'), items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('aha_moments'),     items: z.array(z.object({ quote: z.string().min(1), attribution: z.string().optional() })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('principles'),      items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1), iconKey: z.string().optional() })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('scenes'),          items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('workflow'),
             schedule: z.array(z.object({ day: z.string().min(1), items: z.array(z.string().min(1)).min(1) })).min(1),       ...sectionCitations }),
  z.object({ kind: z.literal('failure_points'),  items: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })).min(1), ...sectionCitations }),
  z.object({ kind: z.literal('callout'),
             tone: z.enum(['note', 'warn', 'success']), body: z.string().min(1),                                              ...sectionCitations }),
  z.object({ kind: z.literal('paragraph'),       body: z.string().min(1),                                                    ...sectionCitations }),
  z.object({ kind: z.literal('list'),            ordered: z.boolean(), items: z.array(z.string().min(1)).min(1),             ...sectionCitations }),
  z.object({ kind: z.literal('quote'),           body: z.string().min(1),
             attribution: z.string().optional(),
             sourceVideoId: z.string().optional(),
             timestampStart: z.number().int().min(0).optional(),                                                              ...sectionCitations }),
]);

export type PageSection = z.infer<typeof pageSectionSchema>;

export const citationSchema = z.object({
  id: z.string().min(1),
  sourceVideoId: z.string().min(1),
  videoTitle: z.string().min(1),
  timestampStart: z.number().int().min(0),
  timestampEnd: z.number().int().min(0),
  timestampLabel: z.string().min(1),
  excerpt: z.string().min(1),
  url: z.string().url().optional(),
});
export type Citation = z.infer<typeof citationSchema>;

export const topicSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  iconKey: z.string().min(1),
  accentColor: z.enum(['mint', 'peach', 'lilac', 'rose', 'blue', 'amber', 'sage', 'slate']),
  pageCount: z.number().int().min(0),
});
export type Topic = z.infer<typeof topicSchema>;

export const pageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  type: z.enum(['lesson', 'framework', 'playbook']),
  status: z.enum(['draft', 'reviewed', 'published']),

  title: z.string().min(1),
  summary: z.string().min(1),
  summaryPlainText: z.string().min(1),
  searchKeywords: z.array(z.string().min(1)),

  topicSlugs: z.array(z.string().min(1)),
  estimatedReadMinutes: z.number().int().min(1),
  publishedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),

  citationCount: z.number().int().min(0),
  sourceCoveragePercent: z.number().min(0).max(1),
  evidenceQuality: z.enum(['strong', 'moderate', 'limited']),

  reviewedBy: z.string().optional(),
  lastReviewedAt: z.string().datetime().optional(),

  hero: z.object({
    illustrationKey: z.enum(['books', 'desk', 'plant', 'open-notebook']),
  }).optional(),

  sections: z.array(pageSectionSchema).min(1),
  citations: z.array(citationSchema),
  relatedPageIds: z.array(z.string().min(1)),
});
export type Page = z.infer<typeof pageSchema>;

export const sourceVideoSchema = z.object({
  id: z.string().min(1),
  youtubeId: z.string().min(1),
  title: z.string().min(1),
  channelName: z.string().min(1),
  publishedAt: z.string().datetime(),
  durationSec: z.number().int().min(1),
  thumbnailUrl: z.string().url(),
  transcriptStatus: z.enum(['available', 'partial', 'unavailable']),
  topicSlugs: z.array(z.string().min(1)),
  citedPageIds: z.array(z.string().min(1)),
  keyMoments: z.array(z.object({
    timestampStart: z.number().int().min(0),
    timestampEnd: z.number().int().min(0),
    label: z.string().min(1),
  })),
  transcriptExcerpts: z.array(z.object({
    timestampStart: z.number().int().min(0),
    body: z.string().min(1),
  })),
});
export type SourceVideo = z.infer<typeof sourceVideoSchema>;

export const navItemSchema = z.object({
  label: z.string().min(1),
  href: z.string().min(1),
  iconKey: z.string().min(1),
});
export type NavItem = z.infer<typeof navItemSchema>;

export const editorialAtlasManifestSchema = z.object({
  schemaVersion: z.literal('editorial_atlas_v1'),
  hubId: z.string().min(1),
  releaseId: z.string().min(1),
  hubSlug: z.string().min(1),
  templateKey: z.literal('editorial_atlas'),
  visibility: z.enum(['public', 'unlisted']),
  publishedAt: z.string().datetime().nullable(),
  generatedAt: z.string().datetime(),

  title: z.string().min(1),
  tagline: z.string().min(1),

  creator: z.object({
    name: z.string().min(1),
    handle: z.string().min(1),
    avatarUrl: z.string(),                       // may be empty string in mock
    bio: z.string(),
    youtubeChannelUrl: z.string(),
  }),

  stats: z.object({
    videoCount: z.number().int().min(0),
    sourceCount: z.number().int().min(0),
    transcriptPercent: z.number().min(0).max(1),
    archiveYears: z.number().min(0),
    pageCount: z.number().int().min(0),
  }),

  topics: z.array(topicSchema),
  pages: z.array(pageSchema),
  sources: z.array(sourceVideoSchema),

  navigation: z.object({
    primary: z.array(navItemSchema),
    secondary: z.array(navItemSchema),
  }),

  trust: z.object({
    methodologySummary: z.string().min(1),
    qualityPrinciples: z.array(z.object({ title: z.string().min(1), body: z.string().min(1) })),
    creationProcess: z.array(z.object({
      stepNumber: z.number().int().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
    })),
    faq: z.array(z.object({ question: z.string().min(1), answer: z.string().min(1) })),
  }),
});
export type EditorialAtlasManifest = z.infer<typeof editorialAtlasManifestSchema>;
```

- [ ] **Step 2.4: Run the test to verify it passes**

Run: `cd apps/web && pnpm test --test-name-pattern "(citation|page section|manifest)"`
Expected: 6 tests, all PASS.

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/src/lib/hub/manifest/schema.ts apps/web/src/lib/hub/manifest/schema.test.ts
git commit -m "feat(hub): add EditorialAtlasManifest zod schema"
```

---

### Task 3: Empty-state helpers

**Files:**
- Create: `apps/web/src/lib/hub/manifest/empty-state.ts`
- Create: `apps/web/src/lib/hub/manifest/empty-state.test.ts`

- [ ] **Step 3.1: Write the failing test**

```ts
// apps/web/src/lib/hub/manifest/empty-state.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { citationUrl, formatTimestampLabel, resolveAccentColor, ACCENT_COLORS } from './empty-state';

test('citationUrl: uses citation.url when present', () => {
  const cit = { url: 'https://example.com/x', timestampStart: 100 };
  const vid = { youtubeId: 'YT123' };
  assert.equal(citationUrl(cit, vid), 'https://example.com/x');
});

test('citationUrl: synthesizes from youtubeId + timestampStart when url missing', () => {
  const cit = { url: undefined, timestampStart: 261 };
  const vid = { youtubeId: 'YT123' };
  assert.equal(citationUrl(cit, vid), 'https://www.youtube.com/watch?v=YT123&t=261s');
});

test('citationUrl: floors fractional timestamps', () => {
  const cit = { url: undefined, timestampStart: 261.7 };
  const vid = { youtubeId: 'YT123' };
  assert.equal(citationUrl(cit, vid), 'https://www.youtube.com/watch?v=YT123&t=261s');
});

test('formatTimestampLabel: mm:ss for under one hour', () => {
  assert.equal(formatTimestampLabel(0),    '0:00');
  assert.equal(formatTimestampLabel(5),    '0:05');
  assert.equal(formatTimestampLabel(65),   '1:05');
  assert.equal(formatTimestampLabel(261),  '4:21');
  assert.equal(formatTimestampLabel(3599), '59:59');
});

test('formatTimestampLabel: h:mm:ss for one hour and over', () => {
  assert.equal(formatTimestampLabel(3600), '1:00:00');
  assert.equal(formatTimestampLabel(3661), '1:01:01');
});

test('resolveAccentColor: returns input when in palette', () => {
  for (const color of ACCENT_COLORS) {
    assert.equal(resolveAccentColor(color), color);
  }
});

test('resolveAccentColor: falls back to slate for unknown', () => {
  assert.equal(resolveAccentColor('neon-pink' as never), 'slate');
  assert.equal(resolveAccentColor(undefined as never),   'slate');
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `cd apps/web && pnpm test --test-name-pattern "(citationUrl|formatTimestampLabel|resolveAccentColor)"`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement empty-state.ts**

```ts
// apps/web/src/lib/hub/manifest/empty-state.ts
//
// Helpers that encode the renderer's empty-state contract from the design
// spec (§ 5.5). Used everywhere a Citation, timestamp, or accent color may
// be missing or malformed.

import type { Citation, SourceVideo, Topic } from './schema';

export const ACCENT_COLORS = [
  'mint', 'peach', 'lilac', 'rose', 'blue', 'amber', 'sage', 'slate',
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

/**
 * Returns the citation's URL, or synthesizes a YouTube watch URL with a
 * timestamp anchor when `citation.url` is missing.
 */
export function citationUrl(
  citation: Pick<Citation, 'url' | 'timestampStart'>,
  video: Pick<SourceVideo, 'youtubeId'>,
): string {
  if (citation.url) return citation.url;
  const t = Math.floor(citation.timestampStart);
  return `https://www.youtube.com/watch?v=${video.youtubeId}&t=${t}s`;
}

/**
 * Formats a duration in seconds as `mm:ss` or `h:mm:ss`.
 */
export function formatTimestampLabel(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * Validates an accent color against the documented palette.
 * Falls back to `slate` for any unknown value.
 */
export function resolveAccentColor(value: Topic['accentColor'] | undefined): AccentColor {
  if (value && (ACCENT_COLORS as readonly string[]).includes(value)) {
    return value as AccentColor;
  }
  return 'slate';
}
```

- [ ] **Step 3.4: Run test to verify it passes**

Run: `cd apps/web && pnpm test --test-name-pattern "(citationUrl|formatTimestampLabel|resolveAccentColor)"`
Expected: 7 tests, all PASS.

- [ ] **Step 3.5: Commit**

```bash
git add apps/web/src/lib/hub/manifest/empty-state.ts apps/web/src/lib/hub/manifest/empty-state.test.ts
git commit -m "feat(hub): add manifest empty-state helpers"
```

---

### Task 4: Mock manifest skeleton + 1 of each page type

**Files:**
- Create: `apps/web/src/lib/hub/manifest/mockManifest.ts`
- Create: `apps/web/src/lib/hub/manifest/mockManifest.test.ts`

- [ ] **Step 4.1: Write the failing test**

```ts
// apps/web/src/lib/hub/manifest/mockManifest.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { mockManifest } from './mockManifest';
import { editorialAtlasManifestSchema, type PageSection } from './schema';

test('mock manifest: parses against schema', () => {
  const result = editorialAtlasManifestSchema.safeParse(mockManifest);
  if (!result.success) {
    console.error(result.error.issues);
  }
  assert.equal(result.success, true);
});

test('mock manifest: ≥14 pages with all 3 types covered', () => {
  assert.ok(mockManifest.pages.length >= 14, `expected ≥14 pages, got ${mockManifest.pages.length}`);
  const types = new Set(mockManifest.pages.map((p) => p.type));
  assert.ok(types.has('lesson'),    'missing lesson');
  assert.ok(types.has('framework'), 'missing framework');
  assert.ok(types.has('playbook'),  'missing playbook');
});

test('mock manifest: ≥8 topics, ≥20 sources', () => {
  assert.ok(mockManifest.topics.length  >= 8,  `expected ≥8 topics, got ${mockManifest.topics.length}`);
  assert.ok(mockManifest.sources.length >= 20, `expected ≥20 sources, got ${mockManifest.sources.length}`);
});

test('mock manifest: every section kind is exercised by at least one page', () => {
  const kinds = new Set<PageSection['kind']>();
  for (const page of mockManifest.pages) for (const s of page.sections) kinds.add(s.kind);

  const required: PageSection['kind'][] = [
    'overview', 'why_it_works', 'steps', 'common_mistakes', 'aha_moments',
    'principles', 'scenes', 'workflow', 'failure_points',
    'callout', 'paragraph', 'list', 'quote',
  ];

  for (const k of required) assert.ok(kinds.has(k), `no page exercises section kind '${k}'`);
});

test('mock manifest: every citation referenced by a section also appears in page.citations', () => {
  for (const page of mockManifest.pages) {
    const known = new Set(page.citations.map((c) => c.id));
    for (const section of page.sections) {
      for (const id of (section as { citationIds?: string[] }).citationIds ?? []) {
        assert.ok(known.has(id), `page ${page.slug} section ${section.kind} references unknown citation ${id}`);
      }
    }
  }
});

test('mock manifest: hubSlug and templateKey are consistent', () => {
  assert.equal(mockManifest.hubSlug,     'ali-abdaal');
  assert.equal(mockManifest.templateKey, 'editorial_atlas');
  assert.equal(mockManifest.schemaVersion, 'editorial_atlas_v1');
});

test('mock manifest: stats.pageCount matches pages.length', () => {
  assert.equal(mockManifest.stats.pageCount, mockManifest.pages.length);
});
```

- [ ] **Step 4.2: Run test to verify it fails**

Run: `cd apps/web && pnpm test --test-name-pattern "mock manifest"`
Expected: FAIL — module not found.

- [ ] **Step 4.3: Build mock manifest skeleton in a new file**

The mock is large — ~1000 lines of structured data. Build it deliberately:

1. Create the file with manifest top-level (schemaVersion, hubId, hubSlug='ali-abdaal', creator, stats, navigation, trust).
2. Add 8 topics (Productivity, Learning, Writing, Career & Business, Systems, Mindset, Health & Habits, Creator Growth).
3. Add 20 sources with realistic titles, durations, key moments, and 2–4 transcript excerpts each.
4. Add 14 pages: 6 lessons, 4 frameworks, 4 playbooks. **Every section kind** from the required list must appear in at least one page. Use the sources above for citations.

Use the schema in `./schema.ts` as the source of truth for shapes. The test in step 4.2 enforces all coverage requirements.

```ts
// apps/web/src/lib/hub/manifest/mockManifest.ts
//
// Deterministic mock for the Editorial Atlas template. The visual contract
// while the pipeline emits the older release_manifest_v0. Replace via
// adapter.ts once the pipeline integration project lands.

import type { EditorialAtlasManifest, Page, SourceVideo, Topic, Citation } from './schema';

const NOW = '2026-04-25T10:00:00Z';
const ONE_YEAR_AGO = '2025-04-25T10:00:00Z';

const topics: Topic[] = [
  { id: 'top_prod',  slug: 'productivity',     title: 'Productivity',     description: 'Systems, focus, planning, and methods for doing meaningful work well.',           iconKey: 'productivity',  accentColor: 'mint',   pageCount: 0 },
  { id: 'top_learn', slug: 'learning',         title: 'Learning',         description: 'How to learn faster, retain more, and build deep understanding.',                iconKey: 'learning',      accentColor: 'peach',  pageCount: 0 },
  { id: 'top_write', slug: 'writing',          title: 'Writing',          description: 'Clear thinking through writing, idea capture, and publishing.',                  iconKey: 'writing',       accentColor: 'lilac',  pageCount: 0 },
  { id: 'top_career',slug: 'career-business',  title: 'Career & Business',description: 'Building a career and a calm, sustainable creator business.',                    iconKey: 'career',        accentColor: 'rose',   pageCount: 0 },
  { id: 'top_sys',   slug: 'systems',          title: 'Systems',          description: 'Personal operating systems for sustainable, repeatable output.',                 iconKey: 'systems',       accentColor: 'blue',   pageCount: 0 },
  { id: 'top_mind',  slug: 'mindset',          title: 'Mindset',          description: 'Mental models, motivation, and the inner game of getting things done.',         iconKey: 'mindset',       accentColor: 'amber',  pageCount: 0 },
  { id: 'top_habit', slug: 'health-habits',    title: 'Health & Habits',  description: 'Foundations: sleep, movement, energy, focus, and habits that stick.',            iconKey: 'habits',        accentColor: 'sage',   pageCount: 0 },
  { id: 'top_growth',slug: 'creator-growth',   title: 'Creator Growth',   description: 'YouTube, audience, content strategy, and the craft of being seen.',             iconKey: 'growth',        accentColor: 'slate',  pageCount: 0 },
];

// 20 source videos — keep titles believable and key moments meaningful.
const sources: SourceVideo[] = Array.from({ length: 20 }, (_, i) => {
  const id = `vid_${String(i + 1).padStart(3, '0')}`;
  const youtubeId = `YT${String(1000 + i)}`;
  const titles = [
    'How I Plan My Week for Maximum Productivity',
    'My Simple Productivity System That Actually Works',
    'How I Take Smart Notes (Zettelkasten in plain English)',
    'The Feynman Technique Explained',
    'Deep Work: My Focus Routine',
    'How to Build a Second Brain',
    'My Energy Management System',
    'Time Blocking — How I Actually Do It',
    'Habit Stacking: The 1% Rule',
    'How I Read 100+ Books a Year',
    'Creator Burnout — What I Got Wrong',
    'The 3-Hour Writing Routine',
    'Frameworks vs. Routines — The Real Difference',
    'My YouTube Process from Idea to Upload',
    'Active Recall — The One Study Habit That Matters',
    'The Eisenhower Matrix in Practice',
    'Building a Personal Operating System',
    'Compound Hobbies — The Long Game',
    'How I Track Energy, Not Just Time',
    'Ship It — Why Done Beats Perfect',
  ];
  return {
    id,
    youtubeId,
    title: titles[i] ?? `Source video ${i + 1}`,
    channelName: 'Ali Abdaal',
    publishedAt: ONE_YEAR_AGO,
    durationSec: 600 + i * 30,
    thumbnailUrl: `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
    transcriptStatus: i % 7 === 6 ? 'partial' : 'available',
    topicSlugs: [topics[i % topics.length]!.slug],
    citedPageIds: [],
    keyMoments: [
      { timestampStart:  45, timestampEnd: 110, label: 'The core idea' },
      { timestampStart: 180, timestampEnd: 245, label: 'How it works in practice' },
      { timestampStart: 320, timestampEnd: 380, label: 'A common mistake' },
      { timestampStart: 460, timestampEnd: 540, label: 'Pulling it together' },
      { timestampStart: 600, timestampEnd: 660, label: 'Why this matters' },
    ],
    transcriptExcerpts: [
      { timestampStart:  60, body: 'Most people skip this step, and that is exactly why their system never sticks.' },
      { timestampStart: 200, body: 'The point isn\'t to be efficient. The point is to be effective.' },
      { timestampStart: 460, body: 'Once you do this once a week, the rest of the system runs itself.' },
    ],
  };
});

// Citation helper — pick a video and a key moment.
const cite = (vidIndex: number, momentIndex: number, citationId: string, excerpt: string): Citation => {
  const v = sources[vidIndex]!;
  const m = v.keyMoments[momentIndex]!;
  return {
    id: citationId,
    sourceVideoId: v.id,
    videoTitle: v.title,
    timestampStart: m.timestampStart,
    timestampEnd: m.timestampEnd,
    timestampLabel: `${Math.floor(m.timestampStart / 60)}:${String(m.timestampStart % 60).padStart(2, '0')}`,
    excerpt,
    url: `https://www.youtube.com/watch?v=${v.youtubeId}&t=${m.timestampStart}s`,
  };
};

// Build the 14 pages. Every section kind appears at least once across the set.
// (The test in mockManifest.test.ts enforces this.)
const pages: Page[] = [
  // ─── Lesson 1: Feynman Technique (overview, why_it_works, steps, common_mistakes, aha_moments, paragraph, quote) ───
  {
    id: 'pg_feynman', slug: 'feynman-technique', type: 'lesson', status: 'published',
    title: 'The Feynman Technique',
    summary: 'A powerful mental model for learning anything by teaching it in simple terms.',
    summaryPlainText: 'A powerful mental model for learning anything by teaching it in simple terms.',
    searchKeywords: ['feynman', 'learning', 'teach', 'simple'],
    topicSlugs: ['learning'],
    estimatedReadMinutes: 6,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 4, sourceCoveragePercent: 0.85, evidenceQuality: 'strong',
    reviewedBy: 'Ali Abdaal', lastReviewedAt: NOW,
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview',
        body: 'The Feynman Technique is a four-step method named after physicist Richard Feynman. The idea is simple: if you can explain something in plain words, you understand it; if you can\'t, you have found the gap.',
        citationIds: ['cit_fey_1'] },
      { kind: 'why_it_works',
        body: 'Teaching forces compression. Compression exposes the parts you don\'t actually understand.',
        points: ['It surfaces vague language.', 'It demands concrete examples.', 'It pushes you to find the right level of abstraction.'],
        citationIds: ['cit_fey_1', 'cit_fey_2'] },
      { kind: 'steps',
        title: 'The 4-step method',
        items: [
          { title: '1. Choose a concept',  body: 'Pick what you want to understand. Be specific. "Calculus" is too broad; "the chain rule" is workable.' },
          { title: '2. Teach it to a child', body: 'Write the explanation as if for a 12-year-old. No jargon, no shortcuts.' },
          { title: '3. Identify the gaps', body: 'Wherever you stalled or reached for big words — that is the gap. Go back to the source.' },
          { title: '4. Simplify and analogize', body: 'Rewrite the explanation. Use analogies. Iterate until it flows.' },
        ],
        citationIds: ['cit_fey_3'] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Skipping step 3', body: 'It is tempting to feel done after the first explanation. The whole point is the audit.' },
          { title: 'Choosing too broad a concept', body: 'You will end up writing a textbook chapter, not finding the gap.' },
        ],
        citationIds: ['cit_fey_4'] },
      { kind: 'aha_moments',
        items: [
          { quote: 'If you can\'t explain it simply, you don\'t understand it well enough.', attribution: 'Richard Feynman (paraphrase)' },
        ] },
      { kind: 'paragraph',
        body: 'Most learners under-use this technique because writing things out feels like wasted effort. It isn\'t. The discomfort of writing is the learning.' },
      { kind: 'quote',
        body: 'Once you do this once a week, the rest of the system runs itself.',
        attribution: 'Ali, on building a learning routine',
        sourceVideoId: 'vid_004',
        timestampStart: 460,
        citationIds: ['cit_fey_2'] },
    ],
    citations: [
      cite(3, 0, 'cit_fey_1', 'The Feynman technique is the strongest learning method I have ever found.'),
      cite(3, 1, 'cit_fey_2', 'You write it down for a 12-year-old. That is the whole trick.'),
      cite(3, 2, 'cit_fey_3', 'Step three is the only step that actually matters.'),
      cite(2, 1, 'cit_fey_4', 'The most common mistake is picking a topic that is too big.'),
    ],
    relatedPageIds: ['pg_active_recall', 'pg_smart_notes'],
  },

  // ─── Lesson 2: Active Recall (overview, why_it_works, steps, list, paragraph) ───
  {
    id: 'pg_active_recall', slug: 'active-recall', type: 'lesson', status: 'published',
    title: 'Active recall',
    summary: 'The single most effective learning technique — and how to actually do it.',
    summaryPlainText: 'The single most effective learning technique — and how to actually do it.',
    searchKeywords: ['active recall', 'learning', 'study', 'retention'],
    topicSlugs: ['learning'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.7, evidenceQuality: 'strong',
    hero: { illustrationKey: 'books' },
    sections: [
      { kind: 'overview', body: 'Active recall is the practice of retrieving information from memory, rather than re-reading it. It is the strongest predictor of long-term retention we have.',
        citationIds: ['cit_ar_1'] },
      { kind: 'why_it_works', body: 'Re-reading creates a feeling of familiarity that is easily mistaken for understanding. Retrieval forces the brain to do the work that actually consolidates memory.',
        citationIds: ['cit_ar_2'] },
      { kind: 'steps', title: 'How to do it',
        items: [
          { title: '1. Read once',     body: 'Skim the material to map the territory. Don\'t take notes yet.' },
          { title: '2. Close the book', body: 'Write down everything you remember without looking.' },
          { title: '3. Compare',        body: 'Diff your recall against the source. The mistakes are the lesson.' },
        ],
        citationIds: ['cit_ar_3'] },
      { kind: 'list', ordered: false,
        items: [
          'Use blank-page recall before reaching for highlights.',
          'Quiz yourself with cue questions, not summaries.',
          'Space the recall sessions across days, not minutes.',
        ] },
      { kind: 'paragraph', body: 'Active recall feels harder than re-reading because it is harder. That is the point.' },
    ],
    citations: [
      cite(14, 0, 'cit_ar_1', 'Re-reading is the most popular study technique and one of the worst.'),
      cite(14, 1, 'cit_ar_2', 'Retrieval is the act of remembering. That is what locks the memory in.'),
      cite(14, 2, 'cit_ar_3', 'Blank page, no notes, write what you remember. Then check.'),
    ],
    relatedPageIds: ['pg_feynman', 'pg_smart_notes'],
  },

  // ─── Lesson 3: Time Blocking (overview, steps, callout, list) ───
  {
    id: 'pg_time_blocking', slug: 'time-blocking', type: 'lesson', status: 'published',
    title: 'Time blocking',
    summary: 'How to build a calendar that actually reflects what you intend to do.',
    summaryPlainText: 'How to build a calendar that actually reflects what you intend to do.',
    searchKeywords: ['time blocking', 'calendar', 'productivity', 'focus'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.6, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'Time blocking is putting every intended task on the calendar — including admin, breaks, and deep work — instead of leaving them on a to-do list.',
        citationIds: ['cit_tb_1'] },
      { kind: 'steps', title: 'A simple version',
        items: [
          { title: '1. Pick the hard thing first', body: 'Block 90–120 minutes of deep work. This goes on the calendar before anything else.' },
          { title: '2. Cluster the small things',  body: 'Email, Slack, admin — one or two boxes a day. Outside those boxes, leave the inbox closed.' },
          { title: '3. Leave a buffer',            body: 'Block 25% of the day as buffer. The day will run over and that is fine.' },
        ],
        citationIds: ['cit_tb_2'] },
      { kind: 'callout', tone: 'note',
        body: 'Time blocking is a forecast, not a contract. If a block runs over, redraw the day — don\'t skip it.' },
      { kind: 'list', ordered: false,
        items: ['One calendar, not three.', 'Color by category, not priority.', 'Review tomorrow at the end of today.'] },
    ],
    citations: [
      cite(7, 0, 'cit_tb_1', 'If it is not on the calendar, it does not happen.'),
      cite(7, 1, 'cit_tb_2', 'I block the hard thing first. Everything else fits around it.'),
    ],
    relatedPageIds: ['pg_weekly_planning', 'pg_eisenhower'],
  },

  // ─── Lesson 4: Habit Stacking (overview, why_it_works, common_mistakes, paragraph) ───
  {
    id: 'pg_habit_stacking', slug: 'habit-stacking', type: 'lesson', status: 'published',
    title: 'Habit stacking',
    summary: 'How to attach new habits onto existing routines without willpower.',
    summaryPlainText: 'How to attach new habits onto existing routines without willpower.',
    searchKeywords: ['habit stacking', 'habits', 'routine'],
    topicSlugs: ['health-habits'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.65, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'plant' },
    sections: [
      { kind: 'overview', body: 'A habit stack is "After [existing habit], I will [new habit]". You inherit the trigger from a routine that is already automatic.',
        citationIds: ['cit_hs_1'] },
      { kind: 'why_it_works', body: 'New habits fail because there is no cue. Existing habits already have one. Borrowing is cheaper than building.',
        citationIds: ['cit_hs_2'] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Stacking onto a habit that isn\'t actually automatic', body: 'If you skip the anchor, you skip the stack. Test the anchor for a week before relying on it.' },
          { title: 'Stacking too many at once',                            body: 'Pick one new habit per anchor. Adding three is how stacks collapse.' },
        ] },
      { kind: 'paragraph', body: 'The art is choosing an anchor that is genuinely habitual — like brushing your teeth, not "checking email" (which mutates by mood).' },
    ],
    citations: [
      cite(8, 0, 'cit_hs_1', 'After I pour my coffee, I will write three sentences. That is the whole stack.'),
      cite(8, 2, 'cit_hs_2', 'You don\'t need a new trigger. You need to borrow one that already works.'),
    ],
    relatedPageIds: [],
  },

  // ─── Lesson 5: Deep Work (overview, principles section misuse — actually use principles for a framework. Use list+paragraph here) ───
  {
    id: 'pg_deep_work', slug: 'deep-work', type: 'lesson', status: 'published',
    title: 'Deep work',
    summary: 'What deep work actually is, and how to protect it on a normal week.',
    summaryPlainText: 'What deep work actually is, and how to protect it on a normal week.',
    searchKeywords: ['deep work', 'focus', 'attention'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.55, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'Deep work is sustained focus on a cognitively demanding task with no context-switching. The output of two hours of deep work usually beats eight of shallow.',
        citationIds: ['cit_dw_1'] },
      { kind: 'list', ordered: true,
        items: [
          'Pick one deep block per day (90–120 min).',
          'Same time, same place — automate the start.',
          'No browser tabs, no notifications, no background music with lyrics.',
          'After the block, take a real break.',
        ] },
      { kind: 'paragraph', body: 'You do not need 4 hours of deep work a day. One reliable block is the difference between most weeks and your best ones.',
        citationIds: ['cit_dw_2'] },
    ],
    citations: [
      cite(4, 0, 'cit_dw_1', 'Deep work means doing the actual work. Not preparing to do it.'),
      cite(4, 3, 'cit_dw_2', 'One block a day, every day. That is enough.'),
    ],
    relatedPageIds: ['pg_time_blocking', 'pg_eisenhower'],
  },

  // ─── Lesson 6: Smart Notes (overview, paragraph, list) ───
  {
    id: 'pg_smart_notes', slug: 'smart-notes', type: 'lesson', status: 'published',
    title: 'Smart notes',
    summary: 'A note-taking method that compounds into a thinking system.',
    summaryPlainText: 'A note-taking method that compounds into a thinking system.',
    searchKeywords: ['smart notes', 'zettelkasten', 'note taking'],
    topicSlugs: ['learning', 'writing'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.7, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview', body: 'Smart notes (the Zettelkasten method) treat each note as a self-contained idea, written in your own words and linked to other notes.',
        citationIds: ['cit_sn_1'] },
      { kind: 'paragraph', body: 'The trick is the linking. A standalone note is a fact; a linked one is a thought.',
        citationIds: ['cit_sn_2'] },
      { kind: 'list', ordered: false,
        items: ['One idea per note.', 'Always in your own words.', 'Always link before saving.'] },
    ],
    citations: [
      cite(2, 0, 'cit_sn_1', 'Each note is one idea. That is the whole rule.'),
      cite(2, 1, 'cit_sn_2', 'Notes that don\'t link to anything die.'),
    ],
    relatedPageIds: ['pg_feynman', 'pg_active_recall'],
  },

  // ─── Framework 1: Eisenhower Matrix (overview, principles, common_mistakes, callout) ───
  {
    id: 'pg_eisenhower', slug: 'eisenhower-matrix', type: 'framework', status: 'published',
    title: 'The Eisenhower Matrix',
    summary: 'A 2×2 for sorting urgent from important.',
    summaryPlainText: 'A 2×2 for sorting urgent from important.',
    searchKeywords: ['eisenhower', 'priority', 'urgent', 'important'],
    topicSlugs: ['productivity'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.6, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'The matrix sorts work into four quadrants: urgent + important (do now), important not urgent (schedule), urgent not important (delegate), neither (delete).',
        citationIds: ['cit_em_1'] },
      { kind: 'principles',
        items: [
          { title: 'Important ≠ urgent', body: 'Most "urgent" tasks are someone else\'s priority arriving at the wrong moment.', iconKey: 'compass' },
          { title: 'Schedule beats remember', body: 'Important-not-urgent only happens if it goes on the calendar.', iconKey: 'calendar' },
          { title: 'Default to delete',  body: 'If a task fits neither axis cleanly, the right action is almost always to drop it.', iconKey: 'trash' },
        ],
        citationIds: ['cit_em_2'] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Treating the matrix as a to-do list', body: 'It is a sorting tool. The output is a calendar, not a backlog.' },
          { title: 'Living in quadrant 1',                  body: 'If everything is urgent + important, you are reacting, not planning.' },
        ] },
      { kind: 'callout', tone: 'success',
        body: 'Run this once a week, not once a day. Sorting is cheap weekly; expensive daily.' },
    ],
    citations: [
      cite(15, 0, 'cit_em_1', 'The four quadrants don\'t change. What changes is how you spend the week.'),
      cite(15, 2, 'cit_em_2', 'Most "urgent" things are not actually important.'),
    ],
    relatedPageIds: ['pg_time_blocking'],
  },

  // ─── Framework 2: Compound Hobbies (overview, principles, paragraph) ───
  {
    id: 'pg_compound_hobbies', slug: 'compound-hobbies', type: 'framework', status: 'published',
    title: 'Compound hobbies',
    summary: 'Why some hobbies pay you back for life — and most don\'t.',
    summaryPlainText: 'Why some hobbies pay you back for life — and most don\'t.',
    searchKeywords: ['compound', 'hobbies', 'long term', 'leverage'],
    topicSlugs: ['career-business', 'mindset'],
    estimatedReadMinutes: 5,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.55, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'plant' },
    sections: [
      { kind: 'overview', body: 'A compound hobby is one whose value grows non-linearly with time spent — writing, programming, woodworking. The first year teaches you very little; the tenth pays for itself.',
        citationIds: ['cit_ch_1'] },
      { kind: 'principles',
        items: [
          { title: 'Pick one for life',  body: 'Compounding only works if you stay. Pick one slot, leave it open.', iconKey: 'tree' },
          { title: 'Optimize for years',  body: 'A compound hobby looks bad on a 30-day chart. That is the point.',  iconKey: 'chart' },
          { title: 'Document the path',   body: 'The unique value is the trail of artifacts you leave.',              iconKey: 'pen' },
        ],
        citationIds: ['cit_ch_2'] },
      { kind: 'paragraph', body: 'Most "productive" hobbies are consumption in a productivity costume. A compound hobby produces.' },
    ],
    citations: [
      cite(17, 0, 'cit_ch_1', 'A compound hobby is one you would still do at 60.'),
      cite(17, 2, 'cit_ch_2', 'The first year is bad. That is fine. Stay.'),
    ],
    relatedPageIds: [],
  },

  // ─── Framework 3: Energy Management (overview, principles, list, callout) ───
  {
    id: 'pg_energy_mgmt', slug: 'energy-management', type: 'framework', status: 'published',
    title: 'Energy management',
    summary: 'Schedule by energy, not just time.',
    summaryPlainText: 'Schedule by energy, not just time.',
    searchKeywords: ['energy', 'time management', 'schedule'],
    topicSlugs: ['productivity', 'health-habits'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 2, sourceCoveragePercent: 0.5, evidenceQuality: 'limited',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'You have 16 waking hours, but maybe 4 of them are high-energy. Treating all hours as equal is the most common scheduling mistake.',
        citationIds: ['cit_en_1'] },
      { kind: 'principles',
        items: [
          { title: 'Pair task to energy',   body: 'Hard cognitive work in your highest-energy block. Admin in the trough.', iconKey: 'sun' },
          { title: 'Track for two weeks',   body: 'You can\'t optimize what you haven\'t measured. Two weeks of energy logs reveal the pattern.', iconKey: 'clipboard' },
          { title: 'Protect peaks',          body: 'Meetings drift toward peaks. Defend them.', iconKey: 'shield' },
        ],
        citationIds: ['cit_en_2'] },
      { kind: 'list', ordered: false,
        items: ['Morning: deep work.', 'Mid-morning: writing or strategy.', 'Afternoon: meetings, admin.', 'Evening: reading, planning tomorrow.'] },
      { kind: 'callout', tone: 'warn',
        body: 'Your peak might not be the morning. Track first, schedule second.' },
    ],
    citations: [
      cite(18, 0, 'cit_en_1', 'You don\'t have 8 productive hours. You have maybe 4.'),
      cite(18, 2, 'cit_en_2', 'Track energy for two weeks before you redesign anything.'),
    ],
    relatedPageIds: ['pg_time_blocking', 'pg_deep_work'],
  },

  // ─── Framework 4: Frameworks vs Routines (overview, paragraph, quote, list) ───
  {
    id: 'pg_frameworks_vs_routines', slug: 'frameworks-vs-routines', type: 'framework', status: 'published',
    title: 'Frameworks vs. routines',
    summary: 'When to use a structure, and when to use a habit.',
    summaryPlainText: 'When to use a structure, and when to use a habit.',
    searchKeywords: ['frameworks', 'routines', 'systems'],
    topicSlugs: ['systems', 'mindset'],
    estimatedReadMinutes: 4,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 1, sourceCoveragePercent: 0.45, evidenceQuality: 'limited',
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview', body: 'A framework is a structure you apply when context changes. A routine is a behavior you repeat regardless. Confusing the two is why people abandon both.',
        citationIds: ['cit_fr_1'] },
      { kind: 'paragraph', body: 'Frameworks travel; routines protect. You do not need a routine for things that happen rarely. You do not need a framework for things you do every day.' },
      { kind: 'quote', body: 'Routines for the inevitable. Frameworks for the new.', attribution: 'Ali, summarizing the distinction',
        sourceVideoId: 'vid_013', timestampStart: 180 },
      { kind: 'list', ordered: false,
        items: ['Daily writing — routine.', 'Quarterly planning — framework.', 'Workout — routine.', 'Career decision — framework.'] },
    ],
    citations: [
      cite(12, 1, 'cit_fr_1', 'Routines are for the things that happen every day. Frameworks are for the rest.'),
    ],
    relatedPageIds: [],
  },

  // ─── Playbook 1: Productivity Operating System (overview, principles, scenes, workflow, failure_points) ───
  {
    id: 'pg_productivity_os', slug: 'productivity-operating-system', type: 'playbook', status: 'published',
    title: 'The Productivity Operating System',
    summary: 'A complete system for focus, energy, and weekly review.',
    summaryPlainText: 'A complete system for focus, energy, and weekly review.',
    searchKeywords: ['productivity os', 'system', 'weekly review'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 9,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 4, sourceCoveragePercent: 0.85, evidenceQuality: 'strong',
    reviewedBy: 'Ali Abdaal', lastReviewedAt: NOW,
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'A personal operating system has four layers: principles, scenes (recurring contexts), a weekly workflow, and a small set of failure points to watch.',
        citationIds: ['cit_pos_1'] },
      { kind: 'principles',
        items: [
          { title: 'Calm beats heroic',     body: 'A sustainable week is the win condition. Heroic weeks compound into burnout.',                                       iconKey: 'lighthouse' },
          { title: 'Plan once, ship daily', body: 'Plan on Sunday, then execute the plan. Replanning every day is the failure mode.',                                  iconKey: 'compass' },
          { title: 'One block, every day',  body: 'A reliable single deep block is more valuable than three theoretical ones.',                                          iconKey: 'anchor' },
          { title: 'Energy over time',       body: 'Schedule the hard thing where the energy is, not where the slot is.',                                                iconKey: 'sun' },
        ],
        citationIds: ['cit_pos_2'] },
      { kind: 'scenes',
        items: [
          { title: 'Sunday plan',         body: '90 minutes. Review last week, choose 3 outcomes, time-block the calendar.' },
          { title: 'Daily start',         body: '15 minutes. Top of day, top of mind: the one thing.' },
          { title: 'Daily wrap',          body: '10 minutes. What shipped, what didn\'t, what tomorrow needs.' },
          { title: 'Friday review',       body: '30 minutes. Was the week worth it? What next week needs.' },
        ],
        citationIds: ['cit_pos_3'] },
      { kind: 'workflow',
        schedule: [
          { day: 'Sunday',    items: ['Review last week.', 'Choose 3 outcomes.', 'Time-block the calendar.'] },
          { day: 'Monday',    items: ['Deep block 9–11.', 'Admin 14–15.', 'Daily wrap 17:00.'] },
          { day: 'Wednesday', items: ['Mid-week check.',   'Realign blocks.', 'Drop or defer extras.'] },
          { day: 'Friday',    items: ['30-minute review.', 'Carry forward.',   'Next-week first-block locked.'] },
        ] },
      { kind: 'failure_points',
        items: [
          { title: 'Skipping the Sunday plan', body: 'Without it, the week is reactive. The whole system depends on the plan being made.' },
          { title: 'Letting meetings creep into peaks', body: 'Calendar discipline is half the system. If meetings own the morning, deep work disappears.' },
          { title: 'Treating the wrap as optional',     body: 'The wrap is what stitches days together. Skipping it is what makes a week feel scattered.' },
        ],
        citationIds: ['cit_pos_4'] },
    ],
    citations: [
      cite(0, 0, 'cit_pos_1', 'A productivity OS is just a small set of routines you actually run.'),
      cite(0, 1, 'cit_pos_2', 'Calm and consistent beats heroic and brittle.'),
      cite(1, 0, 'cit_pos_3', 'Sunday plan, daily start, Friday review. That is the spine.'),
      cite(1, 3, 'cit_pos_4', 'The system fails the week you skip the plan.'),
    ],
    relatedPageIds: ['pg_time_blocking', 'pg_deep_work', 'pg_weekly_planning'],
  },

  // ─── Playbook 2: How I Plan My Week (overview, scenes, workflow, common_mistakes) ───
  {
    id: 'pg_weekly_planning', slug: 'how-i-plan-my-week', type: 'playbook', status: 'published',
    title: 'How I plan my week',
    summary: 'A weekly planning ritual built around outcomes, not tasks.',
    summaryPlainText: 'A weekly planning ritual built around outcomes, not tasks.',
    searchKeywords: ['weekly planning', 'plan', 'review'],
    topicSlugs: ['productivity', 'systems'],
    estimatedReadMinutes: 7,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.75, evidenceQuality: 'strong',
    hero: { illustrationKey: 'open-notebook' },
    sections: [
      { kind: 'overview', body: 'The plan is not a task list. It is a small set of outcomes for the week, time-blocked into the days when they have the best chance.',
        citationIds: ['cit_wp_1'] },
      { kind: 'scenes',
        items: [
          { title: 'Pick the week\'s 3 outcomes', body: 'Three things, one sentence each. Outcome, not activity.' },
          { title: 'Block the deep work',         body: 'Each outcome gets at least one 90-minute block on the calendar.' },
          { title: 'Defend the buffer',           body: '25% of the week is unbooked. The plan will run over.' },
        ],
        citationIds: ['cit_wp_2'] },
      { kind: 'workflow',
        schedule: [
          { day: 'Sunday', items: ['90-minute plan.', 'Last week review.', 'Next week outcomes.', 'Calendar blocks.'] },
          { day: 'Wednesday', items: ['10-minute mid-week check.', 'Adjust blocks.', 'Note what is slipping.'] },
          { day: 'Friday', items: ['30-minute review.', 'Score outcomes.', 'Next-week first-block locked.'] },
        ] },
      { kind: 'common_mistakes',
        items: [
          { title: 'Planning tasks instead of outcomes', body: 'A task list is a backlog. Outcomes are decisions.' },
          { title: 'No buffer',                            body: 'The unplanned will happen. Leave room.' },
          { title: 'Skipping the Friday review',           body: 'Without the review, the next plan is built on hope.' },
        ],
        citationIds: ['cit_wp_3'] },
    ],
    citations: [
      cite(0, 1, 'cit_wp_1', 'Planning your week removes decision fatigue and helps you focus on what matters.'),
      cite(0, 0, 'cit_wp_2', 'Three outcomes. Three blocks. That is the spine of the week.'),
      cite(1, 2, 'cit_wp_3', 'The Friday review is the most important 30 minutes of the week.'),
    ],
    relatedPageIds: ['pg_productivity_os', 'pg_time_blocking'],
  },

  // ─── Playbook 3: Second Brain (overview, principles, scenes, failure_points) ───
  {
    id: 'pg_second_brain', slug: 'second-brain', type: 'playbook', status: 'published',
    title: 'Building a second brain',
    summary: 'A capture-organize-distill-express loop for ideas you actually reuse.',
    summaryPlainText: 'A capture-organize-distill-express loop for ideas you actually reuse.',
    searchKeywords: ['second brain', 'notes', 'capture', 'distill'],
    topicSlugs: ['learning', 'systems', 'writing'],
    estimatedReadMinutes: 8,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.7, evidenceQuality: 'moderate',
    hero: { illustrationKey: 'books' },
    sections: [
      { kind: 'overview', body: 'A second brain is a personal knowledge system organized around the loop: Capture → Organize → Distill → Express. Most people stop at capture.',
        citationIds: ['cit_sb_1'] },
      { kind: 'principles',
        items: [
          { title: 'Capture is cheap',     body: 'Lower the friction of capture as much as possible. Sort later.', iconKey: 'inbox' },
          { title: 'Organize for action',  body: 'Files belong with the project that needs them, not with their topic.', iconKey: 'folder' },
          { title: 'Distill on demand',    body: 'Don\'t pre-summarize everything. Distill when you need it.',         iconKey: 'beaker' },
          { title: 'Express to lock it in', body: 'A note you never use is a note you never had.',                       iconKey: 'pen' },
        ],
        citationIds: ['cit_sb_2'] },
      { kind: 'scenes',
        items: [
          { title: 'Daily capture', body: 'Inbox stays open all day. Quick add, tag later.' },
          { title: 'Weekly sweep',  body: 'Empty inbox, file into projects. 30 min.' },
          { title: 'Monthly distill', body: 'Top 5 most-revisited notes get rewritten in your own words.' },
        ] },
      { kind: 'failure_points',
        items: [
          { title: 'Hoarding without distilling', body: 'A library of unread notes is not knowledge. It\'s decoration.' },
          { title: 'Over-organizing',              body: 'Three folders is enough. The taxonomy is the trap.' },
          { title: 'Tools as procrastination',     body: 'A new app is rarely the answer.' },
        ],
        citationIds: ['cit_sb_3'] },
    ],
    citations: [
      cite(5, 0, 'cit_sb_1', 'A second brain is not a list of files. It is a loop.'),
      cite(5, 1, 'cit_sb_2', 'Capture is cheap. Distillation is what compounds.'),
      cite(5, 2, 'cit_sb_3', 'Most second brains die from over-organization.'),
    ],
    relatedPageIds: ['pg_smart_notes', 'pg_active_recall'],
  },

  // ─── Playbook 4: YouTube Process (overview, scenes, workflow, failure_points, callout) ───
  {
    id: 'pg_youtube_process', slug: 'my-youtube-process', type: 'playbook', status: 'published',
    title: 'My YouTube process',
    summary: 'Idea to upload, end to end, on a sustainable cadence.',
    summaryPlainText: 'Idea to upload, end to end, on a sustainable cadence.',
    searchKeywords: ['youtube', 'creator', 'video', 'process'],
    topicSlugs: ['creator-growth', 'systems'],
    estimatedReadMinutes: 9,
    publishedAt: ONE_YEAR_AGO, updatedAt: NOW,
    citationCount: 3, sourceCoveragePercent: 0.8, evidenceQuality: 'strong',
    hero: { illustrationKey: 'desk' },
    sections: [
      { kind: 'overview', body: 'The process has four scenes: Idea, Script, Shoot, Edit & Ship. Each scene has a checklist; the calendar reflects them.',
        citationIds: ['cit_yt_1'] },
      { kind: 'scenes',
        items: [
          { title: 'Idea',         body: 'Start from a problem an audience already has, not a topic you find interesting.' },
          { title: 'Script',       body: 'Outline → first pass → tighten. Two days, not five.' },
          { title: 'Shoot',        body: 'Single setup, multiple cuts. Don\'t reset the room three times.' },
          { title: 'Edit & ship',  body: 'Cut for clarity, not pace. Ship before perfect.' },
        ],
        citationIds: ['cit_yt_2'] },
      { kind: 'workflow',
        schedule: [
          { day: 'Monday',  items: ['Idea + outline.'] },
          { day: 'Tuesday', items: ['Script first pass.'] },
          { day: 'Wednesday', items: ['Tighten + record.'] },
          { day: 'Thursday', items: ['Rough edit.'] },
          { day: 'Friday',  items: ['Polish + thumbnail + ship.'] },
        ] },
      { kind: 'failure_points',
        items: [
          { title: 'Scripting too long',          body: 'A 4-day script means a 5-day video. The cadence collapses.' },
          { title: 'Re-shooting for perfection',  body: 'Most reshoots improve nothing audiences notice.' },
          { title: 'Skipping the thumbnail',      body: 'Half the video is the thumbnail. Don\'t treat it as an afterthought.' },
        ],
        citationIds: ['cit_yt_3'] },
      { kind: 'callout', tone: 'success',
        body: 'A boring weekly video beats a heroic monthly one. Cadence compounds.' },
    ],
    citations: [
      cite(13, 0, 'cit_yt_1', 'Every video moves through the same four stages. The process is the leverage.'),
      cite(13, 1, 'cit_yt_2', 'Single setup, single batch. Resetting the room is a productivity tax.'),
      cite(13, 3, 'cit_yt_3', 'A boring weekly upload beats a heroic monthly one.'),
    ],
    relatedPageIds: ['pg_productivity_os'],
  },
];

// Backfill topic.pageCount and source.citedPageIds.
for (const t of topics) {
  t.pageCount = pages.filter((p) => p.topicSlugs.includes(t.slug)).length;
}
for (const v of sources) {
  v.citedPageIds = pages
    .filter((p) => p.citations.some((c) => c.sourceVideoId === v.id))
    .map((p) => p.id);
}

export const mockManifest: EditorialAtlasManifest = {
  schemaVersion: 'editorial_atlas_v1',
  hubId: 'hub_mock_ali_abdaal',
  releaseId: 'rel_mock_001',
  hubSlug: 'ali-abdaal',
  templateKey: 'editorial_atlas',
  visibility: 'public',
  publishedAt: ONE_YEAR_AGO,
  generatedAt: NOW,

  title: 'Editorial Atlas Hub',
  tagline:
    'A curated collection of lessons, frameworks, and systems from Ali\'s 400+ videos — to help you learn, build, and decide better.',

  creator: {
    name: 'Ali Abdaal',
    handle: '@aliabdaal',
    avatarUrl: 'https://yt3.ggpht.com/ytc/placeholder-avatar.jpg',
    bio: 'Doctor turned creator and entrepreneur. Writing about productivity, learning, and a calm, sustainable creator life.',
    youtubeChannelUrl: 'https://www.youtube.com/@aliabdaal',
  },

  stats: {
    videoCount: 412,
    sourceCount: sources.length,
    transcriptPercent: 0.87,
    archiveYears: 9.4,
    pageCount: pages.length,
  },

  topics,
  pages,
  sources,

  navigation: {
    primary: [
      { label: 'Home',        href: '/h/ali-abdaal',                 iconKey: 'home' },
      { label: 'Start here',  href: '/h/ali-abdaal/start',           iconKey: 'compass' },
      { label: 'Topics',      href: '/h/ali-abdaal/topics',          iconKey: 'tags' },
      { label: 'All pages',   href: '/h/ali-abdaal/pages',           iconKey: 'pages' },
      { label: 'Frameworks',  href: '/h/ali-abdaal/topics/systems',  iconKey: 'grid' },
      { label: 'Playbooks',   href: '/h/ali-abdaal/topics/productivity', iconKey: 'book' },
      { label: 'Sources',     href: '/h/ali-abdaal/sources',         iconKey: 'video' },
      { label: 'Methodology', href: '/h/ali-abdaal/methodology',     iconKey: 'shield' },
      { label: 'Ask this hub',href: '/h/ali-abdaal/ask',             iconKey: 'sparkles' },
    ],
    secondary: [
      { label: 'Videos',      href: '/h/ali-abdaal/sources',         iconKey: 'play' },
      { label: 'Newsletter',  href: 'https://aliabdaal.com',         iconKey: 'mail' },
      { label: 'Recommended', href: '/h/ali-abdaal/methodology',     iconKey: 'star' },
    ],
  },

  trust: {
    methodologySummary:
      'CreatorCanon structures Ali\'s entire video archive into a source-backed knowledge hub. Every page is built from transcripts, grounded in citations, and reviewed for clarity and accuracy.',
    qualityPrinciples: [
      { title: 'Source-backed',         body: 'Every substantive claim links to a video and timestamp.' },
      { title: 'Continuously updated',  body: 'New videos are processed within days; pages are republished, not duplicated.' },
      { title: 'Made for learners',     body: 'Pages are designed for re-reading, not algorithmic consumption.' },
      { title: 'Editor reviewed',       body: 'Pages move through draft → reviewed → published before they go live.' },
    ],
    creationProcess: [
      { stepNumber: 1, title: 'Index videos',     body: 'We import the channel, fetch transcripts, and structure source moments.' },
      { stepNumber: 2, title: 'Cluster ideas',    body: 'Recurring themes become topics; recurring concepts become candidate pages.' },
      { stepNumber: 3, title: 'Draft pages',      body: 'Each page is drafted from the transcript with grounded citations on every claim.' },
      { stepNumber: 4, title: 'Editor review',    body: 'A human editor reviews drafts for clarity and accuracy.' },
      { stepNumber: 5, title: 'Publish + revise', body: 'Published pages are revised — not replaced — as new videos add evidence.' },
    ],
    faq: [
      { question: 'Are the pages written by Ali?',                answer: 'Ali\'s words and ideas come from his videos. The page structure and prose are written and edited by CreatorCanon based on those sources, with citations on every substantive claim.' },
      { question: 'Why not just watch the videos?',                answer: 'Pages are designed for re-reading, search, and linking. They\'re a complement to videos, not a replacement.' },
      { question: 'How do you decide what is a Lesson vs Playbook?', answer: 'Lessons explain a single idea. Frameworks describe a structure. Playbooks describe an end-to-end practice you run.' },
      { question: 'How are citations chosen?',                      answer: 'Each citation links to the specific timestamp in the source video where the idea is best expressed.' },
      { question: 'What does "Limited evidence" mean?',             answer: 'Some pages cover topics where the archive has fewer references. We surface that explicitly so you know how strongly the page is supported.' },
    ],
  },
};
```

**Note:** This file produces 14 pages covering all 13 section kinds, 8 topics, 20 sources. The test in step 4.2 enforces this. If a kind is missing, the test will name which one — add a section of that kind to any existing page.

- [ ] **Step 4.4: Run test to verify it passes**

Run: `cd apps/web && pnpm test --test-name-pattern "mock manifest"`
Expected: 7 tests, all PASS.

If "every section kind" fails, the failure message names the missing kind — add a section of that kind to any existing page (the easiest is appending a `paragraph`/`list`/`callout` to an existing page that doesn't already have it).

- [ ] **Step 4.5: Commit**

```bash
git add apps/web/src/lib/hub/manifest/mockManifest.ts apps/web/src/lib/hub/manifest/mockManifest.test.ts
git commit -m "feat(hub): add Editorial Atlas mock manifest"
```

---

### Task 5: Adapter stub

**Files:**
- Create: `apps/web/src/lib/hub/manifest/adapter.ts`

- [ ] **Step 5.1: Write the file (no test — pure documentation stub)**

```ts
// apps/web/src/lib/hub/manifest/adapter.ts
//
// Pipeline → EditorialAtlasManifest adapter.
//
// NOT IMPLEMENTED IN THIS SESSION.
//
// Maps the existing pipeline release output (release_manifest_v0 +
// draft_pages_v0 + source/transcript artifacts in `packages/pipeline/src/`)
// to EditorialAtlasManifest. The template is the contract; the pipeline is
// wired to emit this contract in a separate, later session — see the
// follow-up spec file `docs/superpowers/specs/<TBD>-pipeline-adapter.md`
// (created by the next brainstorming pass).
//
// Until then, the public hub route uses
// `apps/web/src/lib/hub/manifest/mockManifest.ts`.

import type { EditorialAtlasManifest } from './schema';

export function buildEditorialAtlasManifestFromRelease(
  _input: never,
): EditorialAtlasManifest {
  throw new Error(
    'buildEditorialAtlasManifestFromRelease: not implemented yet — see docs/superpowers/specs/2026-04-25-editorial-atlas-hub-design.md § 5.7',
  );
}
```

- [ ] **Step 5.2: Verify typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS (no output).

- [ ] **Step 5.3: Commit**

```bash
git add apps/web/src/lib/hub/manifest/adapter.ts
git commit -m "feat(hub): add pipeline adapter stub (TODO)"
```

---

### Task 6: Chat schema

**Files:**
- Create: `apps/web/src/lib/hub/chat/schema.ts`
- Create: `apps/web/src/lib/hub/chat/schema.test.ts`

- [ ] **Step 6.1: Write the failing test**

```ts
// apps/web/src/lib/hub/chat/schema.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { askRequestSchema, askResponseSchema } from './schema';

test('ask request: minimal valid', () => {
  const r = askRequestSchema.safeParse({
    hubId: 'hub_1',
    question: 'How does Ali plan his week?',
    filters: { topicSlugs: [], sourceVideoIds: [], pageIds: [] },
  });
  assert.equal(r.success, true);
});

test('ask request: question must be non-empty', () => {
  const r = askRequestSchema.safeParse({
    hubId: 'hub_1', question: '',
    filters: { topicSlugs: [], sourceVideoIds: [], pageIds: [] },
  });
  assert.equal(r.success, false);
});

test('ask response: successful answer with citationId-tagged bullets', () => {
  const r = askResponseSchema.safeParse({
    answer: {
      summary: 'Ali plans his week on Sunday by choosing 3 outcomes.',
      bullets: [
        { text: 'Review last week before planning the next.',  citationIds: ['c1'] },
        { text: 'Choose 1–3 meaningful outcomes for the week.', citationIds: ['c2'] },
      ],
      confidence: 'strong',
      evidenceQuality: 'strong',
      limitations: null,
    },
    citations: [
      { id: 'c1', sourceVideoId: 'vid_001', videoTitle: 'How I plan',
        timestampStart: 261, timestampEnd: 318, timestampLabel: '04:21',
        excerpt: 'Plan on Sunday.', url: 'https://yt/?v=x&t=261s' },
      { id: 'c2', sourceVideoId: 'vid_002', videoTitle: 'My system',
        timestampStart: 100, timestampEnd: 150, timestampLabel: '01:40',
        excerpt: 'Three outcomes per week.', url: 'https://yt/?v=y&t=100s' },
    ],
    relatedPages: [
      { id: 'pg_1', title: 'How I plan my week', type: 'playbook', slug: 'how-i-plan-my-week' },
    ],
    suggestedFollowups: ['What is the weekly review checklist?'],
  });
  assert.equal(r.success, true);
});

test('ask response: unsupported variant', () => {
  const r = askResponseSchema.safeParse({
    answer: null,
    unsupported: true,
    message: 'Not enough source support.',
    partialMatches: [{ type: 'topic', title: 'Productivity', slug: 'productivity' }],
    suggestedSearches: ['weekly planning'],
  });
  assert.equal(r.success, true);
});

test('ask response: cannot mix unsupported with answer', () => {
  const r = askResponseSchema.safeParse({
    answer: { summary: 'x', bullets: [], confidence: 'strong', evidenceQuality: 'strong', limitations: null },
    unsupported: true,
    message: 'x',
    partialMatches: [],
    suggestedSearches: [],
  });
  assert.equal(r.success, false);
});
```

- [ ] **Step 6.2: Run test to verify it fails**

Run: `cd apps/web && pnpm test --test-name-pattern "ask "`
Expected: FAIL — module not found.

- [ ] **Step 6.3: Implement chat/schema.ts**

```ts
// apps/web/src/lib/hub/chat/schema.ts
//
// Zod + TypeScript types for the grounded-chat API (POST /h/[hubSlug]/ask/api).
// Mirrors the "Ask This Hub" contract from the design spec § 6.3.

import { z } from 'zod';

// ── Request ──
export const askRequestSchema = z.object({
  hubId: z.string().min(1),
  question: z.string().min(1).max(500),
  filters: z.object({
    topicSlugs: z.array(z.string().min(1)).default([]),
    sourceVideoIds: z.array(z.string().min(1)).default([]),
    pageIds: z.array(z.string().min(1)).default([]),
  }),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

// ── Response — successful answer ──
const answerCitationSchema = z.object({
  id: z.string().min(1),
  sourceVideoId: z.string().min(1),
  videoTitle: z.string().min(1),
  timestampStart: z.number().int().min(0),
  timestampEnd: z.number().int().min(0),
  timestampLabel: z.string().min(1),
  url: z.string().url(),
  excerpt: z.string().min(1),
});

const relatedPageSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: z.enum(['lesson', 'framework', 'playbook']),
  slug: z.string().min(1),
});

const answerBulletSchema = z.object({
  text: z.string().min(1),
  citationIds: z.array(z.string().min(1)),       // [] is valid; renderer warns
});

const successfulAnswerSchema = z.object({
  answer: z.object({
    summary: z.string().min(1),
    bullets: z.array(answerBulletSchema),
    confidence: z.enum(['strong', 'moderate', 'limited']),
    evidenceQuality: z.enum(['strong', 'moderate', 'limited']),
    limitations: z.string().nullable(),
  }),
  citations: z.array(answerCitationSchema),
  relatedPages: z.array(relatedPageSchema),
  suggestedFollowups: z.array(z.string().min(1)),
});

// ── Response — unsupported ──
const partialMatchSchema = z.object({
  type: z.enum(['topic', 'page', 'source']),
  title: z.string().min(1),
  slug: z.string().min(1),
});

const unsupportedAnswerSchema = z.object({
  answer: z.literal(null),
  unsupported: z.literal(true),
  message: z.string().min(1),
  partialMatches: z.array(partialMatchSchema),
  suggestedSearches: z.array(z.string().min(1)),
});

// ── Discriminated union of the two response shapes ──
// Zod's discriminatedUnion needs a literal field, so we use `unsupported`.
// Successful responses are normalized to include `unsupported: false` on the
// wire by the route handler — the schema below accepts either shape and the
// app code dispatches by checking `'answer' in response && response.answer`.

export const askResponseSchema = z.union([
  successfulAnswerSchema.extend({ unsupported: z.literal(false).optional() }),
  unsupportedAnswerSchema,
]);
export type AskResponse = z.infer<typeof askResponseSchema>;
```

- [ ] **Step 6.4: Run test to verify it passes**

Run: `cd apps/web && pnpm test --test-name-pattern "ask "`
Expected: 5 tests, all PASS.

- [ ] **Step 6.5: Commit**

```bash
git add apps/web/src/lib/hub/chat/schema.ts apps/web/src/lib/hub/chat/schema.test.ts
git commit -m "feat(hub): add grounded chat API schema"
```

---

### Task 7: Mock chat answers

**Files:**
- Create: `apps/web/src/lib/hub/chat/mockAnswers.ts`
- Create: `apps/web/src/lib/hub/chat/mockAnswers.test.ts`
- Create: `apps/web/src/lib/hub/chat/RAG-NOTES.md`

- [ ] **Step 7.1: Write the failing test**

```ts
// apps/web/src/lib/hub/chat/mockAnswers.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { lookupMockAnswer, MOCK_ANSWER_QUESTIONS } from './mockAnswers';
import { askResponseSchema } from './schema';

test('mock answers: every documented question returns a successful answer', () => {
  for (const q of MOCK_ANSWER_QUESTIONS) {
    const result = lookupMockAnswer(q);
    assert.ok(result, `no mock answer for: ${q}`);
    const parsed = askResponseSchema.safeParse(result);
    assert.equal(parsed.success, true, `mock for ${q} fails schema`);
    if ('answer' in result && result.answer) {
      assert.ok(result.answer.bullets.length >= 3, 'answers should have ≥3 bullets');
      for (const b of result.answer.bullets) {
        assert.ok(b.citationIds.length > 0, `bullet without citation: ${b.text}`);
      }
    }
  }
});

test('mock answers: unknown question returns unsupported response', () => {
  const result = lookupMockAnswer('What is the meaning of life?');
  assert.ok(result);
  assert.equal(askResponseSchema.safeParse(result).success, true);
  assert.equal('unsupported' in result && result.unsupported, true);
});

test('mock answers: case-insensitive trimmed match', () => {
  const result = lookupMockAnswer('  HOW does Ali Plan his Week?  ');
  assert.ok(result && 'answer' in result && result.answer);
});
```

- [ ] **Step 7.2: Run test to verify it fails**

Run: `cd apps/web && pnpm test --test-name-pattern "mock answers"`
Expected: FAIL — module not found.

- [ ] **Step 7.3: Implement mockAnswers.ts**

```ts
// apps/web/src/lib/hub/chat/mockAnswers.ts
//
// Deterministic dictionary of mock answers for the grounded chat UI. Real
// retrieval lives in a separate project — see RAG-NOTES.md.

import type { AskResponse } from './schema';

// The 5 questions surfaced as `SuggestedQuestions` on /ask. Every one of these
// must return a successful answer; anything else returns the unsupported shape.
export const MOCK_ANSWER_QUESTIONS = [
  'How does Ali plan his week?',
  'What does Ali say about deep work?',
  'How should I start learning faster?',
  'What are the core ideas behind the Productivity Operating System?',
  'Which videos explain note-taking best?',
] as const;

const ANSWERS: Record<string, AskResponse> = {
  'how does ali plan his week?': {
    answer: {
      summary:
        'Ali recommends a weekly planning ritual built around outcomes rather than tasks: review last week, choose 1–3 outcomes for the next week, time-block deep work first, and leave a buffer for the unexpected.',
      bullets: [
        { text: 'Review what happened last week before planning the next.',     citationIds: ['cit_pos_4', 'cit_wp_3'] },
        { text: 'Choose 1–3 meaningful outcomes for the week — not a task list.', citationIds: ['cit_wp_2'] },
        { text: 'Time-block deep work first, then admin around it.',             citationIds: ['cit_tb_2'] },
        { text: 'Leave roughly 25% of the week as buffer.',                       citationIds: ['cit_tb_1'] },
        { text: 'Run a short Friday review to score the week.',                  citationIds: ['cit_wp_3'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_pos_4', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 540, timestampEnd: 600, timestampLabel: '9:00',
        url: 'https://www.youtube.com/watch?v=YT1001&t=540s',
        excerpt: 'The system fails the week you skip the plan.' },
      { id: 'cit_wp_3', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 320, timestampEnd: 380, timestampLabel: '5:20',
        url: 'https://www.youtube.com/watch?v=YT1001&t=320s',
        excerpt: 'The Friday review is the most important 30 minutes of the week.' },
      { id: 'cit_wp_2', sourceVideoId: 'vid_001', videoTitle: 'How I Plan My Week for Maximum Productivity',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1000&t=45s',
        excerpt: 'Three outcomes. Three blocks. That is the spine of the week.' },
      { id: 'cit_tb_2', sourceVideoId: 'vid_008', videoTitle: 'Time Blocking — How I Actually Do It',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1007&t=180s',
        excerpt: 'I block the hard thing first. Everything else fits around it.' },
      { id: 'cit_tb_1', sourceVideoId: 'vid_008', videoTitle: 'Time Blocking — How I Actually Do It',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1007&t=45s',
        excerpt: 'If it is not on the calendar, it does not happen.' },
    ],
    relatedPages: [
      { id: 'pg_weekly_planning',  title: 'How I plan my week',                  type: 'playbook',  slug: 'how-i-plan-my-week' },
      { id: 'pg_productivity_os',  title: 'The Productivity Operating System',  type: 'playbook',  slug: 'productivity-operating-system' },
      { id: 'pg_time_blocking',    title: 'Time blocking',                       type: 'lesson',    slug: 'time-blocking' },
    ],
    suggestedFollowups: [
      'What is the weekly planning checklist?',
      'What does Ali say about time blocking?',
      'Which videos explain weekly review best?',
    ],
  },

  'what does ali say about deep work?': {
    answer: {
      summary:
        'Deep work is sustained focus on a cognitively demanding task with no context-switching. Ali argues that one reliable daily block of 90–120 minutes outperforms multiple scattered ones.',
      bullets: [
        { text: 'Pick one deep block per day — same time, same place.',          citationIds: ['cit_dw_1'] },
        { text: 'No notifications, no browser tabs, no lyric music.',            citationIds: ['cit_dw_1'] },
        { text: 'After the block, take a real break — not a phone scroll.',     citationIds: ['cit_dw_2'] },
        { text: 'Two hours of real deep work beats eight of shallow.',          citationIds: ['cit_dw_2'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_dw_1', sourceVideoId: 'vid_005', videoTitle: 'Deep Work: My Focus Routine',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1004&t=45s',
        excerpt: 'Deep work means doing the actual work. Not preparing to do it.' },
      { id: 'cit_dw_2', sourceVideoId: 'vid_005', videoTitle: 'Deep Work: My Focus Routine',
        timestampStart: 460, timestampEnd: 540, timestampLabel: '7:40',
        url: 'https://www.youtube.com/watch?v=YT1004&t=460s',
        excerpt: 'One block a day, every day. That is enough.' },
    ],
    relatedPages: [
      { id: 'pg_deep_work',     title: 'Deep work',     type: 'lesson', slug: 'deep-work' },
      { id: 'pg_time_blocking', title: 'Time blocking', type: 'lesson', slug: 'time-blocking' },
    ],
    suggestedFollowups: [
      'What is a good deep-work schedule?',
      'How long should a deep block be?',
      'Which videos explain focus routines?',
    ],
  },

  'how should i start learning faster?': {
    answer: {
      summary:
        'Two techniques drive most of the gain: active recall (testing yourself instead of re-reading) and the Feynman technique (writing the explanation as if for a child). Both are uncomfortable; that\'s the point.',
      bullets: [
        { text: 'Use blank-page recall before reaching for highlights.',   citationIds: ['cit_ar_1', 'cit_ar_3'] },
        { text: 'Run the Feynman technique every time you finish a chapter.', citationIds: ['cit_fey_1'] },
        { text: 'Compare your recall to the source — the gaps are the lesson.', citationIds: ['cit_ar_2'] },
        { text: 'Space the recall across days, not minutes.',               citationIds: ['cit_ar_3'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_ar_1',  sourceVideoId: 'vid_015', videoTitle: 'Active Recall — The One Study Habit That Matters',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1014&t=45s',
        excerpt: 'Re-reading is the most popular study technique and one of the worst.' },
      { id: 'cit_ar_2',  sourceVideoId: 'vid_015', videoTitle: 'Active Recall — The One Study Habit That Matters',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1014&t=180s',
        excerpt: 'Retrieval is the act of remembering. That is what locks the memory in.' },
      { id: 'cit_ar_3',  sourceVideoId: 'vid_015', videoTitle: 'Active Recall — The One Study Habit That Matters',
        timestampStart: 320, timestampEnd: 380, timestampLabel: '5:20',
        url: 'https://www.youtube.com/watch?v=YT1014&t=320s',
        excerpt: 'Blank page, no notes, write what you remember. Then check.' },
      { id: 'cit_fey_1', sourceVideoId: 'vid_004', videoTitle: 'The Feynman Technique Explained',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1003&t=45s',
        excerpt: 'The Feynman technique is the strongest learning method I have ever found.' },
    ],
    relatedPages: [
      { id: 'pg_active_recall', title: 'Active recall',          type: 'lesson', slug: 'active-recall' },
      { id: 'pg_feynman',       title: 'The Feynman Technique',  type: 'lesson', slug: 'feynman-technique' },
      { id: 'pg_smart_notes',   title: 'Smart notes',             type: 'lesson', slug: 'smart-notes' },
    ],
    suggestedFollowups: [
      'How do I use the Feynman technique on a math topic?',
      'What is spaced repetition?',
      'Which videos explain note-taking best?',
    ],
  },

  'what are the core ideas behind the productivity operating system?': {
    answer: {
      summary:
        'The Productivity OS has four layers: a small set of principles, a few recurring scenes (Sunday plan, daily wrap, Friday review), a weekly workflow that ties them together, and a watchlist of failure points where most systems collapse.',
      bullets: [
        { text: 'Principles, scenes, workflow, failure points — that is the spine.', citationIds: ['cit_pos_1'] },
        { text: 'Calm and consistent beats heroic and brittle.',                       citationIds: ['cit_pos_2'] },
        { text: 'Sunday plan, daily start, Friday review — the rhythm of the week.', citationIds: ['cit_pos_3'] },
        { text: 'The system fails the week you skip the plan.',                       citationIds: ['cit_pos_4'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_pos_1', sourceVideoId: 'vid_001', videoTitle: 'How I Plan My Week for Maximum Productivity',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1000&t=45s',
        excerpt: 'A productivity OS is just a small set of routines you actually run.' },
      { id: 'cit_pos_2', sourceVideoId: 'vid_001', videoTitle: 'How I Plan My Week for Maximum Productivity',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1000&t=180s',
        excerpt: 'Calm and consistent beats heroic and brittle.' },
      { id: 'cit_pos_3', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1001&t=45s',
        excerpt: 'Sunday plan, daily start, Friday review. That is the spine.' },
      { id: 'cit_pos_4', sourceVideoId: 'vid_002', videoTitle: 'My Simple Productivity System That Actually Works',
        timestampStart: 540, timestampEnd: 600, timestampLabel: '9:00',
        url: 'https://www.youtube.com/watch?v=YT1001&t=540s',
        excerpt: 'The system fails the week you skip the plan.' },
    ],
    relatedPages: [
      { id: 'pg_productivity_os', title: 'The Productivity Operating System', type: 'playbook', slug: 'productivity-operating-system' },
      { id: 'pg_weekly_planning', title: 'How I plan my week',                 type: 'playbook', slug: 'how-i-plan-my-week' },
      { id: 'pg_time_blocking',   title: 'Time blocking',                      type: 'lesson',   slug: 'time-blocking' },
    ],
    suggestedFollowups: [
      'What does the Sunday plan look like?',
      'How do I structure the Friday review?',
      'What are the failure points to watch for?',
    ],
  },

  'which videos explain note-taking best?': {
    answer: {
      summary:
        'Two videos cover the core: "How I Take Smart Notes" introduces the Zettelkasten method, and "Building a Second Brain" puts it in a complete capture-organize-distill-express loop.',
      bullets: [
        { text: 'Each note = one idea, written in your own words, linked to others.', citationIds: ['cit_sn_1', 'cit_sn_2'] },
        { text: 'A second brain runs the loop: capture, organize, distill, express.', citationIds: ['cit_sb_1'] },
        { text: 'Capture is cheap; distillation is what compounds.',                   citationIds: ['cit_sb_2'] },
      ],
      confidence: 'strong', evidenceQuality: 'strong', limitations: null,
    },
    citations: [
      { id: 'cit_sn_1', sourceVideoId: 'vid_003', videoTitle: 'How I Take Smart Notes (Zettelkasten in plain English)',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1002&t=45s',
        excerpt: 'Each note is one idea. That is the whole rule.' },
      { id: 'cit_sn_2', sourceVideoId: 'vid_003', videoTitle: 'How I Take Smart Notes (Zettelkasten in plain English)',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1002&t=180s',
        excerpt: 'Notes that don\'t link to anything die.' },
      { id: 'cit_sb_1', sourceVideoId: 'vid_006', videoTitle: 'How to Build a Second Brain',
        timestampStart: 45,  timestampEnd: 110, timestampLabel: '0:45',
        url: 'https://www.youtube.com/watch?v=YT1005&t=45s',
        excerpt: 'A second brain is not a list of files. It is a loop.' },
      { id: 'cit_sb_2', sourceVideoId: 'vid_006', videoTitle: 'How to Build a Second Brain',
        timestampStart: 180, timestampEnd: 245, timestampLabel: '3:00',
        url: 'https://www.youtube.com/watch?v=YT1005&t=180s',
        excerpt: 'Capture is cheap. Distillation is what compounds.' },
    ],
    relatedPages: [
      { id: 'pg_smart_notes',   title: 'Smart notes',          type: 'lesson',   slug: 'smart-notes' },
      { id: 'pg_second_brain',  title: 'Building a second brain', type: 'playbook', slug: 'second-brain' },
    ],
    suggestedFollowups: [
      'How do I link notes effectively?',
      'What tools does Ali use for notes?',
      'How does this connect to active recall?',
    ],
  },
};

const UNSUPPORTED: AskResponse = {
  answer: null,
  unsupported: true,
  message:
    "I couldn't find enough source support in this hub to answer that confidently. Try asking about a topic covered in Ali's videos, or browse related pages below.",
  partialMatches: [
    { type: 'topic', title: 'Productivity', slug: 'productivity' },
    { type: 'topic', title: 'Learning',     slug: 'learning' },
    { type: 'topic', title: 'Systems',      slug: 'systems' },
  ],
  suggestedSearches: ['weekly planning', 'deep work', 'time blocking', 'active recall'],
};

export function lookupMockAnswer(question: string): AskResponse {
  const key = question.trim().toLowerCase();
  return ANSWERS[key] ?? UNSUPPORTED;
}
```

- [ ] **Step 7.4: Run test to verify it passes**

Run: `cd apps/web && pnpm test --test-name-pattern "mock answers"`
Expected: 3 tests, all PASS.

- [ ] **Step 7.5: Add RAG-NOTES.md**

```md
# RAG Notes (Future Implementer)

This file lives alongside `mockAnswers.ts`. It captures the future-RAG plan
recorded in the design spec § 6.5. **Nothing in this file is built in v1.**

## System prompt (informational)

> You are the grounded assistant for this CreatorCanon hub. Answer only
> using the supplied hub context. Do not use outside knowledge. If the
> context does not support the answer, say you do not have enough source
> support. Every substantive claim must be supported by at least one
> citation. Prefer concise, practical answers. Preserve the creator's
> terminology and nuance. Never invent video titles, timestamps, quotes,
> or claims.

## Retrieval flow (informational)

1. Embed the user's question.
2. Retrieve top-K transcript chunks, source moments, and pages from this
   hub's release manifest. Filter by `hub.id`. Do not cross hubs.
3. Generate an answer constrained to the retrieved context.
4. For each substantive bullet, attach 1+ citations whose `excerpt` (or
   nearby transcript) supports it.
5. Compute `evidenceQuality` from citation count and distinct-source count.
6. If no bullet has a backing citation, return the `unsupported` response
   shape with `partialMatches` derived from topic-keyword overlap.

## Implementation note

Replace `lookupMockAnswer` with a real handler that respects the
`AskRequest.filters.{topicSlugs,sourceVideoIds,pageIds}` to scope retrieval.
The mock dictionary should remain available behind a feature flag for
local development.
```

- [ ] **Step 7.6: Commit**

```bash
git add apps/web/src/lib/hub/chat/
git commit -m "feat(hub): add mock chat answers + RAG notes"
```

---

## Phase 1 — Visual chrome

Phase 1 builds the layout shell and rewires the home route to render against the mock manifest. UI components are not unit-tested in this session — they're verified by `pnpm typecheck`, `pnpm lint`, and a final visual smoke check at Task 16. The user reviews visually, then approves Phase 2.

### Task 8: Tokens

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/tokens.ts`

- [ ] **Step 8.1: Write tokens.ts**

```ts
// apps/web/src/components/hub/EditorialAtlas/tokens.ts
//
// Visual tokens for the Editorial Atlas template. Inter type throughout;
// the editorial feel comes from layout / canvas / spacing / borders.

export const palette = {
  // Canvas
  paper: '#F8F4EC',          // hero / page background
  paperWarm: '#F2EBDA',      // sidebar fill
  surface: '#FFFFFF',         // card / panel fill
  surfaceMuted: '#FAF6EE',    // table-row hover, soft panel

  // Ink
  ink: '#1A1612',
  ink2: '#3D352A',
  ink3: '#6B5F50',
  ink4: '#9A8E7C',

  // Rule
  rule: '#E5DECF',
  ruleStrong: '#D6CFC0',

  // Accent washes — used as 8–12% backgrounds for category icons.
  // Keys mirror Topic.accentColor in the manifest.
  accent: {
    mint:  { fg: '#2F7A5C', wash: '#E2F1E9' },
    peach: { fg: '#9C5A2E', wash: '#F4E5D8' },
    lilac: { fg: '#6F4FA0', wash: '#ECE4F4' },
    rose:  { fg: '#A34A60', wash: '#F4E1E6' },
    blue:  { fg: '#3A6E92', wash: '#E2EDF4' },
    amber: { fg: '#A07424', wash: '#F4EAD2' },
    sage:  { fg: '#5C7C56', wash: '#E6EEDF' },
    slate: { fg: '#4F5B6B', wash: '#E5E9EE' },
  },

  // Trust strip background
  trustBar: '#1A1612',
  trustBarInk: '#F2EBDA',
} as const;

export const fonts = {
  // Inter throughout — no serif. Editorial feel comes from layout, not type.
  display: 'var(--font-inter, Inter, system-ui, sans-serif)',
  body:    'var(--font-inter, Inter, system-ui, sans-serif)',
  numeric: 'var(--font-inter, Inter, system-ui, sans-serif)',  // tabular-nums via CSS feature
} as const;

export const layout = {
  sidebarWidth: 232,           // px
  contentMaxWidth: 1080,       // px
  rightRailWidth: 304,         // px
  pagePaddingX: 32,            // px
  pagePaddingY: 28,            // px
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export type AccentKey = keyof typeof palette.accent;
```

- [ ] **Step 8.2: Verify typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 8.3: Commit**

```bash
git add apps/web/src/components/hub/EditorialAtlas/tokens.ts
git commit -m "feat(hub): Editorial Atlas visual tokens"
```

---

### Task 9: Line illustrations

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/illustrations/BooksIllustration.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/illustrations/DeskIllustration.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/illustrations/PlantIllustration.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/illustrations/OpenNotebookIllustration.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/illustrations/LineIllustration.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/illustrations/index.ts`

- [ ] **Step 9.1: Write the four leaf illustrations**

Each leaf is an inline SVG, single component. Keep them visually consistent: 2px stroke (`stroke="currentColor"`), warm `text-[#3D352A]` default, no fills, soft accent dots. The implementer can refine the actual paths — the contract here is the API, not pixel-perfect art.

```tsx
// apps/web/src/components/hub/EditorialAtlas/illustrations/BooksIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function BooksIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* stack of three books */}
      <rect x="40"  y="48"  width="68" height="14" rx="2" />
      <rect x="48"  y="62"  width="60" height="14" rx="2" />
      <rect x="36"  y="76"  width="76" height="14" rx="2" />
      {/* upright book */}
      <path d="M132 90 V40 a4 4 0 0 1 4 -4 h28 a4 4 0 0 1 4 4 v50" />
      <path d="M132 90 H168" />
      {/* mug */}
      <path d="M180 96 v22 a8 8 0 0 0 8 8 h12 a8 8 0 0 0 8 -8 v-22 z" />
      <path d="M208 102 h6 a6 6 0 0 1 6 6 v6 a6 6 0 0 1 -6 6 h-6" />
      {/* steam */}
      <path d="M188 90 q2 -8 -2 -12" />
      <path d="M198 88 q2 -10 -2 -14" />
    </svg>
  );
}
```

```tsx
// apps/web/src/components/hub/EditorialAtlas/illustrations/DeskIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function DeskIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* desk surface */}
      <line x1="20" y1="120" x2="220" y2="120" />
      {/* notebook */}
      <rect x="38"  y="84"  width="80" height="36" rx="3" />
      <line x1="78" y1="84" x2="78" y2="120" />
      {/* pen */}
      <line x1="124" y1="118" x2="160" y2="92" />
      <path d="M158 90 l6 -2 -2 6 z" />
      {/* lamp */}
      <path d="M186 120 V92 q0 -10 10 -10 h12" />
      <path d="M204 78 l16 -8 v18 z" />
      {/* mug */}
      <path d="M134 96 v18 a6 6 0 0 0 6 6 h10 a6 6 0 0 0 6 -6 v-18 z" />
    </svg>
  );
}
```

```tsx
// apps/web/src/components/hub/EditorialAtlas/illustrations/PlantIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function PlantIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* pot */}
      <path d="M88 130 l4 -28 h56 l4 28 z" />
      {/* leaves */}
      <path d="M120 102 q-30 -16 -28 -52 q24 6 28 52 z" />
      <path d="M120 102 q30 -16 28 -52 q-24 6 -28 52 z" />
      <path d="M120 102 v-44" />
    </svg>
  );
}
```

```tsx
// apps/web/src/components/hub/EditorialAtlas/illustrations/OpenNotebookIllustration.tsx
type Props = { className?: string; ariaHidden?: boolean };

export function OpenNotebookIllustration({ className, ariaHidden = true }: Props) {
  return (
    <svg
      viewBox="0 0 240 160" className={className} aria-hidden={ariaHidden} role={ariaHidden ? undefined : 'img'}
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* open book */}
      <path d="M30 50 l90 -10 v90 l-90 10 z" />
      <path d="M210 50 l-90 -10 v90 l90 10 z" />
      <line x1="120" y1="40"  x2="120" y2="130" />
      {/* lines on left page */}
      <line x1="44" y1="64" x2="100" y2="60" />
      <line x1="44" y1="78" x2="104" y2="74" />
      <line x1="44" y1="92" x2="92"  y2="88" />
      {/* lines on right page */}
      <line x1="140" y1="60"  x2="196" y2="64" />
      <line x1="140" y1="74"  x2="200" y2="78" />
      <line x1="140" y1="88"  x2="184" y2="92" />
    </svg>
  );
}
```

- [ ] **Step 9.2: Write LineIllustration.tsx (the dispatcher)**

```tsx
// apps/web/src/components/hub/EditorialAtlas/illustrations/LineIllustration.tsx
import type { ReactNode } from 'react';

import { BooksIllustration } from './BooksIllustration';
import { DeskIllustration } from './DeskIllustration';
import { PlantIllustration } from './PlantIllustration';
import { OpenNotebookIllustration } from './OpenNotebookIllustration';

export type IllustrationKey = 'books' | 'desk' | 'plant' | 'open-notebook';

type Props = { illustrationKey: IllustrationKey; className?: string };

export function LineIllustration({ illustrationKey, className }: Props): ReactNode {
  switch (illustrationKey) {
    case 'books':         return <BooksIllustration className={className} />;
    case 'desk':          return <DeskIllustration className={className} />;
    case 'plant':         return <PlantIllustration className={className} />;
    case 'open-notebook': return <OpenNotebookIllustration className={className} />;
    default: {
      const _exhaustive: never = illustrationKey;
      void _exhaustive;
      return null;
    }
  }
}
```

- [ ] **Step 9.3: Write index.ts barrel**

```ts
// apps/web/src/components/hub/EditorialAtlas/illustrations/index.ts
export { LineIllustration, type IllustrationKey } from './LineIllustration';
export { BooksIllustration } from './BooksIllustration';
export { DeskIllustration } from './DeskIllustration';
export { PlantIllustration } from './PlantIllustration';
export { OpenNotebookIllustration } from './OpenNotebookIllustration';
```

- [ ] **Step 9.4: Verify typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9.5: Commit**

```bash
git add apps/web/src/components/hub/EditorialAtlas/illustrations/
git commit -m "feat(hub): line illustrations for Editorial Atlas hero"
```

---

### Task 10: HubFooterTrustBar

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/shell/HubFooterTrustBar.tsx`

- [ ] **Step 10.1: Write HubFooterTrustBar.tsx**

```tsx
// apps/web/src/components/hub/EditorialAtlas/shell/HubFooterTrustBar.tsx
import type { EditorialAtlasManifest } from '@/lib/hub/manifest/schema';

type Props = {
  qualityPrinciples: EditorialAtlasManifest['trust']['qualityPrinciples'];
};

/**
 * The dark trust strip that sits at the bottom of every hub surface.
 * Three columns of principle title + body, rendered against a warm-dark fill.
 */
export function HubFooterTrustBar({ qualityPrinciples }: Props) {
  // Show the first 3 principles in this strip; the Methodology page renders all of them.
  const principles = qualityPrinciples.slice(0, 3);

  return (
    <footer className="mt-16 bg-[#1A1612] text-[#F2EBDA]">
      <div className="mx-auto max-w-[1080px] px-8 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          {principles.map((p) => (
            <div key={p.title}>
              <h3 className="text-[14px] font-semibold tracking-[-0.01em]">{p.title}</h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#D6CFC0]">{p.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-[12px] text-[#9A8E7C]">
          <span>About CreatorCanon — source-grounded knowledge hubs from creator archives.</span>
          <a href="https://creatorcanon.com" className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">creatorcanon.com</a>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 10.2: Verify typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 10.3: Commit**

```bash
git add apps/web/src/components/hub/EditorialAtlas/shell/HubFooterTrustBar.tsx
git commit -m "feat(hub): HubFooterTrustBar"
```

---

### Task 11: HubSidebar

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/shell/HubSidebar.tsx`

- [ ] **Step 11.1: Write HubSidebar.tsx**

```tsx
// apps/web/src/components/hub/EditorialAtlas/shell/HubSidebar.tsx
import Link from 'next/link';
import Image from 'next/image';
import type { EditorialAtlasManifest } from '@/lib/hub/manifest/schema';
import { getSearchRoute } from '@/lib/hub/routes';

type Props = {
  hubSlug: string;
  title: EditorialAtlasManifest['title'];
  creator: EditorialAtlasManifest['creator'];
  navigation: EditorialAtlasManifest['navigation'];
  /**
   * Pathname from the route component. Used to highlight the active nav item.
   * The hub layout passes `usePathname()` through; the sidebar itself is a
   * server component because it doesn't need any state.
   */
  activePathname: string;
};

/**
 * The persistent left sidebar on every hub surface.
 * - Creator pill at top
 * - Primary nav (~9 items)
 * - Secondary "Resources" nav
 * - Source-backed footer card
 * - "Built on CreatorCanon" link
 * - Sticky search input at the very bottom
 */
export function HubSidebar({ hubSlug, title, creator, navigation, activePathname }: Props) {
  return (
    <aside
      aria-label="Hub navigation"
      className="hidden w-[232px] shrink-0 flex-col bg-[#F2EBDA] text-[#3D352A] md:flex"
    >
      <div className="flex flex-1 flex-col px-4 py-5">
        {/* Creator pill */}
        <Link href={`/h/${hubSlug}`} className="flex items-center gap-2.5 rounded-[10px] px-1 py-1 hover:bg-black/5">
          <span className="grid size-7 place-items-center overflow-hidden rounded-full bg-[#D6CFC0]">
            {creator.avatarUrl ? (
              <Image src={creator.avatarUrl} alt="" width={28} height={28} />
            ) : (
              <span aria-hidden className="text-[11px] font-semibold text-[#3D352A]">
                {creator.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-semibold leading-tight text-[#1A1612]">{creator.name}</span>
            <span className="block truncate text-[11px] text-[#6B5F50]">{title}</span>
          </span>
        </Link>

        {/* Primary nav */}
        <nav aria-label="Primary" className="mt-5">
          <ul className="space-y-0.5">
            {navigation.primary.map((item) => {
              const active = item.href === activePathname || (item.href !== `/h/${hubSlug}` && activePathname.startsWith(item.href));
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={
                      'flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[13px] transition-colors ' +
                      (active
                        ? 'bg-white text-[#1A1612] font-medium shadow-[0_1px_0_rgba(0,0,0,0.04)]'
                        : 'text-[#6B5F50] hover:bg-white/60 hover:text-[#1A1612]')
                    }
                  >
                    <span aria-hidden className="size-1.5 rounded-full bg-current opacity-40" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Secondary nav */}
        {navigation.secondary.length > 0 && (
          <nav aria-label="Resources" className="mt-6">
            <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Resources</p>
            <ul className="mt-2 space-y-0.5">
              {navigation.secondary.map((item) => (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    className="flex h-8 items-center gap-2.5 rounded-[8px] px-2 text-[13px] text-[#6B5F50] transition-colors hover:bg-white/60 hover:text-[#1A1612]"
                  >
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Source-backed footer card */}
        <div className="mt-auto rounded-[10px] border border-[#D6CFC0] bg-white/60 p-3">
          <p className="text-[12px] font-semibold text-[#1A1612]">Source-backed knowledge</p>
          <p className="mt-1 text-[11px] leading-[1.55] text-[#6B5F50]">
            Every page is built from {creator.name.split(' ')[0]}'s videos, transcripts, and grounded citations.
          </p>
          <Link
            href={`/h/${hubSlug}/methodology`}
            className="mt-2 inline-flex text-[11px] font-semibold text-[#1A1612] hover:underline"
          >
            Learn more →
          </Link>
        </div>

        {/* Search */}
        <form action={getSearchRoute(hubSlug)} method="get" className="mt-3">
          <label htmlFor="hub-search" className="sr-only">Search this hub</label>
          <input
            id="hub-search" name="q" type="search" placeholder="Search this hub…"
            className="h-9 w-full rounded-[8px] border border-[#D6CFC0] bg-white px-3 text-[12px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:border-[#1A1612] focus:outline-none"
          />
        </form>

        {/* Built on CreatorCanon */}
        <a
          href="https://creatorcanon.com"
          className="mt-3 text-[10px] text-[#9A8E7C] hover:text-[#1A1612]"
          target="_blank" rel="noreferrer"
        >
          Built on CreatorCanon
        </a>
      </div>
    </aside>
  );
}
```

- [ ] **Step 11.2: Verify typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 11.3: Commit**

```bash
git add apps/web/src/components/hub/EditorialAtlas/shell/HubSidebar.tsx
git commit -m "feat(hub): HubSidebar"
```

---

### Task 12: HubShell

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/shell/HubShell.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/shell/index.ts`

- [ ] **Step 12.1: Write HubShell.tsx**

```tsx
// apps/web/src/components/hub/EditorialAtlas/shell/HubShell.tsx
import type { ReactNode } from 'react';

import type { EditorialAtlasManifest } from '@/lib/hub/manifest/schema';

import { HubSidebar } from './HubSidebar';
import { HubFooterTrustBar } from './HubFooterTrustBar';

type Props = {
  manifest: EditorialAtlasManifest;
  /** The current pathname, supplied by the route component. */
  activePathname: string;
  /** Optional right rail (renders to the right of `children` on lg+). */
  rightRail?: ReactNode;
  children: ReactNode;
};

/**
 * The Editorial Atlas chrome. Always renders:
 * - HubSidebar (fixed-width, persistent across navigation)
 * - Main content + optional right rail
 * - HubFooterTrustBar (dark strip)
 */
export function HubShell({ manifest, activePathname, rightRail, children }: Props) {
  return (
    <div className="min-h-screen bg-[#F8F4EC] text-[#1A1612]">
      <div className="flex min-h-screen">
        <HubSidebar
          hubSlug={manifest.hubSlug}
          title={manifest.title}
          creator={manifest.creator}
          navigation={manifest.navigation}
          activePathname={activePathname}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <main
            className={
              rightRail
                ? 'mx-auto flex w-full max-w-[1080px] flex-1 gap-8 px-8 py-7 lg:flex-row'
                : 'mx-auto w-full max-w-[1080px] flex-1 px-8 py-7'
            }
          >
            <div className="min-w-0 flex-1">{children}</div>
            {rightRail ? (
              <aside aria-label="Evidence and related" className="w-[304px] shrink-0">
                {rightRail}
              </aside>
            ) : null}
          </main>

          <HubFooterTrustBar qualityPrinciples={manifest.trust.qualityPrinciples} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 12.2: Write barrel**

```ts
// apps/web/src/components/hub/EditorialAtlas/shell/index.ts
export { HubShell } from './HubShell';
export { HubSidebar } from './HubSidebar';
export { HubFooterTrustBar } from './HubFooterTrustBar';
```

- [ ] **Step 12.3: Verify typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS.

- [ ] **Step 12.4: Commit**

```bash
git add apps/web/src/components/hub/EditorialAtlas/shell/HubShell.tsx apps/web/src/components/hub/EditorialAtlas/shell/index.ts
git commit -m "feat(hub): HubShell layout"
```

---

### Task 13: Rename route folder + update existing files

The old route folder is `apps/web/src/app/h/[subdomain]/`. Next.js segments it as `params.subdomain`. We rename to `[hubSlug]` and update every file inside that references the segment.

**Files:**
- Rename: `apps/web/src/app/h/[subdomain]/` → `apps/web/src/app/h/[hubSlug]/`
- Modify: `apps/web/src/app/h/[hubSlug]/manifest.ts` (param rename)
- Modify: `apps/web/src/app/h/[hubSlug]/opengraph-image.tsx` (param rename)
- Modify: `apps/web/src/app/h/[hubSlug]/twitter-image.tsx` (param rename)
- Modify: `apps/web/src/app/h/[hubSlug]/loading.tsx` (canvas update)

- [ ] **Step 13.1: Rename the folder**

Run from the repo root:

```bash
git mv "apps/web/src/app/h/[subdomain]" "apps/web/src/app/h/[hubSlug]"
```

- [ ] **Step 13.2: Update manifest.ts (param + comment only)**

Open `apps/web/src/app/h/[hubSlug]/manifest.ts`. The function currently signature is `loadHubManifest(subdomain: string)`. Change the parameter name to `hubSlug`:

```ts
// before
export const loadHubManifest = cache(async (subdomain: string) => {
  // …
  .where(eq(hub.subdomain, subdomain))
  // …
});

// after — only renames; behavior is unchanged. The DB column hub.subdomain is unchanged.
export const loadHubManifest = cache(async (hubSlug: string) => {
  // …
  .where(eq(hub.subdomain, hubSlug))
  // …
});
```

Add a one-line comment at the top of the file:

```ts
// Note: this loader serves OG images and the legacy renderer. The new
// Editorial Atlas home page reads from `lib/hub/manifest/mockManifest.ts`
// directly. This file stays in service for the other consumers.
```

- [ ] **Step 13.3: Update opengraph-image.tsx and twitter-image.tsx**

Find every `params.subdomain` and `params: { subdomain: string }` in both files and rename to `hubSlug`. Behavior unchanged.

- [ ] **Step 13.4: Update loading.tsx to match the paper canvas**

```tsx
// apps/web/src/app/h/[hubSlug]/loading.tsx
//
// Skeleton shown while a hub page renders. Matches the Editorial Atlas paper
// canvas so the swap to real content is visually quiet.

export default function HubLoading() {
  return (
    <div className="flex min-h-screen bg-[#F8F4EC]">
      <div className="hidden w-[232px] shrink-0 bg-[#F2EBDA] md:block" />
      <div className="mx-auto w-full max-w-[1080px] px-8 py-7">
        <div className="h-3 w-24 rounded bg-[#E5DECF]" />
        <div className="mt-4 h-10 w-3/4 max-w-[640px] rounded bg-[#E5DECF]" />
        <div className="mt-4 h-4 w-2/3 max-w-[520px] rounded bg-[#EFE9DA]" />
        <div className="mt-10 grid gap-3 md:grid-cols-3">
          <div className="h-24 rounded-[12px] border border-[#E5DECF] bg-white" />
          <div className="h-24 rounded-[12px] border border-[#E5DECF] bg-white" />
          <div className="h-24 rounded-[12px] border border-[#E5DECF] bg-white" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 13.5: Verify typecheck**

Run: `cd apps/web && pnpm typecheck`
Expected: PASS. If any file missed a `subdomain` reference, fix it now.

- [ ] **Step 13.6: Commit**

```bash
git add apps/web/src/app/h/[hubSlug]/
git commit -m "refactor(hub): rename [subdomain] route segment to [hubSlug]"
```

---

### Task 14: New Hub Home stub

**Files:**
- Modify: `apps/web/src/app/h/[hubSlug]/page.tsx` (full replacement)

- [ ] **Step 14.1: Replace page.tsx**

```tsx
// apps/web/src/app/h/[hubSlug]/page.tsx
//
// Editorial Atlas — Hub Home.
//
// Phase 1: shell-only stub. Hero, stat strip, "Phase 2 coming next" copy.
// The full home page (PageCard grid, TopicGrid preview, compact ask box) is
// built in Phase 2 — this stub exists so the chrome can be visually reviewed.
//
// Reads from the mock manifest directly. The pipeline-fed loader stays in
// `./manifest.ts` for OG/Twitter images and the legacy renderer.

import type { Metadata } from 'next';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getHubRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: { hubSlug: string };
}): Promise<Metadata> {
  // Phase 1 stub: title from the mock. Phase 2 wires real lookup + canonical URL.
  if (params.hubSlug !== mockManifest.hubSlug) {
    return { title: 'Hub not found' };
  }
  return {
    title: mockManifest.title,
    description: mockManifest.tagline,
    alternates: { canonical: getHubRoute(params.hubSlug) },
  };
}

export default function HubHomePage({ params }: { params: { hubSlug: string } }) {
  // Phase 1: only the mock hub renders. Real DB-backed hubs 404 here for now.
  if (params.hubSlug !== mockManifest.hubSlug) {
    return (
      <div className="min-h-screen bg-[#F8F4EC] p-8 text-[#1A1612]">
        <p>Hub not found.</p>
      </div>
    );
  }

  return (
    <HubShell manifest={mockManifest} activePathname={`/h/${params.hubSlug}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">
        Reference hub
      </p>
      <div className="mt-3 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.025em] text-[#1A1612]">
            {mockManifest.title}
          </h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-[#3D352A]">
            {mockManifest.tagline}
          </p>
        </div>
        <div className="text-[#3D352A]">
          <LineIllustration illustrationKey="open-notebook" className="h-[120px] w-[180px]" />
        </div>
      </div>

      {/* Stats strip */}
      <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-[#E5DECF] py-6 sm:grid-cols-5">
        <Stat label="Videos"            value={mockManifest.stats.videoCount.toLocaleString()} />
        <Stat label="Sources"           value={mockManifest.stats.sourceCount.toLocaleString()} />
        <Stat label="With transcripts"  value={`${Math.round(mockManifest.stats.transcriptPercent * 100)}%`} />
        <Stat label="Years of archive"  value={`${mockManifest.stats.archiveYears} yrs`} />
        <Stat label="Pages"             value={mockManifest.stats.pageCount.toLocaleString()} />
      </dl>

      {/* Phase-1 placeholder for the rest of Hub Home */}
      <section className="mt-12 rounded-[12px] border border-dashed border-[#D6CFC0] bg-white p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">
          Phase 1 stop gate
        </p>
        <p className="mt-2 text-[14px] leading-[1.55] text-[#3D352A]">
          Chrome is in. Phase 2 builds the rest of Hub Home (page card grid, topic grid preview,
          compact ask box) plus the All Pages and Generic Lesson surfaces. Review the layout,
          sidebar, illustrations, and trust strip before approving Phase 2.
        </p>
      </section>
    </HubShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">{label}</dt>
      <dd className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.015em] text-[#1A1612] [font-feature-settings:'tnum']">
        {value}
      </dd>
    </div>
  );
}
```

- [ ] **Step 14.2: Verify typecheck and lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: both PASS.

- [ ] **Step 14.3: Commit**

```bash
git add apps/web/src/app/h/[hubSlug]/page.tsx
git commit -m "feat(hub): Editorial Atlas Hub Home stub (Phase 1)"
```

---

### Task 15: Compat redirect

**Files:**
- Modify: `apps/web/src/app/h/[hubSlug]/[slug]/page.tsx` (full replacement — was the old detail page)

- [ ] **Step 15.1: Replace [slug]/page.tsx with a 308 redirect**

```tsx
// apps/web/src/app/h/[hubSlug]/[slug]/page.tsx
//
// Backwards-compatibility redirect for the old flat URL pattern.
// Old: /h/[hubSlug]/[slug]
// New: /h/[hubSlug]/pages/[slug]
//
// This dynamic segment only matches when no other dedicated segment
// (`pages`, `topics`, `sources`, `start`, `methodology`, `search`, `ask`) wins
// — Next.js routes specific segments first.
//
// Phase 1 acceptance includes a manual smoke test against
// /h/<slug>/start, /h/<slug>/topics, /h/<slug>/pages, etc. to confirm no
// shadowing. If a conflict surfaces (it shouldn't), delete this file and
// note the reason in the implementation PR.

import { permanentRedirect } from 'next/navigation';

import { getPageRoute } from '@/lib/hub/routes';

export default function LegacyDetailRedirect({
  params,
}: {
  params: { hubSlug: string; slug: string };
}) {
  permanentRedirect(getPageRoute(params.hubSlug, params.slug));
}
```

- [ ] **Step 15.2: Verify typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`
Expected: both PASS.

- [ ] **Step 15.3: Smoke-test the redirect via the dev server**

Start the app:
```bash
cd apps/web && pnpm dev
```

In a browser (the dev server runs at http://localhost:3000):
- Visit `http://localhost:3000/h/ali-abdaal/old-slug-name`. Expected: 308 redirect to `/h/ali-abdaal/pages/old-slug-name` (which 404s in Phase 1 — that's fine; the redirect itself is what we're testing).
- Visit `http://localhost:3000/h/ali-abdaal`. Expected: Hub Home stub renders (chrome + stat strip + "Phase 1 stop gate" panel).
- Visit `http://localhost:3000/h/ali-abdaal/start`, `/topics`, `/pages`, `/sources`, `/methodology`, `/search`, `/ask`. Expected: all 404 (those segments don't exist in Phase 1 — confirms no slug-shadowing).

If `/start` etc. accidentally redirect via the `[slug]` catch-all instead of 404'ing, the route-precedence assumption is wrong — investigate before continuing.

Stop the dev server when done.

- [ ] **Step 15.4: Commit**

```bash
git add apps/web/src/app/h/[hubSlug]/[slug]/page.tsx
git commit -m "feat(hub): 308 redirect from /h/[hubSlug]/[slug] to /pages/[slug]"
```

---

### Task 16: Phase 1 stop gate — visual review

**Files:** none (verification step)

- [ ] **Step 16.1: Run the full verification suite**

```bash
cd apps/web && pnpm typecheck && pnpm lint && pnpm test
```

Expected: all three PASS. The test suite runs every `*.test.ts` from Tasks 1–7.

- [ ] **Step 16.2: Start the dev server and capture a screenshot**

```bash
cd apps/web && pnpm dev
```

Visit `http://localhost:3000/h/ali-abdaal` in a browser. Capture a screenshot of:
- The hub home stub (chrome + sidebar + stat strip + footer trust bar visible).

The screenshot is what gets sent to the user as proof the chrome lands.

- [ ] **Step 16.3: STOP — hand back to user**

Do **not** start Phase 2. Reply to the user with:

> Phase 1 complete. Typecheck + lint + tests pass. The chrome is rendering at `/h/ali-abdaal` against the mock manifest. Screenshot attached. The remaining 13 surfaces (Phases 2–6) are queued — pending your visual approval to proceed.

The user reviews the screenshot, gives feedback, and either approves Phase 2 or asks for chrome revisions before proceeding.

---

## Phase 2 — Core content surfaces

Phase 2 expands the home stub into the real Hub Home, builds the Lesson Page (proves the section system end-to-end), and adds the All Pages Index. Building blocks (PageCard, PageTable, SectionRenderer, etc.) land first because Phases 2–5 all depend on them.

UI components are not unit-tested in this stack (no jsdom / RTL). Verification = `pnpm typecheck` + `pnpm lint` + visual smoke at the end of each task. The pure-logic helpers (e.g. PageTable filter/sort) ARE tested with `node:test`.

### Task 17: MetaTagPill + EvidenceQualityBadge + Breadcrumb

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/MetaTagPill.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/EvidenceQualityBadge.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/Breadcrumb.tsx`

- [ ] **Step 17.1: Implement MetaTagPill**

A small inline pill used everywhere a page type, topic name, or other compact label is displayed. Uses `palette.accent[<key>]` from `tokens.ts`.

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/MetaTagPill.tsx
import type { ReactNode } from 'react';
import { palette, type AccentKey } from '../tokens';
import { resolveAccentColor } from '@/lib/hub/manifest/empty-state';

type Props = {
  children: ReactNode;
  accent?: AccentKey | string;        // tolerant of arbitrary strings via resolveAccentColor
  variant?: 'soft' | 'outline';       // outline used when chrome already has color
  size?: 'sm' | 'xs';
};

export function MetaTagPill({ children, accent, variant = 'soft', size = 'sm' }: Props) {
  const key = resolveAccentColor(accent as never);
  const c = palette.accent[key];
  const sizeCls = size === 'xs'
    ? 'h-5 px-1.5 text-[10px]'
    : 'h-6 px-2 text-[11px]';

  if (variant === 'outline') {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border ${sizeCls} font-medium`}
        style={{ borderColor: c.fg + '40', color: c.fg }}
      >{children}</span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${sizeCls} font-medium`}
      style={{ backgroundColor: c.wash, color: c.fg }}
    >{children}</span>
  );
}
```

- [ ] **Step 17.2: Implement EvidenceQualityBadge**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/EvidenceQualityBadge.tsx
import { MetaTagPill } from './MetaTagPill';

type Props = { quality: 'strong' | 'moderate' | 'limited' | 'none' };

const LABELS = {
  strong:   { label: 'Strong evidence',   accent: 'sage' },
  moderate: { label: 'Moderate evidence', accent: 'amber' },
  limited:  { label: 'Limited evidence',  accent: 'rose' },
  none:     { label: 'No evidence',       accent: 'slate' },
} as const;

export function EvidenceQualityBadge({ quality }: Props) {
  const { label, accent } = LABELS[quality];
  return <MetaTagPill accent={accent}>{label}</MetaTagPill>;
}
```

- [ ] **Step 17.3: Implement Breadcrumb**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/Breadcrumb.tsx
import Link from 'next/link';

type Crumb = { label: string; href?: string };
type Props = { crumbs: Crumb[] };

export function Breadcrumb({ crumbs }: Props) {
  return (
    <nav aria-label="Breadcrumb" className="text-[11px] text-[#9A8E7C]">
      <ol className="flex items-center gap-1.5">
        {crumbs.map((c, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {c.href ? (
              <Link href={c.href} className="hover:text-[#3D352A] hover:underline underline-offset-2">{c.label}</Link>
            ) : (
              <span className="text-[#3D352A]">{c.label}</span>
            )}
            {i < crumbs.length - 1 && <span aria-hidden>›</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
```

- [ ] **Step 17.4: Verify typecheck + lint**

Run: `cd apps/web && pnpm typecheck && pnpm lint`. Expected: PASS.

- [ ] **Step 17.5: Commit**

```bash
git add apps/web/src/components/hub/EditorialAtlas/blocks/
git commit -m "feat(hub): MetaTagPill, EvidenceQualityBadge, Breadcrumb"
```

---

### Task 18: PageCard + PageRow

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/PageCard.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/PageRow.tsx`

- [ ] **Step 18.1: Implement PageCard (used in grids)**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/PageCard.tsx
import Link from 'next/link';

import type { Page } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { MetaTagPill } from './MetaTagPill';

type Props = {
  page: Pick<Page, 'slug' | 'type' | 'title' | 'summary' | 'topicSlugs' | 'estimatedReadMinutes' | 'citationCount'>;
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
};

export function PageCard({ page, hubSlug, topicAccentBySlug = {} }: Props) {
  const primaryTopic = page.topicSlugs[0];
  return (
    <Link
      href={getPageRoute(hubSlug, page.slug)}
      className="group block rounded-[12px] border border-[#E5DECF] bg-white p-4 transition-all hover:-translate-y-px hover:border-[#D6CFC0] hover:shadow-[0_4px_16px_rgba(26,22,18,0.06)]"
    >
      <div className="flex items-center gap-2">
        <MetaTagPill size="xs" accent={primaryTopic ? topicAccentBySlug[primaryTopic] : undefined}>
          {page.type}
        </MetaTagPill>
        {primaryTopic && (
          <span className="text-[10px] uppercase tracking-[0.12em] text-[#9A8E7C]">
            {primaryTopic.replace(/-/g, ' ')}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-[15px] font-semibold leading-[1.3] tracking-[-0.01em] text-[#1A1612] group-hover:text-[#1A1612]">
        {page.title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[13px] leading-[1.5] text-[#6B5F50]">{page.summary}</p>
      <div className="mt-4 flex items-center gap-3 text-[11px] text-[#9A8E7C]">
        <span>{page.estimatedReadMinutes} min read</span>
        <span aria-hidden>·</span>
        <span>{page.citationCount} citations</span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 18.2: Implement PageRow (used in tables)**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/PageRow.tsx
import Link from 'next/link';

import type { Page } from '@/lib/hub/manifest/schema';
import { getPageRoute } from '@/lib/hub/routes';
import { MetaTagPill } from './MetaTagPill';

type Props = {
  page: Page;
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
};

export function PageRow({ page, hubSlug, topicAccentBySlug = {} }: Props) {
  return (
    <Link
      href={getPageRoute(hubSlug, page.slug)}
      className="grid grid-cols-[1fr_120px_120px_80px_100px] items-center gap-4 px-4 py-3 text-[13px] hover:bg-[#FAF6EE]"
    >
      <div className="min-w-0">
        <p className="truncate font-medium text-[#1A1612]">{page.title}</p>
        <p className="truncate text-[11px] text-[#9A8E7C]">{page.summary}</p>
      </div>
      <MetaTagPill size="xs" accent={topicAccentBySlug[page.topicSlugs[0] ?? '']}>
        {page.type}
      </MetaTagPill>
      <span className="truncate text-[11px] text-[#6B5F50]">
        {page.topicSlugs.map((s) => s.replace(/-/g, ' ')).join(', ')}
      </span>
      <span className="text-right text-[11px] tabular-nums text-[#6B5F50]">{page.estimatedReadMinutes}m</span>
      <span className="text-right text-[11px] tabular-nums text-[#9A8E7C]">
        {new Date(page.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
    </Link>
  );
}
```

- [ ] **Step 18.3: Verify + commit**

Run: `cd apps/web && pnpm typecheck && pnpm lint`. Then:
```bash
git add apps/web/src/components/hub/EditorialAtlas/blocks/
git commit -m "feat(hub): PageCard + PageRow"
```

---

### Task 19: PageTable (filter/sort/search logic + UI)

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/PageTable.tsx`
- Create: `apps/web/src/lib/hub/manifest/pageFilters.ts`
- Create: `apps/web/src/lib/hub/manifest/pageFilters.test.ts`

- [ ] **Step 19.1: Write pageFilters.test.ts**

The pure-logic functions get unit tests; the UI does not.

```ts
// apps/web/src/lib/hub/manifest/pageFilters.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { filterPages, sortPages } from './pageFilters';
import { mockManifest } from './mockManifest';

const pages = mockManifest.pages;

test('filterPages: empty filters returns all', () => {
  assert.equal(filterPages(pages, { query: '', types: [], topicSlugs: [] }).length, pages.length);
});

test('filterPages: query matches title and summaryPlainText', () => {
  const r = filterPages(pages, { query: 'feynman', types: [], topicSlugs: [] });
  assert.ok(r.some((p) => p.slug === 'feynman-technique'));
});

test('filterPages: types restricts result set', () => {
  const r = filterPages(pages, { query: '', types: ['playbook'], topicSlugs: [] });
  assert.ok(r.length > 0);
  for (const p of r) assert.equal(p.type, 'playbook');
});

test('filterPages: topicSlugs restricts result set', () => {
  const r = filterPages(pages, { query: '', types: [], topicSlugs: ['learning'] });
  assert.ok(r.length > 0);
  for (const p of r) assert.ok(p.topicSlugs.includes('learning'));
});

test('sortPages: newest first by updatedAt', () => {
  const r = sortPages(pages, 'newest');
  for (let i = 1; i < r.length; i++) {
    assert.ok(new Date(r[i - 1]!.updatedAt) >= new Date(r[i]!.updatedAt));
  }
});

test('sortPages: most-cited first by citationCount', () => {
  const r = sortPages(pages, 'most-cited');
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i - 1]!.citationCount >= r[i]!.citationCount);
  }
});
```

- [ ] **Step 19.2: Implement pageFilters.ts**

```ts
// apps/web/src/lib/hub/manifest/pageFilters.ts
import type { Page } from './schema';

export type PageFilters = {
  query: string;
  types: ('lesson' | 'framework' | 'playbook')[];
  topicSlugs: string[];
};

export type PageSort = 'newest' | 'most-cited' | 'title';

export function filterPages(pages: Page[], f: PageFilters): Page[] {
  const q = f.query.trim().toLowerCase();
  return pages.filter((p) => {
    if (p.status !== 'published') return false;
    if (f.types.length > 0 && !f.types.includes(p.type)) return false;
    if (f.topicSlugs.length > 0 && !f.topicSlugs.some((s) => p.topicSlugs.includes(s))) return false;
    if (q.length > 0) {
      const hay = `${p.title} ${p.summaryPlainText} ${p.searchKeywords.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function sortPages(pages: Page[], sort: PageSort): Page[] {
  const copy = [...pages];
  switch (sort) {
    case 'newest':
      return copy.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    case 'most-cited':
      return copy.sort((a, b) => b.citationCount - a.citationCount);
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
  }
}
```

- [ ] **Step 19.3: Run tests**

Run: `cd apps/web && pnpm test --test-name-pattern "(filterPages|sortPages)"`. Expected: 6 PASS.

- [ ] **Step 19.4: Implement PageTable.tsx (client component, uses filters above)**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/PageTable.tsx
'use client';

import { useMemo, useState } from 'react';

import type { Page } from '@/lib/hub/manifest/schema';
import { filterPages, sortPages, type PageFilters, type PageSort } from '@/lib/hub/manifest/pageFilters';

import { PageRow } from './PageRow';

type Props = {
  pages: Page[];
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
  initialQuery?: string;
  /** When false, hide the type-filter chips (used on Topic Detail). */
  showTypeFilter?: boolean;
  /** Restrict to a single topic; chips for other topics are hidden. */
  lockedTopicSlug?: string;
};

const TYPE_OPTIONS = ['lesson', 'framework', 'playbook'] as const;

export function PageTable({
  pages, hubSlug, topicAccentBySlug = {},
  initialQuery = '', showTypeFilter = true, lockedTopicSlug,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [types, setTypes] = useState<typeof TYPE_OPTIONS[number][]>([]);
  const [sort, setSort] = useState<PageSort>('newest');

  const visible = useMemo(() => {
    const filters: PageFilters = {
      query, types,
      topicSlugs: lockedTopicSlug ? [lockedTopicSlug] : [],
    };
    return sortPages(filterPages(pages, filters), sort);
  }, [pages, query, types, lockedTopicSlug, sort]);

  return (
    <div className="rounded-[12px] border border-[#E5DECF] bg-white">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E5DECF] px-4 py-3">
        <input
          type="search" placeholder="Search pages…"
          value={query} onChange={(e) => setQuery(e.target.value)}
          className="h-8 flex-1 min-w-[200px] rounded-[8px] border border-[#E5DECF] px-3 text-[12px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:border-[#1A1612] focus:outline-none"
        />
        {showTypeFilter && (
          <div className="flex items-center gap-1">
            {TYPE_OPTIONS.map((t) => {
              const active = types.includes(t);
              return (
                <button key={t} type="button"
                  onClick={() => setTypes((cur) => active ? cur.filter((x) => x !== t) : [...cur, t])}
                  className={
                    'h-8 rounded-[8px] border px-3 text-[11px] font-medium capitalize ' +
                    (active
                      ? 'border-[#1A1612] bg-[#1A1612] text-[#F8F4EC]'
                      : 'border-[#E5DECF] text-[#3D352A] hover:border-[#D6CFC0]')
                  }
                >{t}</button>
              );
            })}
          </div>
        )}
        <select
          value={sort} onChange={(e) => setSort(e.target.value as PageSort)}
          className="h-8 rounded-[8px] border border-[#E5DECF] bg-white px-2 text-[11px] text-[#3D352A]"
        >
          <option value="newest">Newest</option>
          <option value="most-cited">Most cited</option>
          <option value="title">Title A→Z</option>
        </select>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_120px_120px_80px_100px] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">
        <span>Page</span><span>Type</span><span>Topics</span>
        <span className="text-right">Length</span><span className="text-right">Updated</span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[#E5DECF]">
        {visible.length === 0 && (
          <div className="px-4 py-8 text-center text-[12px] text-[#9A8E7C]">No pages match.</div>
        )}
        {visible.map((p) => (
          <PageRow key={p.id} page={p} hubSlug={hubSlug} topicAccentBySlug={topicAccentBySlug} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 19.5: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/lib/hub/manifest/pageFilters.ts apps/web/src/lib/hub/manifest/pageFilters.test.ts apps/web/src/components/hub/EditorialAtlas/blocks/PageTable.tsx
git commit -m "feat(hub): PageTable with search, type filter, sort"
```

---

### Task 20: SectionRenderer + 13 section components

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/SectionRenderer.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/sections/{Overview,WhyItWorks,Steps,CommonMistakes,AhaMoments,Principles,Scenes,Workflow,FailurePoints,Callout,Paragraph,List,Quote}Section.tsx` (13 files)

- [ ] **Step 20.1: Implement the section components (one file per kind)**

Each section component takes the matching variant of the `PageSection` discriminated union plus an optional `citationsById` map (for rendering "Supported by" footers). Pattern:

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/sections/OverviewSection.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';
import { SectionCitationFooter } from './_SectionCitationFooter';

type Props = {
  section: Extract<PageSection, { kind: 'overview' }>;
  citationsById?: Record<string, Citation>;
};

export function OverviewSection({ section, citationsById }: Props) {
  return (
    <section className="space-y-3">
      <h2 className="text-[18px] font-semibold tracking-[-0.01em] text-[#1A1612]">Overview</h2>
      <p className="text-[14px] leading-[1.6] text-[#3D352A]">{section.body}</p>
      <SectionCitationFooter citationIds={section.citationIds} citationsById={citationsById} />
    </section>
  );
}
```

Apply the same shape to the other 12 kinds. Section-specific layouts:

- **WhyItWorksSection** — `body` paragraph + bullet `points` if present.
- **StepsSection** — numbered list of `items: { title, body }[]` with serif-numeral leading numbers (use `[font-feature-settings:'tnum']`).
- **CommonMistakesSection** — `items` as a 2-column grid of titled cards with a warn-toned border tint.
- **AhaMomentsSection** — `items` as pull-quote blocks with attribution.
- **PrinciplesSection** — `items` as 3-column grid of icon + title + body.
- **ScenesSection** — `items` as numbered cards, similar to steps but lighter.
- **WorkflowSection** — `schedule` rendered as a table: day rows × items (one bullet list per day).
- **FailurePointsSection** — `items` as a 2-column grid with rose-toned border.
- **CalloutSection** — single panel with `tone`-based wash (note=blue, warn=amber, success=sage).
- **ParagraphSection** — single paragraph, no header.
- **ListSection** — `<ul>` or `<ol>` based on `ordered`.
- **QuoteSection** — large pull-quote with attribution; if `sourceVideoId` + `timestampStart` present, renders a "Watch at hh:mm" link via `formatTimestampLabel`.

The `_SectionCitationFooter.tsx` helper:

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/sections/_SectionCitationFooter.tsx
import type { Citation } from '@/lib/hub/manifest/schema';

type Props = {
  citationIds?: string[];
  citationsById?: Record<string, Citation>;
};

export function SectionCitationFooter({ citationIds, citationsById }: Props) {
  if (!citationIds?.length || !citationsById) return null;
  const cited = citationIds.map((id) => citationsById[id]).filter(Boolean) as Citation[];
  if (cited.length === 0) return null;
  return (
    <p className="mt-2 text-[11px] text-[#9A8E7C]">
      Supported by {cited.length} {cited.length === 1 ? 'source' : 'sources'} · {cited.map((c) => c.videoTitle).join(' · ')}
    </p>
  );
}
```

- [ ] **Step 20.2: Implement SectionRenderer.tsx (the dispatcher)**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/SectionRenderer.tsx
import type { PageSection, Citation } from '@/lib/hub/manifest/schema';

import { OverviewSection } from './sections/OverviewSection';
import { WhyItWorksSection } from './sections/WhyItWorksSection';
import { StepsSection } from './sections/StepsSection';
import { CommonMistakesSection } from './sections/CommonMistakesSection';
import { AhaMomentsSection } from './sections/AhaMomentsSection';
import { PrinciplesSection } from './sections/PrinciplesSection';
import { ScenesSection } from './sections/ScenesSection';
import { WorkflowSection } from './sections/WorkflowSection';
import { FailurePointsSection } from './sections/FailurePointsSection';
import { CalloutSection } from './sections/CalloutSection';
import { ParagraphSection } from './sections/ParagraphSection';
import { ListSection } from './sections/ListSection';
import { QuoteSection } from './sections/QuoteSection';

type Props = {
  section: PageSection;
  citationsById?: Record<string, Citation>;
};

export function SectionRenderer({ section, citationsById }: Props) {
  switch (section.kind) {
    case 'overview':        return <OverviewSection        section={section} citationsById={citationsById} />;
    case 'why_it_works':    return <WhyItWorksSection      section={section} citationsById={citationsById} />;
    case 'steps':           return <StepsSection           section={section} citationsById={citationsById} />;
    case 'common_mistakes': return <CommonMistakesSection  section={section} citationsById={citationsById} />;
    case 'aha_moments':     return <AhaMomentsSection      section={section} citationsById={citationsById} />;
    case 'principles':      return <PrinciplesSection      section={section} citationsById={citationsById} />;
    case 'scenes':          return <ScenesSection          section={section} citationsById={citationsById} />;
    case 'workflow':        return <WorkflowSection        section={section} citationsById={citationsById} />;
    case 'failure_points':  return <FailurePointsSection   section={section} citationsById={citationsById} />;
    case 'callout':         return <CalloutSection         section={section} citationsById={citationsById} />;
    case 'paragraph':       return <ParagraphSection       section={section} citationsById={citationsById} />;
    case 'list':            return <ListSection            section={section} citationsById={citationsById} />;
    case 'quote':           return <QuoteSection           section={section} citationsById={citationsById} />;
    default: {
      const _exhaustive: never = section;
      void _exhaustive;
      return null;
    }
  }
}
```

- [ ] **Step 20.3: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/blocks/
git commit -m "feat(hub): SectionRenderer + 13 section components"
```

---

### Task 21: TopicCard + TopicGrid

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/TopicCard.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/TopicGrid.tsx`

- [ ] **Step 21.1: Implement TopicCard**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/TopicCard.tsx
import Link from 'next/link';

import type { Topic } from '@/lib/hub/manifest/schema';
import { palette } from '../tokens';
import { resolveAccentColor } from '@/lib/hub/manifest/empty-state';
import { getTopicRoute } from '@/lib/hub/routes';

type Props = { topic: Topic; hubSlug: string };

export function TopicCard({ topic, hubSlug }: Props) {
  const c = palette.accent[resolveAccentColor(topic.accentColor)];
  return (
    <Link
      href={getTopicRoute(hubSlug, topic.slug)}
      className="group block rounded-[12px] border border-[#E5DECF] bg-white p-5 transition-all hover:-translate-y-px hover:border-[#D6CFC0] hover:shadow-[0_4px_16px_rgba(26,22,18,0.06)]"
    >
      <span
        aria-hidden
        className="grid size-9 place-items-center rounded-[8px]"
        style={{ backgroundColor: c.wash, color: c.fg }}
      >
        {/* Inline placeholder icon — Phase 3 wires Lucide via iconKey lookup. */}
        <span className="size-3 rounded-full bg-current" />
      </span>
      <h3 className="mt-4 text-[15px] font-semibold tracking-[-0.01em] text-[#1A1612]">{topic.title}</h3>
      <p className="mt-1.5 text-[13px] leading-[1.5] text-[#6B5F50] line-clamp-2">{topic.description}</p>
      <p className="mt-3 text-[11px] text-[#9A8E7C]">{topic.pageCount} {topic.pageCount === 1 ? 'page' : 'pages'}</p>
    </Link>
  );
}
```

- [ ] **Step 21.2: Implement TopicGrid**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/TopicGrid.tsx
import type { Topic } from '@/lib/hub/manifest/schema';
import { TopicCard } from './TopicCard';

type Props = { topics: Topic[]; hubSlug: string; columns?: 2 | 3 | 4 };

export function TopicGrid({ topics, hubSlug, columns = 3 }: Props) {
  const colCls = columns === 4 ? 'lg:grid-cols-4' : columns === 2 ? 'sm:grid-cols-2' : 'lg:grid-cols-3 sm:grid-cols-2';
  return (
    <div className={`grid gap-3 ${colCls}`}>
      {topics.map((t) => <TopicCard key={t.id} topic={t} hubSlug={hubSlug} />)}
    </div>
  );
}
```

- [ ] **Step 21.3: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/blocks/
git commit -m "feat(hub): TopicCard + TopicGrid"
```

---

### Task 22: Real Hub Home (Surface 1)

**Files:**
- Modify: `apps/web/src/app/h/[hubSlug]/page.tsx` (replace the Phase 1 stub)

- [ ] **Step 22.1: Replace the Phase 1 stub with the real Hub Home**

```tsx
// apps/web/src/app/h/[hubSlug]/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { PageCard } from '@/components/hub/EditorialAtlas/blocks/PageCard';
import { TopicGrid } from '@/components/hub/EditorialAtlas/blocks/TopicGrid';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getHubRoute, getPagesRoute, getTopicsRoute, getStartRoute, getAskRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return {
    title: mockManifest.title,
    description: mockManifest.tagline,
    alternates: { canonical: getHubRoute(params.hubSlug) },
  };
}

export default function HubHomePage({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) {
    return <div className="min-h-screen bg-[#F8F4EC] p-8 text-[#1A1612]">Hub not found.</div>;
  }

  const m = mockManifest;
  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const startHerePages   = m.pages.filter((p) => p.evidenceQuality === 'strong').slice(0, 3);
  const exploreByTopic   = m.topics.slice(0, 6);
  const allPagesPreview  = [...m.pages].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt)).slice(0, 5);

  return (
    <HubShell manifest={m} activePathname={getHubRoute(params.hubSlug)}>
      {/* Hero */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Reference hub</p>
      <div className="mt-3 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.025em]">{m.title}</h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-[#3D352A]">{m.tagline}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link href={getStartRoute(params.hubSlug)} className="inline-flex h-10 items-center rounded-[10px] bg-[#1A1612] px-4 text-[13px] font-semibold text-[#F8F4EC] hover:opacity-90">Start here</Link>
            <Link href={getTopicsRoute(params.hubSlug)} className="inline-flex h-10 items-center rounded-[10px] border border-[#D6CFC0] bg-white px-4 text-[13px] font-semibold text-[#1A1612] hover:border-[#1A1612]">Explore by topic</Link>
          </div>
        </div>
        <div className="text-[#3D352A]">
          <LineIllustration illustrationKey="open-notebook" className="h-[160px] w-[240px]" />
        </div>
      </div>

      {/* Compact ask box (links to /ask — does NOT run inline per spec § 6.1) */}
      <form action={getAskRoute(params.hubSlug)} method="get" className="mt-8 flex items-center gap-2 rounded-[12px] border border-[#E5DECF] bg-white p-2 pl-4">
        <span aria-hidden className="text-[#9A8E7C]">✦</span>
        <input
          type="text" name="q" placeholder="Ask this hub a question…"
          className="flex-1 bg-transparent text-[13px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:outline-none"
        />
        <button type="submit" className="inline-flex h-9 items-center rounded-[8px] bg-[#1A1612] px-3 text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90">
          Ask →
        </button>
      </form>

      {/* Stats strip */}
      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-6 border-y border-[#E5DECF] py-6 sm:grid-cols-5">
        <Stat label="Videos"           value={m.stats.videoCount.toLocaleString()} />
        <Stat label="Sources"          value={m.stats.sourceCount.toLocaleString()} />
        <Stat label="With transcripts" value={`${Math.round(m.stats.transcriptPercent * 100)}%`} />
        <Stat label="Years of archive" value={`${m.stats.archiveYears} yrs`} />
        <Stat label="Pages"            value={m.stats.pageCount.toLocaleString()} />
      </dl>

      {/* Start here */}
      <section className="mt-12">
        <SectionHeader title="Start here" linkLabel="View start guide →" linkHref={getStartRoute(params.hubSlug)} />
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {startHerePages.map((p) => (
            <PageCard key={p.id} page={p} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
          ))}
        </div>
      </section>

      {/* Explore by topic */}
      <section className="mt-12">
        <SectionHeader title="Explore by topic" linkLabel="All topics →" linkHref={getTopicsRoute(params.hubSlug)} />
        <div className="mt-4">
          <TopicGrid topics={exploreByTopic} hubSlug={params.hubSlug} columns={3} />
        </div>
      </section>

      {/* All pages preview */}
      <section className="mt-12">
        <SectionHeader title="All pages" linkLabel={`View all ${m.pages.length} pages →`} linkHref={getPagesRoute(params.hubSlug)} />
        <ul className="mt-4 divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
          {allPagesPreview.map((p) => (
            <li key={p.id}>
              <Link href={`/h/${params.hubSlug}/pages/${p.slug}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#FAF6EE]">
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[#1A1612]">{p.title}</span>
                  <span className="block truncate text-[11px] text-[#9A8E7C]">{p.summary}</span>
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-[0.1em] text-[#9A8E7C]">{p.type}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </HubShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">{label}</dt>
      <dd className="mt-1 text-[28px] font-semibold leading-none tracking-[-0.015em] text-[#1A1612] [font-feature-settings:'tnum']">{value}</dd>
    </div>
  );
}

function SectionHeader({ title, linkLabel, linkHref }: { title: string; linkLabel: string; linkHref: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <h2 className="text-[20px] font-semibold tracking-[-0.015em]">{title}</h2>
      <Link href={linkHref} className="text-[12px] font-semibold text-[#1A1612] hover:underline">{linkLabel}</Link>
    </div>
  );
}
```

- [ ] **Step 22.2: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/page.tsx
git commit -m "feat(hub): real Hub Home with hero, ask box, stats, sections"
```

---

### Task 23: Lesson Page (Surface 6)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/pages/[pageSlug]/page.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/RelatedPages.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/SourceRail.tsx`

- [ ] **Step 23.1: Implement RelatedPages**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/RelatedPages.tsx
import type { Page } from '@/lib/hub/manifest/schema';
import { PageCard } from './PageCard';

type Props = {
  pages: Page[];
  hubSlug: string;
  topicAccentBySlug?: Record<string, string>;
  layout?: 'grid' | 'rail';
};

export function RelatedPages({ pages, hubSlug, topicAccentBySlug, layout = 'grid' }: Props) {
  if (pages.length === 0) return null;
  return (
    <section>
      <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">Related pages</h2>
      <div className={layout === 'rail' ? 'mt-3 space-y-2' : 'mt-3 grid gap-3 md:grid-cols-3'}>
        {pages.map((p) => <PageCard key={p.id} page={p} hubSlug={hubSlug} topicAccentBySlug={topicAccentBySlug} />)}
      </div>
    </section>
  );
}
```

- [ ] **Step 23.2: Implement SourceRail**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/SourceRail.tsx
import type { Citation, SourceVideo } from '@/lib/hub/manifest/schema';
import { citationUrl, formatTimestampLabel } from '@/lib/hub/manifest/empty-state';

type Props = { citations: Citation[]; sourcesById: Record<string, SourceVideo> };

export function SourceRail({ citations, sourcesById }: Props) {
  if (citations.length === 0) {
    return (
      <section className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Evidence &amp; sources</h2>
        <p className="mt-2 text-[12px] text-[#6B5F50]">No sources cited yet.</p>
      </section>
    );
  }
  return (
    <section className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Evidence &amp; sources</h2>
      <ol className="mt-3 space-y-3">
        {citations.map((c) => {
          const v = sourcesById[c.sourceVideoId];
          if (!v) return null;
          const url = citationUrl(c, v);
          return (
            <li key={c.id}>
              <a href={url} target="_blank" rel="noreferrer" className="block hover:bg-[#FAF6EE] -mx-2 px-2 py-1.5 rounded-[8px]">
                <p className="text-[12px] font-medium text-[#1A1612] line-clamp-2">{c.videoTitle}</p>
                <p className="mt-0.5 text-[11px] text-[#9A8E7C]">
                  Open at {c.timestampLabel || formatTimestampLabel(c.timestampStart)}
                </p>
                <p className="mt-1 text-[11px] italic leading-[1.5] text-[#6B5F50] line-clamp-2">"{c.excerpt}"</p>
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
```

- [ ] **Step 23.3: Implement the Lesson/Framework/Playbook page**

This single route file handles all three page types — layout switches on `page.type`.

```tsx
// apps/web/src/app/h/[hubSlug]/pages/[pageSlug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { MetaTagPill } from '@/components/hub/EditorialAtlas/blocks/MetaTagPill';
import { EvidenceQualityBadge } from '@/components/hub/EditorialAtlas/blocks/EvidenceQualityBadge';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { SectionRenderer } from '@/components/hub/EditorialAtlas/blocks/SectionRenderer';
import { RelatedPages } from '@/components/hub/EditorialAtlas/blocks/RelatedPages';
import { SourceRail } from '@/components/hub/EditorialAtlas/blocks/SourceRail';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getHubRoute, getPageRoute, getPagesRoute, getTopicRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; pageSlug: string } }): Promise<Metadata> {
  const page = mockManifest.pages.find((p) => p.slug === params.pageSlug && p.status === 'published');
  if (!page || params.hubSlug !== mockManifest.hubSlug) return { title: 'Page not found' };
  return {
    title: `${page.title} — ${mockManifest.title}`,
    description: page.summaryPlainText,
    alternates: { canonical: getPageRoute(params.hubSlug, page.slug) },
  };
}

export default function HubPageDetail({ params }: { params: { hubSlug: string; pageSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const page = m.pages.find((p) => p.slug === params.pageSlug && p.status === 'published');
  if (!page) notFound();

  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const sourcesById = Object.fromEntries(m.sources.map((s) => [s.id, s]));
  const citationsById = Object.fromEntries(page.citations.map((c) => [c.id, c]));
  const related = m.pages.filter((p) => page.relatedPageIds.includes(p.id) && p.status === 'published');
  const primaryTopic = m.topics.find((t) => t.slug === page.topicSlugs[0]);

  return (
    <HubShell
      manifest={m}
      activePathname={getPageRoute(params.hubSlug, page.slug)}
      rightRail={<SourceRail citations={page.citations} sourcesById={sourcesById} />}
    >
      <Breadcrumb crumbs={[
        { label: 'All pages', href: getPagesRoute(params.hubSlug) },
        ...(primaryTopic ? [{ label: primaryTopic.title, href: getTopicRoute(params.hubSlug, primaryTopic.slug) }] : []),
        { label: page.title },
      ]} />

      <div className="mt-3 flex items-center gap-2">
        <MetaTagPill accent={primaryTopic?.accentColor}>{page.type}</MetaTagPill>
        <EvidenceQualityBadge quality={page.evidenceQuality} />
      </div>

      <div className="mt-4 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[36px] font-semibold leading-[1.08] tracking-[-0.02em] text-[#1A1612]">{page.title}</h1>
          <p className="mt-3 text-[15px] leading-[1.55] text-[#3D352A]">{page.summary}</p>
          <p className="mt-3 text-[11px] text-[#9A8E7C]">
            {page.estimatedReadMinutes} min read · {page.citationCount} citations · Updated {new Date(page.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
            {page.reviewedBy ? ` · Reviewed by ${page.reviewedBy}` : ''}
          </p>
        </div>
        {page.hero?.illustrationKey && (
          <div className="text-[#3D352A]">
            <LineIllustration illustrationKey={page.hero.illustrationKey} className="h-[140px] w-[200px]" />
          </div>
        )}
      </div>

      <div className="mt-10 space-y-10">
        {page.sections.map((s, i) => (
          <SectionRenderer key={i} section={s} citationsById={citationsById} />
        ))}
      </div>

      {related.length > 0 && (
        <div className="mt-16 border-t border-[#E5DECF] pt-10">
          <RelatedPages pages={related} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
        </div>
      )}
    </HubShell>
  );
}
```

- [ ] **Step 23.4: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/blocks/RelatedPages.tsx apps/web/src/components/hub/EditorialAtlas/blocks/SourceRail.tsx apps/web/src/app/h/[hubSlug]/pages/
git commit -m "feat(hub): Lesson page with sections + right-rail source list"
```

---

### Task 24: All Pages Index (Surface 5)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/pages/page.tsx`

- [ ] **Step 24.1: Implement All Pages Index**

```tsx
// apps/web/src/app/h/[hubSlug]/pages/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { PageTable } from '@/components/hub/EditorialAtlas/blocks/PageTable';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getPagesRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return {
    title: `All pages — ${mockManifest.title}`,
    description: `${mockManifest.pages.length} source-grounded pages across the ${mockManifest.title}.`,
    alternates: { canonical: getPagesRoute(params.hubSlug) },
  };
}

export default function AllPagesIndex({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const published = m.pages.filter((p) => p.status === 'published');

  return (
    <HubShell manifest={m} activePathname={getPagesRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Reference hub</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">All pages</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Browse the entire archive of lessons, frameworks, and systems — every page source-backed and designed to help you learn, build, and decide.
      </p>
      <div className="mt-8">
        <PageTable pages={published} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
      </div>
    </HubShell>
  );
}
```

- [ ] **Step 24.2: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/pages/page.tsx
git commit -m "feat(hub): All Pages Index"
```

---

## Phase 3 — Topics + specialized pages

### Task 25: Topics Index (Surface 3)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/topics/page.tsx`

- [ ] **Step 25.1: Implement Topics Index**

```tsx
// apps/web/src/app/h/[hubSlug]/topics/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { TopicGrid } from '@/components/hub/EditorialAtlas/blocks/TopicGrid';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getTopicsRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Topics — ${mockManifest.title}`, alternates: { canonical: getTopicsRoute(params.hubSlug) } };
}

export default function TopicsIndex({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  return (
    <HubShell manifest={m} activePathname={getTopicsRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Topics</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Explore by topic</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Browse ideas and pages by theme. Each topic brings together related lessons, frameworks, and playbooks to help you learn, apply, and create.
      </p>
      <div className="mt-8">
        <TopicGrid topics={m.topics} hubSlug={params.hubSlug} columns={3} />
      </div>
    </HubShell>
  );
}
```

- [ ] **Step 25.2: Commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/topics/page.tsx
git commit -m "feat(hub): Topics Index"
```

---

### Task 26: Topic Detail (Surface 4)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/topics/[topicSlug]/page.tsx`

- [ ] **Step 26.1: Implement Topic Detail**

Reuses `PageTable` with `lockedTopicSlug` and `showTypeFilter={true}`.

```tsx
// apps/web/src/app/h/[hubSlug]/topics/[topicSlug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { PageTable } from '@/components/hub/EditorialAtlas/blocks/PageTable';
import { TopicCard } from '@/components/hub/EditorialAtlas/blocks/TopicCard';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getTopicRoute, getTopicsRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; topicSlug: string } }): Promise<Metadata> {
  const topic = mockManifest.topics.find((t) => t.slug === params.topicSlug);
  if (!topic || params.hubSlug !== mockManifest.hubSlug) return { title: 'Topic not found' };
  return {
    title: `${topic.title} — ${mockManifest.title}`,
    description: topic.description,
    alternates: { canonical: getTopicRoute(params.hubSlug, topic.slug) },
  };
}

export default function TopicDetail({ params }: { params: { hubSlug: string; topicSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const topic = m.topics.find((t) => t.slug === params.topicSlug);
  if (!topic) notFound();

  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));
  const topicPages = m.pages.filter((p) => p.topicSlugs.includes(topic.slug) && p.status === 'published');
  const startWithThese = topicPages.filter((p) => p.evidenceQuality === 'strong').slice(0, 3);
  const relatedTopics = m.topics.filter((t) => t.slug !== topic.slug).slice(0, 3);

  return (
    <HubShell
      manifest={m}
      activePathname={getTopicRoute(params.hubSlug, topic.slug)}
      rightRail={
        <div className="space-y-6">
          <section>
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Related topics</h2>
            <div className="mt-3 space-y-2">
              {relatedTopics.map((rt) => <TopicCard key={rt.id} topic={rt} hubSlug={params.hubSlug} />)}
            </div>
          </section>
        </div>
      }
    >
      <Breadcrumb crumbs={[{ label: 'Topics', href: getTopicsRoute(params.hubSlug) }, { label: topic.title }]} />
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">{topic.title}</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">{topic.description}</p>

      {startWithThese.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Start with these</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {startWithThese.map((p) => (
              <PageCard key={p.id} page={p} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
            ))}
          </div>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">All pages in {topic.title}</h2>
        <div className="mt-3">
          <PageTable
            pages={topicPages} hubSlug={params.hubSlug}
            topicAccentBySlug={topicAccentBySlug} lockedTopicSlug={topic.slug}
          />
        </div>
      </section>
    </HubShell>
  );
}

import { PageCard } from '@/components/hub/EditorialAtlas/blocks/PageCard';
```

- [ ] **Step 26.2: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/topics/
git commit -m "feat(hub): Topic Detail with start-with-these and filtered table"
```

---

### Task 27: Framework page variant (Surface 7)

**Files:** none new — Surfaces 6/7/8 share the same route file `pages/[pageSlug]/page.tsx` from Task 23. The renderer already switches on `page.type`. Verify mock data covers all three types.

- [ ] **Step 27.1: Smoke-test framework rendering**

Start dev server: `cd apps/web && pnpm dev`. Visit:
- `/h/ali-abdaal/pages/eisenhower-matrix` (`type === 'framework'`) — should render with framework hero, principles section, common-mistakes, callout.
- `/h/ali-abdaal/pages/compound-hobbies` — same.
- `/h/ali-abdaal/pages/energy-management` — same.
- `/h/ali-abdaal/pages/frameworks-vs-routines` — same.

Confirm each renders with the framework `MetaTagPill`, all sections layout cleanly, citations show in the right rail. If a section type fails, fix the corresponding section component from Task 20.

- [ ] **Step 27.2: Commit any fixes**

```bash
git add -p
git commit -m "fix(hub): framework page section layout adjustments"
```

---

### Task 28: Playbook page variant (Surface 8)

**Files:** none new — same route file. The playbook-specific section kinds (`principles`, `scenes`, `workflow`, `failure_points`) were implemented in Task 20.

- [ ] **Step 28.1: Smoke-test playbook rendering**

Visit:
- `/h/ali-abdaal/pages/productivity-operating-system` — exercises `principles` + `scenes` + `workflow` + `failure_points`.
- `/h/ali-abdaal/pages/how-i-plan-my-week` — exercises `scenes` + `workflow` + `common_mistakes`.
- `/h/ali-abdaal/pages/second-brain` — exercises `principles` + `scenes` + `failure_points`.
- `/h/ali-abdaal/pages/my-youtube-process` — exercises `scenes` + `workflow` + `failure_points` + `callout`.

Each should render the workflow as a day-by-day table, principles as a 3-up icon grid, scenes as numbered cards, failure_points as a 2-col grid with rose-toned border.

- [ ] **Step 28.2: Commit any fixes**

```bash
git add -p
git commit -m "fix(hub): playbook section adjustments"
```

---

### Task 29: Start Here (Surface 2)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/start/page.tsx`

- [ ] **Step 29.1: Implement Start Here**

```tsx
// apps/web/src/app/h/[hubSlug]/start/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { PageCard } from '@/components/hub/EditorialAtlas/blocks/PageCard';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getPageRoute, getStartRoute, getTopicRoute, getTopicsRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Start here — ${mockManifest.title}`, alternates: { canonical: getStartRoute(params.hubSlug) } };
}

export default function StartHere({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));

  // Three "paths" curated from the published pages.
  const beginnerPath = m.pages.filter((p) => p.type === 'lesson' && p.evidenceQuality === 'strong').slice(0, 3);
  const builderPath  = m.pages.filter((p) => p.type === 'framework' && p.status === 'published').slice(0, 3);
  const deepPath     = m.pages.filter((p) => p.type === 'playbook' && p.status === 'published').slice(0, 3);

  return (
    <HubShell manifest={m} activePathname={getStartRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Start here</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">New to the hub?</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Three paths into the archive — pick the one that matches how you want to use it. Each path is three pages long and source-backed end to end.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <Path title="Beginner path" body="Start with the most-cited foundational lessons." pages={beginnerPath} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
        <Path title="Builder path"  body="Frameworks you can apply to your own work this week." pages={builderPath} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
        <Path title="Deep dive"      body="Full systems you can adopt end to end."                pages={deepPath}     hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} />
      </div>

      <section className="mt-12 rounded-[12px] border border-[#E5DECF] bg-white p-6">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">How to know where to start</h2>
        <p className="mt-2 text-[13px] leading-[1.55] text-[#3D352A]">
          If you want a foundation, start with the lessons. If you have a problem this week, start with a framework.
          If you want to overhaul a habit or workflow, start with a playbook. You can always switch — pages link to each other.
        </p>
        <Link href={getTopicsRoute(params.hubSlug)} className="mt-3 inline-flex text-[13px] font-semibold text-[#1A1612] hover:underline">
          Or browse by topic →
        </Link>
      </section>
    </HubShell>
  );
}

function Path({ title, body, pages, hubSlug, topicAccentBySlug }: {
  title: string; body: string; pages: typeof mockManifest.pages;
  hubSlug: string; topicAccentBySlug: Record<string, string>;
}) {
  return (
    <section className="rounded-[12px] border border-[#E5DECF] bg-white p-5">
      <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-[#1A1612]">{title}</h2>
      <p className="mt-1 text-[13px] leading-[1.55] text-[#6B5F50]">{body}</p>
      <ol className="mt-4 space-y-2">
        {pages.map((p, i) => (
          <li key={p.id}>
            <Link href={getPageRoute(hubSlug, p.slug)} className="flex items-center gap-3 rounded-[8px] border border-transparent px-2 py-1.5 hover:border-[#E5DECF] hover:bg-[#FAF6EE]">
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#F2EBDA] text-[10px] font-semibold text-[#3D352A] [font-feature-settings:'tnum']">{i + 1}</span>
              <span className="min-w-0 truncate text-[13px] font-medium text-[#1A1612]">{p.title}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
```

- [ ] **Step 29.2: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/start/page.tsx
git commit -m "feat(hub): Start Here with three curated paths"
```

---

### Task 30: Phase 3 visual smoke

**Files:** none

- [ ] **Step 30.1: Smoke-test all Phase 3 surfaces**

Run dev server, visit:
- `/h/ali-abdaal/start`
- `/h/ali-abdaal/topics`
- `/h/ali-abdaal/topics/productivity` (and 2 other topic slugs)

Confirm chrome + content render cleanly, navigation between pages works, breadcrumbs are correct, type filters and search on the page tables behave.

If any layouts feel cramped/loose, adjust the `max-w` and `gap` values in the page files.

```bash
git add -p
git commit -m "fix(hub): Phase 3 layout polish"
```

---

## Phase 4 — Sources

### Task 31: SourceCard + SourceRow + CitationBlock

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/SourceCard.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/SourceRow.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/CitationBlock.tsx`

- [ ] **Step 31.1: Implement SourceCard**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/SourceCard.tsx
import Link from 'next/link';
import Image from 'next/image';

import type { SourceVideo } from '@/lib/hub/manifest/schema';
import { getSourceRoute } from '@/lib/hub/routes';
import { MetaTagPill } from './MetaTagPill';

type Props = { source: SourceVideo; hubSlug: string };

export function SourceCard({ source, hubSlug }: Props) {
  return (
    <Link
      href={getSourceRoute(hubSlug, source.id)}
      className="group block rounded-[12px] border border-[#E5DECF] bg-white p-3 transition-all hover:border-[#D6CFC0]"
    >
      <div className="aspect-video overflow-hidden rounded-[8px] bg-[#F2EBDA]">
        <Image src={source.thumbnailUrl} alt="" width={320} height={180} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <h3 className="mt-3 text-[13px] font-medium leading-[1.35] text-[#1A1612] line-clamp-2">{source.title}</h3>
      <div className="mt-2 flex items-center gap-2 text-[10px] text-[#9A8E7C]">
        <span>{Math.floor(source.durationSec / 60)} min</span>
        <span aria-hidden>·</span>
        <MetaTagPill size="xs" accent={source.transcriptStatus === 'available' ? 'sage' : source.transcriptStatus === 'partial' ? 'amber' : 'slate'}>
          {source.transcriptStatus === 'available' ? 'Transcript' : source.transcriptStatus === 'partial' ? 'Partial' : 'No transcript'}
        </MetaTagPill>
      </div>
    </Link>
  );
}
```

- [ ] **Step 31.2: Implement SourceRow**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/SourceRow.tsx
import Link from 'next/link';
import Image from 'next/image';

import type { SourceVideo } from '@/lib/hub/manifest/schema';
import { getSourceRoute } from '@/lib/hub/routes';

type Props = { source: SourceVideo; hubSlug: string };

export function SourceRow({ source, hubSlug }: Props) {
  return (
    <Link
      href={getSourceRoute(hubSlug, source.id)}
      className="grid grid-cols-[80px_1fr_120px_100px] items-center gap-4 px-4 py-3 hover:bg-[#FAF6EE]"
    >
      <div className="aspect-video overflow-hidden rounded-[6px] bg-[#F2EBDA]">
        <Image src={source.thumbnailUrl} alt="" width={80} height={45} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[#1A1612]">{source.title}</p>
        <p className="text-[11px] text-[#9A8E7C]">
          {source.channelName} · {Math.floor(source.durationSec / 60)} min · {source.citedPageIds.length} pages cite
        </p>
      </div>
      <span className="text-[11px] text-[#6B5F50]">
        {source.transcriptStatus === 'available' ? 'Transcript' : source.transcriptStatus === 'partial' ? 'Partial' : 'No transcript'}
      </span>
      <span className="text-right text-[11px] tabular-nums text-[#9A8E7C]">
        {new Date(source.publishedAt).toLocaleDateString('en', { month: 'short', year: 'numeric' })}
      </span>
    </Link>
  );
}
```

- [ ] **Step 31.3: Implement CitationBlock (full inline citation)**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/CitationBlock.tsx
import type { Citation, SourceVideo } from '@/lib/hub/manifest/schema';
import { citationUrl, formatTimestampLabel } from '@/lib/hub/manifest/empty-state';

type Props = {
  citation: Citation;
  source: SourceVideo;
  variant?: 'inline' | 'card';
};

export function CitationBlock({ citation, source, variant = 'card' }: Props) {
  const url = citationUrl(citation, source);
  const label = citation.timestampLabel || formatTimestampLabel(citation.timestampStart);

  if (variant === 'inline') {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="text-[12px] font-medium text-[#1A1612] underline underline-offset-2 hover:no-underline">
        {citation.videoTitle} · {label}
      </a>
    );
  }
  return (
    <a
      href={url} target="_blank" rel="noreferrer"
      className="block rounded-[10px] border border-[#E5DECF] bg-white p-3 transition-colors hover:border-[#D6CFC0] hover:bg-[#FAF6EE]"
    >
      <p className="text-[12px] font-semibold text-[#1A1612] line-clamp-2">{citation.videoTitle}</p>
      <p className="mt-1 text-[11px] text-[#9A8E7C]">Watch at {label}</p>
      <p className="mt-2 text-[12px] italic leading-[1.5] text-[#3D352A] line-clamp-3">"{citation.excerpt}"</p>
    </a>
  );
}
```

- [ ] **Step 31.4: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/blocks/{SourceCard,SourceRow,CitationBlock}.tsx
git commit -m "feat(hub): SourceCard, SourceRow, CitationBlock"
```

---

### Task 32: Sources Library (Surface 9)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/sources/page.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/blocks/SourceTable.tsx`

- [ ] **Step 32.1: Implement SourceTable (mirrors PageTable shape)**

```tsx
// apps/web/src/components/hub/EditorialAtlas/blocks/SourceTable.tsx
'use client';

import { useMemo, useState } from 'react';
import type { SourceVideo } from '@/lib/hub/manifest/schema';
import { SourceRow } from './SourceRow';

type Props = { sources: SourceVideo[]; hubSlug: string };

const STATUS_OPTIONS = ['available', 'partial', 'unavailable'] as const;

export function SourceTable({ sources, hubSlug }: Props) {
  const [query, setQuery] = useState('');
  const [statuses, setStatuses] = useState<typeof STATUS_OPTIONS[number][]>([]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sources.filter((s) => {
      if (statuses.length > 0 && !statuses.includes(s.transcriptStatus)) return false;
      if (q && !`${s.title} ${s.channelName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sources, query, statuses]);

  return (
    <div className="rounded-[12px] border border-[#E5DECF] bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E5DECF] px-4 py-3">
        <input
          type="search" placeholder="Search videos…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="h-8 flex-1 min-w-[200px] rounded-[8px] border border-[#E5DECF] px-3 text-[12px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:border-[#1A1612] focus:outline-none"
        />
        {STATUS_OPTIONS.map((s) => {
          const active = statuses.includes(s);
          return (
            <button key={s} type="button"
              onClick={() => setStatuses((cur) => active ? cur.filter((x) => x !== s) : [...cur, s])}
              className={
                'h-8 rounded-[8px] border px-3 text-[11px] font-medium capitalize ' +
                (active ? 'border-[#1A1612] bg-[#1A1612] text-[#F8F4EC]' : 'border-[#E5DECF] text-[#3D352A] hover:border-[#D6CFC0]')
              }
            >{s}</button>
          );
        })}
      </div>
      <div className="grid grid-cols-[80px_1fr_120px_100px] gap-4 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">
        <span></span><span>Title</span><span>Transcript</span><span className="text-right">Published</span>
      </div>
      <div className="divide-y divide-[#E5DECF]">
        {visible.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-[#9A8E7C]">No sources match.</div>}
        {visible.map((s) => <SourceRow key={s.id} source={s} hubSlug={hubSlug} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 32.2: Implement Sources Library page**

```tsx
// apps/web/src/app/h/[hubSlug]/sources/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { SourceTable } from '@/components/hub/EditorialAtlas/blocks/SourceTable';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getSourcesRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Sources — ${mockManifest.title}`, alternates: { canonical: getSourcesRoute(params.hubSlug) } };
}

export default function SourcesLibrary({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  return (
    <HubShell manifest={m} activePathname={getSourcesRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Sources</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Videos &amp; source library</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Every video that grounds a page in this hub. Browse the full archive, see which pages cite each video, and open a source at the moment it's referenced.
      </p>
      <div className="mt-8">
        <SourceTable sources={m.sources} hubSlug={params.hubSlug} />
      </div>
    </HubShell>
  );
}
```

- [ ] **Step 32.3: Commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/blocks/SourceTable.tsx apps/web/src/app/h/[hubSlug]/sources/page.tsx
git commit -m "feat(hub): Sources Library + SourceTable"
```

---

### Task 33: Source Video Detail (Surface 10)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/sources/[videoId]/page.tsx`

- [ ] **Step 33.1: Implement Source Detail**

```tsx
// apps/web/src/app/h/[hubSlug]/sources/[videoId]/page.tsx
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { Breadcrumb } from '@/components/hub/EditorialAtlas/blocks/Breadcrumb';
import { MetaTagPill } from '@/components/hub/EditorialAtlas/blocks/MetaTagPill';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { formatTimestampLabel } from '@/lib/hub/manifest/empty-state';
import { getPageRoute, getSourceRoute, getSourcesRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string; videoId: string } }): Promise<Metadata> {
  const source = mockManifest.sources.find((s) => s.id === params.videoId);
  if (!source || params.hubSlug !== mockManifest.hubSlug) return { title: 'Source not found' };
  return {
    title: `${source.title} — ${mockManifest.title}`,
    alternates: { canonical: getSourceRoute(params.hubSlug, source.id) },
  };
}

export default function SourceDetail({ params }: { params: { hubSlug: string; videoId: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const source = m.sources.find((s) => s.id === params.videoId);
  if (!source) notFound();

  const youtubeWatch = `https://www.youtube.com/watch?v=${source.youtubeId}`;
  const citingPages = m.pages.filter((p) => source.citedPageIds.includes(p.id) && p.status === 'published');

  return (
    <HubShell
      manifest={m}
      activePathname={getSourceRoute(params.hubSlug, source.id)}
      rightRail={
        <section className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Source coverage</h2>
          <dl className="mt-3 space-y-2 text-[12px]">
            <Row label="Platform"          value="YouTube" />
            <Row label="Channel"           value={source.channelName} />
            <Row label="Published"         value={new Date(source.publishedAt).toLocaleDateString('en', { month: 'long', year: 'numeric' })} />
            <Row label="Duration"          value={`${Math.floor(source.durationSec / 60)} min`} />
            <Row label="Transcript"        value={source.transcriptStatus} />
            <Row label="Pages citing"      value={`${citingPages.length}`} />
            <Row label="Key moments"       value={`${source.keyMoments.length}`} />
          </dl>
          <a href={youtubeWatch} target="_blank" rel="noreferrer" className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[8px] bg-[#1A1612] text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90">
            Open on YouTube
          </a>
        </section>
      }
    >
      <Breadcrumb crumbs={[{ label: 'Sources', href: getSourcesRoute(params.hubSlug) }, { label: source.title }]} />
      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="aspect-video w-full max-w-[480px] overflow-hidden rounded-[12px] bg-[#F2EBDA]">
          <Image src={source.thumbnailUrl} alt="" width={480} height={270} className="h-full w-full object-cover" />
        </div>
        <div className="min-w-0">
          <MetaTagPill accent="slate">Video</MetaTagPill>
          <h1 className="mt-3 text-[28px] font-semibold tracking-[-0.015em] text-[#1A1612]">{source.title}</h1>
          <p className="mt-2 text-[12px] text-[#9A8E7C]">{source.channelName} · {Math.floor(source.durationSec / 60)} min</p>
        </div>
      </div>

      {/* Pages that cite this video */}
      {citingPages.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Pages that cite this video</h2>
          <ul className="mt-3 divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
            {citingPages.map((p) => (
              <li key={p.id}>
                <Link href={getPageRoute(params.hubSlug, p.slug)} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[#FAF6EE]">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[#1A1612]">{p.title}</span>
                    <span className="block truncate text-[11px] text-[#9A8E7C]">{p.summary}</span>
                  </span>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-[#9A8E7C]">{p.type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Key moments */}
      {source.keyMoments.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Key moments</h2>
          <ol className="mt-3 space-y-2">
            {source.keyMoments.map((m, i) => (
              <li key={i}>
                <a
                  href={`${youtubeWatch}&t=${m.timestampStart}s`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-3 rounded-[8px] border border-[#E5DECF] bg-white px-3 py-2 hover:border-[#D6CFC0]"
                >
                  <span className="size-9 shrink-0 rounded-[6px] bg-[#F2EBDA] grid place-items-center text-[11px] font-semibold tabular-nums text-[#3D352A]">
                    {formatTimestampLabel(m.timestampStart)}
                  </span>
                  <span className="text-[13px] font-medium text-[#1A1612]">{m.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Transcript excerpts */}
      {source.transcriptExcerpts.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Transcript excerpts</h2>
          <ul className="mt-3 space-y-3">
            {source.transcriptExcerpts.map((e, i) => (
              <li key={i} className="rounded-[10px] border border-[#E5DECF] bg-white p-4">
                <p className="text-[11px] tabular-nums text-[#9A8E7C]">{formatTimestampLabel(e.timestampStart)}</p>
                <p className="mt-1 text-[13px] italic leading-[1.55] text-[#3D352A]">"{e.body}"</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </HubShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#9A8E7C]">{label}</dt>
      <dd className="text-right text-[#3D352A] truncate">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 33.2: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/sources/
git commit -m "feat(hub): Source Detail with key moments + transcript excerpts"
```

---

### Task 34: Phase 4 visual smoke

- [ ] **Step 34.1: Smoke-test sources surfaces**

Visit `/h/ali-abdaal/sources` and click through to 2 source detail pages. Verify thumbnails, key moments timeline, transcript excerpts, "open at timestamp" links work (open YouTube at the right time).

```bash
git add -p
git commit -m "fix(hub): Phase 4 polish"
```

---

## Phase 5 — Discovery + trust

### Task 35: Methodology / Trust (Surface 11)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/methodology/page.tsx`

- [ ] **Step 35.1: Implement Methodology page**

```tsx
// apps/web/src/app/h/[hubSlug]/methodology/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { LineIllustration } from '@/components/hub/EditorialAtlas/illustrations';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getMethodologyRoute } from '@/lib/hub/routes';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: { hubSlug: string } }): Promise<Metadata> {
  if (params.hubSlug !== mockManifest.hubSlug) return { title: 'Hub not found' };
  return { title: `Methodology — ${mockManifest.title}`, alternates: { canonical: getMethodologyRoute(params.hubSlug) } };
}

export default function MethodologyPage({ params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  return (
    <HubShell manifest={m} activePathname={getMethodologyRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Methodology</p>
      <div className="mt-3 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-[640px]">
          <h1 className="text-[36px] font-semibold tracking-[-0.02em]">Methodology &amp; trust</h1>
          <p className="mt-3 text-[14px] leading-[1.6] text-[#3D352A]">{m.trust.methodologySummary}</p>
        </div>
        <div className="text-[#3D352A]"><LineIllustration illustrationKey="books" className="h-[140px] w-[200px]" /></div>
      </div>

      <section className="mt-12">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Quality principles</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {m.trust.qualityPrinciples.map((p) => (
            <div key={p.title} className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
              <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">{p.title}</h3>
              <p className="mt-2 text-[12px] leading-[1.55] text-[#6B5F50]">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Our knowledge creation process</h2>
        <ol className="mt-4 grid gap-3 md:grid-cols-5">
          {m.trust.creationProcess.map((step) => (
            <li key={step.stepNumber} className="rounded-[12px] border border-[#E5DECF] bg-white p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Step {step.stepNumber}</span>
              <h3 className="mt-2 text-[13px] font-semibold tracking-[-0.01em] text-[#1A1612]">{step.title}</h3>
              <p className="mt-1 text-[12px] leading-[1.55] text-[#6B5F50]">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Frequently asked questions</h2>
        <ul className="mt-4 divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
          {m.trust.faq.map((q) => (
            <li key={q.question} className="px-5 py-4">
              <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[#1A1612]">{q.question}</h3>
              <p className="mt-2 text-[13px] leading-[1.55] text-[#3D352A]">{q.answer}</p>
            </li>
          ))}
        </ul>
      </section>
    </HubShell>
  );
}
```

- [ ] **Step 35.2: Commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/methodology/page.tsx
git commit -m "feat(hub): Methodology page"
```

---

### Task 36: Search Results (Surface 12)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/search/page.tsx`

- [ ] **Step 36.1: Implement Search Results**

Reuses the same in-memory filter logic as `pageFilters.ts` and adds a topic + source pass.

```tsx
// apps/web/src/app/h/[hubSlug]/search/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { PageRow } from '@/components/hub/EditorialAtlas/blocks/PageRow';
import { TopicCard } from '@/components/hub/EditorialAtlas/blocks/TopicCard';
import { SourceRow } from '@/components/hub/EditorialAtlas/blocks/SourceRow';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { getSearchRoute } from '@/lib/hub/routes';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Search' };

export default function SearchPage({
  params,
  searchParams,
}: {
  params: { hubSlug: string };
  searchParams: { q?: string };
}) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  const q = (searchParams.q ?? '').trim().toLowerCase();
  const topicAccentBySlug = Object.fromEntries(m.topics.map((t) => [t.slug, t.accentColor]));

  const matchingPages = q
    ? m.pages.filter((p) => p.status === 'published' && `${p.title} ${p.summaryPlainText} ${p.searchKeywords.join(' ')}`.toLowerCase().includes(q))
    : [];
  const matchingTopics = q
    ? m.topics.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q))
    : [];
  const matchingSources = q
    ? m.sources.filter((s) => s.title.toLowerCase().includes(q))
    : [];

  return (
    <HubShell manifest={m} activePathname={getSearchRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Search</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Search results</h1>

      <form action={getSearchRoute(params.hubSlug)} method="get" className="mt-6 flex items-center gap-2 rounded-[12px] border border-[#E5DECF] bg-white p-2 pl-4">
        <input
          type="search" name="q" defaultValue={q} placeholder="Search this hub…"
          className="flex-1 bg-transparent text-[13px] text-[#1A1612] placeholder:text-[#9A8E7C] focus:outline-none"
        />
        <button type="submit" className="inline-flex h-9 items-center rounded-[8px] bg-[#1A1612] px-3 text-[12px] font-semibold text-[#F8F4EC] hover:opacity-90">
          Search
        </button>
      </form>

      {!q && (
        <p className="mt-6 text-[13px] text-[#9A8E7C]">Enter a query above to search pages, topics, and sources.</p>
      )}

      {q && (
        <>
          <Section title={`Pages (${matchingPages.length})`}>
            {matchingPages.length === 0 ? (
              <Empty />
            ) : (
              <ul className="divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
                {matchingPages.map((p) => <li key={p.id}><PageRow page={p} hubSlug={params.hubSlug} topicAccentBySlug={topicAccentBySlug} /></li>)}
              </ul>
            )}
          </Section>

          <Section title={`Topics (${matchingTopics.length})`}>
            {matchingTopics.length === 0 ? <Empty /> : (
              <div className="grid gap-3 md:grid-cols-3">
                {matchingTopics.map((t) => <TopicCard key={t.id} topic={t} hubSlug={params.hubSlug} />)}
              </div>
            )}
          </Section>

          <Section title={`Sources (${matchingSources.length})`}>
            {matchingSources.length === 0 ? <Empty /> : (
              <ul className="divide-y divide-[#E5DECF] rounded-[12px] border border-[#E5DECF] bg-white">
                {matchingSources.map((s) => <li key={s.id}><SourceRow source={s} hubSlug={params.hubSlug} /></li>)}
              </ul>
            )}
          </Section>
        </>
      )}
    </HubShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-[14px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Empty() {
  return <p className="rounded-[10px] border border-dashed border-[#D6CFC0] bg-white px-4 py-6 text-center text-[12px] text-[#9A8E7C]">No matches.</p>;
}
```

- [ ] **Step 36.2: Commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/search/page.tsx
git commit -m "feat(hub): Search Results"
```

---

### Task 37: Phase 5 visual smoke

- [ ] **Step 37.1: Smoke-test methodology + search**

Visit `/h/ali-abdaal/methodology` (verify principles, process, FAQ render). Visit `/h/ali-abdaal/search?q=feynman` (verify pages match). Try queries with no results to confirm empty states.

```bash
git add -p
git commit -m "fix(hub): Phase 5 polish"
```

---

## Phase 6 — Grounded chat

### Task 38: Chat /ask/api route handler

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/ask/api/route.ts`

- [ ] **Step 38.1: Implement the mock route handler**

```ts
// apps/web/src/app/h/[hubSlug]/ask/api/route.ts
//
// Mock grounded-chat endpoint. Returns canned answers for the 5 example
// questions; everything else returns the unsupported response shape.

import { NextResponse } from 'next/server';

import { askRequestSchema } from '@/lib/hub/chat/schema';
import { lookupMockAnswer } from '@/lib/hub/chat/mockAnswers';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: { hubSlug: string } }) {
  if (params.hubSlug !== mockManifest.hubSlug) {
    return NextResponse.json({ error: 'Hub not found' }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = askRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad request', issues: parsed.error.issues }, { status: 400 });
  }
  const answer = lookupMockAnswer(parsed.data.question);
  return NextResponse.json(answer);
}
```

- [ ] **Step 38.2: Smoke-test with curl**

```bash
cd apps/web && pnpm dev
# in another terminal:
curl -X POST http://localhost:3000/h/ali-abdaal/ask/api \
  -H 'Content-Type: application/json' \
  -d '{"hubId":"hub_mock_ali_abdaal","question":"How does Ali plan his week?","filters":{"topicSlugs":[],"sourceVideoIds":[],"pageIds":[]}}'
```

Expected: JSON with `answer.summary`, `answer.bullets[].citationIds`, `citations[]`, `relatedPages[]`.

Try also: `"question":"What is the meaning of life?"` → expect `{ "answer": null, "unsupported": true, … }`.

- [ ] **Step 38.3: Commit**

```bash
git add apps/web/src/app/h/[hubSlug]/ask/api/route.ts
git commit -m "feat(hub): mock grounded chat /ask/api endpoint"
```

---

### Task 39: SuggestedQuestions + ChatSourceCard + AnswerCitationList

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/ask/SuggestedQuestions.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/ask/ChatSourceCard.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/ask/AnswerCitationList.tsx`

- [ ] **Step 39.1: Implement SuggestedQuestions**

```tsx
// apps/web/src/components/hub/EditorialAtlas/ask/SuggestedQuestions.tsx
'use client';

type Props = { questions: readonly string[]; onPick: (q: string) => void };

export function SuggestedQuestions({ questions, onPick }: Props) {
  return (
    <ul className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <li key={q}>
          <button
            type="button" onClick={() => onPick(q)}
            className="inline-flex items-center rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612] hover:bg-[#FAF6EE]"
          >{q}</button>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 39.2: Implement ChatSourceCard**

```tsx
// apps/web/src/components/hub/EditorialAtlas/ask/ChatSourceCard.tsx
import type { AskResponse } from '@/lib/hub/chat/schema';

type Citation = Extract<AskResponse, { citations: any[] }>['citations'][number];
type Props = { citation: Citation };

export function ChatSourceCard({ citation }: Props) {
  return (
    <a
      href={citation.url} target="_blank" rel="noreferrer"
      className="block rounded-[10px] border border-[#E5DECF] bg-white p-3 transition-colors hover:border-[#D6CFC0] hover:bg-[#FAF6EE]"
    >
      <p className="text-[12px] font-semibold text-[#1A1612] line-clamp-2">{citation.videoTitle}</p>
      <p className="mt-1 text-[11px] text-[#9A8E7C]">Watch at {citation.timestampLabel}</p>
      <p className="mt-2 text-[12px] italic leading-[1.5] text-[#3D352A] line-clamp-3">"{citation.excerpt}"</p>
    </a>
  );
}
```

- [ ] **Step 39.3: Implement AnswerCitationList**

```tsx
// apps/web/src/components/hub/EditorialAtlas/ask/AnswerCitationList.tsx
import type { AskResponse } from '@/lib/hub/chat/schema';

import { ChatSourceCard } from './ChatSourceCard';

type Citation = Extract<AskResponse, { citations: any[] }>['citations'][number];
type Props = { citations: Citation[] };

export function AnswerCitationList({ citations }: Props) {
  if (citations.length === 0) return null;
  return (
    <section>
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Sources used</h3>
      <ol className="mt-2 grid gap-2 sm:grid-cols-2">
        {citations.map((c) => <li key={c.id}><ChatSourceCard citation={c} /></li>)}
      </ol>
    </section>
  );
}
```

- [ ] **Step 39.4: Commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/ask/
git commit -m "feat(hub): chat citation components"
```

---

### Task 40: GroundedAnswer + UnsupportedAnswerState + EmptyChatState

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/ask/GroundedAnswer.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/ask/UnsupportedAnswerState.tsx`
- Create: `apps/web/src/components/hub/EditorialAtlas/ask/EmptyChatState.tsx`

- [ ] **Step 40.1: Implement GroundedAnswer**

```tsx
// apps/web/src/components/hub/EditorialAtlas/ask/GroundedAnswer.tsx
import Link from 'next/link';

import type { AskResponse } from '@/lib/hub/chat/schema';
import { EvidenceQualityBadge } from '../blocks/EvidenceQualityBadge';
import { getPageRoute } from '@/lib/hub/routes';

import { AnswerCitationList } from './AnswerCitationList';

type Props = {
  hubSlug: string;
  response: Extract<AskResponse, { citations: any[] }>;
  /** The question that produced this answer — shown above the answer card. */
  question: string;
};

export function GroundedAnswer({ hubSlug, response, question }: Props) {
  const { answer, citations, relatedPages, suggestedFollowups } = response;
  return (
    <article className="space-y-5 rounded-[14px] border border-[#E5DECF] bg-white p-6">
      <header className="flex items-start justify-between gap-4">
        <p className="text-[14px] leading-[1.5] text-[#9A8E7C]">{question}</p>
        <EvidenceQualityBadge quality={answer.evidenceQuality} />
      </header>

      <p className="text-[15px] leading-[1.6] text-[#1A1612]">{answer.summary}</p>

      <ul className="space-y-2">
        {answer.bullets.map((b, i) => (
          <li
            key={i}
            className={
              'rounded-[10px] border px-4 py-2.5 text-[13px] leading-[1.55] ' +
              (b.citationIds.length > 0
                ? 'border-[#E5DECF] bg-[#FAF6EE] text-[#3D352A]'
                : 'border-[#A34A60]/40 bg-[#F4E1E6]/40 text-[#A34A60]')
            }
          >
            {b.text}
            {b.citationIds.length === 0 && (
              <span className="ml-2 text-[10px] uppercase tracking-[0.12em]">No source attached</span>
            )}
          </li>
        ))}
      </ul>

      <AnswerCitationList citations={citations} />

      {relatedPages.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Related pages</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {relatedPages.map((p) => (
              <li key={p.id}>
                <Link href={getPageRoute(hubSlug, p.slug)} className="block rounded-[10px] border border-[#E5DECF] bg-[#FAF6EE] px-3 py-2 text-[12px] hover:border-[#D6CFC0]">
                  <span className="block font-medium text-[#1A1612]">{p.title}</span>
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-[#9A8E7C]">{p.type}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestedFollowups.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Follow-up questions</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestedFollowups.map((q) => (
              <li key={q}>
                <button type="button" data-followup={q} className="inline-flex items-center rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612]">
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
```

- [ ] **Step 40.2: Implement UnsupportedAnswerState**

```tsx
// apps/web/src/components/hub/EditorialAtlas/ask/UnsupportedAnswerState.tsx
import Link from 'next/link';

import type { AskResponse } from '@/lib/hub/chat/schema';
import { getSearchRoute, getTopicRoute } from '@/lib/hub/routes';

type Props = {
  hubSlug: string;
  response: Extract<AskResponse, { unsupported: true }>;
  question: string;
};

export function UnsupportedAnswerState({ hubSlug, response, question }: Props) {
  return (
    <article className="space-y-4 rounded-[14px] border border-[#E5DECF] bg-white p-6">
      <p className="text-[14px] leading-[1.5] text-[#9A8E7C]">{question}</p>
      <p className="rounded-[10px] border border-[#E5DECF] bg-[#FAF6EE] p-4 text-[14px] leading-[1.55] text-[#3D352A]">{response.message}</p>

      {response.suggestedSearches.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Try searching</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {response.suggestedSearches.map((s) => (
              <li key={s}>
                <Link href={getSearchRoute(hubSlug, s)} className="inline-flex rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612]">
                  {s}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {response.partialMatches.length > 0 && (
        <section>
          <h3 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#9A8E7C]">Or browse</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {response.partialMatches.map((m) => (
              <li key={`${m.type}-${m.slug}`}>
                <Link
                  href={m.type === 'topic' ? getTopicRoute(hubSlug, m.slug) : '#'}
                  className="inline-flex rounded-full border border-[#E5DECF] bg-white px-3 py-1.5 text-[12px] text-[#3D352A] hover:border-[#1A1612]"
                >
                  {m.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
```

- [ ] **Step 40.3: Implement EmptyChatState**

```tsx
// apps/web/src/components/hub/EditorialAtlas/ask/EmptyChatState.tsx
import { LineIllustration } from '../illustrations';
import { SuggestedQuestions } from './SuggestedQuestions';

type Props = { suggestedQuestions: readonly string[]; onPick: (q: string) => void };

export function EmptyChatState({ suggestedQuestions, onPick }: Props) {
  return (
    <div className="rounded-[14px] border border-[#E5DECF] bg-white p-8 text-center">
      <div className="mx-auto text-[#3D352A]">
        <LineIllustration illustrationKey="open-notebook" className="mx-auto h-[120px] w-[180px]" />
      </div>
      <p className="mt-6 text-[14px] leading-[1.55] text-[#3D352A] max-w-[480px] mx-auto">
        Try one of these questions, or type your own. Every answer is grounded only in this hub's videos and pages.
      </p>
      <div className="mt-6">
        <SuggestedQuestions questions={suggestedQuestions} onPick={onPick} />
      </div>
    </div>
  );
}
```

- [ ] **Step 40.4: Commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/ask/
git commit -m "feat(hub): GroundedAnswer + Unsupported + EmptyChatState"
```

---

### Task 41: AskHubInput

**Files:**
- Create: `apps/web/src/components/hub/EditorialAtlas/ask/AskHubInput.tsx`

- [ ] **Step 41.1: Implement AskHubInput**

```tsx
// apps/web/src/components/hub/EditorialAtlas/ask/AskHubInput.tsx
'use client';

import { useState, type FormEvent } from 'react';

type Props = {
  initial?: string;
  placeholder?: string;
  pending?: boolean;
  onSubmit: (question: string) => void;
};

export function AskHubInput({ initial = '', placeholder = "Ask about productivity, learning, systems, focus, or anything covered in this hub…", pending, onSubmit }: Props) {
  const [value, setValue] = useState(initial);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim() || pending) return;
    onSubmit(value.trim());
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-[14px] border border-[#E5DECF] bg-white p-3">
      <textarea
        value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder}
        rows={2}
        className="w-full resize-none bg-transparent px-2 py-1 text-[14px] leading-[1.55] text-[#1A1612] placeholder:text-[#9A8E7C] focus:outline-none"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button type="submit" disabled={pending || !value.trim()}
          className="inline-flex h-9 items-center rounded-[8px] bg-[#1A1612] px-4 text-[12px] font-semibold text-[#F8F4EC] disabled:opacity-50 hover:opacity-90">
          {pending ? 'Asking…' : 'Ask this hub →'}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 41.2: Commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/components/hub/EditorialAtlas/ask/AskHubInput.tsx
git commit -m "feat(hub): AskHubInput"
```

---

### Task 42: Ask This Hub page (Surface 13)

**Files:**
- Create: `apps/web/src/app/h/[hubSlug]/ask/page.tsx`
- Create: `apps/web/src/app/h/[hubSlug]/ask/AskHubClient.tsx`

- [ ] **Step 42.1: Implement the server route**

```tsx
// apps/web/src/app/h/[hubSlug]/ask/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { HubShell } from '@/components/hub/EditorialAtlas/shell';
import { mockManifest } from '@/lib/hub/manifest/mockManifest';
import { MOCK_ANSWER_QUESTIONS } from '@/lib/hub/chat/mockAnswers';
import { getAskRoute } from '@/lib/hub/routes';

import { AskHubClient } from './AskHubClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Ask this hub' };

export default function AskPage({
  params,
  searchParams,
}: {
  params: { hubSlug: string };
  searchParams: { q?: string };
}) {
  if (params.hubSlug !== mockManifest.hubSlug) notFound();
  const m = mockManifest;
  return (
    <HubShell manifest={m} activePathname={getAskRoute(params.hubSlug)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9A8E7C]">Ask this hub</p>
      <h1 className="mt-3 text-[36px] font-semibold tracking-[-0.02em]">Ask this hub</h1>
      <p className="mt-2 max-w-[640px] text-[14px] leading-[1.55] text-[#3D352A]">
        Ask questions and get answers grounded only in {m.creator.name.split(' ')[0]}'s videos, transcripts, and published hub pages.
      </p>

      <div className="mt-8">
        <AskHubClient
          hubId={m.hubId}
          hubSlug={m.hubSlug}
          suggestedQuestions={MOCK_ANSWER_QUESTIONS}
          initialQuestion={searchParams.q ?? ''}
        />
      </div>
    </HubShell>
  );
}
```

- [ ] **Step 42.2: Implement the client component**

```tsx
// apps/web/src/app/h/[hubSlug]/ask/AskHubClient.tsx
'use client';

import { useEffect, useState } from 'react';

import { AskHubInput } from '@/components/hub/EditorialAtlas/ask/AskHubInput';
import { EmptyChatState } from '@/components/hub/EditorialAtlas/ask/EmptyChatState';
import { GroundedAnswer } from '@/components/hub/EditorialAtlas/ask/GroundedAnswer';
import { UnsupportedAnswerState } from '@/components/hub/EditorialAtlas/ask/UnsupportedAnswerState';
import { askResponseSchema, type AskResponse } from '@/lib/hub/chat/schema';
import { getAskApiRoute } from '@/lib/hub/routes';

type Props = {
  hubId: string;
  hubSlug: string;
  suggestedQuestions: readonly string[];
  initialQuestion: string;
};

type Turn = { question: string; response: AskResponse };

export function AskHubClient({ hubId, hubSlug, suggestedQuestions, initialQuestion }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (initialQuestion.trim()) ask(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function ask(question: string) {
    setPending(true);
    try {
      const res = await fetch(getAskApiRoute(hubSlug), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hubId, question, filters: { topicSlugs: [], sourceVideoIds: [], pageIds: [] } }),
      });
      const json = await res.json();
      const parsed = askResponseSchema.safeParse(json);
      if (!parsed.success) throw new Error('Bad response shape');
      setTurns((t) => [...t, { question, response: parsed.data }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <AskHubInput pending={pending} onSubmit={ask} />

      {turns.length === 0 && !pending && (
        <EmptyChatState suggestedQuestions={suggestedQuestions} onPick={ask} />
      )}

      {turns.map((t, i) => (
        'unsupported' in t.response && t.response.unsupported ? (
          <UnsupportedAnswerState key={i} hubSlug={hubSlug} response={t.response} question={t.question} />
        ) : (
          <GroundedAnswer key={i} hubSlug={hubSlug} response={t.response as Extract<AskResponse, { citations: any[] }>} question={t.question} />
        )
      ))}
    </div>
  );
}
```

- [ ] **Step 42.3: Verify + commit**

```bash
cd apps/web && pnpm typecheck && pnpm lint
git add apps/web/src/app/h/[hubSlug]/ask/
git commit -m "feat(hub): Ask This Hub page (Surface 13)"
```

---

### Task 43: Phase 6 visual smoke + compact ask box from home

- [ ] **Step 43.1: Smoke-test the chat surface**

Visit `/h/ali-abdaal/ask`. Expect: hero copy, AskHubInput, EmptyChatState with 5 suggested questions.

Click each suggested question. Each must:
- Submit and return a successful `GroundedAnswer` with the spec-defined evidence quality, bullets-with-citations, citations list, related pages, follow-up questions.
- Show the `EvidenceQualityBadge`.

Type a custom question like "What is the meaning of life?". Expect: `UnsupportedAnswerState` with suggested searches and partial matches.

- [ ] **Step 43.2: Smoke-test the home → ask hand-off**

From Hub Home, type a question into the compact ask box → submit → land on `/ask?q=…` → see the answer auto-fetched on mount.

- [ ] **Step 43.3: Commit any polish**

```bash
git add -p
git commit -m "fix(hub): Phase 6 chat polish"
```

---

## Phase 7 — Adapter handoff

### Task 44: Verify adapter stub + write follow-up spec pointer

**Files:**
- Modify: `apps/web/src/lib/hub/manifest/adapter.ts` (no-op verification — already created in Task 5)
- Create: `docs/superpowers/specs/2026-04-25-editorial-atlas-pipeline-adapter-followup.md`

- [ ] **Step 44.1: Re-read adapter.ts**

Confirm the file matches what Task 5 produced — `buildEditorialAtlasManifestFromRelease` throws with the documented error message. No code changes here.

- [ ] **Step 44.2: Write the follow-up spec pointer**

```md
# Pipeline → EditorialAtlasManifest Adapter — Follow-Up Spec Brief

**Status:** Brief / not designed yet
**Depends on:** [`2026-04-25-editorial-atlas-hub-design.md`](2026-04-25-editorial-atlas-hub-design.md)

## Why this exists

The Editorial Atlas template ships with a mock manifest at
`apps/web/src/lib/hub/manifest/mockManifest.ts`. The pipeline currently
emits the older `release_manifest_v0` schema. To wire real hub data into
the Editorial Atlas template we need an adapter:

```ts
buildEditorialAtlasManifestFromRelease(input: {
  release: ReleaseRow,
  manifestV0: ReleaseManifestV0,
  draftPages: DraftPagesV0Artifact,
  sources: SourceVideo[],          // joined from `youtube_video` + transcripts
  /* …more inputs as needed */
}): EditorialAtlasManifest
```

## In scope (next session)

1. Define mapping rules: which v0 blocks become which v1 section kinds.
2. Decide which Editorial Atlas fields are derivable from current pipeline
   output (most metadata) vs. need new pipeline stages (key moments,
   aha_moments, evidence quality scoring, topic taxonomy, illustration choice).
3. Decide what to do for fields that have no data source yet — empty array,
   placeholder, or "skip section" (the renderer handles all three per § 5.5).
4. Write the adapter, swap the route from mock to real, gate behind a
   feature flag for a canary window.

## Out of scope

- New pipeline stages themselves. The adapter brokers existing data; pipeline
  changes are a third project.
- Any change to the renderer or template — the contract is settled.

## Open questions for the brainstorming pass

- Where does `Topic` taxonomy come from? Manual curation? Cluster output?
- How are `keyMoments` and `aha_moments` synthesized — LLM stage or marker-detection?
- How is `evidenceQuality` computed — citation count threshold, distinct-source
  count, semantic similarity, or editor input?
- Visibility: how does `unlisted` interact with the publish flow?

(Brainstorming and writing-plans skills will design the rest.)
```

- [ ] **Step 44.3: Commit**

```bash
git add docs/superpowers/specs/2026-04-25-editorial-atlas-pipeline-adapter-followup.md
git commit -m "docs(hub): pipeline adapter follow-up brief"
```

---

## Self-review

### Spec coverage (end-to-end)

| Spec section | Plan task(s) |
|---|---|
| § 4.3 Route helpers | Task 1 |
| § 5.1–5.3 Manifest types & zod | Task 2 |
| § 5.5 Empty-state contract + citation URL synthesis | Task 3 |
| § 5.6 Mock manifest with full section-kind coverage | Task 4 |
| § 5.7 Adapter stub | Task 5, verified Task 44 |
| § 6.3 Chat API contract | Task 6 |
| § 6.4 Mock chat answers + § 6.5 RAG notes | Task 7 |
| Tokens | Task 8 |
| § 4.1 Layer 2 LineIllustration | Task 9 |
| § 4.1 Layer 1 chrome (HubFooter, Sidebar, Shell) | Tasks 10–12 |
| § 7 Phase 1 — folder rename + home stub + compat redirect | Tasks 13–15 |
| § 7 Phase 1 review gate | Task 16 |
| § 4.1 Layer 2 building blocks (MetaTagPill / EvidenceQualityBadge / Breadcrumb / PageCard / PageRow / PageTable / SectionRenderer / TopicCard / TopicGrid / RelatedPages / SourceRail / SourceCard / SourceRow / CitationBlock / SourceTable) | Tasks 17–21, 23, 31, 32 |
| Surface 1 Hub Home | Task 22 |
| Surface 5 All Pages Index | Task 24 |
| Surface 6 Lesson Page | Task 23 |
| Surface 3 Topics Index | Task 25 |
| Surface 4 Topic Detail | Task 26 |
| Surface 7 Framework Page | Task 27 (smoke; same renderer as 6) |
| Surface 8 Playbook Page | Task 28 (smoke; uses principles/scenes/workflow/failure_points kinds from Task 20) |
| Surface 2 Start Here | Task 29 |
| Surface 9 Sources Library | Task 32 |
| Surface 10 Source Video Detail | Task 33 |
| Surface 11 Methodology / Trust | Task 35 |
| Surface 12 Search Results | Task 36 |
| Surface 13 Ask This Hub + § 6.4 mock /ask/api | Tasks 38–43 (chrome 39–41; route 38; page+client 42; smoke 43) |
| Compact ask box on Hub Home (§ 6.1) | Task 22 (form action posts to `/ask`) + Task 43 hand-off smoke |
| § 8 Compat policy (no DB writes, no /app/configure changes, no enum changes, no R2 deletion, no pipeline rewrites) | Followed by exclusion across all 44 tasks |
| § 9 Performance — `revalidate = 60` on read-only surfaces, `force-dynamic` on `/search` and `/ask` | Tasks 14, 22–36 (revalidate); Tasks 36, 42 (force-dynamic) |

All 13 surfaces accounted for. No sections of the spec are unmapped to a task.

### Placeholder scan

Searched for: "TBD", "TODO" outside the deliberate adapter stub, "implement later", "fill in details", "add appropriate error handling", "similar to Task N", "write tests for the above" without code, "fix as needed".

Found and reviewed:
- Adapter stub `throw new Error('… not implemented yet …')` — deliberate per spec § 5.7. Verified in Task 44.
- Phase 3 / 4 / 5 smoke-test tasks (27, 28, 30, 34, 37) end with `git add -p && git commit -m "fix(hub): … polish"`. These are real tasks: visit the surface, fix any layout regressions found. They're not "implement later" placeholders — the *work* is finding regressions, and the task says where to look.
- The mock manifest's recovery instruction in Task 4 ("If a kind is missing, the test will name which one — add a section of that kind to any existing page") is a fallback for the coverage test, not a placeholder.

No genuine placeholders found.

### Type / name consistency

Cross-checking names across all 44 tasks:

- **Schema names** — `EditorialAtlasManifest`, `Page`, `PageSection`, `Citation`, `SourceVideo`, `Topic`, `NavItem` defined in Task 2, used identically in Tasks 4, 17–43.
- **Section kinds** — 13 string literals in `pageSectionSchema` (Task 2) match exactly the 13 component file names + 13 cases in `SectionRenderer` (Task 20) + 13 coverage assertions in the mock test (Task 4).
- **Route helper names** — `getHubRoute / getStartRoute / getTopicsRoute / getTopicRoute / getPagesRoute / getPageRoute / getSourcesRoute / getSourceRoute / getMethodologyRoute / getSearchRoute / getAskRoute / getAskApiRoute` defined in Task 1, used identically in Tasks 11, 14, 15, 22–43.
- **Mock identifiers** — `mockManifest` (Task 4), `MOCK_ANSWER_QUESTIONS` + `lookupMockAnswer` (Task 7) used in Tasks 14, 22–43, 38, 42.
- **Block components** — `HubShell`, `HubSidebar`, `HubFooterTrustBar`, `LineIllustration`, `MetaTagPill`, `EvidenceQualityBadge`, `Breadcrumb`, `PageCard`, `PageRow`, `PageTable`, `TopicCard`, `TopicGrid`, `RelatedPages`, `SourceRail`, `SourceCard`, `SourceRow`, `SourceTable`, `CitationBlock`, `SectionRenderer` defined in Tasks 8–21, 31, 32 — names match imports across Tasks 22–43.
- **Chat components** — `AskHubInput`, `SuggestedQuestions`, `ChatSourceCard`, `AnswerCitationList`, `GroundedAnswer`, `UnsupportedAnswerState`, `EmptyChatState`, `AskHubClient` defined Tasks 39–42, used in Task 42.
- **Helper names** — `citationUrl`, `formatTimestampLabel`, `resolveAccentColor`, `ACCENT_COLORS`, `palette`, `filterPages`, `sortPages` defined in Tasks 3, 8, 19; consumed in Tasks 17, 18, 19, 21, 23, 31, 33.
- **Param rename** — `loadHubManifest` parameter renamed `subdomain` → `hubSlug` in Task 13 (function body still queries `eq(hub.subdomain, hubSlug)` because the DB column name is unchanged per non-destructive policy). All Next.js params throughout Phases 2–6 use `params.hubSlug` consistently.

No type or name mismatches found.

### Scope check

This plan is large (44 tasks). It builds the complete Editorial Atlas template end-to-end. Each phase produces working software on its own — Phase 1 alone gives a renderable chrome at `/h/[hubSlug]`; each subsequent phase adds surfaces that don't depend on later phases. The Phase 1 stop gate (Task 16) keeps execution under explicit user control before the bulk of the work starts. Pipeline integration is intentionally out of scope (Task 44 documents the handoff to a separate spec).

The plan is appropriately one project, not several — every task contributes to a single deliverable (one template, one set of surfaces). Decomposition into separate plans isn't warranted.
