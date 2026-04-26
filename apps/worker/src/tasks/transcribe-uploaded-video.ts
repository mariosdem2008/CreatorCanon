import { task, logger } from '@trigger.dev/sdk/v3';
import { eq, getDb } from '@creatorcanon/db';
import { video, transcriptAsset, normalizedTranscriptVersion } from '@creatorcanon/db/schema';
import { extractAudioFromR2Source } from '@creatorcanon/pipeline';
import { createR2Client, createOpenAIClient, transcriptKey } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';

interface Payload {
  videoId: string;
  workspaceId: string;
}

/** Maximum file size in bytes that Whisper accepts in a single call (25 MB). */
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Count words in a VTT string by stripping metadata lines and splitting on whitespace.
 */
function countVttWords(vtt: string): number {
  const lines = vtt.split('\n');
  const textLines = lines.filter(
    (l) =>
      l.trim() &&
      !l.startsWith('WEBVTT') &&
      !l.includes('-->') &&
      !/^\d+$/.test(l.trim()) &&
      !l.startsWith('NOTE'),
  );
  return textLines.join(' ').split(/\s+/).filter(Boolean).length;
}

/**
 * Format milliseconds as a VTT timestamp: HH:MM:SS.mmm
 */
function formatVttTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

/**
 * Convert a verbose_json Whisper response into a VTT string.
 */
function toVtt(verboseRes: {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}): string {
  const segments = verboseRes.segments?.filter((s) => s.text.trim()) ?? [];
  if (segments.length > 0) {
    return [
      'WEBVTT',
      '',
      ...segments.flatMap((s, i) => [
        String(i + 1),
        `${formatVttTimestamp(s.start * 1000)} --> ${formatVttTimestamp(Math.max(s.end * 1000, s.start * 1000 + 1000))}`,
        s.text.trim(),
        '',
      ]),
    ].join('\n');
  }
  const text = verboseRes.text.trim();
  if (!text) return 'WEBVTT\n';
  const durationMs = Math.max(30_000, Math.round((verboseRes.duration ?? 60) * 1000));
  return [
    'WEBVTT',
    '',
    '1',
    `00:00:00.000 --> ${formatVttTimestamp(durationMs)}`,
    text,
    '',
  ].join('\n');
}

