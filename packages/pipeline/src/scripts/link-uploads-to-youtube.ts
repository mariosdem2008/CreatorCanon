/**
 * Operator one-off: populate `video.youtube_video_id` on the 6 manual-upload
 * Hormozi rows so downstream citation rendering can deep-link into YouTube
 * with timestamps. Idempotent — re-running is a no-op when the column is
 * already populated to the requested value.
 */
import { closeDb, eq, getDb } from '@creatorcanon/db';
import { video } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const MAPPINGS: Array<{ videoId: string; youtubeId: string; titleHint: string }> = [
  { videoId: 'mu_19babea8dd50', youtubeId: 'fr78adfAnuA', titleHint: 'How to Use AI in Your Business in 2026' },
  { videoId: 'mu_d1874754ed57', youtubeId: '9q5ojtkqsBs', titleHint: 'How to Win With AI in 2026' },
  { videoId: 'mu_ef960bd0c8b8', youtubeId: 'yb2cLMMuMdQ', titleHint: 'How to make progress faster than everyone' },
  { videoId: 'mu_bedea1b0c85a', youtubeId: 'uWdIgftpvBI', titleHint: 'If I Started A Business in 2026' },
  { videoId: 'mu_680b5481c40b', youtubeId: 'jfW6gL6hKhk', titleHint: 'If I Wanted to Make My First $100K in 2026' },
  { videoId: 'mu_429e72237932', youtubeId: 'UDBkiBnMrHs', titleHint: 'If you’re ambitious but inconsistent' },
];

async function main() {
  const db = getDb();
  for (const m of MAPPINGS) {
    const rows = await db.select({ id: video.id, title: video.title, current: video.youtubeVideoId })
      .from(video).where(eq(video.id, m.videoId)).limit(1);
    const v = rows[0];
    if (!v) { console.warn(`[link-yt] ${m.videoId} not found in video table; skipping`); continue; }
    if (!v.title?.toLowerCase().includes(m.titleHint.toLowerCase().slice(0, 25))) {
      throw new Error(`[link-yt] safety check failed: ${m.videoId} title="${v.title}" doesn't match expected "${m.titleHint}"`);
    }
    if (v.current === m.youtubeId) { console.log(`[link-yt] ${m.videoId} already=${m.youtubeId} (no-op)`); continue; }
    await db.update(video).set({ youtubeVideoId: m.youtubeId }).where(eq(video.id, m.videoId));
    console.log(`[link-yt] ${m.videoId} → ${m.youtubeId} (${v.title})`);
  }
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
