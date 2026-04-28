# Free Archive Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a no-login CreatorCanon "Free Archive Audit" that lets a visitor paste a public YouTube channel URL, receives a valuable public-data audit of their archive, and understands exactly why a full CreatorCanon hub can increase reputation, trust, lead quality, and monetization.

**Architecture:** Add a public marketing route at `/archive-audit`, a server action that runs a bounded audit engine, a public YouTube adapter backed by a YouTube Data API key, a transcript sampler that reuses the same public caption techniques already proven in the pipeline, an AI report generator that returns strict JSON, and a persisted `archive_audit` table for abuse control, follow-up, and product analytics. The audit is URL-only; Google OAuth stays reserved for claiming the audit, selecting private/unlisted sources, and generating a full paid hub.

**Tech Stack:** Next.js App Router, React server actions, Drizzle/Postgres, `googleapis`, existing `@creatorcanon/adapters` OpenAI client, Zod, `zod-to-json-schema`, Tailwind, existing CreatorCanon UI primitives, and existing pipeline transcript/parsing patterns.

---

## Product Decision

The free audit should work from a pasted YouTube channel URL.

Account connection would reduce friction-to-value because public channel metadata, public video metadata, public uploads playlists, and many public caption tracks are enough to prove the product. OAuth should be introduced only after the visitor has seen value:

- Free audit: public URL, no login, public videos only, public caption/transcript availability only, no private analytics.
- Claim audit: email or existing request-access flow, saves the report and opens sales/support follow-up.
- Full hub: OAuth and project configuration, because this is when CreatorCanon needs owner-read access, private source selection, and publishing workflow.

The audit must state the data boundary clearly in product language:

> This scan used public channel data and public transcripts. Connecting your account later lets CreatorCanon include unlisted/private videos, owner-only captions, and a curated source set.

## Business Outcome

The audit is not a generic SEO report. It is a preview of "your archive as a product."

The report should give visitors:

- Proof that CreatorCanon understands their business and archive.
- A concrete map of what their hub could become.
- Enough free insight to feel valuable on its own.
- A visible gap between the audit and the paid hub: the audit diagnoses; CreatorCanon builds, cites, packages, and publishes.

The report should convert through three CTAs:

- Primary: `Build my full hub`
- Secondary: `Claim this audit`
- Tertiary: `Request alpha access`

## Current System Context

The existing product already supports the paid version of this journey:

- OAuth connect uses Google read-only YouTube scopes and `channels.list({ mine: true })`.
- The app syncs uploads, stores channel/video rows, and lets a user configure a project.
- The generation pipeline imports selected sources, gets transcripts, normalizes and segments them, extracts knowledge, composes pages, verifies quality, and adapts the result into hub-ready content.
- Public transcript fetching already exists inside `ensure-transcripts`: timedtext track listing, direct VTT download, and watch-page player response extraction.
- The Canon pipeline builds channel profile, visual context, video intelligence, canon, page briefs, page composition, page quality, and adaptation.

The audit should not duplicate the full hub pipeline. It should reuse the same product logic at preview scale:

- Fetch public channel and video evidence.
- Sample enough transcript text to infer the archive's knowledge shape.
- Generate a strategic report and a miniature hub blueprint.
- Persist one audit row without creating workspace/project/run records.

## User Experience

### Route

Create `/archive-audit` as a public marketing route with no login gate.

Page layout:

- First viewport: audit workbench, not a landing page.
- Left/top: URL input with a clear no-login promise.
- Right/below: live preview panel showing the report sections that will be generated.
- During run: progress steps with current stage.
- On success: full audit report in the same page.
- On error: specific recovery copy, never a raw stack or generic failure.

Recommended hero copy:

- Eyebrow: `Free Archive Audit`
- H1: `See what your YouTube archive could become.`
- Body: `Paste your channel URL. CreatorCanon scans public videos and transcripts, then maps the knowledge product hiding in your archive.`
- Input placeholder: `https://www.youtube.com/@yourchannel`
- Submit: `Audit my archive`
- Trust note: `No login required for the first scan. Public data only.`

### Report Sections

The audit should return these sections:

1. **Archive Readiness Score**
   - Overall score 0-100.
   - Four subscores: knowledge density, source depth, positioning clarity, hub monetization potential.
   - Plain-English interpretation.

2. **Creator Positioning Snapshot**
   - What the creator appears to teach.
   - Who the archive seems to serve.
   - Reputation angle: why this archive can build authority.

3. **Hidden Knowledge Inventory**
   - Repeated frameworks.
   - Playbooks/processes.
   - Stories/proof moments.
   - Contrarian opinions.
   - Source-backed examples.

4. **Hub Blueprint Preview**
   - Suggested hub title.
   - 3-6 tracks.
   - 5-10 candidate pages/lessons.
   - A sample lesson card with source video references.

5. **Monetization Opportunities**
   - Lead magnet angle.
   - Paid member/resource hub angle.
   - Consulting/authority angle.
   - Course or cohort angle when supported by evidence.

6. **Gaps Before Publishing**
   - Missing transcripts.
   - Thin or scattered topics.
   - Unclear titles.
   - Weak evidence density.
   - Channel freshness concerns.

