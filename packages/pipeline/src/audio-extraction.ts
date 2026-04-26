import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { and, desc, eq, getDb, inArray } from '@creatorcanon/db';
import {
  mediaAsset,
  transcriptAsset,
} from '@creatorcanon/db/schema';

// ── R2-source extraction (manual uploads) ──────────────────────────────────────

export interface ExtractAudioFromR2SourceInput {
  workspaceId: string;
  videoId: string;
  /** R2 key for the uploaded source file. */
  sourceR2Key: string;
  /** MIME type of the uploaded file; used to decide audio passthrough vs ffmpeg. */
  contentType: string;
  /** R2 key where the extracted/passthrough audio should be written. */
  outputR2Key: string;
}

export interface ExtractAudioFromR2SourceResult {
  outputR2Key: string;
  /** Duration in seconds, or 0 if it could not be determined. */
  durationSec: number;
  sizeBytes: number;
}

/**
 * Download a file from R2, optionally run ffmpeg to extract audio, then
 * upload the result back to a different R2 key.
 *
 * - Audio files (contentType starts with `audio/`): uploaded as-is (passthrough).
 * - Video files (contentType starts with `video/`): audio stream extracted via
 *   `ffmpeg -i <input> -vn -c:a aac <output.m4a>`.
 */
export async function extractAudioFromR2Source(
  input: ExtractAudioFromR2SourceInput,
): Promise<ExtractAudioFromR2SourceResult> {
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-r2extract-'));
  try {
    // 1. Download source from R2
    const sourceObj = await r2.getObject(input.sourceR2Key);
    const sourceExt = guessExtension(input.contentType, input.sourceR2Key);
    const sourcePath = path.join(tempDir, `source${sourceExt}`);
    await fs.writeFile(sourcePath, sourceObj.body);

    let audioPath: string;
    let outputContentType: string;

    if (input.contentType.startsWith('audio/')) {
      // Audio passthrough — no conversion needed
      audioPath = sourcePath;
      outputContentType = input.contentType;
    } else {
      // Video — extract audio stream as AAC m4a
      const outputPath = path.join(tempDir, 'audio.m4a');
      await runCommand(ffmpegBin(), [
        '-y',
        '-i', sourcePath,
        '-vn',
        '-c:a', 'aac',
        outputPath,
      ]);
      audioPath = outputPath;
      outputContentType = 'audio/mp4';
    }

    // 2. Probe duration via ffprobe (best-effort; 0 on failure)
    const durationSec = await probeDuration(audioPath);

    // 3. Upload to outputR2Key
    const audioBytes = await fs.readFile(audioPath);
    await r2.putObject({
      key: input.outputR2Key,
      body: audioBytes,
      contentType: outputContentType,
      metadata: {
        source: 'manual-upload-extraction',
        workspaceId: input.workspaceId,
        videoId: input.videoId,
      },
    });

    return {
      outputR2Key: input.outputR2Key,
      durationSec,
      sizeBytes: audioBytes.byteLength,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function guessExtension(contentType: string, fallbackKey: string): string {
  const mimeToExt: Record<string, string> = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
    'audio/webm': '.webm',
    'audio/aac': '.aac',
  };
  if (mimeToExt[contentType]) return mimeToExt[contentType]!;
  const extFromKey = path.extname(fallbackKey);
  return extFromKey || '.bin';
}

async function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      filePath,
    ]);
    let out = '';
    proc.stdout?.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) { resolve(0); return; }
      try {
        const parsed = JSON.parse(out) as { format?: { duration?: string } };
        const dur = parseFloat(parsed.format?.duration ?? '0');
        resolve(isFinite(dur) ? dur : 0);
      } catch {
        resolve(0);
      }
    });
    proc.on('error', () => resolve(0));
  });
}

export interface AudioExtractionVideoInput {
  videoId: string;
  youtubeVideoId: string | null;
  title: string | null;
}

export interface ExtractVideoAudioAssetsInput {
  workspaceId: string;
  runId: string;
  videos: AudioExtractionVideoInput[];
  force?: boolean;
  requireConfirmation?: boolean;
}

export interface ExtractVideoAudioAssetsResult {
  extractedCount: number;
  reusedCount: number;
  items: Array<{
    videoId: string;
    youtubeVideoId: string | null;
    title: string | null;
    transcriptProvider: string | null;
    audioR2Key: string;
    action: 'extracted' | 'reused';
  }>;
}

function ytdlpBin(): string {
  return process.env.AUDIO_EXTRACTION_YTDLP_BIN?.trim() || 'yt-dlp';
}

function ffmpegBin(): string {
  return process.env.AUDIO_EXTRACTION_FFMPEG_BIN?.trim() || 'ffmpeg';
}

function challengeRuntimeBin(): string {
  return process.env.AUDIO_EXTRACTION_CHALLENGE_RUNTIME_BIN?.trim() || 'deno';
}

function assertCommandReady(command: string, args: string[], label: string) {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
  });
  if (result.status === 0) return;
  throw new Error(`${label} is not available. Install it or set the matching AUDIO_EXTRACTION_* env override.`);
}

function runCommand(
  command: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts?.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          [
            `Command failed: ${command} ${args.join(' ')}`,
            stdout.trim() ? `stdout:\n${stdout.trim()}` : '',
            stderr.trim() ? `stderr:\n${stderr.trim()}` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        ),
      );
    });
  });
}

