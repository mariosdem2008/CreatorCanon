# Audit To Creator Manual Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A creator can finish a public archive audit, tap Generate Hub, and CreatorCanon creates a branded Creator Manual hub pipeline-ready from that audit without touching the old Editorial Atlas code path.

**Architecture:** Add an additive audit-to-hub handoff layer in the isolated `feat/audit-to-creator-manual-handoff` worktree. The handoff loads the saved audit report, normalizes it into a source-backed hub request, calls a design-spec agent, seeds channel/video/project/run/hub records with the design spec, runs the existing generation pipeline, and auto-publishes when the generation came from an audit handoff. The Creator Manual template remains the only hub template key and consumes brand/design metadata from `hub.metadata`.

**Tech Stack:** Next.js App Router server actions, Drizzle/Postgres migrations, existing `@creatorcanon/pipeline` stage harness, OpenAI chat JSON schema calls, existing worker queue/Trigger patterns, Creator Manual manifest schema, Node test runner, Turborepo.

---

## Guardrails

- Work only in `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\audit-to-creator-manual-handoff`.
- Read from `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\free-archive-audit` only as reference.
- Do not write to or run commands inside `C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\audit-server`; Claude is working there.
- All DB changes are additive except the already-completed Editorial Atlas enum cleanup from the template branch.
- The migration must not alter existing pipeline tables destructively. New audit tables and indexes are safe.
- Use TDD for production behavior: write failing tests, run them, implement, rerun.
- Default generation path remains unchanged for manual project creation and checkout.

## File Map

- Create `packages/db/src/schema/archive_audit.ts`: public archive audit table plus audit-to-hub linkage table.
- Modify `packages/db/src/schema/enums.ts`: add `archiveAuditStatusEnum`.
- Modify `packages/db/src/schema/index.ts`: export archive audit schema.
- Create `packages/db/drizzle/out/0012_archive_audit_handoff.sql`: additive migration for audit tables.
- Modify `packages/db/drizzle/out/meta/_journal.json`: append migration entry.
- Create `packages/adapters/src/youtube/public-channel.ts`: public YouTube API client used by archive audits.
- Modify `packages/adapters/src/index.ts` and `packages/adapters/package.json`: export the public channel client.
- Create `packages/pipeline/src/audit/*`: portable archive-audit engine from the audit branch.
- Modify `packages/pipeline/src/index.ts` and `packages/pipeline/package.json`: export `@creatorcanon/pipeline/audit`.
- Create `packages/pipeline/src/audit-handoff/types.ts`: normalized audit input and design spec schemas.
- Create `packages/pipeline/src/audit-handoff/design-spec.ts`: deterministic fallback and OpenAI-backed design spec agent.
- Create `packages/pipeline/src/audit-handoff/seed.ts`: idempotent channel/video/project/run/hub seeding from audit output.
- Create `packages/pipeline/src/audit-handoff/run-audit-hub-generation.ts`: orchestration and auto-publish helper.
- Create `packages/pipeline/src/audit-handoff/index.ts`: handoff exports.
- Modify `packages/pipeline/src/publish-run-as-hub.ts`: keep publishing generic but allow audit handoff metadata to flow to release metadata.
- Modify `apps/worker/src/queue-runner.ts`: after a queued generation run completes, auto-publish only when linked in `audit_hub_generation`.
- Create/modify `apps/worker/src/tasks/run-audit-hub.ts` and `apps/worker/src/tasks/index.ts`: optional Trigger task for audit handoff dispatch.
- Create `apps/web/src/app/(marketing)/archive-audit/*`: public audit route/actions/view-model.
- Create `apps/web/src/components/marketing/archive-audit/*`: audit UI and Generate Hub CTA.
- Create `apps/web/src/app/(marketing)/archive-audit/generate-hub-action.ts`: authenticated server action for the CTA.
- Modify `packages/pipeline/src/adapters/creator-manual/index.ts`: consume more brand customizations from design spec.
- Modify `packages/db/src/schema/release.ts`: widen `HubMetadata.brand` type so the template can be redesigned through metadata.

## Task 1: Port The Archive Audit Substrate