export const transcribeUploadedVideoTask = task({
  id: 'transcribe-uploaded-video',
  maxDuration: 3600,
  machine: 'medium-1x',

  run: async (payload: Payload) => {
    logger.info('Transcribe uploaded video starting', payload as unknown as Record<string, unknown>);
    const db = getDb();

    // 1. Load video row; bail on unexpected states.
    const rows = await db.select().from(video).where(eq(video.id, payload.videoId)).limit(1);
    const v = rows[0];
    if (!v) throw new Error(`Video ${payload.videoId} not found`);

    if (v.transcribeStatus !== 'transcribing') {
      logger.warn(`Video ${payload.videoId} status is ${v.transcribeStatus}; skipping`);
      return { skipped: true };
    }
    if (!v.localR2Key) throw new Error(`Video ${payload.videoId} has no localR2Key`);
    if (!v.contentType) throw new Error(`Video ${payload.videoId} has no contentType`);

    try {
      const env = parseServerEnv(process.env);
      const r2 = createR2Client(env);
      const openaiClient = createOpenAIClient(env);

      // 2. Extract audio (or passthrough for audio uploads).
      const audioR2Key = `workspaces/${payload.workspaceId}/uploads/${payload.videoId}/audio.m4a`;
      logger.info('Extracting audio', { videoId: payload.videoId, contentType: v.contentType });
      const extracted = await extractAudioFromR2Source({
        workspaceId: payload.workspaceId,
        videoId: payload.videoId,
        sourceR2Key: v.localR2Key,
        contentType: v.contentType,
        outputR2Key: audioR2Key,
      });
      logger.info('Audio extracted', {
        videoId: payload.videoId,
        sizeBytes: extracted.sizeBytes,
        durationSec: extracted.durationSec,
      });

      // 3. Transcribe via OpenAI Whisper (gpt-4o-mini-transcribe).
      const openai = openaiClient.raw;
      const audioObj = await r2.getObject(audioR2Key);
      const audioBytes = audioObj.body;

      let vttContent: string;

      if (audioBytes.byteLength <= WHISPER_MAX_BYTES) {
        // Single-call transcription
        logger.info('Transcribing audio (single call)', {
          videoId: payload.videoId,
          sizeBytes: audioBytes.byteLength,
        });
        const file = new File([audioBytes], `${payload.videoId}.m4a`, { type: 'audio/mp4' });
        const res = await openai.audio.transcriptions.create({
          model: 'gpt-4o-mini-transcribe',
          file,
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        });
        const verboseRes = res as unknown as {
          text: string;
          language?: string;
          duration?: number;
          segments?: Array<{ start: number; end: number; text: string }>;
        };
        vttContent = toVtt(verboseRes);
      } else {
        // TODO(chunking): For files > 25 MB, split via ffmpeg into 10 MB chunks,
        // transcribe each chunk with a timestamp offset, then concatenate the VTT
        // segments. This is a TODO for a follow-up commit; for now we transcribe
        // truncated to the first 25 MB and log a warning.
        logger.warn('Audio file exceeds 25 MB Whisper limit; transcribing first 25 MB only', {
          videoId: payload.videoId,
          sizeBytes: audioBytes.byteLength,
        });
        const truncated = audioBytes.slice(0, WHISPER_MAX_BYTES);
        const file = new File([truncated], `${payload.videoId}.m4a`, { type: 'audio/mp4' });
        const res = await openai.audio.transcriptions.create({
          model: 'gpt-4o-mini-transcribe',
          file,
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        });
        const verboseRes = res as unknown as {
          text: string;
          language?: string;
          duration?: number;
          segments?: Array<{ start: number; end: number; text: string }>;
        };
        vttContent = toVtt(verboseRes);
      }

      // 4. Write VTT to canonical R2 location.
      const vttKey = transcriptKey({
        workspaceId: payload.workspaceId,
        videoId: payload.videoId,
        format: 'vtt',
      });
      await r2.putObject({
        key: vttKey,
        body: vttContent,
        contentType: 'text/vtt',
      });
      logger.info('VTT written to R2', { videoId: payload.videoId, vttKey });

      // 5. Insert transcriptAsset row.
      const wordCount = countVttWords(vttContent);
      const taId = `ta_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await db.insert(transcriptAsset).values({
        id: taId,
        workspaceId: payload.workspaceId,
        videoId: payload.videoId,
        provider: 'gpt-4o-mini-transcribe',
        r2Key: vttKey,
        wordCount,
        isCanonical: true,
      });

      // 6. Insert normalizedTranscriptVersion row (VTT is the initial normalized form).
      const ntvId = `ntv_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await db.insert(normalizedTranscriptVersion).values({
        id: ntvId,
        workspaceId: payload.workspaceId,
        videoId: payload.videoId,
        transcriptAssetId: taId,
        r2Key: vttKey,
        version: 1,
      });

      // 7. Mark video ready + capture duration.
      const durationSeconds = extracted.durationSec > 0
        ? Math.round(extracted.durationSec)
        : null;
      await db
        .update(video)
        .set({ transcribeStatus: 'ready', durationSeconds })
        .where(eq(video.id, payload.videoId));

      logger.info('Transcribe uploaded video complete', {
        videoId: payload.videoId,
        vttKey,
        wordCount,
      });
      return { ok: true, vttKey };
    } catch (err) {
      logger.error('Transcribe uploaded video failed', {
        videoId: payload.videoId,
        error: String(err),
      });
      await db.update(video).set({ transcribeStatus: 'failed' }).where(eq(video.id, payload.videoId));
      throw err;
    }
  },
});
