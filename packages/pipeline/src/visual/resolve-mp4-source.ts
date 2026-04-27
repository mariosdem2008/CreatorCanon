import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { and, eq } from '@creatorcanon/db';
import { mediaAsset } from '@creatorcanon/db/schema';
import type { AtlasDb } from '@creatorcanon/db';
import type { R2Client } from '@creatorcanon/adapters';

export interface LocalMp4Source {
  mp4Path: string;
  /** MUST be invoked in a finally block to delete the temp mp4. */
  cleanup: () => Promise<void>;
}

/**
 * v1: only `mediaAsset.type='video_mp4'` is supported.
 * yt-dlp fallback is deferred to v1.1.
 *
 * Returns null when no usable source — caller skips visual extraction for
 * that video and continues. The caller MUST invoke `cleanup()` after use.
 */
export async function resolveLocalMp4Source(
  db: AtlasDb,
  r2: R2Client,
  videoId: string,
): Promise<LocalMp4Source | null> {
  const rows = await db
    .select({ r2Key: mediaAsset.r2Key })
    .from(mediaAsset)
    .where(and(eq(mediaAsset.videoId, videoId), eq(mediaAsset.type, 'video_mp4')))
    .limit(1);
  if (!rows[0]) return null;

  const obj = await r2.getObject(rows[0].r2Key);
  const tmp = path.join(os.tmpdir(), `cc-mp4-${videoId}-${crypto.randomUUID().slice(0, 8)}.mp4`);
  await fs.writeFile(tmp, obj.body);

  return {
    mp4Path: tmp,
    cleanup: async () => {
      try {
        await fs.unlink(tmp);
      } catch {
        // best-effort
      }
    },
  };
}
