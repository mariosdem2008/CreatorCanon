# Remove Editorial Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fully remove the old Editorial Atlas template path and make Creator Manual the only generated hub template, including DB migration, pipeline handoff, public runtime cleanup, verification, migration push, commit, and branch push.

**Architecture:** Keep Claude's audit-pipeline work isolated by making all edits only in `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\creator-manual-template`. Replace the `editorial_atlas_v1` manifest contract with `creator_manual_v1`, register only a Creator Manual adapter, and let old Editorial Atlas URLs/components disappear instead of maintaining backward compatibility. Old live Editorial Atlas release manifests should fail closed with `notFound()` instead of crashing the app.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle/Postgres, R2 manifest storage, Node test runner, pnpm/turbo.

---

## Guardrails

- Work only in `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\creator-manual-template`.
- Do not edit files in `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\audit-server` or any other worktree.
- Before every implementation task, run `git status --short --branch`.
- Do not revert unrelated changes if they appear. Stop and report only if unrelated changes block the task.
- Use `apply_patch` for manual edits.
- Do not touch audit pipeline stage internals except the adapter handoff comments/registry points explicitly named below.
- The migration must be applied with `pnpm db:migrate` after code is updated. If the environment cannot reach the DB, capture the exact error and leave the migration file committed.

## File Structure

### Create

- `packages/pipeline/src/adapters/creator-manual/manifest-types.ts` - pipeline-side TypeScript contract for `creator_manual_v1`.
- `packages/pipeline/src/adapters/creator-manual/utils.ts` - slug, text, timestamp, confidence, and thumbnail helpers.
- `packages/pipeline/src/adapters/creator-manual/index.ts` - `adaptArchiveToCreatorManual()` DB-to-manifest adapter.
- `packages/pipeline/src/adapters/creator-manual/test/adapter.smoke.test.ts` - adapter runtime validation against the web schema.
- `packages/db/drizzle/out/0011_creator_manual_template_key.sql` - DB enum/default/data migration from old keys to `creator_manual`.

### Modify

- `packages/db/src/schema/enums.ts` - make `hub_template_key` expose only `creator_manual`.
- `packages/db/src/schema/release.ts` - change hub default to `creator_manual`; extend `HubMetadata` brand customization bag.
- `packages/db/drizzle/out/meta/_journal.json` - add the 0011 migration entry.
- `packages/pipeline/src/adapters/index.ts` - remove Editorial Atlas adapter and register Creator Manual only.
- `packages/pipeline/src/adapters/types.ts` - return `CreatorManualManifest`.
- `packages/pipeline/src/stages/adapt.ts` - unchanged behavior, updated expectation/comments/tests for `creator_manual`.
- `packages/pipeline/src/publish-run-as-hub.ts` - validate/stamp/publish `creator_manual_v1`; create hubs with `creator_manual`.
- `packages/pipeline/src/run-generation-pipeline.ts` - remove Editorial Atlas wording.
- `packages/pipeline/src/stages/test/adapt.test.ts` - expect `creator_manual` and `creator_manual_v1`.
- `packages/pipeline/src/test/e2e-smoke.test.ts` - seed/expect Creator Manual.
- `packages/pipeline/src/inspect-alpha-content.ts` - type/print Creator Manual manifest safely.
- `packages/pipeline/src/run-alpha-e2e.ts` - expect Creator Manual schema.
- `packages/pipeline/src/smoke-alpha.ts` - expect Creator Manual schema.
- `packages/pipeline/src/smoke-audio-publish.ts` - print Creator Manual counts.
- `packages/pipeline/src/smoke-local.ts` - expect Creator Manual schema.
- `packages/pipeline/src/smoke-review-edit.ts` - fetch Creator Manual manifest type.
- `apps/web/src/components/hub/templates.ts` - keep `paper|midnight|field` as brand skins, remove Editorial Atlas naming.
- `apps/web/src/app/app/configure/actions.ts` - no logic change unless type expectations require `creator_manual`.
- `apps/web/src/lib/hub/manifest/schema.ts` - remove all Editorial Atlas schemas/types and make the hub manifest schema Creator Manual only.
- `apps/web/src/app/h/[hubSlug]/manifest.ts` - remove Editorial Atlas loader/legacy redirect; catch invalid old manifests with `notFound()`.
- `apps/web/src/app/h/[hubSlug]/page.tsx` - Creator Manual only.
- `apps/web/src/app/h/[hubSlug]/opengraph-image.tsx` - Creator Manual only.
- Creator Manual routes under `apps/web/src/app/h/[hubSlug]/{library,pillars,segments,claims,glossary,themes,workshop,search,sources}` - remove legacy redirects and old schema branches.