**Files:**
- Create: `packages/db/src/schema/archive_audit.ts`
- Modify: `packages/db/src/schema/enums.ts`
- Modify: `packages/db/src/schema/index.ts`
- Create: `packages/adapters/src/youtube/public-channel.ts`
- Modify: `packages/adapters/src/index.ts`
- Modify: `packages/adapters/package.json`
- Create: `packages/pipeline/src/audit/index.ts`
- Create: `packages/pipeline/src/audit/types.ts`
- Create: `packages/pipeline/src/audit/url.ts`
- Create: `packages/pipeline/src/audit/sampling.ts`
- Create: `packages/pipeline/src/audit/scoring.ts`
- Create: `packages/pipeline/src/audit/transcripts.ts`
- Create: `packages/pipeline/src/audit/prompt.ts`
- Create: `packages/pipeline/src/audit/run-archive-audit.ts`
- Modify: `packages/pipeline/src/index.ts`
- Modify: `packages/pipeline/package.json`
- Test: `packages/pipeline/src/audit/*.test.ts`

- [ ] **Step 1: Write failing schema/export tests**

```ts
// packages/pipeline/src/audit/types.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditReportSchema } from './types';

describe('archive audit report contract', () => {
  it('accepts the public audit report shape used by audit-to-hub handoff', () => {
    const parsed = auditReportSchema.parse({
      version: 1,
      channel: {
        id: 'UC123',
        title: 'Creator Name',
        handle: '@creator',
        url: 'https://www.youtube.com/@creator',
        thumbnailUrl: null,
      },
      scanned: { videoCount: 12, transcriptCount: 4, publicDataOnly: true },
      scores: {
        overall: 82,
        knowledgeDensity: 84,
        sourceDepth: 78,
        positioningClarity: 80,
        monetizationPotential: 86,
      },
      positioning: {
        oneLineRead: 'Practical operator education.',
        audience: 'Founders',
        authorityAngle: 'Field-tested systems',
      },
      inventory: {
        frameworks: ['Offer design'],
        playbooks: ['Sales calls'],
        proofMoments: ['Workshop breakdown'],
        repeatedThemes: ['Pricing', 'Hiring', 'Lead flow'],
      },
      blueprint: {
        hubTitle: 'Creator Name Manual',
        tracks: [
          { title: 'Start', description: 'Core orientation.', candidatePages: ['Overview'] },
          { title: 'Build', description: 'Operating systems.', candidatePages: ['Systems'] },
          { title: 'Scale', description: 'Growth loops.', candidatePages: ['Growth'] },
        ],
        sampleLesson: {
          title: 'Offer ladder',
          promise: 'Clarify the next best offer.',
          sourceVideoIds: ['abc123'],
        },
      },
      monetization: {
        leadMagnet: 'A practical checklist.',
        paidHub: 'A premium manual.',
        authorityOffer: 'Advisory support.',
        priority: 'Build the first hub.',
      },
      gaps: [{ label: 'Transcript depth', severity: 'medium', fix: 'Connect the channel.' }],
      creatorCanonFit: {
        summary: 'Strong fit.',
        buildPlan: ['Pick sources.', 'Generate canon.', 'Publish manual.'],
        cta: 'Build the hub',
      },
      auditMemo: {
        headlineFinding: 'The archive can become a manual.',
        bestFirstHub: 'Creator Name Manual',
        whatINoticed: {
          summary: 'Clear repeated themes.',
          repeatedTopics: ['Pricing', 'Hiring', 'Lead flow'],
          currentFriction: ['Archive is scattered', 'No guided path', 'Weak citation surface'],
          opportunity: 'Package the operating system.',
        },
        fitScoreRows: [
          { signal: 'Useful archive depth', score: 8, whyItMatters: 'Enough videos.' },
          { signal: 'Evergreen value', score: 8, whyItMatters: 'Durable topics.' },
          { signal: 'Audience pain', score: 8, whyItMatters: 'Clear pain.' },
          { signal: 'Product potential', score: 9, whyItMatters: 'Strong use case.' },
        ],
        recommendedHub: {
          name: 'Creator Name Manual',
          targetAudience: 'Founders',
          outcome: 'Build better systems.',
          whyThisFirst: 'It is focused.',
          firstPages: ['Overview', 'Pricing', 'Sales', 'Hiring', 'Systems'],
        },
        examplePage: {
          title: 'Offer ladder',
          simpleSummary: 'A practical offer page.',
          recommendedPath: ['Watch', 'Extract', 'Apply', 'Review'],
          archiveConnection: 'Uses the strongest source videos.',
          sourceVideosUsed: [{ videoId: 'abc123', title: 'Offer video' }],
          takeaways: ['Clarify buyer', 'Name outcome', 'Sequence offers'],
        },
        businessUses: {
          leadMagnet: 'Checklist',
          paidMiniProduct: 'Paid manual',
          courseSupport: 'Course companion',
          authorityAsset: 'Public proof hub',
        },
      },
    });

    assert.equal(parsed.channel.title, 'Creator Name');
  });
});
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `pnpm --filter @creatorcanon/pipeline test -- src/audit/types.test.ts`

Expected: FAIL because `packages/pipeline/src/audit/types.ts` does not exist.

- [ ] **Step 3: Port implementation from read-only audit worktree**

Port the known-good files from `free-archive-audit`:

```powershell
# Reference only. Do not modify this worktree.
Get-Content -LiteralPath 'C:\Users\mario\Desktop\CHANNEL ATLAS\SaaS\.worktrees\free-archive-audit\packages\pipeline\src\audit\types.ts'
```

Create matching files in the integration worktree using `apply_patch`. Keep imports pointed at current package names. Add `archiveAuditStatusEnum` and the DB table schema.

- [ ] **Step 4: Export public YouTube audit adapter**

Add:

```ts
export { createPublicYouTubeClient } from './youtube/public-channel';
export type {
  PublicYouTubeChannel,
  PublicYouTubeChannelInput,
  PublicYouTubeClient,
  PublicYouTubeVideo,
} from './youtube/public-channel';
```

Add package export:

```json
"./youtube/public-channel": "./src/youtube/public-channel.ts"
```

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm --filter @creatorcanon/adapters test
pnpm --filter @creatorcanon/pipeline test -- src/audit/types.test.ts src/audit/sampling.test.ts src/audit/scoring.test.ts src/audit/url.test.ts
pnpm --filter @creatorcanon/pipeline typecheck
```