7. **What CreatorCanon Would Build**
   - Hosted hub.
   - Cited lessons and playbooks.
   - Grounded chat over the archive.
   - Premium templates.
   - Review workflow and publishable URL.

### Conversion Behavior

Do not hide the audit behind email. Show the value first.

After the report renders:

- Primary CTA links to `/request-access?source=archive-audit&channel=<encoded-channel-url>`.
- Secondary CTA can say `Claim this audit` and use the same request-access route until a dedicated lead capture exists.
- Add a compact bottom CTA: `Your audit found the raw material. CreatorCanon turns it into the hub.`

## Data And Privacy Constraints

The no-login audit can use:

- Public channel metadata.
- Public uploads playlist.
- Public video metadata and statistics.
- Public captions/transcripts discoverable through timedtext/watch page methods.

The no-login audit cannot reliably use:

- Private videos.
- Unlisted videos that are not discoverable from the public uploads playlist.
- Owner-only captions from `captions.download`.
- YouTube Studio analytics.
- Subscriber demographics.
- Revenue data.

The UI and report should phrase this as a product boundary, not a limitation:

> This is a public archive preview. The full hub build can use a curated source set after you connect your account.

## File Map

Create or modify these files:

- `packages/core/src/env.ts`
- `.env.example`
- `packages/db/src/schema/enums.ts`
- `packages/db/src/schema/archive_audit.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/drizzle/out/0011_archive_audit.sql`
- `packages/db/drizzle/out/meta/_journal.json`
- `packages/adapters/src/youtube/public-channel.ts`
- `packages/adapters/src/youtube/public-channel.test.ts`
- `packages/adapters/src/index.ts`
- `packages/adapters/package.json`
- `packages/pipeline/src/audit/types.ts`
- `packages/pipeline/src/audit/url.ts`
- `packages/pipeline/src/audit/sampling.ts`
- `packages/pipeline/src/audit/transcripts.ts`
- `packages/pipeline/src/audit/scoring.ts`
- `packages/pipeline/src/audit/prompt.ts`
- `packages/pipeline/src/audit/run-archive-audit.ts`
- `packages/pipeline/src/audit/url.test.ts`
- `packages/pipeline/src/audit/sampling.test.ts`
- `packages/pipeline/src/audit/scoring.test.ts`
- `packages/pipeline/src/audit/types.test.ts`
- `packages/pipeline/src/index.ts`
- `apps/web/src/app/(marketing)/archive-audit/page.tsx`
- `apps/web/src/app/(marketing)/archive-audit/actions.ts`
- `apps/web/src/app/(marketing)/archive-audit/audit-view-model.ts`
- `apps/web/src/app/(marketing)/archive-audit/audit-view-model.test.ts`
- `apps/web/src/components/marketing/archive-audit/ArchiveAuditClient.tsx`
- `apps/web/src/components/marketing/archive-audit/AuditUrlForm.tsx`
- `apps/web/src/components/marketing/archive-audit/AuditProgress.tsx`
- `apps/web/src/components/marketing/archive-audit/AuditReport.tsx`
- `apps/web/src/components/marketing/archive-audit/AuditScoreCard.tsx`
- `apps/web/src/components/marketing/archive-audit/AuditBlueprintPreview.tsx`
- `apps/web/src/components/marketing/archive-audit/AuditEmptyPreview.tsx`
- `apps/web/src/components/marketing/Hero.tsx`
- `apps/web/src/components/marketing/CTA.tsx`
- `apps/web/src/components/marketing/HowItWorks.tsx`

## Implementation Tasks

### 1. Add Audit Environment Configuration

- [ ] Update `packages/core/src/env.ts` with optional audit configuration.
- [ ] Update `.env.example` with the same keys and production comments.

Use optional `YOUTUBE_API_KEY` so local builds still parse env in environments that have not enabled the feature.

```ts
// packages/core/src/env.ts
YOUTUBE_API_KEY: z.string().min(1).optional(),
ARCHIVE_AUDIT_MODEL: z.string().min(1).default('gpt-4o-mini'),
ARCHIVE_AUDIT_DAILY_LIMIT_PER_IP: z.coerce.number().int().positive().default(5),
ARCHIVE_AUDIT_MAX_PUBLIC_VIDEOS: z.coerce.number().int().positive().default(50),
ARCHIVE_AUDIT_MAX_TRANSCRIPTS: z.coerce.number().int().positive().default(10),
```

`.env.example` entries:

```bash
YOUTUBE_API_KEY=
ARCHIVE_AUDIT_MODEL=gpt-4o-mini
ARCHIVE_AUDIT_DAILY_LIMIT_PER_IP=5
ARCHIVE_AUDIT_MAX_PUBLIC_VIDEOS=50
ARCHIVE_AUDIT_MAX_TRANSCRIPTS=10
```

Acceptance:

- `parseServerEnv` works when `YOUTUBE_API_KEY` is absent.
- The audit engine returns a typed configuration error when a visitor submits a channel and `YOUTUBE_API_KEY` is missing.

### 2. Add Audit Persistence

- [ ] Add `archiveAuditStatusEnum` to `packages/db/src/schema/enums.ts`.
- [ ] Add `packages/db/src/schema/archive_audit.ts`.
- [ ] Export the new schema from `packages/db/src/schema/index.ts`.
- [ ] Add migration `packages/db/drizzle/out/0011_archive_audit.sql`.
- [ ] Append journal entry `0011_archive_audit`.