### Delete

- `apps/web/src/components/hub/EditorialAtlas/**`
- `apps/web/src/components/hub/publicTemplates.tsx`
- `apps/web/src/lib/hub/workbench.ts`
- `apps/web/src/lib/hub/manifest/mockManifest.ts`
- `apps/web/src/lib/hub/manifest/mockManifest.test.ts`
- `apps/web/src/lib/hub/manifest/schema.highlights.test.ts`
- Editorial-only routes:
  - `apps/web/src/app/h/[hubSlug]/ask/**`
  - `apps/web/src/app/h/[hubSlug]/highlights/**`
  - `apps/web/src/app/h/[hubSlug]/methodology/**`
  - `apps/web/src/app/h/[hubSlug]/pages/**`
  - `apps/web/src/app/h/[hubSlug]/start/**`
  - `apps/web/src/app/h/[hubSlug]/topics/**`
  - `apps/web/src/app/h/[hubSlug]/[slug]/**`
- `packages/pipeline/src/adapters/editorial-atlas/**`

---

## Task 1: DB Template Key Migration

**Files:**
- Modify: `packages/db/src/schema/enums.ts`
- Modify: `packages/db/src/schema/release.ts`
- Create: `packages/db/drizzle/out/0011_creator_manual_template_key.sql`
- Modify: `packages/db/drizzle/out/meta/_journal.json`

- [ ] **Step 1: Verify branch and workspace**

Run:

```powershell
git status --short --branch
git worktree list
```

Expected: branch `feat/creator-manual-template` is clean; `audit-server` is a separate worktree.

- [ ] **Step 2: Update the enum schema**

In `packages/db/src/schema/enums.ts`, replace:

```ts
export const hubTemplateKeyEnum = pgEnum('hub_template_key', [
  'editorial_atlas',
  'legacy_v0',
]);
```

with:

```ts
export const hubTemplateKeyEnum = pgEnum('hub_template_key', ['creator_manual']);
```

- [ ] **Step 3: Update hub metadata and default**

In `packages/db/src/schema/release.ts`, extend `HubMetadata`:

```ts
  /** Creator Manual brand overrides merged by the hub adapter. */
  brand?: {
    name?: string;
    tone?: string;
    colors?: Partial<{
      background: string;
      foreground: string;
      surface: string;
      elevated: string;
      border: string;
      muted: string;
      accent: string;
      accentForeground: string;
      warning: string;
      success: string;
    }>;
    typography?: Partial<{
      headingFamily: string;
      bodyFamily: string;
    }>;
    assets?: Partial<{
      logoUrl: string;
      heroImageUrl: string;
      patternImageUrl: string;
    }>;
  };
```

Change:

```ts
templateKey: hubTemplateKeyEnum('template_key').notNull().default('editorial_atlas'),
```

to:

```ts
templateKey: hubTemplateKeyEnum('template_key').notNull().default('creator_manual'),
```

- [ ] **Step 4: Add manual migration SQL**

Create `packages/db/drizzle/out/0011_creator_manual_template_key.sql` with:

```sql
ALTER TABLE "hub" ALTER COLUMN "template_key" DROP DEFAULT;

UPDATE "hub"
SET "template_key" = 'creator_manual'
WHERE "template_key"::text IN ('editorial_atlas', 'legacy_v0');

CREATE TYPE "hub_template_key_new" AS ENUM ('creator_manual');

ALTER TABLE "hub"
ALTER COLUMN "template_key"
TYPE "hub_template_key_new"
USING 'creator_manual'::"hub_template_key_new";

DROP TYPE "hub_template_key";
ALTER TYPE "hub_template_key_new" RENAME TO "hub_template_key";

ALTER TABLE "hub" ALTER COLUMN "template_key" SET DEFAULT 'creator_manual';
```

- [ ] **Step 5: Register migration in journal**

Append this entry to `packages/db/drizzle/out/meta/_journal.json` after idx `10`:

```json
{
  "idx": 11,
  "version": "7",
  "when": 1777766400000,
  "tag": "0011_creator_manual_template_key",
  "breakpoints": true
}
```

- [ ] **Step 6: Verify DB package typecheck**

Run:

```powershell
pnpm --filter @creatorcanon/db typecheck
```

Expected: PASS.

---

## Task 2: Creator Manual Pipeline Adapter

**Files:**
- Create: `packages/pipeline/src/adapters/creator-manual/manifest-types.ts`
- Create: `packages/pipeline/src/adapters/creator-manual/utils.ts`
- Create: `packages/pipeline/src/adapters/creator-manual/index.ts`
- Create: `packages/pipeline/src/adapters/creator-manual/test/adapter.smoke.test.ts`
- Modify: `packages/pipeline/src/adapters/index.ts`
- Modify: `packages/pipeline/src/adapters/types.ts`
- Modify: `packages/pipeline/src/stages/test/adapt.test.ts`

- [ ] **Step 1: Define the pipeline-side manifest type**

Create `packages/pipeline/src/adapters/creator-manual/manifest-types.ts` with interfaces matching the public `creatorManualManifestSchema`:

```ts
export interface CreatorManualEvidenceRef {
  sourceId: string;
  segmentId?: string;
  timestampStart?: number;
  timestampEnd?: number;
  note?: string;
}

export interface CreatorManualNavItem {
  label: string;
  routeKey:
    | 'home'
    | 'library'
    | 'pillars'
    | 'sources'
    | 'segments'
    | 'claims'
    | 'glossary'
    | 'themes'
    | 'workshop'
    | 'search';
}

export interface CreatorManualNode {
  id: string;
  slug: string;
  type: string;
  title: string;
  summary: string;
  body: string;
  pillarIds: string[];
  themeIds: string[];
  claimIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualPillar {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  sections?: { title: string; body: string }[];
  nodeIds: string[];
  claimIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualSource {
  id: string;
  title: string;
  creatorName: string;
  platform: 'youtube' | 'podcast' | 'article' | 'workshop' | 'other';
  youtubeId: string | null;
  url?: string;
  thumbnailUrl?: string;
  publishedAt: string | null;
  durationSec: number | null;
  summary: string;
  segmentIds: string[];
}

export interface CreatorManualSegment {
  id: string;
  sourceId: string;
  slug: string;
  title: string;
  summary: string;
  timestampStart: number;
  timestampEnd: number;
  transcriptExcerpt: string;
  nodeIds: string[];
  claimIds: string[];
}

export interface CreatorManualClaim {
  id: string;
  title: string;
  statement: string;
  confidence: 'strong' | 'moderate' | 'developing';
  evidence: CreatorManualEvidenceRef[];
  relatedNodeIds: string[];
}

export interface CreatorManualGlossaryEntry {
  id: string;
  term: string;
  slug: string;
  definition: string;
  relatedNodeIds: string[];
}

export interface CreatorManualTheme {
  id: string;
  slug: string;
  title: string;
  summary: string;
  nodeIds: string[];
  pillarIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualWorkshopStage {
  id: string;
  slug: string;
  title: string;
  summary: string;
  objective: string;
  steps: { title: string; body: string }[];
  nodeIds: string[];
  evidence: CreatorManualEvidenceRef[];
}

export interface CreatorManualSearchDoc {
  id: string;
  type: 'node' | 'pillar' | 'source' | 'segment' | 'claim' | 'glossary' | 'theme' | 'workshop';
  recordId: string;
  slug?: string;
  title: string;
  summary: string;
  body?: string;
  keywords?: string[];
}

export interface CreatorManualManifest {
  schemaVersion: 'creator_manual_v1';
  template: { id: 'creator-manual'; version: number };
  hubId: string;
  releaseId: string;
  hubSlug: string;
  visibility: 'public' | 'unlisted';
  publishedAt: string | null;
  generatedAt: string;
  title: string;
  tagline: string;
  creator: {
    name: string;
    handle: string;
    avatarUrl?: string;
    portraitUrl?: string;
    canonicalUrl: string;
    tagline: string;
    thesis: string;
    about: string;
    voiceSummary: string;
  };
  brand: {
    name: string;
    tone: string;
    tokens: {
      colors: {
        background: string;
        foreground: string;
        surface: string;
        elevated: string;
        border: string;
        muted: string;
        accent: string;
        accentForeground: string;
        warning: string;
        success: string;
        typeMap?: Record<string, string>;
      };
      typography: { headingFamily: string; bodyFamily: string };
      radius: string;
      shadow: string;
    };
    assets?: { logoUrl?: string; heroImageUrl?: string; patternImageUrl?: string };
    style: { mode: 'light' | 'dark' | 'system' | 'custom' };
    labels: { evidence?: string; workshop?: string; library?: string };
  };
  navigation: { primary: CreatorManualNavItem[]; secondary: CreatorManualNavItem[] };
  home: {
    eyebrow: string;
    headline: string;
    summary: string;
    featuredNodeIds: string[];
    featuredPillarIds: string[];
  };
  stats: {
    nodeCount: number;
    pillarCount: number;
    sourceCount: number;
    segmentCount: number;
    claimCount: number;
    glossaryCount: number;
  };
  nodes: CreatorManualNode[];
  pillars: CreatorManualPillar[];
  sources: CreatorManualSource[];
  segments: CreatorManualSegment[];
  claims: CreatorManualClaim[];
  glossary: CreatorManualGlossaryEntry[];
  themes: CreatorManualTheme[];
  workshop: CreatorManualWorkshopStage[];
  search: CreatorManualSearchDoc[];
}
```

- [ ] **Step 2: Add adapter utilities**

Create helpers in `utils.ts`:

```ts
export function slugify(value: string, fallback = 'item'): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || fallback;
}

export function nonEmpty(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function excerpt(value: string, max = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 1).trim()}...` : compact;
}

export function seconds(ms: number | null | undefined): number {
  return Math.max(0, Math.floor((ms ?? 0) / 1000));
}

export function youtubeUrl(youtubeId: string | null | undefined): string | undefined {
  return youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : undefined;
}