Expected: PASS.

## Task 2: Add Audit Handoff Contracts And Design Spec Agent

**Files:**
- Create: `packages/pipeline/src/audit-handoff/types.ts`
- Create: `packages/pipeline/src/audit-handoff/design-spec.ts`
- Create: `packages/pipeline/src/audit-handoff/index.ts`
- Test: `packages/pipeline/src/audit-handoff/types.test.ts`
- Test: `packages/pipeline/src/audit-handoff/design-spec.test.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
// packages/pipeline/src/audit-handoff/types.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  creatorManualDesignSpecSchema,
  normalizeDesignSpecForHubMetadata,
} from './types';

describe('Creator Manual design spec contract', () => {
  it('requires complete brand colors and customization metadata', () => {
    const spec = creatorManualDesignSpecSchema.parse({
      version: 1,
      brand: {
        name: 'Creator Manual',
        tone: 'High-trust, direct, evidence-led.',
        colors: {
          background: '#f7f3ea',
          foreground: '#161513',
          surface: '#fffaf0',
          elevated: '#ffffff',
          border: '#d8cebd',
          muted: '#686056',
          accent: '#0f766e',
          accentForeground: '#ffffff',
          warning: '#b45309',
          success: '#15803d',
          typeMap: {
            lesson: '#0f766e',
            framework: '#1d4ed8',
            playbook: '#7c3aed',
          },
        },
        typography: {
          headingFamily: 'Georgia, serif',
          bodyFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
        },
        assets: {},
        style: { mode: 'custom' },
        labels: {
          evidence: 'Source clips',
          workshop: 'Operating workshop',
          library: 'Manual library',
        },
        radius: '8px',
        shadow: '0 18px 60px rgba(22, 21, 19, 0.14)',
      },
      positioning: {
        tagline: 'A source-backed operating manual.',
        homeHeadline: 'The Creator Manual',
        homeSummary: 'A practical map of the archive.',
      },
      motion: {
        intensity: 'standard',
        principles: ['Fast staggered reveals', 'No blocking animation'],
      },
      customization: {
        editableKeys: ['brand.colors.accent', 'brand.typography.headingFamily'],
      },
    });

    const metadata = normalizeDesignSpecForHubMetadata(spec);

    assert.equal(metadata.brand?.colors?.accent, '#0f766e');
    assert.equal(metadata.brand?.labels?.evidence, 'Source clips');
    assert.equal(metadata.tagline, 'A source-backed operating manual.');
  });
});
```

- [ ] **Step 2: Run the contract tests to verify failure**

Run: `pnpm --filter @creatorcanon/pipeline test -- src/audit-handoff/types.test.ts`

Expected: FAIL because the audit-handoff module does not exist.

- [ ] **Step 3: Implement schemas and deterministic fallback**

Create:

```ts
export const creatorManualDesignSpecSchema = z.object({
  version: z.literal(1),
  brand: z.object({
    name: z.string().min(1).max(120),
    tone: z.string().min(1).max(240),
    colors: z.object({
      background: hexColor,
      foreground: hexColor,
      surface: hexColor,
      elevated: hexColor,
      border: hexColor,
      muted: hexColor,
      accent: hexColor,
      accentForeground: hexColor,
      warning: hexColor,
      success: hexColor,
      typeMap: z.record(z.string().regex(/^[a-z][a-z0-9_-]*$/), hexColor).default({}),
    }),
    typography: z.object({
      headingFamily: z.string().min(1),
      bodyFamily: z.string().min(1),
    }),
    assets: z.object({
      logoUrl: z.string().url().optional(),
      heroImageUrl: z.string().url().optional(),
      patternImageUrl: z.string().url().optional(),
    }).default({}),
    style: z.object({ mode: z.enum(['light', 'dark', 'system', 'custom']) }),
    labels: z.object({
      evidence: z.string().min(1),
      workshop: z.string().min(1),
      library: z.string().min(1),
    }),
    radius: z.string().min(1),
    shadow: z.string().min(1),
  }),
  positioning: z.object({
    tagline: z.string().min(1).max(240),
    homeHeadline: z.string().min(1).max(160),
    homeSummary: z.string().min(1).max(420),
  }),
  motion: z.object({
    intensity: z.enum(['subtle', 'standard', 'expressive']),
    principles: z.array(z.string().min(1)).min(1).max(6),
  }),
  customization: z.object({
    editableKeys: z.array(z.string().min(1)).min(1),
  }),
});
```

The deterministic fallback must derive a polished but safe design spec from audit score and creator category, never from random output.

- [ ] **Step 4: Write failing design-agent tests**

```ts
// packages/pipeline/src/audit-handoff/design-spec.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackCreatorManualDesignSpec, generateCreatorManualDesignSpec } from './design-spec';
import type { AuditReport } from '../audit';

const report = {
  version: 1,
  channel: { id: 'UC1', title: 'Operator Lab', handle: '@operatorlab', url: 'https://www.youtube.com/@operatorlab', thumbnailUrl: null },
  scanned: { videoCount: 20, transcriptCount: 5, publicDataOnly: true },
  scores: { overall: 88, knowledgeDensity: 90, sourceDepth: 82, positioningClarity: 84, monetizationPotential: 91 },
  positioning: { oneLineRead: 'Operator education.', audience: 'Founders', authorityAngle: 'Field-tested systems' },
  inventory: { frameworks: ['Offer systems'], playbooks: ['Sales operating rhythm'], proofMoments: ['Workshop clip'], repeatedThemes: ['Sales', 'Pricing', 'Hiring'] },
  blueprint: { hubTitle: 'Operator Lab Manual', tracks: [
    { title: 'Start', description: 'Start here.', candidatePages: ['Overview'] },
    { title: 'Build', description: 'Build systems.', candidatePages: ['Systems'] },
    { title: 'Scale', description: 'Scale.', candidatePages: ['Scale'] },
  ], sampleLesson: { title: 'Offer systems', promise: 'Clarify the offer.', sourceVideoIds: ['yt1'] } },
  monetization: { leadMagnet: 'Checklist', paidHub: 'Manual', authorityOffer: 'Advisory', priority: 'Build hub' },
  gaps: [],
  creatorCanonFit: { summary: 'Strong fit', buildPlan: ['Extract', 'Organize', 'Publish'], cta: 'Build it' },
  auditMemo: {
    headlineFinding: 'Strong archive.',
    bestFirstHub: 'Operator Lab Manual',
    whatINoticed: { summary: 'Themes repeat.', repeatedTopics: ['Sales', 'Pricing', 'Hiring'], currentFriction: ['Scattered'], opportunity: 'Package it.' },
    fitScoreRows: [
      { signal: 'Useful archive depth', score: 8, whyItMatters: 'Enough depth.' },
      { signal: 'Evergreen value', score: 8, whyItMatters: 'Evergreen.' },
      { signal: 'Audience pain', score: 9, whyItMatters: 'Pain.' },
      { signal: 'Product potential', score: 9, whyItMatters: 'Potential.' },
    ],
    recommendedHub: { name: 'Operator Lab Manual', targetAudience: 'Founders', outcome: 'Build systems.', whyThisFirst: 'Focused.', firstPages: ['Overview', 'Sales', 'Pricing', 'Hiring', 'Systems'] },
    examplePage: { title: 'Offer systems', simpleSummary: 'A page.', recommendedPath: ['Watch', 'Extract', 'Apply', 'Review'], archiveConnection: 'Uses sources.', sourceVideosUsed: [{ videoId: 'yt1', title: 'Offer video' }], takeaways: ['One', 'Two', 'Three'] },
    businessUses: { leadMagnet: 'Checklist', paidMiniProduct: 'Manual', courseSupport: 'Course', authorityAsset: 'Proof' },
  },
} satisfies AuditReport;

describe('Creator Manual design spec agent', () => {
  it('builds a deterministic fallback when no model client is supplied', async () => {
    const spec = await generateCreatorManualDesignSpec({ auditReport: report, modelClient: null });
    assert.equal(spec.brand.name, 'Operator Lab Manual');
    assert.match(spec.brand.colors.accent, /^#[0-9a-fA-F]{6}$/);
  });

  it('keeps fallback color palette complete', () => {
    const spec = buildFallbackCreatorManualDesignSpec(report);
    assert.ok(spec.brand.colors.background);
    assert.ok(spec.brand.colors.foreground);
    assert.ok(spec.brand.colors.typeMap.framework);
  });
});
```