Schema shape:

```ts
// packages/db/src/schema/enums.ts
export const archiveAuditStatusEnum = pgEnum('archive_audit_status', [
  'queued',
  'running',
  'succeeded',
  'failed',
]);
```

```ts
// packages/db/src/schema/archive_audit.ts
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { archiveAuditStatusEnum } from './enums';

export type ArchiveAuditReportJson = {
  version: 1;
  channel: {
    id: string;
    title: string;
    handle?: string;
    url: string;
    thumbnailUrl?: string;
  };
  scores: {
    overall: number;
    knowledgeDensity: number;
    sourceDepth: number;
    positioningClarity: number;
    monetizationPotential: number;
  };
  sections: unknown;
};

export const archiveAudit = pgTable(
  'archive_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    status: archiveAuditStatusEnum('status').default('queued').notNull(),
    inputUrl: text('input_url').notNull(),
    canonicalChannelUrl: text('canonical_channel_url'),
    channelId: text('channel_id'),
    channelTitle: text('channel_title'),
    channelHandle: text('channel_handle'),
    ipHash: text('ip_hash'),
    videoCountScanned: integer('video_count_scanned').default(0).notNull(),
    transcriptCountScanned: integer('transcript_count_scanned').default(0).notNull(),
    report: jsonb('report').$type<ArchiveAuditReportJson>(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => ({
    channelIdx: index('archive_audit_channel_idx').on(table.channelId),
    ipCreatedIdx: index('archive_audit_ip_created_idx').on(table.ipHash, table.createdAt),
    statusCreatedIdx: index('archive_audit_status_created_idx').on(table.status, table.createdAt),
  }),
);

export type ArchiveAudit = typeof archiveAudit.$inferSelect;
export type NewArchiveAudit = typeof archiveAudit.$inferInsert;
```

Migration:

```sql
CREATE TYPE "archive_audit_status" AS ENUM ('queued', 'running', 'succeeded', 'failed');

CREATE TABLE "archive_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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

CREATE INDEX "archive_audit_channel_idx" ON "archive_audit" ("channel_id");
CREATE INDEX "archive_audit_ip_created_idx" ON "archive_audit" ("ip_hash", "created_at");
CREATE INDEX "archive_audit_status_created_idx" ON "archive_audit" ("status", "created_at");
```

Journal addition:

```json
{
  "idx": 11,
  "version": "7",
  "when": 1777766400000,
  "tag": "0011_archive_audit",
  "breakpoints": true
}
```

Acceptance:

- `@creatorcanon/db/schema` exports `archiveAudit`.
- Migration applies cleanly on a fresh local database.
- The table supports daily IP throttling and report retrieval without requiring auth.

### 3. Build Public YouTube URL Parsing

- [ ] Create `packages/pipeline/src/audit/url.ts`.
- [ ] Create `packages/pipeline/src/audit/url.test.ts`.

Supported inputs:

- `https://www.youtube.com/@creator`
- `https://youtube.com/@creator/videos`
- `https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx`
- `https://www.youtube.com/c/legacyname`
- `https://www.youtube.com/user/legacyname`
- `@creator`

Parser contract:

```ts
export type ParsedYouTubeChannelInput =
  | { kind: 'handle'; value: string; originalUrl: string }
  | { kind: 'channelId'; value: string; originalUrl: string }
  | { kind: 'customName'; value: string; originalUrl: string }
  | { kind: 'username'; value: string; originalUrl: string };

export function parseYouTubeChannelInput(rawInput: string): ParsedYouTubeChannelInput {
  const input = rawInput.trim();
  if (!input) throw new Error('channel_url_required');

  if (input.startsWith('@')) {
    return { kind: 'handle', value: input.slice(1), originalUrl: input };
  }

  const url = new URL(input);
  const host = url.hostname.replace(/^www\./, '');
  if (host !== 'youtube.com' && host !== 'm.youtube.com') {
    throw new Error('channel_url_not_youtube');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const first = parts[0] ?? '';
  const second = parts[1] ?? '';

  if (first.startsWith('@')) return { kind: 'handle', value: first.slice(1), originalUrl: input };
  if (first === 'channel' && second) return { kind: 'channelId', value: second, originalUrl: input };
  if (first === 'c' && second) return { kind: 'customName', value: second, originalUrl: input };
  if (first === 'user' && second) return { kind: 'username', value: second, originalUrl: input };

  throw new Error('channel_url_unsupported');
}
```

Test cases:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseYouTubeChannelInput } from './url';

test('parses handle-only channel input', () => {
  assert.deepEqual(parseYouTubeChannelInput('@CreatorCanon'), {
    kind: 'handle',
    value: 'CreatorCanon',
    originalUrl: '@CreatorCanon',
  });
});

test('parses youtube handle url', () => {
  assert.equal(
    parseYouTubeChannelInput('https://www.youtube.com/@CreatorCanon/videos').value,
    'CreatorCanon',
  );
});