export function sourceThumbnail(input: {
  youtubeVideoId?: string | null;
  thumbnails?: { small?: string; medium?: string; large?: string; maxres?: string } | null;
}): string | undefined {
  return (
    input.thumbnails?.maxres ??
    input.thumbnails?.large ??
    input.thumbnails?.medium ??
    input.thumbnails?.small ??
    (input.youtubeVideoId ? `https://i.ytimg.com/vi/${input.youtubeVideoId}/hqdefault.jpg` : undefined)
  );
}
```

- [ ] **Step 3: Implement `adaptArchiveToCreatorManual()`**

Create `packages/pipeline/src/adapters/creator-manual/index.ts` that:

1. Loads hub/project/run/channel/channelProfile rows.
2. Loads selected videos through `generationRun.videoSetId -> videoSetItem -> video`.
3. Loads run segments and canonical transcript rows.
4. Loads `page` + `pageVersion` rows from canon/page composition.
5. Loads `canonNode` rows and uses them when pages are sparse.
6. Builds a schema-complete Creator Manual manifest with safe fallbacks.

The adapter must export:

```ts
export const adaptArchiveToCreatorManual: AdapterFn = async ({ runId, hubId, releaseId }) => {
  // implementation
};
```

Minimum runtime behavior:

```ts
const manifest: CreatorManualManifest = {
  schemaVersion: 'creator_manual_v1',
  template: { id: 'creator-manual', version: 1 },
  hubId,
  releaseId,
  hubSlug: hubRow.subdomain,
  visibility: hubRow.accessMode === 'public' ? 'public' : 'unlisted',
  publishedAt: releaseRow?.liveAt?.toISOString() ?? null,
  generatedAt: new Date().toISOString(),
  title: projectRow.title,
  tagline: metadata.tagline ?? `${creatorName}'s source-backed operating manual.`,
  // fill creator, brand, navigation, home, stats, and collections
};
```

The manifest must pass `creatorManualManifestSchema.safeParse(manifest)`.

- [ ] **Step 4: Register only Creator Manual**

In `packages/pipeline/src/adapters/index.ts`, replace the registry with:

```ts
import { adaptArchiveToCreatorManual } from './creator-manual';
import type { AdapterFn } from './types';

export const ADAPTERS: Record<string, AdapterFn> = {
  creator_manual: adaptArchiveToCreatorManual,
};
```

In `packages/pipeline/src/adapters/types.ts`, replace the return type with:

```ts
import type { CreatorManualManifest } from './creator-manual/manifest-types';

export interface AdapterInput {
  runId: string;
  hubId: string;
  releaseId: string;
}