- [ ] **Step 5: Implement OpenAI-backed agent with JSON schema**

Use `createOpenAIClient(parseServerEnv(process.env))` only when a client is not injected and env is available. If the provider fails or returns invalid JSON, fall back to deterministic spec and preserve the error reason in the orchestration artifact.

- [ ] **Step 6: Verify**

Run:

```powershell
pnpm --filter @creatorcanon/pipeline test -- src/audit-handoff/types.test.ts src/audit-handoff/design-spec.test.ts
pnpm --filter @creatorcanon/pipeline typecheck
```

Expected: PASS.

## Task 3: Seed Project, Run, Hub, And Source Records From An Audit

**Files:**
- Create: `packages/pipeline/src/audit-handoff/seed.ts`
- Test: `packages/pipeline/src/audit-handoff/seed.test.ts`
- Modify: `packages/db/src/schema/archive_audit.ts`

- [ ] **Step 1: Write failing seed tests**

```ts
// packages/pipeline/src/audit-handoff/seed.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditVideoSeedSet, buildAuditProjectConfig } from './seed';

describe('audit handoff seed helpers', () => {
  it('selects source videos from sample lesson first, then recommended page sources', () => {
    const selected = buildAuditVideoSeedSet({
      sampleLessonVideoIds: ['a', 'b'],
      examplePageVideoIds: ['b', 'c'],
      maxVideos: 4,
    });

    assert.deepEqual(selected, ['a', 'b', 'c']);
  });

  it('stores audit and design context in project config', () => {
    const config = buildAuditProjectConfig({
      auditId: 'aa_123',
      designSpecId: 'design_1',
      audience: 'Founders',
      tone: 'High-trust, direct, evidence-led.',
    });

    assert.equal(config.audit_handoff?.auditId, 'aa_123');
    assert.equal(config.audience, 'Founders');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @creatorcanon/pipeline test -- src/audit-handoff/seed.test.ts`

Expected: FAIL because `seed.ts` does not exist.

- [ ] **Step 3: Implement idempotent seeding helpers**

The seed helper must:

- create or reuse a `channel` row by `(workspaceId, youtubeChannelId)`;
- create or reuse `video` rows by `(workspaceId, youtubeVideoId)`;
- create a locked `video_set`;
- create a `project`;
- create a `generation_run` with `status='queued'` only after handoff metadata is ready;
- create or update a `hub` with `templateKey='creator_manual'`, `freePreview='all'`, and design metadata;
- insert `audit_hub_generation` linking `auditId`, `workspaceId`, `projectId`, `runId`, `hubId`, `actorUserId`, and `autoPublish=true`.

When public video metadata is missing because the public audit report only stores IDs, create minimal video rows with title fallback from `auditMemo.examplePage.sourceVideosUsed`.

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm --filter @creatorcanon/pipeline test -- src/audit-handoff/seed.test.ts
pnpm --filter @creatorcanon/pipeline typecheck
```

Expected: PASS.

## Task 4: Orchestrate The Audit-To-Hub Pipeline And Auto-Publish

**Files:**
- Create: `packages/pipeline/src/audit-handoff/run-audit-hub-generation.ts`
- Modify: `packages/pipeline/src/audit-handoff/index.ts`
- Modify: `apps/worker/src/queue-runner.ts`
- Create: `apps/worker/src/tasks/run-audit-hub.ts`
- Modify: `apps/worker/src/tasks/index.ts`
- Test: `packages/pipeline/src/audit-handoff/run-audit-hub-generation.test.ts`
- Test: `apps/worker/src/queue-runner.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

