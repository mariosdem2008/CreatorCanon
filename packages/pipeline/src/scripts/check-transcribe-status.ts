import { closeDb, eq, sql, getDb } from '@creatorcanon/db';
import { video, segment } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const db = getDb();

  const recentVids = await db
    .select({
      id: video.id,
      title: video.title,
      transcribeStatus: video.transcribeStatus,
    })
    .from(video)
    .where(eq(video.sourceKind, 'manual_upload'));

  // Group by transcribeStatus
  const byStatus = new Map<string, number>();
  for (const v of recentVids) {
    const status = v.transcribeStatus ?? 'null';
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }
  console.info(`Total manual_upload videos: ${recentVids.length}`);
  console.info(`Status breakdown:`);
  for (const [s, n] of byStatus) console.info(`  ${s.padEnd(20)} ${n}`);

  // Show last 50 with seg count
  console.info(`\nLast 50 videos:`);
  const last50 = recentVids.slice(-50);
  for (const v of last50) {
    const segCountRow = await db.select({ c: sql<number>`count(*)::int` }).from(segment).where(eq(segment.videoId, v.id));
    const c = segCountRow[0]?.c ?? 0;
    const status = (v.transcribeStatus ?? 'null').padEnd(12);
    const title = (v.title ?? '<no title>').slice(0, 60);
    console.info(`  ${status} ${String(c).padStart(4)} segs ${v.id} ${title}`);
  }

  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