export type AdapterFn = (input: AdapterInput) => Promise<CreatorManualManifest>;
```

- [ ] **Step 5: Replace adapter smoke test**

Create `packages/pipeline/src/adapters/creator-manual/test/adapter.smoke.test.ts` using the existing editorial smoke fixture pattern, but seed hubs with:

```ts
templateKey: 'creator_manual',
```

and validate:

```ts
const parsed = creatorManualManifestSchema.safeParse(manifest);
assert.equal(parsed.success, true);
assert.equal(manifest.schemaVersion, 'creator_manual_v1');
assert.equal(manifest.template.id, 'creator-manual');
assert.ok(manifest.nodes.length >= 1);
assert.ok(manifest.sources.length >= 1);
assert.ok(manifest.search.length >= manifest.nodes.length);
```

- [ ] **Step 6: Update adapt-stage test**

In `packages/pipeline/src/stages/test/adapt.test.ts`, replace seed and assertions:

```ts
templateKey: 'creator_manual',
assert.equal(output.templateKey, 'creator_manual');
assert.equal(parsed.schemaVersion, 'creator_manual_v1');
assert.equal(parsed.releaseId, 'unpublished');
assert.ok(parsed.nodes.length >= 1, 'at least 1 node expected');
```

- [ ] **Step 7: Run targeted pipeline tests**

Run:

```powershell
pnpm --filter @creatorcanon/pipeline test -- --test-name-pattern "creator-manual|runAdaptStage"
```

Expected: PASS or skipped only because required env is unavailable.

---

## Task 3: Publish and Generation Handoff

**Files:**
- Modify: `packages/pipeline/src/publish-run-as-hub.ts`
- Modify: `packages/pipeline/src/run-generation-pipeline.ts`
- Modify: `apps/web/src/app/app/configure/actions.ts`
- Modify: smoke/inspection scripts listed in File Structure.

- [ ] **Step 1: Make hub creation Creator Manual by default**

In `getOrCreateHub()` inside `packages/pipeline/src/publish-run-as-hub.ts`, insert hubs with:

```ts
templateKey: 'creator_manual',
```

When an existing hub is found, update both `theme` and old `templateKey`:

```ts
const updates: Partial<typeof hub.$inferInsert> = { updatedAt: new Date() };
if (existing[0].theme !== input.theme) updates.theme = input.theme;
if (existing[0].templateKey !== 'creator_manual') updates.templateKey = 'creator_manual';
```

- [ ] **Step 2: Replace publish validation**

Replace `assertEditorialAtlasV1()` with:

```ts
function assertCreatorManualV1(value: unknown): asserts value is CreatorManualManifest {
  if (
    typeof value !== 'object' ||
    value === null ||
    (value as { schemaVersion?: unknown }).schemaVersion !== 'creator_manual_v1'
  ) {
    throw new Error(
      `publish: adapt-stage manifest has unexpected schemaVersion='${
        (value as { schemaVersion?: unknown } | null)?.schemaVersion ?? 'missing'
      }'. Expected 'creator_manual_v1'.`,
    );
  }
}
```

Use `CreatorManualManifest` from `./adapters/creator-manual/manifest-types`.

- [ ] **Step 3: Stamp and count Creator Manual manifests**

Replace `pages.length` with:

```ts
const pageCount = finalManifest.stats.nodeCount;
```

Return that value for both existing-live and newly published releases.

- [ ] **Step 4: Remove Editorial Atlas wording from generation pipeline**

In `packages/pipeline/src/run-generation-pipeline.ts`, change comments/errors:

```ts
// Require a hub row because the adapt stage writes a hub-specific Creator Manual manifest.
```

and:

```ts
`Creator Manual pipeline requires a hub row for projectId='${payload.projectId}'`
```

- [ ] **Step 5: Update script assertions**

In each smoke/inspect script, replace `EditorialAtlasManifest` imports and `editorial_atlas_v1` checks with `CreatorManualManifest` and `creator_manual_v1`. Count nodes/sources instead of pages when printing summary:

```ts
assert.equal(manifest.schemaVersion, 'creator_manual_v1');
console.info(`nodes=${manifest.stats.nodeCount}, sources=${manifest.stats.sourceCount}`);
```

- [ ] **Step 6: Run targeted typecheck**

Run:

```powershell
pnpm --filter @creatorcanon/pipeline typecheck
```

Expected: PASS.

---

## Task 4: Web Runtime Cleanup

**Files:**
- Modify: `apps/web/src/lib/hub/manifest/schema.ts`
- Modify: `apps/web/src/app/h/[hubSlug]/manifest.ts`
- Modify: `apps/web/src/app/h/[hubSlug]/page.tsx`
- Modify: `apps/web/src/app/h/[hubSlug]/opengraph-image.tsx`
- Modify: Creator Manual route files under `library`, `pillars`, `segments`, `claims`, `glossary`, `themes`, `workshop`, `search`, and `sources`
- Modify: `apps/web/src/components/hub/templates.ts`
- Delete: old Editorial Atlas UI/routes/schema tests listed above.

- [ ] **Step 1: Make manifest schema Creator Manual only**

In `apps/web/src/lib/hub/manifest/schema.ts`, replace the whole file with:

```ts
import {
  creatorManualManifestSchema,
  type CreatorManualManifest,
} from '../creator-manual/schema';

export const hubManifestSchema = creatorManualManifestSchema;
export type HubManifest = CreatorManualManifest;
export type { CreatorManualManifest };