test('rejects non-youtube domains', () => {
  assert.throws(() => parseYouTubeChannelInput('https://example.com/@CreatorCanon'), {
    message: 'channel_url_not_youtube',
  });
});
```

Acceptance:

- Bad input fails before calling the YouTube API.
- Parser output contains enough information for public channel resolution.

### 4. Build Public YouTube Adapter

- [ ] Create `packages/adapters/src/youtube/public-channel.ts`.
- [ ] Create `packages/adapters/src/youtube/public-channel.test.ts`.
- [ ] Export from `packages/adapters/src/index.ts`.
- [ ] Add `./youtube/public-channel` export in `packages/adapters/package.json`.

Types:

```ts
export interface PublicYouTubeChannel {
  id: string;
  title: string;
  description: string;
  handle?: string;
  canonicalUrl: string;
  thumbnailUrl?: string;
  uploadsPlaylistId: string;
  statistics: {
    subscriberCount?: number;
    videoCount?: number;
    viewCount?: number;
  };
}

export interface PublicYouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt?: string;
  durationIso?: string;
  thumbnailUrl?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
}
```

Adapter shape:

```ts
import { google, youtube_v3 } from 'googleapis';

export interface PublicYouTubeClient {
  resolveChannel(input: {
    kind: 'handle' | 'channelId' | 'customName' | 'username';
    value: string;
  }): Promise<PublicYouTubeChannel>;
  listPublicChannelVideos(input: {
    uploadsPlaylistId: string;
    maxResults: number;
  }): Promise<PublicYouTubeVideo[]>;
}

export function createPublicYouTubeClient(apiKey: string): PublicYouTubeClient {
  const youtube = google.youtube({ version: 'v3', auth: apiKey });

  return {
    async resolveChannel(input) {
      const channel = await resolveChannelResource(youtube, input);
      return mapChannel(channel);
    },

    async listPublicChannelVideos(input) {
      const playlistItems = await listUploadItems(youtube, input.uploadsPlaylistId, input.maxResults);
      const ids = playlistItems.map((item) => item.contentDetails?.videoId).filter(Boolean) as string[];
      return fetchVideoDetails(youtube, ids);
    },
  };
}
```

Resolution rules:

- `handle`: `channels.list` with `forHandle`.
- `channelId`: `channels.list` with `id`.
- `username`: `channels.list` with `forUsername`.
- `customName`: first try `forHandle` with the same value, then fail with `channel_not_found`. Do not scrape search results in the first version because it can return wrong owners.

Video collection rules:

- Use the channel `contentDetails.relatedPlaylists.uploads` playlist.
- Fetch up to `ARCHIVE_AUDIT_MAX_PUBLIC_VIDEOS`.
- Use `playlistItems.list` for IDs and `videos.list` for duration/statistics.
- Keep quota bounded: 50 public videos is enough for the free audit.

Acceptance:

- No OAuth token is needed.
- The adapter never calls owner-only caption endpoints.
- Errors are mapped to product-safe codes: `channel_not_found`, `youtube_quota_exceeded`, `youtube_api_unavailable`.

### 5. Build Public Transcript Sampler

- [ ] Create `packages/pipeline/src/audit/transcripts.ts`.
- [ ] Extract or copy the public timedtext/watch-page logic from `packages/pipeline/src/stages/ensure-transcripts.ts` into reusable audit-safe helpers.
- [ ] Keep the helpers side-effect-free: no DB writes, no R2 writes, no audio extraction.

Types:

```ts
export interface PublicTranscriptSample {
  videoId: string;
  language?: string;
  source: 'timedtext' | 'watch_page';
  text: string;
}

export interface TranscriptFetchResult {
  samples: PublicTranscriptSample[];
  unavailableVideoIds: string[];
}
```

Public helper contract:

```ts
export async function fetchPublicTranscriptForAudit(videoId: string): Promise<PublicTranscriptSample | null> {
  const direct = await fetchTimedtextTranscript(videoId);
  if (direct) return direct;

  const fromWatchPage = await fetchWatchPageTranscript(videoId);
  if (fromWatchPage) return fromWatchPage;

  return null;
}
```

Rules:

- Prefer English manually authored tracks when present.
- Fall back to English auto-caption tracks.
- Fall back to first available track when English is absent.
- Convert VTT/caption fragments to plain text.
- Cap each transcript to 12,000 characters for prompt control.
- Cap total transcript text to 100,000 characters.
- Do not call audio extraction for the free audit.

Acceptance:

- Videos without public captions do not fail the audit.
- The audit still generates a useful metadata-only report when transcript coverage is low.
- Transcript availability is surfaced as a score factor and gap.

### 6. Build Archive Video Sampling

- [ ] Create `packages/pipeline/src/audit/sampling.ts`.
- [ ] Create `packages/pipeline/src/audit/sampling.test.ts`.

Sampling should avoid only looking at recent videos. Pick a balanced sample:

- 30 percent most recent.
- 30 percent highest-viewed.
- 20 percent long-form teaching videos.
- 20 percent title-diverse videos using simple token diversity.

Implementation shape:

```ts
export function selectVideosForAudit(
  videos: PublicYouTubeVideo[],
  maxTranscripts: number,
): PublicYouTubeVideo[] {
  const byRecent = [...videos].sort(comparePublishedDesc).slice(0, Math.ceil(maxTranscripts * 0.3));
  const byViews = [...videos].sort(compareViewsDesc).slice(0, Math.ceil(maxTranscripts * 0.3));
  const byDuration = [...videos].sort(compareDurationDesc).slice(0, Math.ceil(maxTranscripts * 0.2));
  const byDiversity = selectTitleDiverseVideos(videos, Math.ceil(maxTranscripts * 0.2));

  return dedupeVideos([...byRecent, ...byViews, ...byDuration, ...byDiversity]).slice(
    0,
    maxTranscripts,
  );
}
```

Acceptance:

- Small channels return all available videos.
- Large channels produce a mixed sample.
- Tests assert no duplicate video IDs and stable selection.

### 7. Define Audit Report Types And JSON Schema

- [ ] Create `packages/pipeline/src/audit/types.ts`.
- [ ] Create `packages/pipeline/src/audit/types.test.ts`.

Use Zod as the source of truth and pass `zod-to-json-schema` to the OpenAI client.

```ts
import { z } from 'zod';

