/**
 * Reset videos with failed/transcribing status back to pending for the given runIds.
 * Use after killing a stuck transcription run.
 *
 * Usage: tsx reset-failed-transcripts.ts <runId-1> ... <runId-N>
 */

import { closeDb, eq, inArray } from '@creatorcanon/db';
import { generationRun, video, videoSetItem } from '@creatorcanon/db/schema';
import { getDb } from '@creatorcanon/db';
import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

async function main() {
  const runIds = process.argv.slice(2);
  if (runIds.length === 0) throw new Error('Usage: tsx reset-failed-transcripts.ts <runId-1> ...');

  const db = getDb();

  for (const runId of runIds) {
    const runRows = await db
      .select({ videoSetId: generationRun.videoSetId })
      .from(generationRun)
      .where(eq(generationRun.id, runId))
      .limit(1);
    if (!runRows[0]) {
      console.warn(`[reset] runId ${runId} not found`);
      continue;
    }
    const items = await db
      .select({ videoId: videoSetItem.videoId })
      .from(videoSetItem)
      .where(eq(videoSetItem.videoSetId, runRows[0].videoSetId));
    const ids = items.map((i) => i.videoId);
    if (ids.length === 0) continue;

    const updated = await db
      .update(video)
      .set({ transcribeStatus: 'pending' })
      .where(inArray(video.id, ids));
    console.info(`[reset] ${runId}: ${ids.length} videos → pending`);
  }

  await closeDb();
}

main().catch(async (e) => { await closeDb(); console.error(e); process.exit(1); });
