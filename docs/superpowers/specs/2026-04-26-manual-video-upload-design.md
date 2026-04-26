# Manual Video Upload — Design Spec

**Date:** 2026-04-26
**Status:** Draft (for execution)
**Owner:** Mario
**Branch:** `feat/manual-video-upload` (cut from `feat/multi-agent-pipeline`)
**Supersedes:** none — additive feature

---

## 1. Why this exists

The current pipeline assumes every video originates from a YouTube channel: `video.youtubeVideoId` is `NOT NULL`, `channel.youtubeChannelId` is `NOT NULL`, ingestion runs through YouTube's Data API + timedtext, and the audio fallback downloads from YouTube.

For testing the multi-agent pipeline (and for creators who want to use a hub before publishing to YouTube), users need to upload their own video/audio files from disk. The downstream pipeline doesn't care about the source — agents read `segment` rows scoped by `runId` — so the only work is the ingestion path.

## 2. Guiding principles

1. **One video table, source-tagged.** Don't create a parallel `uploaded_video` table. Keep all videos in `video` with a `sourceKind` discriminator. Less code duplication, single selector UX.
2. **Bypass YouTube only where YouTube-specific.** `ensure_transcripts.ts` switches on `sourceKind`; everything downstream (segmentation, agents, mergers, adapter) is source-agnostic and unchanged.
3. **R2 is the file store.** Browser uploads directly to R2 via presigned URL; the server only signs + records metadata. No file bytes through Next.js.
4. **Async transcription.** Upload completion enqueues a Trigger.dev job that extracts audio (if needed) and transcribes via Whisper. UI polls for status.
5. **Per-workspace library.** Uploads belong to a workspace, not a project. Matches the existing `videoSet` reuse pattern.
6. **Reuse the existing pipeline.** Don't add new pipeline stages. The new ingestion path produces the same `transcriptAsset` + `normalizedTranscriptVersion` rows the existing path produces.

## 3. Scope

### In scope
- Schema: `video.youtubeVideoId` nullable, `video.sourceKind` enum, `video.localR2Key` text; same shape on `channel`. Synthetic per-workspace upload channel created lazily.
- API routes for upload init / complete / list / delete
- Trigger.dev job: `transcribe-uploaded-video`
- Frontend: `/app/uploads` page (list + drop zone + status), integration into project video selector
- Pipeline: `ensure_transcripts` switches on `sourceKind`, manual-upload path reads from `video.localR2Key`
- Tests: API contracts, schema integrity, transcribe-job idempotency, selector rendering

### Out of scope
- Multipart resumable uploads (single-shot signed URL is fine for v1; 2 GB cap)
- Format conversion (we accept what the browser supplies; ffmpeg pipeline downstream)
- Sharing uploads across workspaces
- Real-time WebSocket status (polling is sufficient)
- Bulk re-transcription (existing tooling handles this)
- Quota / billing limits

## 4. Architecture

### 4.1 Layered model

```
Frontend (apps/web)
  /app/uploads — list + drop-zone
  Tab in project /app/projects/[id]/videos — pick from workspace uploads

API (apps/web/api)
  POST /api/upload/init        → presigned R2 URL + uploadId
  POST /api/upload/complete    → marks ready, kicks transcription
  GET  /api/uploads            → list workspace uploads
  DELETE /api/uploads/:id      → delete (if safe)

Worker (Trigger.dev)
  transcribeUploadedVideo job:
    1. Read video.localR2Key
    2. Extract audio (if needed) — reuse audio-extraction.ts
    3. Whisper-transcribe via gpt-4o-transcribe
    4. Write transcriptAsset + normalizedTranscriptVersion rows
    5. Mark video.transcribeStatus = 'ready'

DB
  Additive schema: nullable youtubeVideoId, sourceKind enum, localR2Key

Pipeline
  ensure_transcripts.ts: switch on sourceKind
    'youtube'        → existing fetch-or-extract path
    'manual_upload'  → use video.localR2Key directly (skip fetch step)
```

### 4.2 Data flow