const scoreSchema = z.number().int().min(0).max(100);

export const auditReportSchema = z.object({
  version: z.literal(1),
  channel: z.object({
    id: z.string(),
    title: z.string(),
    handle: z.string().optional(),
    url: z.string().url(),
    thumbnailUrl: z.string().url().optional(),
  }),
  scanned: z.object({
    videoCount: z.number().int().nonnegative(),
    transcriptCount: z.number().int().nonnegative(),
    publicDataOnly: z.literal(true),
  }),
  scores: z.object({
    overall: scoreSchema,
    knowledgeDensity: scoreSchema,
    sourceDepth: scoreSchema,
    positioningClarity: scoreSchema,
    monetizationPotential: scoreSchema,
  }),
  positioning: z.object({
    oneLineRead: z.string(),
    audience: z.string(),
    authorityAngle: z.string(),
  }),
  inventory: z.object({
    frameworks: z.array(z.string()).max(8),
    playbooks: z.array(z.string()).max(8),
    proofMoments: z.array(z.string()).max(8),
    repeatedThemes: z.array(z.string()).max(10),
  }),
  blueprint: z.object({
    hubTitle: z.string(),
    tracks: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        candidatePages: z.array(z.string()).min(1).max(5),
      }),
    ).min(3).max(6),
    sampleLesson: z.object({
      title: z.string(),
      promise: z.string(),
      sourceVideoIds: z.array(z.string()).min(1).max(4),
    }),
  }),
  monetization: z.object({
    leadMagnet: z.string(),
    paidHub: z.string(),
    authorityOffer: z.string(),
    priority: z.string(),
  }),
  gaps: z.array(
    z.object({
      label: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      fix: z.string(),
    }),
  ).max(8),
  creatorCanonFit: z.object({
    summary: z.string(),
    buildPlan: z.array(z.string()).min(3).max(6),
    cta: z.string(),
  }),
});

export type AuditReport = z.infer<typeof auditReportSchema>;
```

Acceptance:

- Invalid model output is rejected and retried once with a repair prompt.
- The UI consumes only this typed report shape.

### 8. Add Deterministic Scoring

- [ ] Create `packages/pipeline/src/audit/scoring.ts`.
- [ ] Create `packages/pipeline/src/audit/scoring.test.ts`.

The AI can write the report, but scoring should be grounded by deterministic inputs before AI embellishment.

Metrics:

- `sourceDepth`: video count, average duration, transcript coverage.
- `knowledgeDensity`: transcript word count, unique repeated title terms, long-form ratio.
- `positioningClarity`: channel description length, title consistency, repeated topic clusters.
- `monetizationPotential`: archive size, source depth, authority signals from view distribution, transcript coverage.

Code shape:

```ts
export interface AuditScoreInputs {
  videoCount: number;
  transcriptCount: number;
  transcriptWordCount: number;
  averageDurationSeconds: number;
  repeatedTitleTerms: number;
  channelDescriptionLength: number;
  medianViews: number;
}

