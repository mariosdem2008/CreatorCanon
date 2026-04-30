/**
 * Operator one-off: backfill `generation_stage_run` rows for the offline
 * audit work that's already happened on a given run. Stages we record:
 *  - channel_profile      (1 row if channel_profile exists for the run)
 *  - video_intelligence   (1 row per VIC)
 *  - canon                (1 row if any canon_node rows exist for the run)
 *  - synthesis            (1 row if any synthesis-kind canon nodes exist)
 *  - reader_journey       (1 row if a reader_journey playbook canon node exists)
 *  - reference_artifacts  (1 row if any reference_* canon nodes exist)
 *  - page_briefs          (1 row if any page_brief rows exist)
 *
 * All rows have costCents=0 (Codex CLI is free) and use inputHash='offline-codex'
 * + pipelineVersion='canon_v1' so the unique index makes re-runs idempotent.
 *
 * Usage:
 *   tsx ./src/scripts/backfill-offline-stage-runs.ts <runId>
 */

import { and, closeDb, eq, getDb } from '@creatorcanon/db';
import {
  canonNode,
  channelProfile,
  pageBrief,
  videoIntelligenceCard,
} from '@creatorcanon/db/schema';
import { loadDefaultEnvFiles } from '../env-files';
import { trackStageRun } from './util/track-stage';

loadDefaultEnvFiles();

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/backfill-offline-stage-runs.ts <runId>');

  const db = getDb();

  const cp = await db.select({ id: channelProfile.id }).from(channelProfile).where(eq(channelProfile.runId, runId)).limit(1);
  if (cp[0]) {
    await trackStageRun({ runId, stageName: 'channel_profile', summary: { source: 'offline-codex' } });
    console.info(`[backfill-stages] channel_profile recorded`);
  }

  const vics = await db.select({ videoId: videoIntelligenceCard.videoId }).from(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, runId));
  for (const v of vics) {
    await trackStageRun({ runId, stageName: `video_intelligence:${v.videoId}`, summary: { videoId: v.videoId } });
  }
  if (vics.length > 0) console.info(`[backfill-stages] video_intelligence recorded for ${vics.length} videos`);

  const canon = await db.select({ id: canonNode.id, type: canonNode.type, payload: canonNode.payload }).from(canonNode).where(eq(canonNode.runId, runId));
  if (canon.length > 0) {
    await trackStageRun({ runId, stageName: 'canon', summary: { count: canon.length } });
    console.info(`[backfill-stages] canon recorded (${canon.length} nodes)`);

    const synth = canon.filter((c) => (c.payload as { kind?: string })?.kind === 'synthesis');
    if (synth.length > 0) {
      await trackStageRun({ runId, stageName: 'cross_video_synthesis', summary: { count: synth.length } });
      console.info(`[backfill-stages] cross_video_synthesis recorded (${synth.length} nodes)`);
    }

    const journey = canon.filter((c) => c.type === 'playbook' && (c.payload as { kind?: string })?.kind === 'reader_journey');
    if (journey.length > 0) {
      await trackStageRun({ runId, stageName: 'reader_journey', summary: { count: journey.length } });
      console.info(`[backfill-stages] reader_journey recorded`);
    }

    const refs = canon.filter((c) => {
      const k = (c.payload as { kind?: string })?.kind;
      return typeof k === 'string' && k.startsWith('reference_');
    });
    if (refs.length > 0) {
      await trackStageRun({ runId, stageName: 'reference_artifacts', summary: { count: refs.length } });
      console.info(`[backfill-stages] reference_artifacts recorded (${refs.length} nodes)`);
    }
  }

  const briefs = await db.select({ id: pageBrief.id }).from(pageBrief).where(eq(pageBrief.runId, runId));
  if (briefs.length > 0) {
    await trackStageRun({ runId, stageName: 'page_briefs', summary: { count: briefs.length } });
    console.info(`[backfill-stages] page_briefs recorded (${briefs.length})`);
  }

  await closeDb();
  console.info('[backfill-stages] DONE');
}

main().catch(async (err) => { await closeDb(); console.error('[backfill-stages] FAILED', err); process.exit(1); });
