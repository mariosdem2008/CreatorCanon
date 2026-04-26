# Manual Video Upload Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement task-by-task.

**Spec:** [`docs/superpowers/specs/2026-04-26-manual-video-upload-design.md`](../specs/2026-04-26-manual-video-upload-design.md)

**Goal:** Let users upload video/audio files from disk, transcribe them async, and feed them into the multi-agent pipeline identically to YouTube videos.

**Branch:** `feat/manual-video-upload` (cut from `feat/multi-agent-pipeline`).

**Tech stack:** Drizzle (Postgres), Next.js App Router (`apps/web`), Trigger.dev (`apps/worker`), R2 (presigned PUT), OpenAI `gpt-4o-mini-transcribe`.

---

## File structure

### New files

```
packages/db/src/schema/
  enums.ts                          # MODIFY: add sourceKindEnum, uploadStatusEnum, transcribeStatusEnum
  youtube.ts                        # MODIFY: video + channel column changes
packages/db/drizzle/out/
  0004_manual_video_upload.sql      # generated migration

packages/pipeline/src/
  audio-extraction.ts               # MODIFY: refactor extractAudio to accept local-file input + add extractAudioFromR2
  stages/ensure-transcripts.ts      # MODIFY: switch on sourceKind

apps/web/src/
  app/uploads/page.tsx              # NEW: drop-zone + list + status polling
  app/api/upload/init/route.ts      # NEW
  app/api/upload/complete/route.ts  # NEW
  app/api/uploads/route.ts          # NEW: GET list
  app/api/uploads/[id]/route.ts     # NEW: DELETE
  components/uploads/UploadDropzone.tsx
  components/uploads/UploadList.tsx
  components/uploads/UploadStatusBadge.tsx
  lib/uploads/contentTypes.ts       # NEW: allowlist + size cap constants
  lib/uploads/synthetic-channel.ts  # NEW: get-or-create per-workspace upload channel

apps/worker/src/tasks/
  transcribe-uploaded-video.ts      # NEW: Trigger.dev task

apps/web/src/app/projects/[id]/videos/
  page.tsx                          # MODIFY: add tabs (YouTube / Workspace uploads)
  WorkspaceUploadsTab.tsx           # NEW

# Tests
packages/db/src/                    # extend existing schema tests where relevant
apps/web/src/app/api/upload/init/route.test.ts        # NEW
apps/web/src/app/api/upload/complete/route.test.ts    # NEW
apps/web/src/app/api/uploads/route.test.ts            # NEW
apps/web/src/lib/uploads/contentTypes.test.ts         # NEW
apps/worker/src/tasks/transcribe-uploaded-video.test.ts  # NEW
packages/pipeline/src/stages/test/ensure-transcripts.test.ts  # may already exist; extend
```

### Decomposition rationale

- Schema changes land in one commit. Migration in a separate commit (drizzle convention from prior work).
- Audio extraction refactor stands alone (testable in isolation).
- API routes ship as a group (tightly coupled, share validation helpers).
- Worker task ships once API + audio refactor are in.
- UI ships last (consumes API + worker as backend).

---

## Phase A — Schema + migration

**Why first:** Every API and worker task needs the new columns + enums. Land schema, generate migration, apply, verify backward compat with existing fixtures.

**Stop gate:** `pnpm typecheck` + `pnpm test` pass; existing fixtures still seed.

### Task A.1: Add new enums

**Files:**
- Modify: `packages/db/src/schema/enums.ts`

- [ ] **Step 1:** Append to `enums.ts`:

```ts
export const sourceKindEnum = pgEnum('source_kind', ['youtube', 'manual_upload']);
export const uploadStatusEnum = pgEnum('upload_status', ['uploading', 'uploaded', 'failed']);
export const transcribeStatusEnum = pgEnum('transcribe_status', ['pending', 'transcribing', 'ready', 'failed']);
```

Place them under a `// ----- Manual video upload -----` section header at the bottom.

- [ ] **Step 2:** `pnpm -C packages/db typecheck` → PASS.

- [ ] **Step 3:** Commit `feat(db): add enums for manual video upload`.

### Task A.2: Modify `video` and `channel` schemas

**Files:**
- Modify: `packages/db/src/schema/youtube.ts`

- [ ] **Step 1:** Read current shape. Then in `video` table:
  - Change `youtubeVideoId: text('youtube_video_id').notNull()` → `text('youtube_video_id')` (drop notNull).
  - Add `sourceKind: sourceKindEnum('source_kind').notNull().default('youtube')`.
  - Add `localR2Key: text('local_r2_key')`.
  - Add `uploadStatus: uploadStatusEnum('upload_status')` (nullable; only set for manual_upload).
  - Add `transcribeStatus: transcribeStatusEnum('transcribe_status')` (nullable).
  - Add `fileSizeBytes: bigint('file_size_bytes', { mode: 'number' })` (nullable).
  - Add `contentType: text('content_type')` (nullable).
  - Update existing imports to include the three new enums.