export function calculateAuditScores(input: AuditScoreInputs) {
  const sourceDepth = clampScore(
    input.videoCount * 1.2 +
      input.transcriptCount * 5 +
      Math.min(input.averageDurationSeconds / 60, 30),
  );

  const knowledgeDensity = clampScore(
    input.transcriptWordCount / 800 +
      input.repeatedTitleTerms * 4 +
      Math.min(input.averageDurationSeconds / 90, 25),
  );

  const positioningClarity = clampScore(
    Math.min(input.channelDescriptionLength / 8, 35) + input.repeatedTitleTerms * 5,
  );

  const monetizationPotential = clampScore(
    sourceDepth * 0.35 +
      knowledgeDensity * 0.35 +
      positioningClarity * 0.2 +
      Math.min(input.medianViews / 100, 10),
  );

  const overall = Math.round(
    sourceDepth * 0.25 +
      knowledgeDensity * 0.3 +
      positioningClarity * 0.2 +
      monetizationPotential * 0.25,
  );

  return { overall, knowledgeDensity, sourceDepth, positioningClarity, monetizationPotential };
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
```

Acceptance:

- Scores do not depend on model mood.
- The model receives deterministic scores and must explain them instead of inventing different values.

### 9. Build The Audit Prompt

- [ ] Create `packages/pipeline/src/audit/prompt.ts`.

Prompt requirements:

- Use the CreatorCanon business lens: reputation, knowledge productization, cited hub, monetization.
- Do not write a generic YouTube growth audit.
- Do not promise revenue.
- Say when evidence is limited.
- Tie recommendations to observed public videos and transcript samples.
- Keep the full report direct and founder-facing.

Prompt shape:

```ts
export function buildArchiveAuditPrompt(input: ArchiveAuditPromptInput) {
  return [
    {
      role: 'system' as const,
      content:
        'You are CreatorCanon's archive strategist. You audit a public YouTube archive as raw material for a hosted, source-cited knowledge hub. Focus on authority, reusable frameworks, business reputation, and monetization paths. Do not provide generic YouTube SEO advice.',
    },
    {
      role: 'user' as const,
      content: JSON.stringify(input),
    },
  ];
}
```

The `ArchiveAuditPromptInput` should include:

- Channel metadata.
- Video metadata sample.
- Transcript samples.
- Deterministic scores.
- Transcript coverage warning.
- Product output requirements.

Acceptance:

- Report language sells the hub outcome without sounding like a sales page.
- Each recommendation is traceable to public archive evidence or clearly labeled as an inference.

### 10. Build The Audit Engine

- [ ] Create `packages/pipeline/src/audit/run-archive-audit.ts`.
- [ ] Export it from `packages/pipeline/src/index.ts`.

Engine contract:

```ts
export interface RunArchiveAuditInput {
  channelUrl: string;
  ipAddress?: string;
}

export interface RunArchiveAuditResult {
  auditId: string;
  report: AuditReport;
}

export async function runArchiveAudit(input: RunArchiveAuditInput): Promise<RunArchiveAuditResult> {
  const env = parseServerEnv(process.env);
  if (!env.YOUTUBE_API_KEY) throw new ArchiveAuditError('youtube_api_key_missing');

  const db = createDb(env);
  const ipHash = hashAuditIp(input.ipAddress, env.AUTH_SECRET);
  await enforceDailyAuditLimit(db, ipHash, env.ARCHIVE_AUDIT_DAILY_LIMIT_PER_IP);

  const row = await createQueuedAudit(db, input.channelUrl, ipHash);

  try {
    await markAuditRunning(db, row.id);
    const parsedUrl = parseYouTubeChannelInput(input.channelUrl);
    const youtube = createPublicYouTubeClient(env.YOUTUBE_API_KEY);
    const channel = await youtube.resolveChannel(parsedUrl);
    const videos = await youtube.listPublicChannelVideos({
      uploadsPlaylistId: channel.uploadsPlaylistId,
      maxResults: env.ARCHIVE_AUDIT_MAX_PUBLIC_VIDEOS,
    });
    const sampledVideos = selectVideosForAudit(videos, env.ARCHIVE_AUDIT_MAX_TRANSCRIPTS);
    const transcripts = await fetchTranscriptSamples(sampledVideos);
    const scores = calculateAuditScores(buildScoreInputs(channel, videos, transcripts));
    const report = await generateAuditReport({ channel, videos, sampledVideos, transcripts, scores });

    await markAuditSucceeded(db, row.id, channel, videos.length, transcripts.samples.length, report);
    return { auditId: row.id, report };
  } catch (error) {
    await markAuditFailed(db, row.id, error);
    throw error;
  }
}
```

Daily limit:

```ts
import { createHmac } from 'node:crypto';
import { and, count, gte, eq } from 'drizzle-orm';

export function hashAuditIp(ipAddress: string | undefined, secret: string) {
  const value = ipAddress?.trim() || 'unknown';
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 48);
}

async function enforceDailyAuditLimit(db: Db, ipHash: string, limit: number) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ total: count() })
    .from(archiveAudit)
    .where(and(eq(archiveAudit.ipHash, ipHash), gte(archiveAudit.createdAt, since)));

  if ((row?.total ?? 0) >= limit) {
    throw new ArchiveAuditError('daily_limit_reached');
  }
}
```

Model call:

```ts
const completion = await openai.chat({
  model: env.ARCHIVE_AUDIT_MODEL,
  temperature: 0.2,
  maxTokens: 3500,
  messages: buildArchiveAuditPrompt(promptInput),
  jsonSchema: {
    name: 'creatorcanon_archive_audit',
    schema: zodToJsonSchema(auditReportSchema, 'creatorcanon_archive_audit'),
    strict: true,
  },
  userInteraction: 'archive_audit',
});

const parsed = auditReportSchema.parse(JSON.parse(completion.content));
return parsed;
```

Acceptance:

- The engine returns within one server action request for normal channels.
- It fails gracefully with known `ArchiveAuditError` codes.
- It never creates workspace/project/run records.
- It stores successful and failed attempts for product visibility.

### 11. Build Server Action

- [ ] Create `apps/web/src/app/(marketing)/archive-audit/actions.ts`.

Action state:

```ts
export type ArchiveAuditActionState =
  | { status: 'idle' }
  | { status: 'success'; auditId: string; report: AuditReport }
  | { status: 'error'; code: string; message: string };
```

Server action:

```ts
'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { runArchiveAudit } from '@creatorcanon/pipeline';

const inputSchema = z.object({
  channelUrl: z.string().trim().min(3).max(300),
});