async function downloadAudio(input: {
  youtubeVideoId: string;
  outputDir: string;
}) {
  const outputTemplate = path.join(input.outputDir, 'audio.%(ext)s');
  await runCommand(ytdlpBin(), [
    '--no-playlist',
    '--extract-audio',
    '--audio-format',
    'm4a',
    '--audio-quality',
    '0',
    '--force-overwrites',
    '--remote-components',
    'ejs:github',
    '--output',
    outputTemplate,
    `https://www.youtube.com/watch?v=${input.youtubeVideoId}`,
  ]);

  const files = await fs.readdir(input.outputDir);
  const m4a = files.find((file) => file.toLowerCase() === 'audio.m4a');
  if (!m4a) {
    throw new Error(`yt-dlp finished but did not produce audio.m4a for ${input.youtubeVideoId}.`);
  }
  return path.join(input.outputDir, m4a);
}

function assertExtractionEnvironment(requireConfirmation: boolean) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const isLocal =
    process.env.ARTIFACT_STORAGE === 'local' ||
    process.env.DEV_AUTH_BYPASS_ENABLED === 'true' ||
    appUrl.includes('localhost');

  if (requireConfirmation && !isLocal && process.env.ALPHA_AUDIO_EXTRACT_CONFIRM !== 'true') {
    throw new Error(
      'Refusing extraction outside local/dev without ALPHA_AUDIO_EXTRACT_CONFIRM=true.',
    );
  }
}

async function resolveExistingState(workspaceId: string, videoIds: string[]) {
  const db = getDb();
  const [transcriptRows, audioRows] = await Promise.all([
    db
      .select({
        videoId: transcriptAsset.videoId,
        provider: transcriptAsset.provider,
      })
      .from(transcriptAsset)
      .where(
        and(
          eq(transcriptAsset.workspaceId, workspaceId),
          eq(transcriptAsset.isCanonical, true),
          inArray(transcriptAsset.videoId, videoIds),
        ),
      ),
    db
      .select({
        id: mediaAsset.id,
        videoId: mediaAsset.videoId,
        r2Key: mediaAsset.r2Key,
        createdAt: mediaAsset.createdAt,
      })
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.workspaceId, workspaceId),
          eq(mediaAsset.type, 'audio_m4a'),
          inArray(mediaAsset.videoId, videoIds),
        ),
      )
      .orderBy(desc(mediaAsset.createdAt)),
  ]);

  const transcriptByVideo = new Map(
    transcriptRows.map((row) => [row.videoId, row.provider]),
  );
  const audioByVideo = new Map<string, { id: string; r2Key: string }>();
  for (const row of audioRows) {
    if (!audioByVideo.has(row.videoId)) {
      audioByVideo.set(row.videoId, { id: row.id, r2Key: row.r2Key });
    }
  }

  return { transcriptByVideo, audioByVideo };
}

export async function extractVideoAudioAssets(
  input: ExtractVideoAudioAssetsInput,
): Promise<ExtractVideoAudioAssetsResult> {
  const env = parseServerEnv(process.env);
  assertExtractionEnvironment(input.requireConfirmation ?? true);
  assertCommandReady(ytdlpBin(), ['--version'], 'yt-dlp');
  assertCommandReady(ffmpegBin(), ['-version'], 'ffmpeg');
  assertCommandReady(challengeRuntimeBin(), ['--version'], 'challenge runtime');

  const videos = [...input.videos];
  const { transcriptByVideo, audioByVideo } = await resolveExistingState(
    input.workspaceId,
    videos.map((item) => item.videoId),
  );

  const blockedVideos = videos.filter((item) => transcriptByVideo.has(item.videoId));
  if (blockedVideos.length > 0 && !input.force) {
    throw new Error(
      `Refusing extraction because ${blockedVideos.length} selected video(s) already have canonical transcripts. Re-run with --force=true if you intentionally want to add audio assets anyway.`,
    );
  }

  const db = getDb();
  const r2 = createR2Client(env);
  const items: ExtractVideoAudioAssetsResult['items'] = [];
  let extractedCount = 0;
  let reusedCount = 0;

  for (const selected of videos) {
    if (!selected.youtubeVideoId) {
      // manual_upload videos skip yt-dlp; the worker job handles their audio separately.
      continue;
    }

    const existingAudio = audioByVideo.get(selected.videoId);
    if (existingAudio && !input.force) {
      reusedCount += 1;
      items.push({
        videoId: selected.videoId,
        youtubeVideoId: selected.youtubeVideoId,
        title: selected.title,
        transcriptProvider: transcriptByVideo.get(selected.videoId) ?? null,
        audioR2Key: existingAudio.r2Key,
        action: 'reused',
      });
      continue;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'creatorcanon-extract-'));
    try {
      const localAudioPath = await downloadAudio({
        youtubeVideoId: selected.youtubeVideoId,
        outputDir: tempDir,
      });
      const audioBytes = await fs.readFile(localAudioPath);
      const audioR2Key =
        existingAudio?.r2Key ??
        `workspaces/${input.workspaceId}/media/${selected.videoId}/audio.m4a`;

      await r2.putObject({
        key: audioR2Key,
        body: audioBytes,
        contentType: 'audio/mp4',
        metadata: {
          source: 'alpha-audio-extraction',
          youtubeVideoId: selected.youtubeVideoId,
          runId: input.runId,
        },
      });

      if (!existingAudio) {
        await db.insert(mediaAsset).values({
          id: crypto.randomUUID(),
          workspaceId: input.workspaceId,
          videoId: selected.videoId,
          type: 'audio_m4a',
          r2Key: audioR2Key,
        });
      }

      extractedCount += 1;
      items.push({
        videoId: selected.videoId,
        youtubeVideoId: selected.youtubeVideoId,
        title: selected.title,
        transcriptProvider: transcriptByVideo.get(selected.videoId) ?? null,
        audioR2Key,
        action: 'extracted',
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  return {
    extractedCount,
    reusedCount,
    items,
  };
}