- [ ] **Step 2:** In `channel` table:
  - Change `youtubeChannelId: text('youtube_channel_id').notNull()` → `text('youtube_channel_id')` (drop notNull).
  - Add `sourceKind: sourceKindEnum('source_kind').notNull().default('youtube')`.

- [ ] **Step 3:** `pnpm -C packages/db typecheck` → PASS.

- [ ] **Step 4:** Commit `feat(db): allow non-YouTube videos and channels`.

### Task A.3: Generate and apply migration

**Files:**
- Create (auto): `packages/db/drizzle/out/0004_manual_video_upload.sql`

- [ ] **Step 1:** `pnpm -C packages/db exec drizzle-kit generate --name manual_video_upload`.

- [ ] **Step 2:** Read the generated SQL. Verify:
  - `CREATE TYPE source_kind`, `upload_status`, `transcribe_status` (3 enums)
  - `ALTER TABLE video ADD COLUMN source_kind ...` + `DROP NOT NULL on youtube_video_id`
  - Same for channel
  - 5 new columns on video

- [ ] **Step 3:** Add CHECK constraint manually as a separate migration step (drizzle-kit doesn't generate CHECKs from schema). Append to the SQL file:

```sql
ALTER TABLE video ADD CONSTRAINT video_manual_upload_has_r2_key
  CHECK (source_kind <> 'manual_upload' OR local_r2_key IS NOT NULL);
```

- [ ] **Step 4:** `pnpm -C packages/db migrate` → PASS.

- [ ] **Step 5:** Commit `chore(db): generate migration for manual video upload`.

### Task A.4: Phase A stop gate

- [ ] `pnpm typecheck` (root) → PASS.
- [ ] `pnpm test` (root) → PASS (existing fixtures still work since defaults preserve YouTube path).

---

## Phase B — Synthetic channel + content-type validation

### Task B.1: `lib/uploads/contentTypes.ts`

**Files:**
- Create: `apps/web/src/lib/uploads/contentTypes.ts`
- Create: `apps/web/src/lib/uploads/contentTypes.test.ts`

- [ ] **Step 1: Test first**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedContentType, isAllowedFileSize, MAX_FILE_BYTES, ALLOWED_CONTENT_TYPES } from './contentTypes';

describe('content type allowlist', () => {
  it('allows mp4', () => assert.equal(isAllowedContentType('video/mp4'), true));
  it('allows mp3', () => assert.equal(isAllowedContentType('audio/mpeg'), true));
  it('rejects pdf', () => assert.equal(isAllowedContentType('application/pdf'), false));
  it('rejects empty', () => assert.equal(isAllowedContentType(''), false));
});

describe('file size cap', () => {
  it('allows 2GB exactly', () => assert.equal(isAllowedFileSize(MAX_FILE_BYTES), true));
  it('rejects above 2GB', () => assert.equal(isAllowedFileSize(MAX_FILE_BYTES + 1), false));
  it('rejects 0', () => assert.equal(isAllowedFileSize(0), false));
});
```

- [ ] **Step 2: Implement**

```ts
export const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska',
  'audio/mpeg', 'audio/wav', 'audio/mp4',
]);

export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export function isAllowedContentType(ct: string): boolean {
  return ALLOWED_CONTENT_TYPES.has(ct);
}

export function isAllowedFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_FILE_BYTES;
}

export function fileExtFromContentType(ct: string): string {
  switch (ct) {
    case 'video/mp4':         return 'mp4';
    case 'video/webm':        return 'webm';
    case 'video/quicktime':   return 'mov';
    case 'video/x-matroska':  return 'mkv';
    case 'audio/mpeg':        return 'mp3';
    case 'audio/wav':         return 'wav';
    case 'audio/mp4':         return 'm4a';
    default:                  return 'bin';
  }
}

export function isVideoContentType(ct: string): boolean {
  return ct.startsWith('video/');
}
```

- [ ] **Step 3:** Commit `feat(web): content-type allowlist for uploads`.

### Task B.2: `lib/uploads/synthetic-channel.ts`

**Files:**
- Create: `apps/web/src/lib/uploads/synthetic-channel.ts`
- Create: `apps/web/src/lib/uploads/synthetic-channel.test.ts`

- [ ] **Step 1: Test first**

```ts
import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateUploadChannel } from './synthetic-channel';
import { getDb } from '@creatorcanon/db';
import { workspace, channel, user } from '@creatorcanon/db/schema';
import { eq } from '@creatorcanon/db';