```
1. User drags mp4 onto /app/uploads
2. Browser POSTs file metadata to /api/upload/init
3. Server creates video row (sourceKind='manual_upload', uploadStatus='uploading'),
   creates synthetic channel if needed, returns presigned PUT URL
4. Browser PUTs file directly to R2 (with progress events)
5. Browser POSTs to /api/upload/complete; server marks uploadStatus='uploaded',
   enqueues transcribeUploadedVideo job
6. Worker extracts audio, runs Whisper, writes transcriptAsset rows,
   marks transcribeStatus='ready'
7. UI polls; row goes ready; can be selected for project
```

### 4.3 What we keep vs add

**Kept as-is:**
- `audio-extraction.ts` (reused for the local-file path with a different input shape)
- `normalize_transcripts.ts`, `segment_transcripts.ts`
- `transcriptAsset` + `normalizedTranscriptVersion` shapes
- `videoSet` selector pattern
- Trigger.dev queue dispatch

**Net new:**
- Schema columns: `video.sourceKind`, `video.localR2Key`, `video.uploadStatus`, `video.transcribeStatus`, `channel.sourceKind`. Two new enums.
- Synthetic-channel-per-workspace pattern
- 4 API routes
- 1 Trigger.dev job
- 2 UI pages + 1 component refactor (project selector becomes tabbed)

**Modified:**
- `video.youtubeVideoId`, `channel.youtubeChannelId`, `channel.title` → nullable
- `ensure_transcripts.ts` switches on `sourceKind`

## 5. Data model

### 5.1 Schema changes

```sql
-- New enums
CREATE TYPE source_kind AS ENUM ('youtube', 'manual_upload');
CREATE TYPE upload_status AS ENUM ('uploading', 'uploaded', 'failed');
CREATE TYPE transcribe_status AS ENUM ('pending', 'transcribing', 'ready', 'failed');

-- video table (additive)
ALTER TABLE video ADD COLUMN source_kind source_kind NOT NULL DEFAULT 'youtube';
ALTER TABLE video ALTER COLUMN youtube_video_id DROP NOT NULL;
ALTER TABLE video ADD COLUMN local_r2_key text;
ALTER TABLE video ADD COLUMN upload_status upload_status;     -- only set for manual_upload
ALTER TABLE video ADD COLUMN transcribe_status transcribe_status;  -- only set for manual_upload
ALTER TABLE video ADD COLUMN file_size_bytes bigint;
ALTER TABLE video ADD COLUMN content_type text;
-- Constraint: manual_upload videos must have local_r2_key
ALTER TABLE video ADD CONSTRAINT video_manual_upload_has_r2_key
  CHECK (source_kind <> 'manual_upload' OR local_r2_key IS NOT NULL);

-- channel table (additive)
ALTER TABLE channel ADD COLUMN source_kind source_kind NOT NULL DEFAULT 'youtube';
ALTER TABLE channel ALTER COLUMN youtube_channel_id DROP NOT NULL;
-- Synthetic upload channels have id like 'ch_uploads_<workspaceId>'
```

### 5.2 Synthetic channel pattern

For each workspace, the first manual upload triggers creation of a "synthetic upload channel":

```ts
{
  id: 'ch_uploads_' + workspaceId,
  workspaceId,
  sourceKind: 'manual_upload',
  youtubeChannelId: null,
  title: 'Uploaded videos',
}
```

Subsequent uploads in the same workspace use this channel. Findable via `eq(channel.id, 'ch_uploads_' + workspaceId)`.

### 5.3 R2 layout

```
workspaces/{workspaceId}/uploads/{videoId}/source.{ext}
workspaces/{workspaceId}/uploads/{videoId}/audio.m4a       # extracted, optional
```

The `source.{ext}` file is the original upload. The `audio.m4a` file is created by the audio extractor when the upload is a video format. Audio uploads (mp3, wav, m4a) skip extraction.

## 6. API surface

### 6.1 POST /api/upload/init

Authenticated. Workspace-scoped.

```ts
// Request
{
  filename: string,
  fileSize: number,         // bytes; 400 if > 2_147_483_648
  contentType: string,      // 400 if not in allowlist
  durationSec?: number,     // optional client-supplied estimate; refined post-transcription
}
// Response
{
  videoId: string,           // 'mu_<nanoid>' — pre-allocated; client uses for /complete
  uploadUrl: string,         // presigned PUT URL valid for 30 min
  r2Key: string,             // for debugging only; client doesn't need to use this
}
// Errors: 401 unauth, 400 invalid, 413 too large, 415 wrong type
```

