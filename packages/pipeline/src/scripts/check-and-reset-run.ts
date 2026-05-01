/**
 * One-off helper: print the current status of a generation_run + the
 * transcribe_status of every video in its set. If the run isn't 'queued',
 * flip it back to 'queued' so dispatch-queued-run.ts will accept it.
 *
 * Usage:
 *   tsx ./src/scripts/check-and-reset-run.ts <runId>
 */

import { closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import { generationRun, transcriptAsset, video, videoSetItem } from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/check-and-reset-run.ts <runId>');

  const db = getDb();
  const runRows = await db
    .select({ id: generationRun.id, status: generationRun.status, videoSetId: generationRun.videoSetId })
    .from(generationRun)
    .where(eq(generationRun.id, runId))
    .limit(1);
  const run = runRows[0];
  if (!run) throw new Error(`Run ${runId} not found`);
  console.log(`run=${runId} status=${run.status}`);

  const items = await db.select({ videoId: videoSetItem.videoId }).from(videoSetItem).where(eq(videoSetItem.videoSetId, run.videoSetId));
  const videoIds = items.map((i) => i.videoId);
  const vids = await db
    .select({ id: video.id, title: video.title, ts: video.transcribeStatus })
    .from(video)
    .where(inArray(video.id, videoIds));
  for (const v of vids) console.log(`  video ${v.id} status=${v.ts} ${v.title}`);

  const ta = await db
    .select({ videoId: transcriptAsset.videoId, wordCount: transcriptAsset.wordCount })
    .from(transcriptAsset)
    .where(inArray(transcriptAsset.videoId, videoIds));
  for (const t of ta) console.log(`  transcript videoId=${t.videoId} words=${t.wordCount}`);

  if (run.status !== 'queued' && run.status !== 'failed') {
    console.log(`[reset] flipping run from '${run.status}' → 'queued' so dispatch will accept it`);
    await db.update(generationRun).set({ status: 'queued' }).where(eq(generationRun.id, runId));
  }
  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