```ts
// packages/pipeline/src/audit-handoff/run-audit-hub-generation.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAuditHubGenerationResult } from './run-audit-hub-generation';

describe('audit hub generation result summary', () => {
  it('returns project, run, hub, and release IDs for UI redirects', () => {
    const summary = summarizeAuditHubGenerationResult({
      auditId: 'aa_123',
      projectId: 'prj_1',
      runId: 'run_1',
      hubId: 'hub_1',
      releaseId: 'rel_1',
      publicPath: '/h/operator-lab',
      status: 'published',
    });

    assert.equal(summary.projectPath, '/app/projects/prj_1');
    assert.equal(summary.publicPath, '/h/operator-lab');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @creatorcanon/pipeline test -- src/audit-handoff/run-audit-hub-generation.test.ts`

Expected: FAIL because the orchestrator does not exist.

- [ ] **Step 3: Implement orchestration**

Implement:

```ts
export async function startAuditHubGeneration(input: {
  auditId: string;
  workspaceId: string;
  actorUserId: string;
  autoPublish?: boolean;
}): Promise<StartAuditHubGenerationResult>
```

Responsibilities:

- load `archive_audit` row and require `status='succeeded'`;
- parse `archiveAudit.report` with `auditReportSchema`;
- generate design spec;
- write pre-generation artifacts with `runStage` after run creation:
  - `audit_handoff_context`
  - `audit_design_spec`
- seed/update `hub.metadata` with normalized design metadata;
- leave the `generation_run.status='queued'` so existing dispatch/worker flow can process it;
- mark `audit_hub_generation.status='queued'`.

Implement:

```ts
export async function completeAuditGeneratedRun(input: {
  runId: string;
}): Promise<AuditHubCompletionResult | null>
```

Responsibilities:

- find linked `audit_hub_generation`;
- if no link or `autoPublish=false`, return `null`;
- require generation run is `awaiting_review`;
- call `publishRunAsHub` with stored `actorUserId`;
- update `audit_hub_generation` to `published` and set `releaseId`;
- on error, update status to `failed` with error details and rethrow.

- [ ] **Step 4: Modify queue runner for audit auto-publish only**

After `runGenerationPipeline(payload)` succeeds:

```ts
const published = await completeAuditGeneratedRun({ runId: payload.runId });
if (published) {
  log('auto-published audit generated hub', {
    runId: payload.runId,
    releaseId: published.releaseId,
    publicPath: published.publicPath,
  });
}
```

Manual checkout-generated runs should not auto-publish because they do not have an `audit_hub_generation` link.

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm --filter @creatorcanon/pipeline test -- src/audit-handoff/run-audit-hub-generation.test.ts
pnpm --filter @creatorcanon/worker typecheck
pnpm --filter @creatorcanon/pipeline typecheck
```

Expected: PASS.

## Task 5: Add Generate Hub CTA To The Audit Page

**Files:**
- Create: `apps/web/src/app/(marketing)/archive-audit/actions.ts`
- Create: `apps/web/src/app/(marketing)/archive-audit/generate-hub-action.ts`
- Create: `apps/web/src/app/(marketing)/archive-audit/audit-view-model.ts`
- Create: `apps/web/src/app/(marketing)/archive-audit/page.tsx`
- Create: `apps/web/src/components/marketing/archive-audit/ArchiveAuditClient.tsx`
- Create: `apps/web/src/components/marketing/archive-audit/AuditReport.tsx`
- Create supporting audit UI components from `free-archive-audit`
- Test: `apps/web/src/app/(marketing)/archive-audit/audit-view-model.test.ts`

- [ ] **Step 1: Write failing view model tests**

```ts
// apps/web/src/app/(marketing)/archive-audit/audit-view-model.test.ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditCtaUrl, buildAuditGeneratedProjectUrl } from './audit-view-model';

