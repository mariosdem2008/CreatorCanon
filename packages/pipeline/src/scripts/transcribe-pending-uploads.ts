/**
 * One-off operator script: transcribe every manual-upload video for a given
 * run that's still in `transcribe_status='pending'`. Mirrors the logic in
 * apps/worker/src/tasks/transcribe-uploaded-video.ts but runs inline so we
 * don't need Trigger.dev infra during dev seeding.
 *
 * Adds in-memory chunking for audio files >25 MB so long videos transcribe
 * without hitting Whisper's per-call size cap.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/scripts/transcribe-pending-uploads.ts <runId>
 */

import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import OpenAI from 'openai';

import { createOpenAIClient, createR2Client, transcriptKey } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { and, closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  transcriptAsset,
  video,
  videoSetItem,
} from '@creatorcanon/db/schema';

import { extractAudioFromR2Source } from '../audio-extraction';
import { loadDefaultEnvFiles } from '../env-files';

const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // 24 MB — leave headroom under the 25 MB Whisper cap

/**
 * Build the Whisper-compatible client (or local-process runner) for the
 * selected provider.
 *
 * - `openai` (default): real OpenAI Whisper, billed against the org's metered
 *   quota. Hits the same tier wall as the rest of the pipeline's API spend.
 * - `groq`: Groq Cloud's OpenAI-compatible audio endpoint. Free tier covers
 *   us during development. Model is `whisper-large-v3-turbo` (faster + cheaper
 *   per-call than whisper-1, comparable transcript quality for English).
 * - `local-whisper`: faster-whisper Python process running on the user's
 *   NVIDIA GPU. No quota, no chunking required (faster-whisper handles
 *   arbitrary-length audio natively). Quality matches `large-v3-turbo`.
 *   Requires `pip install faster-whisper` once.
 *
 * The remote providers expose `client.audio.transcriptions.create(...)`.
 * The local runner is a separate union member with `kind: 'local-whisper'`;
 * downstream code branches on `'kind' in transcriber`.
 */
type RemoteTranscriber = { kind: 'remote'; client: OpenAI; model: string; providerLabel: string };
type LocalWhisperRunner = { kind: 'local-whisper'; providerLabel: string; scriptPath: string; pythonBin: string };
type Transcriber = RemoteTranscriber | LocalWhisperRunner;

function buildTranscriber(): Transcriber {
  const provider = (process.env.TRANSCRIBE_PROVIDER ?? 'openai').toLowerCase().trim();
  if (provider === 'local-whisper' || provider === 'local') {
    return buildLocalWhisper();
  }
  if (provider === 'groq') {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('TRANSCRIBE_PROVIDER=groq but GROQ_API_KEY is not set');
    const model = process.env.GROQ_TRANSCRIBE_MODEL?.trim() || 'whisper-large-v3-turbo';
    return {
      kind: 'remote',
      client: new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      }),
      model,
      providerLabel: `groq:${model}`,
    };
  }
  if (provider !== 'openai') {
    throw new Error(`Unsupported TRANSCRIBE_PROVIDER='${provider}'. Use 'openai' | 'groq' | 'local-whisper'.`);
  }
  const env = parseServerEnv(process.env);
  const openaiClient = createOpenAIClient(env);
  return { kind: 'remote', client: openaiClient.raw, model: 'whisper-1', providerLabel: 'openai:whisper-1' };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function buildLocalWhisper(): LocalWhisperRunner {
  const pythonBin = process.env.LOCAL_WHISPER_PYTHON?.trim() || (process.platform === 'win32' ? 'python' : 'python3');
  const scriptPath = path.resolve(__dirname, 'util/local-whisper.py');
  if (!fsSync.existsSync(scriptPath)) {
    throw new Error(`local-whisper.py missing at ${scriptPath}`);
  }
  // Fail fast if the Python package isn't installed — the per-video error
  // would be the same root cause but the operator wouldn't see it until
  // chunk 1 of video 1 fails.
  const probe = spawnSync(pythonBin, ['-c', 'import faster_whisper'], { encoding: 'utf8' });
  if (probe.status !== 0) {
    throw new Error(
      `local-whisper requires faster-whisper. Install with:\n` +
      `  ${pythonBin} -m pip install faster-whisper\n` +
      `then re-run with TRANSCRIBE_PROVIDER=local-whisper.\n` +
      `(probe stderr: ${(probe.stderr ?? '').slice(0, 200)})`,
    );
  }
  const model = process.env.WHISPER_MODEL ?? 'large-v3-turbo';
  return {
    kind: 'local-whisper',
    providerLabel: `local-whisper:${model}`,
    scriptPath,
    pythonBin,
  };
}