Server side:
- Validate workspace permission
- Get-or-create synthetic upload channel
- Insert `video` row with `sourceKind='manual_upload', uploadStatus='uploading', transcribeStatus='pending'`
- Generate presigned PUT URL via R2's `getSignedUrl({ action: 'put', key, expiresInSeconds: 1800 })`
- Return `videoId` (the row's PK)

### 6.2 POST /api/upload/complete

```ts
// Request
{ videoId: string }
// Response
{ ok: true, videoId: string, transcribeStatus: 'transcribing' | 'failed' }
// Errors: 404 not found, 409 already completed, 500 on enqueue failure
```

Server side:
- Verify the video row exists, belongs to caller's workspace, and is `uploadStatus='uploading'`
- HEAD the R2 object to confirm upload (if missing → mark `uploadStatus='failed'`, return 422)
- Update `uploadStatus='uploaded', transcribeStatus='transcribing'`
- Enqueue `transcribeUploadedVideo` Trigger.dev job with `{ videoId, workspaceId }`

### 6.3 GET /api/uploads

```ts
// Query: ?status=ready|transcribing|failed (optional)
// Response: { uploads: Array<{ id, title, fileSize, contentType, durationSec, uploadStatus, transcribeStatus, createdAt }> }
```

Lists workspace's manual-upload videos. Used by `/app/uploads` page and project selector tab.

### 6.4 DELETE /api/uploads/:id

```ts
// Response: { ok: true } or { ok: false, error: 'in_use_by_run' | 'not_found' }
```

Refuses deletion if the video is part of a `videoSet` referenced by a non-failed `generationRun`. On success, deletes the R2 objects (`source.*` + `audio.m4a`) AND the DB row (cascade clears `transcriptAsset`, `normalizedTranscriptVersion`, `segment`).

## 7. Worker job

### 7.1 `transcribeUploadedVideo`

Trigger.dev task in `apps/worker/src/tasks/transcribe-uploaded-video.ts`.

Inputs: `{ videoId: string, workspaceId: string }`

Steps:

1. Load video row. Bail if `transcribeStatus !== 'transcribing'` (prevents double-runs).
2. If `contentType` starts with `video/`: extract audio via `ffmpeg` to `audio.m4a` in R2 at the same prefix. Reuse logic in `packages/pipeline/src/audio-extraction.ts` (refactor for local-file input).
3. If audio file > 25MB (Whisper's per-call limit): split into 10MB chunks (existing chunking logic).
4. Whisper-transcribe each chunk via the OpenAI client (`gpt-4o-transcribe`). Collect VTT.
5. Assemble VTT, write to R2 at `transcripts/{workspaceId}/{videoId}/canonical.vtt` (matching the existing transcript R2 layout).
6. Insert `transcriptAsset` row with `provider='gpt-4o-transcribe', isCanonical=true, r2Key=<vtt path>`.
7. Insert `normalizedTranscriptVersion` row pointing at it (kept consistent with the YouTube path).
8. Update `video.transcribeStatus='ready'` and `video.durationSeconds` from VTT length.
9. On any failure: `video.transcribeStatus='failed'` + log error to Sentry + don't retry (manual delete + re-upload by user).

Idempotency: keyed on `videoId` — if the job runs twice, step 1's status check exits cleanly the second time.

## 8. Frontend

### 8.1 `/app/uploads` page

```
[ Upload videos ]                            [Drop zone]
                                              [List ↓]

┌─────────────────────────────────────────────────────────┐
│ Filename             Size     Status         Actions    │
├─────────────────────────────────────────────────────────┤
│ talk-jan-2026.mp4    180 MB   ⏳ Transcribing            │
│ podcast-001.mp3      45 MB    ✓ Ready          [Delete] │
│ session-2.webm       720 MB   ⚠ Failed         [Delete] │
└─────────────────────────────────────────────────────────┘
```

Component: `/app/uploads/page.tsx`

- Drop zone uses native HTML5 drag-drop
- Multi-file upload (sequential, one at a time for v1)
- Progress bar during PUT to R2 (XMLHttpRequest progress events)
- Polls `GET /api/uploads` every 3s while any row is `transcribing`
- Status badges with the documented colors

### 8.2 Project video selector

Existing: `/app/projects/[id]/videos` lets the user pick YouTube videos for the project's `videoSet`.

Add a tab system:

```
┌──────────────────────┬────────────────────────────────┐
│ YouTube search       │ Workspace uploads              │
├──────────────────────┴────────────────────────────────┤
│ [tab content]                                         │
└───────────────────────────────────────────────────────┘
```

The "Workspace uploads" tab shows the same list as `/app/uploads`, with a checkbox per ready row. Selecting adds the video to the project's `videoSet`. Mixed YouTube + uploaded selections in one project are allowed.

## 9. Pipeline integration

### 9.1 `ensure_transcripts.ts` changes

Read each video's `sourceKind`. Branch:

- `'youtube'` → existing logic (timedtext fetch → Whisper fallback if missing)
- `'manual_upload'` → assert `transcribeStatus === 'ready'`. The `transcriptAsset` row already exists from the upload job; pass through unchanged.

If the orchestrator hits a manual-upload video with `transcribeStatus !== 'ready'`, fail the run cleanly with a `MANUAL_UPLOAD_NOT_TRANSCRIBED` error and a clear message naming the video.

### 9.2 `normalize_transcripts.ts` and `segment_transcripts.ts`

Unchanged — they read `transcriptAsset` rows agnostically.

### 9.3 No agent changes

Specialists, mergers, adapter — all unchanged. They see segments, segments are scoped by `runId`, source-of-segment is invisible to them.

## 10. Validation rules

- File size cap: 2 GB
- Content types: `video/mp4`, `video/webm`, `video/quicktime` (mov), `video/x-matroska` (mkv), `audio/mpeg` (mp3), `audio/wav`, `audio/mp4` (m4a)
- Filename sanitization: replace anything outside `[a-zA-Z0-9._-]` with `_`
- Per-workspace upload count limit: 100 (configurable; prevents runaway storage)
- Per-upload max duration: 4 hours (post-transcription check; longer files split into multiple uploads)

## 11. Observability

- Per-upload R2 metrics already covered by R2's logging
- Transcription job emits structured logs with `runId`, `videoId`, `workspaceId`
- Sentry capture on transcription failure
- Cost-ledger integration: each Whisper call records `costCents` keyed to the workspace

## 12. Risks

1. **Browser dies during PUT to R2.** No row to clean up — orphaned R2 keys. Mitigation: cron sweep of `uploadStatus='uploading'` rows older than 1h, mark `failed` and delete R2 object.
2. **2GB cap is plain HTTP/PUT, not multipart.** S3 protocol allows single PUT up to 5GB; presigned URL works for our cap. If we exceed 2GB later, switch to S3 multipart (presigned URL per part).
3. **Audio extraction OOM for large files.** Existing code chunks by time; should already be safe. Add an explicit memory limit on the worker.
4. **Whisper cost per minute is non-trivial.** ~$0.006/min for `gpt-4o-mini-transcribe`, ~$0.024/min for `gpt-4o-transcribe`. Use mini by default; configurable per workspace.

## 13. Definition of done

A user can:

1. Drag an mp4 from their desktop onto `/app/uploads`, see it upload with progress, then transition to `transcribing`, then `ready`.
2. Open `/app/projects/[id]/videos`, switch to the "Workspace uploads" tab, pick the video, save the selection.
3. Trigger a generation run from `/app/projects/[id]`. The run completes Phase 0 (no YouTube fetch — uses the pre-existing transcript), Phase 1–5, produces a manifest. The manifest references the uploaded video by its synthetic ID.
4. Render `/h/<hubSlug>/sources/<videoId>` and see the uploaded video as a source (no thumbnailUrl from YouTube — fall back to a placeholder; `transcriptStatus` shows `'available'`).
5. Delete the upload from `/app/uploads`. The R2 files are removed; if the video was part of a successful run, the run's history is preserved (the segments stay; the video row deletes via cascade only if no FK references).

10 acceptance items map to spec sections — all must pass before merge.