export async function runArchiveAuditAction(
  _previousState: ArchiveAuditActionState,
  formData: FormData,
): Promise<ArchiveAuditActionState> {
  const parsed = inputSchema.safeParse({
    channelUrl: formData.get('channelUrl'),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      code: 'invalid_channel_url',
      message: 'Paste a YouTube channel URL or handle.',
    };
  }

  try {
    const forwardedFor = headers().get('x-forwarded-for')?.split(',')[0]?.trim();
    const result = await runArchiveAudit({
      channelUrl: parsed.data.channelUrl,
      ipAddress: forwardedFor,
    });

    return { status: 'success', auditId: result.auditId, report: result.report };
  } catch (error) {
    return mapArchiveAuditError(error);
  }
}
```

Acceptance:

- No auth import is used on this route.
- All errors return friendly copy.
- The action only returns validated report data.

### 12. Build Audit View Model

- [ ] Create `apps/web/src/app/(marketing)/archive-audit/audit-view-model.ts`.
- [ ] Create `apps/web/src/app/(marketing)/archive-audit/audit-view-model.test.ts`.

Purpose:

- Keep formatting logic out of TSX.
- Convert scores to labels.
- Convert gaps to ordered UI rows.
- Build request-access URLs.

Code shape:

```ts
export function scoreLabel(score: number) {
  if (score >= 85) return 'Hub-ready archive';
  if (score >= 70) return 'Strong hub potential';
  if (score >= 50) return 'Promising but needs curation';
  return 'Needs a sharper source set';
}

export function buildAuditCtaUrl(channelUrl: string) {
  const params = new URLSearchParams({ source: 'archive-audit', channel: channelUrl });
  return `/request-access?${params.toString()}`;
}
```

Acceptance:

- UI tests cover label thresholds and CTA URLs.
- No report calculation lives in components.

### 13. Build Public Route

- [ ] Create `apps/web/src/app/(marketing)/archive-audit/page.tsx`.
- [ ] Add metadata title and description.
- [ ] Render `ArchiveAuditClient`.

Page shell:

```tsx
import type { Metadata } from 'next';

import { ArchiveAuditClient } from '@/components/marketing/archive-audit/ArchiveAuditClient';

export const metadata: Metadata = {
  title: 'Free YouTube Archive Audit | CreatorCanon',
  description:
    'Paste your YouTube channel URL and see what your archive could become as a source-cited CreatorCanon hub.',
};

export default function ArchiveAuditPage() {
  return <ArchiveAuditClient />;
}
```

Acceptance:

- The route loads without auth.
- It is indexable and shareable.
- The initial viewport is the audit tool, not a marketing-only page.

### 14. Build Audit UI Components

- [ ] Create `ArchiveAuditClient.tsx`.
- [ ] Create `AuditUrlForm.tsx`.
- [ ] Create `AuditProgress.tsx`.
- [ ] Create `AuditEmptyPreview.tsx`.
- [ ] Create `AuditReport.tsx`.
- [ ] Create `AuditScoreCard.tsx`.
- [ ] Create `AuditBlueprintPreview.tsx`.

Client shape:

```tsx
'use client';

import { useFormState, useFormStatus } from 'react-dom';

import { runArchiveAuditAction, type ArchiveAuditActionState } from '@/app/(marketing)/archive-audit/actions';

const initialState: ArchiveAuditActionState = { status: 'idle' };

export function ArchiveAuditClient() {
  const [state, formAction] = useFormState(runArchiveAuditAction, initialState);

  return (
    <main className="min-h-screen bg-paper text-ink">
      <section className="border-b border-rule bg-paper-warm">
        <div className="mx-auto grid max-w-[1180px] gap-8 px-6 py-12 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:py-16">
          <div>
            <p className="text-eyebrow uppercase text-amber-ink">Free Archive Audit</p>
            <h1 className="mt-4 font-serif text-display-lg text-ink">
              See what your YouTube archive could become.
            </h1>
            <p className="mt-5 max-w-[58ch] text-body-lg leading-relaxed text-ink-2">
              Paste your channel URL. CreatorCanon scans public videos and transcripts, then maps the knowledge product hiding in your archive.
            </p>
            <AuditUrlForm action={formAction} state={state} />
          </div>
          <AuditResultPanel state={state} />
        </div>
      </section>
    </main>
  );
}
```

Design rules:

- Use the current CreatorCanon palette and typography.
- Keep it premium and operational, not decorative.
- Do not nest cards inside cards.
- Use one strong workbench section, then full-width report bands.
- Make score cards compact and readable on mobile.
- Keep all button text fitting at 320px width.
- Use existing `Icon` where helpful for arrows, check, play, warning, and external movement.

Progress stages:

- `Resolving channel`
- `Reading public archive`
- `Sampling transcripts`
- `Mapping hub potential`
- `Preparing report`

Because the first version uses a single server action, display the stages as an optimistic pending state while the request is in flight. Do not stream fake stage completions after success.

Error copy:

```ts
const ERROR_COPY: Record<string, string> = {
  invalid_channel_url: 'Paste a YouTube channel URL or handle.',
  channel_url_not_youtube: 'Use a YouTube channel URL, such as https://www.youtube.com/@creator.',
  channel_not_found: 'CreatorCanon could not find that public channel.',
  youtube_api_key_missing: 'Archive audits are not enabled in this environment yet.',
  youtube_quota_exceeded: 'YouTube is rate limiting public archive scans right now. Try again soon.',
  daily_limit_reached: 'You have reached the free audit limit for today.',
  transcript_fetch_failed: 'The public archive loaded, but transcript sampling failed. Try again soon.',
};
```

Acceptance:

- The form remains usable with keyboard only.
- Pending and error states are visually distinct.
- Success report renders all seven sections.
- The CTA stays visible after the report without blocking reading.

### 15. Add Landing Page CTA

- [ ] Update `apps/web/src/components/marketing/Hero.tsx`.
- [ ] Update `apps/web/src/components/marketing/CTA.tsx`.
- [ ] Update `apps/web/src/components/marketing/HowItWorks.tsx`.

Hero CTA change:

```tsx
<Button asChild variant="accent" size="lg">
  <Link href="/archive-audit">
    Get free archive audit
    <Icon name="arrowRight" size={14} />
  </Link>