describe('getOrCreateUploadChannel', () => {
  let workspaceId: string;
  let userId: string;

  before(async () => {
    const db = getDb();
    userId = `u_${Math.random().toString(36).slice(2, 10)}`;
    workspaceId = `w_${Math.random().toString(36).slice(2, 10)}`;
    await db.insert(user).values({ id: userId, email: `t-${userId}@example.com`, name: 'T' });
    await db.insert(workspace).values({ id: workspaceId, ownerUserId: userId, name: 'tw', slug: workspaceId });
  });

  after(async () => {
    const db = getDb();
    await db.delete(channel).where(eq(channel.workspaceId, workspaceId));
    await db.delete(workspace).where(eq(workspace.id, workspaceId));
    await db.delete(user).where(eq(user.id, userId));
  });

  it('creates the channel on first call, returns same id on second', async () => {
    const a = await getOrCreateUploadChannel(workspaceId);
    const b = await getOrCreateUploadChannel(workspaceId);
    assert.equal(a, b);
    assert.equal(a, `ch_uploads_${workspaceId}`);
    const rows = await getDb().select().from(channel).where(eq(channel.id, a));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.sourceKind, 'manual_upload');
  });
});
```

- [ ] **Step 2: Implement**

```ts
import { eq, getDb } from '@creatorcanon/db';
import { channel } from '@creatorcanon/db/schema';

export async function getOrCreateUploadChannel(workspaceId: string): Promise<string> {
  const id = `ch_uploads_${workspaceId}`;
  const db = getDb();
  const existing = await db.select({ id: channel.id }).from(channel).where(eq(channel.id, id)).limit(1);
  if (existing[0]) return id;
  await db.insert(channel).values({
    id,
    workspaceId,
    sourceKind: 'manual_upload',
    youtubeChannelId: null,
    title: 'Uploaded videos',
  }).onConflictDoNothing();
  return id;
}
```

- [ ] **Step 3:** Commit `feat(web): synthetic per-workspace upload channel helper`.

---

## Phase C — API routes

**Why this phase:** the upload page can't function without these. Build them first against tests, then the UI consumes them.

**Stop gate:** all 4 routes have green API contract tests; presigned URL signing works against a local R2 stub.

### Task C.1: POST /api/upload/init

**Files:**
- Create: `apps/web/src/app/api/upload/init/route.ts`
- Create: `apps/web/src/app/api/upload/init/route.test.ts`

- [ ] **Step 1: Test first**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './route';

// Test stub: needs auth bypass for tests, R2 client stub.
// Keep test focused on input validation and wire shape.

describe('POST /api/upload/init', () => {
  it('400 when fileSize > 2GB', async () => {
    const req = new Request('http://localhost/api/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'x.mp4', fileSize: 3 * 1024 * 1024 * 1024, contentType: 'video/mp4' }),
    });
    const res = await POST(req as any);
    assert.equal(res.status, 400);
  });

  it('415 when contentType not allowed', async () => {
    const req = new Request('http://localhost/api/upload/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ filename: 'x.pdf', fileSize: 1000, contentType: 'application/pdf' }),
    });
    const res = await POST(req as any);
    assert.equal(res.status, 415);
  });

  // Happy-path test requires DB seed + auth bypass; covered in integration suite.
});
```

- [ ] **Step 2: Implement**

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { isAllowedContentType, isAllowedFileSize, fileExtFromContentType, MAX_FILE_BYTES } from '@/lib/uploads/contentTypes';
import { getOrCreateUploadChannel } from '@/lib/uploads/synthetic-channel';
import { getDb } from '@creatorcanon/db';
import { video, workspaceMember } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { eq } from '@creatorcanon/db';
import { customAlphabet } from 'nanoid';