export function isCreatorManualManifest(manifest: HubManifest): manifest is CreatorManualManifest {
  return manifest.schemaVersion === 'creator_manual_v1';
}
```

- [ ] **Step 2: Remove legacy manifest loaders**

In `apps/web/src/app/h/[hubSlug]/manifest.ts`:

1. Remove `permanentRedirect`, `isEditorialAtlasManifest`, and `EditorialAtlasManifest`.
2. Remove `loadEditorialAtlasManifest`.
3. Remove `loadCreatorManualManifestOrLegacyRedirect`.
4. Keep `loadCreatorManualManifest`.
5. Wrap R2 JSON parse/schema parse:

```ts
let manifest: CreatorManualManifest;
try {
  manifest = hubManifestSchema.parse(JSON.parse(decoded));
} catch {
  notFound();
}
```

- [ ] **Step 3: Make hub home Creator Manual only**

In `apps/web/src/app/h/[hubSlug]/page.tsx`, remove all imports from `EditorialAtlas`, `workbench`, and old routes. Render only:

```tsx
const { manifest } = await loadCreatorManualManifest(params.hubSlug);
const index = buildCreatorManualIndex(manifest);
return (
  <CreatorManualShell manifest={manifest} activeRouteKey="home">
    <CreatorManualHome manifest={manifest} index={index} />
  </CreatorManualShell>
);
```

- [ ] **Step 4: Convert Creator Manual routes to strict Creator Manual loaders**

For each Creator Manual route using `loadCreatorManualManifestOrLegacyRedirect`, replace:

```ts
import { loadCreatorManualManifestOrLegacyRedirect, loadHubManifest } from '../manifest';
```

with:

```ts
import { loadCreatorManualManifest } from '../manifest';
```

Then use:

```ts
const { manifest } = await loadCreatorManualManifest(params.hubSlug);
```

For metadata, load the Creator Manual manifest directly and remove non-Creator branches.

- [ ] **Step 5: Clean overlapping `/sources` and `/search` routes**

In `sources/page.tsx`, `sources/[videoId]/page.tsx`, and `search/page.tsx`, remove Editorial imports/branches and render Creator Manual only.

- [ ] **Step 6: Delete Editorial-only routes and components**

Use exact paths only:

```powershell
Remove-Item -LiteralPath 'apps\web\src\components\hub\EditorialAtlas' -Recurse
Remove-Item -LiteralPath 'apps\web\src\components\hub\publicTemplates.tsx'
Remove-Item -LiteralPath 'apps\web\src\lib\hub\workbench.ts'
Remove-Item -LiteralPath 'apps\web\src\lib\hub\manifest\mockManifest.ts'
Remove-Item -LiteralPath 'apps\web\src\lib\hub\manifest\mockManifest.test.ts'
Remove-Item -LiteralPath 'apps\web\src\lib\hub\manifest\schema.highlights.test.ts'
Remove-Item -LiteralPath 'apps\web\src\app\h\[hubSlug]\ask' -Recurse
Remove-Item -LiteralPath 'apps\web\src\app\h\[hubSlug]\highlights' -Recurse
Remove-Item -LiteralPath 'apps\web\src\app\h\[hubSlug]\methodology' -Recurse
Remove-Item -LiteralPath 'apps\web\src\app\h\[hubSlug]\pages' -Recurse
Remove-Item -LiteralPath 'apps\web\src\app\h\[hubSlug]\start' -Recurse
Remove-Item -LiteralPath 'apps\web\src\app\h\[hubSlug]\topics' -Recurse
Remove-Item -LiteralPath 'apps\web\src\app\h\[hubSlug]\[slug]' -Recurse
```

- [ ] **Step 7: Rebrand template skins**

In `apps/web/src/components/hub/templates.ts`, keep ids `paper|midnight|field` but change names away from Editorial Atlas:

```ts
paper.name = 'Creator Manual';
midnight.name = 'Operator Manual';
field.name = 'Studio Manual';
```

Keep the IDs because project config still stores these as visual presets.

- [ ] **Step 8: Run web tests and typecheck**

Run:

```powershell
pnpm --filter @creatorcanon/web test
pnpm --filter @creatorcanon/web typecheck
```

Expected: PASS.

---

## Task 5: Delete Pipeline Editorial Atlas and Finish References

**Files:**
- Delete: `packages/pipeline/src/adapters/editorial-atlas/**`
- Modify: any source files still found by the checks below.

- [ ] **Step 1: Delete old pipeline adapter folder**

Run from the worktree root after confirming Task 2 and Task 3 pass:

```powershell
Remove-Item -LiteralPath 'packages\pipeline\src\adapters\editorial-atlas' -Recurse
```

- [ ] **Step 2: Search for forbidden old runtime references**

Run:

```powershell
Get-ChildItem -Path apps\web\src,packages\pipeline\src,packages\db\src -Recurse -File -Include *.ts,*.tsx |
  Select-String -Pattern 'editorial_atlas|EditorialAtlas|editorial-atlas|legacy_v0|loadEditorialAtlasManifest|Editorial Atlas'
```

Expected: no results, except historical text inside migration SQL files under `packages/db/drizzle/out`.

- [ ] **Step 3: Fix any remaining imports**

If the search finds a source import or runtime branch, remove it. Do not keep compatibility code for Editorial Atlas.

- [ ] **Step 4: Run package typechecks**

Run:

```powershell
pnpm --filter @creatorcanon/pipeline typecheck
pnpm --filter @creatorcanon/web typecheck
```

Expected: PASS.

---

## Task 6: Migrate DB, Full Verification, Review, Commit, Push

**Files:**
- Modify only files needed for fixes from verification/review.

- [ ] **Step 1: Apply the DB migration**

Run:

```powershell
pnpm db:migrate
```

Expected: `[db] migrations applied`.

If it fails due missing DB connectivity or extension permissions, capture the exact error and continue with code verification. Do not fake migration success.

- [ ] **Step 2: Run full verification**

Run:

```powershell
pnpm --filter @creatorcanon/db typecheck
pnpm --filter @creatorcanon/pipeline test
pnpm --filter @creatorcanon/web test
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Browser verify the Creator Manual preview**

Use the running app or start it only if not already running from this worktree:

```powershell
pnpm --filter @creatorcanon/web dev
```

Verify:

- `http://localhost:3000/h/creator-manual-preview`
- `http://localhost:3000/h/creator-manual-preview/library`
- `http://localhost:3000/h/creator-manual-preview/sources`
- `http://localhost:3000/h/creator-manual-preview/search`

Expected: no console errors, no horizontal overflow, smooth Creator Manual UI still renders.

- [ ] **Step 4: Request and receive code review**

Use the requested Superpowers review flow:

1. Dispatch a reviewer for spec compliance: old Editorial Atlas removed, Creator Manual is only generated template, DB migration exists/applied, no audit-server worktree touched.
2. Dispatch a reviewer for code quality: type safety, migration safety, route cleanup, adapter fallbacks, no broken imports.
3. Fix every actionable issue.
4. Re-run affected tests.

- [ ] **Step 5: Final forbidden reference scan**

Run:

```powershell
Get-ChildItem -Path apps\web\src,packages\pipeline\src,packages\db\src -Recurse -File -Include *.ts,*.tsx |
  Select-String -Pattern 'editorial_atlas|EditorialAtlas|editorial-atlas|legacy_v0|loadEditorialAtlasManifest|Editorial Atlas'
```

Expected: no source results.

- [ ] **Step 6: Commit and push**

Run:

```powershell
git status --short
git add apps packages docs
git commit -m "replace editorial atlas with creator manual"
git push
```

Expected: branch `feat/creator-manual-template` pushed to origin.

---

## Self-Review

- Spec coverage: The plan removes the old UI, routes, manifest schema, adapter, DB default, generation handoff, publish validator, tests, and smoke assertions. It includes the DB migration application and branch push.
- Placeholder scan: No `TODO`, `TBD`, or unspecified implementation step remains. Adapter internals are intentionally described by exact data sources and required schema behavior, because the worker must fit the existing DB rows rather than paste a brittle mock implementation.
- Type consistency: The new DB key is `creator_manual`, the manifest schema is `creator_manual_v1`, and the template id inside manifests is `creator-manual`.