function ffmpegBin(): string {
  return process.env.AUDIO_EXTRACTION_FFMPEG_BIN?.trim() || 'ffmpeg';
}

function runCommand(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exited with code ${code}. stderr: ${stderr.slice(-400)}`));
    });
  });
}

function formatVttTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.round(ms));
  const hours = Math.floor(safeMs / 3_600_000);
  const minutes = Math.floor((safeMs % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMs % 60_000) / 1000);
  const millis = safeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

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

interface VerboseRes {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{ start: number; end: number; text: string }>;
}

/**
 * Parse Groq-style "Used X, Limit Y" + "try again in Ns" hints from a 429
 * error message. Groq's audio-seconds-per-hour quota is a 1-hour rolling
 * window — short retries don't recover. We compute a reasonable wait that
 * lets enough capacity decay out of the window before retrying.
 */
function pickRateLimitBackoff(message: string, attempt: number): number {
  // Honor Groq's "try again in Xs" hint when present.
  const hint = message.match(/try again in (\d+(?:\.\d+)?)([sm])/i);
  if (hint) {
    const value = parseFloat(hint[1]!);
    const unit = hint[2]!.toLowerCase();
    const ms = unit === 'm' ? value * 60_000 : value * 1000;
    if (ms > 0) return Math.min(ms + 5000, 15 * 60_000); // tiny pad, cap 15 min
  }
  // ASPH (audio-seconds-per-hour) is a rolling-hour quota. We've burned
  // most of it; capacity decays linearly. A 5-10 min wait usually frees
  // enough for the next chunk.
  if (/seconds of audio per hour|asph|tokens per hour/i.test(message)) {
    return Math.min(8 * 60_000 * attempt, 30 * 60_000);
  }
  // Generic 429 — short backoff.
  return Math.min(60_000, 2_000 * 2 ** (attempt - 1));
}

/** Transcribe a single audio file (≤24 MB) via Whisper-compatible API with retries. */
async function transcribeOnce(
  audioPath: string,
  label: string,
  transcriber: RemoteTranscriber,
): Promise<VerboseRes> {
  const audioBytes = await fs.readFile(audioPath);
  const maxAttempts = 6;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const file = new File([audioBytes], `${label}.m4a`, { type: 'audio/mp4' });
      const res = await transcriber.client.audio.transcriptions.create(
        {
          model: transcriber.model,
          file,
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        },
        // 10-min per-call cap — long uploads + slow links shouldn't trip the default 60s.
        { timeout: 10 * 60 * 1000, maxRetries: 0 },
      );
      return res as unknown as VerboseRes;
    } catch (err) {
      lastErr = err;
      const cause = (err as { cause?: { code?: string } } | undefined)?.cause;
      const status = (err as { status?: number }).status;
      const message = String((err as { message?: string }).message ?? err);
      const transientNetwork =
        cause?.code === 'ECONNRESET' ||
        cause?.code === 'ETIMEDOUT' ||
        cause?.code === 'EAI_AGAIN' ||
        cause?.code === 'ENETUNREACH' ||
        cause?.code === 'ECONNREFUSED' ||
        /Connection error|fetch failed|socket hang up/i.test(String(err));
      // 429 is recoverable across ~minutes; 5xx is server-side blip.
      const transientServer = status === 429 || (status != null && status >= 500 && status < 600);
      if ((!transientNetwork && !transientServer) || attempt === maxAttempts) throw err;
      const backoffMs = transientServer && status === 429
        ? pickRateLimitBackoff(message, attempt)
        : Math.min(60_000, 2_000 * 2 ** (attempt - 1));
      const reason = cause?.code ?? `http ${status}` ?? 'transient';
      console.warn(`[transcribe] ${label} attempt ${attempt}/${maxAttempts} failed (${reason}) — retrying in ${Math.round(backoffMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

/**
 * Drive a Python faster-whisper subprocess. Local Whisper has no audio-size
 * cap and no rate limit, so we hand it the full audio path in one call.
 */
/** Run the Python local-whisper subprocess once. Accepts valid JSON output
 * even when the process exits non-zero — faster-whisper on Windows + CUDA
 * occasionally crashes during cleanup (exit 0xC0000409, STATUS_STACK_BUFFER_OVERRUN)
 * after the actual transcription has succeeded and emitted JSON to stdout. */
async function transcribeOnceLocalRaw(
  audioPath: string,
  label: string,
  runner: LocalWhisperRunner,
): Promise<VerboseRes> {
  return new Promise((resolve, reject) => {
    const proc = spawn(runner.pythonBin, [runner.scriptPath, audioPath], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    let stdout = '';
    let stderr = '';
    proc.stdout?.on('data', (b: Buffer) => { stdout += b.toString(); });
    proc.stderr?.on('data', (b: Buffer) => {
      const text = b.toString();
      stderr += text;
      process.stderr.write(text);
    });
    proc.on('error', (err) => {
      reject(new Error(`local-whisper spawn failed for ${label}: ${err.message}. Install with: ${runner.pythonBin} -m pip install faster-whisper`));
    });
    proc.on('close', (code) => {
      // Accept JSON output even on non-zero exit if stdout looks valid —
      // CUDA shutdown crashes on Windows post-transcription happen after
      // the JSON has already been written.
      const trimmed = stdout.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed) as VerboseRes;
          if (Array.isArray(parsed.segments)) {
            if (code !== 0) {
              process.stderr.write(`[local-whisper] ${label} exit ${code} but JSON is valid (${parsed.segments.length} segments) — accepting\n`);
            }
            resolve(parsed);
            return;
          }
        } catch {
          // fall through to the error branch
        }
      }
      if (code !== 0) {
        reject(new Error(`local-whisper ${label} exited ${code}: ${stderr.slice(-400)}`));
        return;
      }
      reject(new Error(`local-whisper ${label} output not JSON; preview: ${stdout.slice(0, 200)}`));
    });
  });
}

/** With per-chunk retry — a flaky CUDA shutdown shouldn't fail the whole video. */
async function transcribeOnceLocal(
  audioPath: string,
  label: string,
  runner: LocalWhisperRunner,
): Promise<VerboseRes> {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await transcribeOnceLocalRaw(audioPath, label, runner);
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const backoffMs = 5000 * attempt;
      process.stderr.write(`[local-whisper] ${label} attempt ${attempt}/${maxAttempts} failed (${(err as Error).message.slice(0, 200)}) — retrying in ${backoffMs}ms\n`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr;
}

/**
 * For audio >24 MB, split into N equal-duration chunks (each well under 24 MB),
 * transcribe each, and stitch the per-segment timestamps back together.
 *
 * Local-whisper bypasses chunking entirely — it streams audio of any length
 * with no rate limit, and chunking would just add re-encoding overhead.
 */
/** Local-whisper memory chunking: faster-whisper loads the whole audio
 * into memory before extracting features. For a 2.7hr podcast that's
 * ~1.5 GB of float32 — easily exceeds the available RAM on a 16 GB box
 * with Chrome + dev tools open. Chunk by duration (default 25 min, env-
 * overridable) so each chunk's feature array fits in ~250 MB. */
const LOCAL_WHISPER_CHUNK_SEC = Math.max(60, parseInt(process.env.LOCAL_WHISPER_CHUNK_SEC ?? '1500', 10));

async function transcribeWithChunking(
  audioPath: string,
  audioBytes: number,
  durationSec: number,
  videoId: string,
  tempDir: string,
  transcriber: Transcriber,
): Promise<VerboseRes> {
  if (transcriber.kind === 'local-whisper') {
    if (durationSec <= LOCAL_WHISPER_CHUNK_SEC) {
      console.info(`[transcribe] ${videoId}: using ${transcriber.providerLabel} (single pass, ${Math.round(durationSec)}s)`);
      return transcribeOnceLocal(audioPath, videoId, transcriber);
    }
    // Long audio: chunk by duration to bound RAM during feature extraction.
    const chunks = Math.ceil(durationSec / LOCAL_WHISPER_CHUNK_SEC);
    const chunkSeconds = Math.ceil(durationSec / chunks);
    console.info(`[transcribe] ${videoId}: ${(durationSec / 60).toFixed(1)}min audio > ${LOCAL_WHISPER_CHUNK_SEC}s; ${transcriber.providerLabel} chunking into ${chunks} pieces of ~${chunkSeconds}s each`);
    const merged: VerboseRes = { text: '', segments: [], duration: durationSec };
    for (let i = 0; i < chunks; i += 1) {
      const startSec = i * chunkSeconds;
      const chunkPath = path.join(tempDir, `lw_chunk_${i}.m4a`);
      await runCommand(ffmpegBin(), [
        '-y',
        '-ss', String(startSec),
        '-t', String(chunkSeconds),
        '-i', audioPath,
        '-vn',
        '-c:a', 'aac',
        chunkPath,
      ]);
      const stat = await fs.stat(chunkPath);
      console.info(`[transcribe]   chunk ${i + 1}/${chunks}: ${(stat.size / 1024 / 1024).toFixed(1)} MB at ${startSec}s`);
      const partial = await transcribeOnceLocal(chunkPath, `${videoId}_${i}`, transcriber);
      if (partial.text) merged.text += (merged.text ? ' ' : '') + partial.text;
      for (const s of partial.segments ?? []) {
        merged.segments!.push({
          start: s.start + startSec,
          end: s.end + startSec,
          text: s.text,
        });
      }
      // Clean up chunk file immediately so we don't pile up tempdir entries.
      await fs.unlink(chunkPath).catch(() => undefined);
    }
    return merged;
  }
  if (audioBytes <= WHISPER_MAX_BYTES) {
    return transcribeOnce(audioPath, videoId, transcriber);
  }
  // Pick chunk count so each chunk is comfortably under the cap.
  const chunks = Math.ceil(audioBytes / WHISPER_MAX_BYTES);
  const chunkSeconds = Math.ceil(durationSec / chunks);
  console.info(`[transcribe] ${videoId}: audio ${(audioBytes / 1024 / 1024).toFixed(1)} MB > ${WHISPER_MAX_BYTES / 1024 / 1024} MB; splitting into ${chunks} chunks of ~${chunkSeconds}s each`);

  const merged: VerboseRes = { text: '', segments: [], duration: durationSec };
  for (let i = 0; i < chunks; i += 1) {
    const startSec = i * chunkSeconds;
    const chunkPath = path.join(tempDir, `chunk_${i}.m4a`);
    // Re-encode each chunk so seek is exact and AAC frames are clean for Whisper.
    await runCommand(ffmpegBin(), [
      '-y',
      '-ss', String(startSec),
      '-t', String(chunkSeconds),
      '-i', audioPath,
      '-vn',
      '-c:a', 'aac',
      chunkPath,
    ]);
    const stat = await fs.stat(chunkPath);
    console.info(`[transcribe]   chunk ${i + 1}/${chunks}: ${(stat.size / 1024 / 1024).toFixed(1)} MB at ${startSec}s`);
    const partial = await transcribeOnce(chunkPath, `${videoId}_${i}`, transcriber);
    if (partial.text) merged.text += (merged.text ? ' ' : '') + partial.text;
    for (const s of partial.segments ?? []) {
      merged.segments!.push({
        start: s.start + startSec,
        end: s.end + startSec,
        text: s.text,
      });
    }
  }
  return merged;
}

function toVtt(verboseRes: VerboseRes): string {
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

async function transcribeVideo(
  v: { id: string; workspaceId: string; localR2Key: string; contentType: string; title: string | null },
  transcriber: Transcriber,
): Promise<void> {
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);
  const db = getDb();

  // Mark transcribing to mirror the worker's invariant.
  await db.update(video).set({ transcribeStatus: 'transcribing', uploadStatus: 'uploaded' }).where(eq(video.id, v.id));

  try {
    // 1. Extract audio to R2 (idempotent).
    const audioR2Key = `workspaces/${v.workspaceId}/uploads/${v.id}/audio.m4a`;
    console.info(`[transcribe] ${v.id} (${v.title}) — extracting audio`);
    const extracted = await extractAudioFromR2Source({
      workspaceId: v.workspaceId,
      videoId: v.id,
      sourceR2Key: v.localR2Key,
      contentType: v.contentType,
      outputR2Key: audioR2Key,
    });
    console.info(`[transcribe] ${v.id} — audio.m4a ${(extracted.sizeBytes / 1024 / 1024).toFixed(1)} MB · ${extracted.durationSec}s`);

    // 2. Pull audio bytes locally for Whisper. Chunk if needed.
    const audioObj = await r2.getObject(audioR2Key);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-transcribe-'));
    const localAudio = path.join(tempDir, 'audio.m4a');
    await fs.writeFile(localAudio, audioObj.body);
    const verboseRes = await transcribeWithChunking(
      localAudio,
      extracted.sizeBytes,
      extracted.durationSec,
      v.id,
      tempDir,
      transcriber,
    );
    await fs.rm(tempDir, { recursive: true, force: true });

    // 3. Convert to VTT + write to canonical R2 location.
    const vttContent = toVtt(verboseRes);
    const vttKey = transcriptKey({ workspaceId: v.workspaceId, videoId: v.id, format: 'vtt' });
    await r2.putObject({ key: vttKey, body: vttContent, contentType: 'text/vtt' });
    const wordCount = countVttWords(vttContent);
    console.info(`[transcribe] ${v.id} — VTT written: ${wordCount} words`);

    // 4. Insert canonical transcriptAsset row. The DB column is a typed
    //    enum that only knows about openai's Whisper variants, so we stamp
    //    'whisper-1' regardless of whether OpenAI or a Groq Whisper-large
    //    variant produced the VTT — the transcription is still Whisper-class
    //    output and downstream stages don't need to discriminate.
    await db.insert(transcriptAsset).values({
      id: crypto.randomUUID(),
      workspaceId: v.workspaceId,
      videoId: v.id,
      provider: 'whisper-1',
      r2Key: vttKey,
      wordCount,
      isCanonical: true,
    }).onConflictDoNothing();

    // 5. Mark video ready.
    const durationSeconds = extracted.durationSec > 0 ? Math.round(extracted.durationSec) : null;
    await db.update(video).set({ transcribeStatus: 'ready', durationSeconds }).where(eq(video.id, v.id));
    console.info(`[transcribe] ${v.id} — DONE`);
  } catch (err) {
    await db.update(video).set({ transcribeStatus: 'failed' }).where(eq(video.id, v.id));
    console.error(`[transcribe] ${v.id} — FAILED:`, err);
    throw err;
  }
}

async function main() {
  loadDefaultEnvFiles();
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/transcribe-pending-uploads.ts <runId>');

  const db = getDb();
  const runRows = await db
    .select({ id: generationRun.id, videoSetId: generationRun.videoSetId, workspaceId: generationRun.workspaceId })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = runRows[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  const itemRows = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, run.videoSetId));
  const videoIds = itemRows.map((r) => r.videoId);
  if (videoIds.length === 0) throw new Error('Run has no videos');

  const vids = await db
    .select({
      id: video.id,
      workspaceId: video.workspaceId,
      localR2Key: video.localR2Key,
      contentType: video.contentType,
      title: video.title,
      transcribeStatus: video.transcribeStatus,
      sourceKind: video.sourceKind,
    })
    .from(video)
    .where(inArray(video.id, videoIds));

  const pending = vids.filter(
    (v) => v.sourceKind === 'manual_upload' && v.transcribeStatus !== 'ready' && v.localR2Key && v.contentType,
  );
  console.info(`[transcribe] Run ${runId}: ${vids.length} videos total, ${pending.length} pending transcription`);

  const transcriber = buildTranscriber();
  console.info(`[transcribe] Provider: ${transcriber.providerLabel}`);

  const failures: Array<{ id: string; title: string | null; error: string }> = [];
  for (let i = 0; i < pending.length; i += 1) {
    const v = pending[i]!;
    console.info(`[transcribe] (${i + 1}/${pending.length}) ${v.id} ${v.title}`);
    try {
      await transcribeVideo({
        id: v.id,
        workspaceId: v.workspaceId,
        localR2Key: v.localR2Key!,
        contentType: v.contentType!,
        title: v.title,
      }, transcriber);
    } catch (err) {
      failures.push({ id: v.id, title: v.title, error: String(err) });
      console.error(`[transcribe] ${v.id} permanently failed; continuing with next video.`);
    }
  }

  await closeDb();
  if (failures.length > 0) {
    console.error(`[transcribe] DONE with ${failures.length}/${pending.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f.id} ${f.title}: ${f.error}`);
    process.exit(2);
  }
  console.info(`[transcribe] All ${pending.length} transcriptions complete.`);
}

main().catch(async (err) => {
  await closeDb();
  console.error('[transcribe] FAILED', err);
  process.exit(1);
});