describe('archive audit view model', () => {
  it('preserves old request access CTA for unauthenticated visitors', () => {
    assert.equal(
      buildAuditCtaUrl('https://www.youtube.com/@creator'),
      '/request-access?source=archive-audit&channel=https%3A%2F%2Fwww.youtube.com%2F%40creator',
    );
  });

  it('builds project URL for generated hubs', () => {
    assert.equal(buildAuditGeneratedProjectUrl('prj_123'), '/app/projects/prj_123');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @creatorcanon/web test -- src/app/(marketing)/archive-audit/audit-view-model.test.ts`

Expected: FAIL because the route files do not exist.

- [ ] **Step 3: Port public audit UI**

Use the current `free-archive-audit` components as reference, but update the CTA section:

- unauthenticated visitors still get request-access copy;
- authenticated users can submit a `Generate Hub` server action;
- server action validates `auditId`, confirms workspace membership, calls `startAuditHubGeneration`, dispatches according to environment, and redirects to the project page.

- [ ] **Step 4: Implement generate action**

Server action behavior:

```ts
export async function generateHubFromAuditAction(formData: FormData): Promise<{ error: string }> {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const auditId = z.string().min(1).parse(formData.get('audit_id'));
  const workspaceId = await resolveUserWorkspaceId(session.user.id);
  const result = await startAuditHubGeneration({
    auditId,
    workspaceId,
    actorUserId: session.user.id,
    autoPublish: true,
  });
  dispatchAuditRun(result.payload);
  redirect(`/app/projects/${result.projectId}`);
}
```

Dispatch must mirror existing Stripe dispatch semantics:

- `worker`: leave queued;
- `inprocess`: fire `runGenerationPipeline` and `completeAuditGeneratedRun` in a background promise;
- `trigger`: use a Trigger task when configured, otherwise fall back to in-process.

- [ ] **Step 5: Verify**

Run:

```powershell
pnpm --filter @creatorcanon/web test -- "src/app/(marketing)/archive-audit/*.test.ts"
pnpm --filter @creatorcanon/web typecheck
```

Expected: PASS.

## Task 6: Make Creator Manual Branding Fully Metadata-Driven

**Files:**
- Modify: `packages/db/src/schema/release.ts`
- Modify: `packages/pipeline/src/adapters/creator-manual/index.ts`
- Modify: `packages/pipeline/src/adapters/creator-manual/test/adapter.smoke.test.ts`
- Modify: `apps/web/src/components/hub/CreatorManual/CreatorManualShell.tsx` only if runtime token mapping needs new keys.

- [ ] **Step 1: Write failing adapter test**

```ts
// Add to packages/pipeline/src/adapters/creator-manual/test/adapter.smoke.test.ts
it('applies design spec brand metadata to the Creator Manual manifest', async () => {
  const r2 = makeMockR2();
  const db = getDb();
  await db.update(hub).set({
    metadata: {
      tagline: 'A premium operating manual.',
      brand: {
        name: 'Operator Lab',
        tone: 'Direct, premium, evidence-led.',
        colors: {
          accent: '#0f766e',
          typeMap: { framework: '#1d4ed8' },
        },
        typography: {
          headingFamily: 'Georgia, serif',
          bodyFamily: 'Geist, ui-sans-serif, system-ui, sans-serif',
        },
        labels: {
          evidence: 'Source clips',
          workshop: 'Operating workshop',
          library: 'Manual library',
        },
        radius: '6px',
        shadow: '0 24px 80px rgba(0,0,0,0.16)',
      },
    } as any,
  }).where(eq(hub.id, hubId));

  await runAdaptStage({
    runId: seed.runId,
    workspaceId: seed.workspaceId,
    hubId,
    r2Override: r2,
  });

  const stored = [...r2.stored.values()].at(-1);
  assert.ok(stored);
  const manifest = JSON.parse(new TextDecoder().decode(stored));
  assert.equal(manifest.brand.name, 'Operator Lab');
  assert.equal(manifest.brand.tokens.colors.accent, '#0f766e');
  assert.equal(manifest.brand.labels.evidence, 'Source clips');
  assert.equal(manifest.brand.tokens.radius, '6px');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @creatorcanon/pipeline test -- src/adapters/creator-manual/test/adapter.smoke.test.ts`

Expected: FAIL because labels/radius/shadow are not consumed.

- [ ] **Step 3: Implement metadata reading**

Extend `HubMetadata.brand` with:

```ts
labels?: Partial<{ evidence: string; workshop: string; library: string }>;
style?: Partial<{ mode: 'light' | 'dark' | 'system' | 'custom' }>;
radius?: string;
shadow?: string;
```

Update the adapter to sanitize and apply:

- colors including `typeMap`;
- typography;
- labels;
- style mode;
- radius and shadow;
- assets.

- [ ] **Step 4: Verify**

Run:

```powershell
pnpm --filter @creatorcanon/pipeline test -- src/adapters/creator-manual/test/adapter.smoke.test.ts
pnpm --filter @creatorcanon/pipeline typecheck
pnpm --filter @creatorcanon/web typecheck
```

Expected: PASS.

## Task 7: Add Additive Migration

**Files:**
- Create: `packages/db/drizzle/out/0012_archive_audit_handoff.sql`
- Modify: `packages/db/drizzle/out/meta/_journal.json`

- [ ] **Step 1: Create migration SQL**

Migration content:

```sql
DO $$ BEGIN
 CREATE TYPE "public"."archive_audit_status" AS ENUM('queued', 'running', 'succeeded', 'failed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "archive_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "status" "archive_audit_status" DEFAULT 'queued' NOT NULL,
  "input_url" text NOT NULL,
  "canonical_channel_url" text,
  "channel_id" text,
  "channel_title" text,
  "channel_handle" text,
  "ip_hash" text,
  "video_count_scanned" integer DEFAULT 0 NOT NULL,
  "transcript_count_scanned" integer DEFAULT 0 NOT NULL,
  "report" jsonb,
  "error_code" text,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_hub_generation" (
  "id" text PRIMARY KEY NOT NULL,
  "audit_id" text NOT NULL REFERENCES "archive_audit"("id") ON DELETE cascade,
  "workspace_id" text NOT NULL REFERENCES "workspace"("id") ON DELETE cascade,
  "project_id" text NOT NULL REFERENCES "project"("id") ON DELETE cascade,
  "run_id" text NOT NULL REFERENCES "generation_run"("id") ON DELETE cascade,
  "hub_id" text NOT NULL REFERENCES "hub"("id") ON DELETE cascade,
  "release_id" text REFERENCES "release"("id") ON DELETE set null,
  "actor_user_id" text REFERENCES "user"("id") ON DELETE set null,
  "status" text DEFAULT 'queued' NOT NULL,
  "auto_publish" boolean DEFAULT true NOT NULL,
  "design_spec" jsonb,
  "error_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_audit_channel_idx" ON "archive_audit" USING btree ("channel_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_audit_ip_created_idx" ON "archive_audit" USING btree ("ip_hash","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "archive_audit_status_created_idx" ON "archive_audit" USING btree ("status","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_hub_generation_audit_workspace_unique" ON "audit_hub_generation" USING btree ("audit_id","workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_hub_generation_run_idx" ON "audit_hub_generation" USING btree ("run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_hub_generation_status_idx" ON "audit_hub_generation" USING btree ("status","created_at");
```

- [ ] **Step 2: Update journal**

Append:

```json
{
  "idx": 12,
  "version": "7",
  "when": 1777852800000,
  "tag": "0012_archive_audit_handoff",
  "breakpoints": true
}
```

- [ ] **Step 3: Verify migration file is additive**

Run:

```powershell
Select-String -Path 'packages/db/drizzle/out/0012_archive_audit_handoff.sql' -Pattern 'DROP|ALTER TYPE|DELETE FROM|TRUNCATE'
pnpm --filter @creatorcanon/db typecheck
```

Expected: no destructive matches; typecheck passes.

## Task 8: End-To-End Verification, Review, Migration Push, Commit, Push

**Files:**
- No production files unless fixes are found.

- [ ] **Step 1: Run targeted tests**

```powershell
pnpm --filter @creatorcanon/adapters test
pnpm --filter @creatorcanon/db typecheck
pnpm --filter @creatorcanon/pipeline test -- "src/audit/**/*.test.ts" "src/audit-handoff/**/*.test.ts" "src/adapters/creator-manual/test/*.test.ts"
pnpm --filter @creatorcanon/web test -- "src/app/(marketing)/archive-audit/*.test.ts"
```

- [ ] **Step 2: Run full checks**

```powershell
pnpm test
pnpm typecheck
pnpm build
```

- [ ] **Step 3: Apply migrations to the configured DB**

Only after checks pass:

```powershell
pnpm db:migrate
```

Expected: `[db] migrations applied`.

- [ ] **Step 4: Request and receive code review**

Use `superpowers:requesting-code-review` with:

- base SHA: `00dfeff`
- head SHA: current `HEAD`
- requirements: this plan
- scope: audit substrate, audit handoff pipeline, design-spec agent, auto-publish, public audit CTA, migration

Use `superpowers:receiving-code-review` before applying feedback.

- [ ] **Step 5: Fix review findings one by one**

For every Critical or Important finding:

1. restate the technical issue internally;
2. verify against code;
3. write or update a failing test;
4. implement the fix;
5. run the relevant test;
6. rerun full typecheck.

- [ ] **Step 6: Commit and push**

```powershell
git status --short
git add packages apps docs
git commit -m "feat: add audit to creator manual handoff"
git push -u origin feat/audit-to-creator-manual-handoff
```

Expected: branch pushed and ready for PR/merge.

## Self-Review

- Spec coverage: the plan covers the archive audit import, design spec agent, audit-to-project seeding, queued generation, audit-only auto-publish, Creator Manual customization metadata, web CTA, migration, verification, review, and push.
- Placeholder scan: no task relies on "TBD" or "implement later"; every task has concrete files, tests, and commands.
- Type consistency: audit report stays `AuditReport`; design output stays `CreatorManualDesignSpec`; hub customization persists through `HubMetadata.brand`; auto-publish linkage is `audit_hub_generation`.