const nano = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const initBody = z.object({
  filename: z.string().min(1).max(256),
  fileSize: z.number().int().positive(),
  contentType: z.string().min(1),
  workspaceId: z.string().min(1),
  durationSec: z.number().int().nonnegative().optional(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = initBody.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.message }, { status: 400 });
  const { filename, fileSize, contentType, workspaceId } = body.data;

  if (!isAllowedFileSize(fileSize)) {
    return NextResponse.json({ error: `File too large; max ${MAX_FILE_BYTES} bytes` }, { status: 413 });
  }
  if (!isAllowedContentType(contentType)) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  }

  // Verify user is member of workspace.
  const db = getDb();
  const member = await db.select().from(workspaceMember)
    .where(/* user member of workspace */ /* ... */)
    .limit(1);
  if (!member[0]) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const channelId = await getOrCreateUploadChannel(workspaceId);
  const videoId = `mu_${nano()}`;
  const ext = fileExtFromContentType(contentType);
  const r2Key = `workspaces/${workspaceId}/uploads/${videoId}/source.${ext}`;

  await db.insert(video).values({
    id: videoId,
    workspaceId,
    channelId,
    youtubeVideoId: null,
    title: filename,
    sourceKind: 'manual_upload',
    localR2Key: r2Key,
    uploadStatus: 'uploading',
    transcribeStatus: 'pending',
    fileSizeBytes: fileSize,
    contentType,
    durationSeconds: body.data.durationSec ?? null,
  });

  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const uploadUrl = await r2.getSignedUrl({
    key: r2Key,
    action: 'put',
    expiresInSeconds: 30 * 60,
    contentType,
  });

  return NextResponse.json({ videoId, uploadUrl, r2Key });
}
```

(Adapt `workspaceMember` query to match the actual schema. Use the membership query patterns from elsewhere in `apps/web/src/`.)

- [ ] **Step 3:** Commit `feat(web): POST /api/upload/init route`.

### Task C.2: POST /api/upload/complete

**Files:**
- Create: `apps/web/src/app/api/upload/complete/route.ts`
- Create: `apps/web/src/app/api/upload/complete/route.test.ts`

- [ ] **Step 1: Tests** for 404, 409 (already completed), 422 (R2 head fails), happy path.

- [ ] **Step 2: Implement**

```ts
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = z.object({ videoId: z.string().min(1) }).safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.message }, { status: 400 });

  const db = getDb();
  const rows = await db.select().from(video).where(eq(video.id, body.data.videoId)).limit(1);
  const v = rows[0];
  if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (v.uploadStatus === 'uploaded') return NextResponse.json({ error: 'Already completed' }, { status: 409 });
  if (v.uploadStatus !== 'uploading') return NextResponse.json({ error: 'Invalid state' }, { status: 409 });

  // HEAD R2 object to confirm upload.
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  try {
    await r2.headObject(v.localR2Key!);
  } catch {
    await db.update(video).set({ uploadStatus: 'failed' }).where(eq(video.id, v.id));
    return NextResponse.json({ error: 'Upload not found in R2' }, { status: 422 });
  }

  await db.update(video)
    .set({ uploadStatus: 'uploaded', transcribeStatus: 'transcribing' })
    .where(eq(video.id, v.id));

  // Enqueue trigger.dev job.
  await tasks.trigger('transcribe-uploaded-video', { videoId: v.id, workspaceId: v.workspaceId });

  return NextResponse.json({ ok: true, videoId: v.id, transcribeStatus: 'transcribing' });
}
```

- [ ] **Step 3:** Commit `feat(web): POST /api/upload/complete route`.

### Task C.3: GET /api/uploads + DELETE /api/uploads/:id

**Files:**
- Create: `apps/web/src/app/api/uploads/route.ts`
- Create: `apps/web/src/app/api/uploads/[id]/route.ts`
- Tests for both

- [ ] **Step 1: Tests** for status filter, listing, ownership check, in-use deletion refusal.

- [ ] **Step 2: Implement** GET (list workspace uploads) and DELETE (refuse if in non-failed run; otherwise delete R2 + cascade).

- [ ] **Step 3:** Commit `feat(web): GET /api/uploads + DELETE /api/uploads/:id`.

### Task C.4: Phase C stop gate

- [ ] All 4 route tests green.
- [ ] Manual `curl` against a running dev server (with auth) confirms init→complete handshake works.

---

## Phase D — Worker job

### Task D.1: Refactor `audio-extraction.ts` to accept R2 input

**Files:**
- Modify: `packages/pipeline/src/audio-extraction.ts`

- [ ] **Step 1:** Read the current shape (assumes YouTube URL input). Refactor to:

```ts
export interface ExtractAudioInput {
  source: { kind: 'youtube'; videoId: string }
        | { kind: 'r2-file'; r2Key: string; contentType: string };
  outputR2Key: string;
}

