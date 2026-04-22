import { and, eq, getDb } from '@creatorcanon/db';
import { closeDb } from '@creatorcanon/db/client';
import {
  mediaAsset,
  normalizedTranscriptVersion,
  segment,
  transcriptAsset,
  video,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from './env-files';
import { ensureTranscripts } from './stages/ensure-transcripts';
import { normalizeTranscripts } from './stages/normalize-transcripts';
import { segmentTranscripts } from './stages/segment-transcripts';

const WORKSPACE_ID = process.env.AUDIO_FIXTURE_WORKSPACE_ID ?? 'local-smoke-workspace';
const RUN_ID = 'audio-fixture-smoke-run';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  loadDefaultEnvFiles();
  process.env.ARTIFACT_STORAGE ??= 'local';
  process.env.LOCAL_ARTIFACT_DIR ??= '.local/artifacts';

  const isLocalMode = process.env.ARTIFACT_STORAGE === 'local';
  if (!isLocalMode && process.env.AUDIO_FIXTURE_SMOKE_CONFIRM !== 'true') {
    throw new Error('Refusing to mutate non-local env. Set AUDIO_FIXTURE_SMOKE_CONFIRM=true to override.');
  }

  const db = getDb();
  const rows = await db
    .select({
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      durationSeconds: video.durationSeconds,
      audioKey: mediaAsset.r2Key,
    })
    .from(mediaAsset)
    .innerJoin(video, eq(video.id, mediaAsset.videoId))
    .where(and(
      eq(mediaAsset.workspaceId, WORKSPACE_ID),
      eq(mediaAsset.type, 'audio_m4a'),
    ))
    .limit(1);

  const target = rows[0];
  assert(target, 'No audio_m4a fixture media_asset row found. Run pnpm dev:seed:audio-fixtures first.');

  await db
    .update(transcriptAsset)
    .set({ isCanonical: false })
    .where(and(
      eq(transcriptAsset.workspaceId, WORKSPACE_ID),
      eq(transcriptAsset.videoId, target.videoId),
    ));
  await db
    .delete(normalizedTranscriptVersion)
    .where(and(
      eq(normalizedTranscriptVersion.workspaceId, WORKSPACE_ID),
      eq(normalizedTranscriptVersion.videoId, target.videoId),
    ));
  await db
    .delete(segment)
    .where(and(
      eq(segment.runId, RUN_ID),
      eq(segment.videoId, target.videoId),
    ));

  const transcripts = await ensureTranscripts({
    runId: RUN_ID,
    workspaceId: WORKSPACE_ID,
    videos: [{
      id: target.videoId,
      youtubeVideoId: target.youtubeVideoId,
      title: target.title,
      durationSeconds: target.durationSeconds,
    }],
  });

  const transcript = transcripts.transcripts[0];
  assert(transcript, 'ensureTranscripts did not return a transcript result.');
  assert(!transcript.skipped, `Expected audio-backed transcript, got skip: ${transcript.skipReason ?? 'unknown'}`);
  assert(transcript.provider === 'gpt-4o-mini-transcribe', `Expected transcribe provider, got ${transcript.provider}.`);
  assert(transcript.r2Key, 'Expected transcribed canonical transcript r2Key.');

  const normalized = await normalizeTranscripts({
    runId: RUN_ID,
    workspaceId: WORKSPACE_ID,
    transcripts: transcripts.transcripts,
  });
  assert(normalized.normalizedTranscripts.length > 0, 'Expected normalized transcript from audio transcription.');

  const segmented = await segmentTranscripts({
    runId: RUN_ID,
    workspaceId: WORKSPACE_ID,
    normalizedTranscripts: normalized.normalizedTranscripts,
  });
  assert(segmented.totalSegments > 0, 'Expected at least one segment from audio transcription.');

  await closeDb();
  console.info(JSON.stringify({
    ok: true,
    workspaceId: WORKSPACE_ID,
    runId: RUN_ID,
    videoId: target.videoId,
    audioKey: target.audioKey,
    transcriptKey: transcript.r2Key,
    provider: transcript.provider,
    segmentsCreated: segmented.totalSegments,
  }, null, 2));
}

main().catch(async (error) => {
  await closeDb();
  console.error('[smoke-audio-fixtures] failed', error);
  process.exit(1);
});
