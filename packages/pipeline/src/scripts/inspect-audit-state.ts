/**
 * Inspect what's already in DB for a given run — used to figure out which
 * audit-phase artifacts are missing so we can fill them in offline.
 */
import { closeDb, eq, getDb, sql } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  generationRun,
  pageBrief,
  segment,
  videoIntelligenceCard,
} from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/inspect-audit-state.ts <runId>');

  const db = getDb();
  const r = await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1);
  console.log('run:', { id: r[0]?.id, status: r[0]?.status });

  const cp = await db.select({ id: channelProfile.id }).from(channelProfile).where(eq(channelProfile.runId, runId));
  console.log('channel_profile rows:', cp.length);

  const vic = await db.select({ videoId: videoIntelligenceCard.videoId }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, runId));
  console.log('video_intelligence_card rows:', vic.length, '— for', vic.map((v) => v.videoId));

  const cn = await db.select({ id: canonNode.id, type: canonNode.type }).from(canonNode).where(eq(canonNode.runId, runId));
  console.log('canon_node rows:', cn.length);

  const pb = await db.select({ id: pageBrief.id, position: pageBrief.position }).from(pageBrief).where(eq(pageBrief.runId, runId));
  console.log('page_brief rows:', pb.length);

  const segCounts = await db
    .select({ videoId: segment.videoId, c: sql<number>`count(*)::int` })
    .from(segment)
    .where(eq(segment.runId, runId))
    .groupBy(segment.videoId);
  console.log('segment counts by video:');
  for (const row of segCounts) console.log('   ', row);

  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