export async function extractAudio(input: ExtractAudioInput): Promise<{ outputR2Key: string; durationSec: number }> {
  // Branch on source.kind. Both download (youtube-dl OR R2 getObject), then ffmpeg → m4a, upload to outputR2Key.
}
```

- [ ] **Step 2:** Existing callers (YouTube ingest path) updated to pass `{ kind: 'youtube', videoId }`.

- [ ] **Step 3:** Test. Commit `refactor(pipeline): audio extraction accepts R2-file input`.

### Task D.2: Trigger.dev task `transcribe-uploaded-video`

**Files:**
- Create: `apps/worker/src/tasks/transcribe-uploaded-video.ts`
- Create: `apps/worker/src/tasks/test/transcribe-uploaded-video.test.ts`

- [ ] **Step 1: Test first** (mock R2 + OpenAI; assert state transitions on video row).

- [ ] **Step 2: Implement** following spec § 7.1 step-by-step.

- [ ] **Step 3:** Register task in `apps/worker/trigger.config.ts`.

- [ ] **Step 4:** Commit `feat(worker): transcribe-uploaded-video task`.

### Task D.3: Pipeline integration

**Files:**
- Modify: `packages/pipeline/src/stages/ensure-transcripts.ts`

- [ ] **Step 1:** Read current logic. Add a switch on `video.sourceKind`:
  - `'youtube'` → existing path
  - `'manual_upload'` → assert `transcribeStatus === 'ready'`; return the existing `transcriptAsset` row; throw `MANUAL_UPLOAD_NOT_TRANSCRIBED` if not ready

- [ ] **Step 2:** Test with a fixture that has a manual-upload video.

- [ ] **Step 3:** Commit `feat(pipeline): ensure-transcripts switches on sourceKind`.

### Task D.4: Phase D stop gate

- [ ] Worker test passes (mocked Whisper + R2).
- [ ] `pnpm typecheck` green.
- [ ] Pipeline e2e smoke (still scripted-provider) accepts a fixture with mixed YouTube + uploaded videos.

---

## Phase E — Frontend

### Task E.1: Upload dropzone component

**Files:**
- Create: `apps/web/src/components/uploads/UploadDropzone.tsx`
- Create: `apps/web/src/components/uploads/UploadDropzone.test.tsx`

- [ ] HTML5 drag-drop + file input fallback. Calls `/api/upload/init`, then PUTs to R2 (XHR with progress events), then calls `/api/upload/complete`. Surfaces progress + errors.

- [ ] Commit.

### Task E.2: Upload list + status badges

**Files:**
- Create: `apps/web/src/components/uploads/UploadList.tsx`
- Create: `apps/web/src/components/uploads/UploadStatusBadge.tsx`

- [ ] Polls `/api/uploads` every 3s while any row is `'transcribing'` or `'uploading'`. Stops polling when all rows are terminal (`ready` | `failed`).

- [ ] Delete button calls `DELETE /api/uploads/:id`; refreshes list.

- [ ] Commit.

### Task E.3: `/app/uploads` page

**Files:**
- Create: `apps/web/src/app/uploads/page.tsx`

- [ ] Server component. Loads workspace, renders `UploadDropzone` + `UploadList`. Handles unauthorized gracefully.

- [ ] Commit.

### Task E.4: Project video selector tabs

**Files:**
- Modify: `apps/web/src/app/projects/[id]/videos/page.tsx`
- Create: `apps/web/src/app/projects/[id]/videos/WorkspaceUploadsTab.tsx`

- [ ] Wrap existing YouTube selector in a tabbed UI. Add "Workspace uploads" tab that shows the upload list (read-only) with checkboxes, write into the project's `videoSet`.

- [ ] Test rendering: empty state, mixed YT + uploaded selections.

- [ ] Commit.

### Task E.5: Phase E stop gate

- [ ] `pnpm -C apps/web test` green.
- [ ] `pnpm -C apps/web typecheck` green.
- [ ] Manual smoke: upload a small mp3 in dev, watch it go ready, select it in a project, kick a generation run, confirm pipeline reads from `transcribeStatus = 'ready'` path.

---

## Phase F — Cleanup + verification

### Task F.1: Cron sweep for orphaned uploads

**Files:**
- Modify: `apps/worker/src/tasks/orphaned-uploads-sweep.ts` (new)

- [ ] Trigger.dev scheduled task: every 1h, find rows with `uploadStatus = 'uploading' AND createdAt < now() - 1h`. Mark `failed`, delete R2 object.

- [ ] Test with a fixture row.

- [ ] Commit.

### Task F.2: End-to-end manual verification

- [ ] On the dev environment, follow spec § 13's 5-step user journey. Document timing + cost in a commit message.

### Task F.3: Open PR

- [ ] `git push origin feat/manual-video-upload`
- [ ] `gh pr create` with the test plan from spec § 13.

---

## Total: ~22 tasks across 6 phases.

Each task ends with a green test + a commit. Phases A and D are the highest-risk (schema migration + worker job); Phases B, C, E are mostly mechanical.
