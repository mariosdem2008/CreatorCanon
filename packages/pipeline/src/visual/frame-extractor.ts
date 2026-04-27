import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

export interface ExtractedFrame {
  timestampMs: number;
  filePath: string;
  bytes: Buffer;
}

export interface FrameExtractionResult {
  frames: ExtractedFrame[];
  /** MUST be invoked in a finally block to remove the temp directory. */
  cleanup: () => Promise<void>;
}

/**
 * Extract N keyframes from a local mp4 at the given millisecond timestamps.
 * Per-frame failures are skipped silently — the function returns whatever it
 * could extract. The caller cleans up by invoking the returned `cleanup`.
 */
export async function extractFrames(input: {
  mp4Path: string;
  timestampsMs: number[];
}): Promise<FrameExtractionResult> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-frames-'));
  const out: ExtractedFrame[] = [];
  for (const ts of input.timestampsMs) {
    const file = path.join(tempDir, `frame_${ts}.jpg`);
    try {
      await runFfmpeg([
        // -ss before -i = fast seek (less accurate but ~10-50x faster on long videos).
        '-ss', `${ts / 1000}`,
        '-i', input.mp4Path,
        '-frames:v', '1',
        '-q:v', '5',
        '-y', file,
      ]);
      const bytes = await fs.readFile(file);
      out.push({ timestampMs: ts, filePath: file, bytes });
    } catch {
      // Skip this frame — keep going for the rest. The extraction stage
      // handles per-video resilience; per-frame skips don't bubble.
    }
  }
  return {
    frames: out,
    cleanup: async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    },
  };
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = process.env.AUDIO_EXTRACTION_FFMPEG_BIN?.trim() || 'ffmpeg';
    const ff = spawn(bin, args, { stdio: 'ignore' });
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))));
    ff.on('error', reject);
  });
}