</Button>
<Button asChild variant="secondary" size="lg">
  <Link href="/case-study">
    <Icon name="play" size={12} aria-hidden />
    See a generated hub
  </Link>
</Button>
```

Add the request access link as small text below the hero CTAs:

```tsx
<p className="mt-5 text-caption text-ink-4">
  Want us to build it now? <Link className="underline decoration-rule underline-offset-4" href="/request-access">Request alpha access</Link>.
</p>
```

How-it-works adjustment:

- Add a first step named `Audit the archive`.
- Keep the paid flow steps after it: connect, pick source set, generate, approve/publish.

Bottom CTA:

- Change headline toward the audit:
  `Find the knowledge product hiding in your archive.`
- Primary button: `/archive-audit`
- Secondary text link: `/request-access`

Acceptance:

- The free audit is the clearest top-of-funnel CTA.
- The paid alpha path still exists for high-intent visitors.
- No marketing copy implies the free audit creates a full hub.

### 16. Add Product Analytics Hooks

- [ ] If the project already has PostHog client helpers for marketing pages, track these events:
  - `archive_audit_viewed`
  - `archive_audit_submitted`
  - `archive_audit_succeeded`
  - `archive_audit_failed`
  - `archive_audit_cta_clicked`
- [ ] If no helper is already present, skip client analytics and rely on persisted `archive_audit` rows for the first version.

Acceptance:

- No new analytics dependency is introduced.
- Analytics failure never affects the audit.

### 17. Verification

- [ ] Run adapter tests:

```bash
pnpm --filter @creatorcanon/adapters test
```

- [ ] Run pipeline tests:

```bash
pnpm --filter @creatorcanon/pipeline test
```

- [ ] Run web tests:

```bash
pnpm --filter @creatorcanon/web test
```

- [ ] Run typechecks:

```bash
pnpm --filter @creatorcanon/adapters typecheck
pnpm --filter @creatorcanon/pipeline typecheck
pnpm --filter @creatorcanon/web typecheck
```

- [ ] Run migration on local DB when database services are available:

```bash
pnpm db:migrate
```

- [ ] Start web locally:

```bash
pnpm --filter @creatorcanon/web dev
```

- [ ] Open `http://localhost:3000/archive-audit` and verify:
  - Initial page is visually polished on desktop.
  - Mobile layout has no text overlap at 320px width.
  - Invalid input error works.
  - Missing `YOUTUBE_API_KEY` error works when the key is absent.
  - A known public channel succeeds when `YOUTUBE_API_KEY` is present.
  - Report CTA links to `/request-access?source=archive-audit&channel=...`.

## Failure Modes And Product Copy

Use these error codes in the engine and map them in the UI:

- `channel_url_required`: `Paste a YouTube channel URL or handle.`
- `channel_url_not_youtube`: `Use a YouTube channel URL, such as https://www.youtube.com/@creator.`
- `channel_url_unsupported`: `Use a public channel page, not a single video or playlist.`
- `channel_not_found`: `CreatorCanon could not find that public channel.`
- `no_public_videos`: `That channel does not show public videos yet.`
- `youtube_api_key_missing`: `Archive audits are not enabled in this environment yet.`
- `youtube_quota_exceeded`: `YouTube is rate limiting public archive scans right now. Try again soon.`
- `daily_limit_reached`: `You have reached the free audit limit for today.`
- `audit_generation_failed`: `The archive scan worked, but the report could not be generated. Try again soon.`

## Security And Abuse Controls

- Store only an HMAC hash of IP addresses.
- Do not require account creation.
- Limit audits per IP hash per rolling 24 hours.
- Cap public videos and transcripts.
- Cap prompt text.
- Never expose raw model errors.
- Never store OAuth tokens or owner data in `archive_audit`.
- Do not use unimplemented Redis rate-limit code for this feature.

## Launch Criteria

The feature is ready when:

- A visitor can generate an audit from a public channel URL without logging in.
- The report gives real value even when transcript coverage is partial.
- The report makes the paid hub feel like the natural next step.
- Landing page CTA points to the audit.
- The engine persists successful and failed runs.
- Tests and typechecks pass for touched packages.
- The page has been visually checked on desktop and mobile.
