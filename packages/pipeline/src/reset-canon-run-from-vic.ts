/**
 * Operator helper: reset a canon_v1 run from video_intelligence onward.
 * Clears the cached stage_runs that were empty/incorrect AND deletes the
 * downstream rows (canon_node, page_brief, page_quality_report, page,
 * page_version) so the next dispatch produces clean output. Keeps the
 * channel_profile and visual_moment rows intact.
 *
 * Usage (from packages/pipeline):
 *   tsx ./src/reset-canon-run-from-vic.ts <runId>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { and, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  generationStageRun,
  videoIntelligenceCard,
  canonNode,
  pageBrief,
  pageQualityReport,
  page,
  pageVersion,
} from '@creatorcanon/db/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(p: string, override = false) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    const k = t.slice(0, i).trim();
    if (!override && process.env[k] !== undefined) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '../../../.env'));
loadEnv(path.resolve(__dirname, '../../../.env.local'), true);

const runId = process.argv[2];
if (!runId) {
  console.error('Usage: tsx ./src/reset-canon-run-from-vic.ts <runId>');
  process.exit(1);
}

const STAGES_TO_CLEAR = [
  'video_intelligence',
  'canon',
  'page_briefs',
  'page_composition',
  'page_quality',
  'adapt',
] as const;

(async () => {
  const db = getDb();

  // Clear downstream materialized rows.
  await db.delete(pageVersion).where(eq(pageVersion.runId, runId));
  await db.delete(page).where(eq(page.runId, runId));
  await db.delete(pageQualityReport).where(eq(pageQualityReport.runId, runId));
  await db.delete(pageBrief).where(eq(pageBrief.runId, runId));
  await db.delete(canonNode).where(eq(canonNode.runId, runId));
  await db.delete(videoIntelligenceCard).where(eq(videoIntelligenceCard.runId, runId));

  // Clear cached stage_run rows so runStage re-executes them.
  const cleared = await db
    .delete(generationStageRun)
    .where(and(
      eq(generationStageRun.runId, runId),
      inArray(generationStageRun.stageName, STAGES_TO_CLEAR as unknown as string[]),
    ))
    .returning({ stageName: generationStageRun.stageName });

  // Move run back to 'queued' so the dispatcher will pick it up.
  await db
    .update(generationRun)
    .set({ status: 'queued', startedAt: null, completedAt: null, updatedAt: new Date() })
    .where(eq(generationRun.id, runId));

  console.info(`[reset] cleared ${cleared.length} stage_run rows + downstream tables for run ${runId}`);
  console.info(`[reset] cleared stages: ${cleared.map((r) => r.stageName).join(', ')}`);
  console.info(`[reset] run status -> 'queued'. Re-dispatch with: tsx ./src/dispatch-queued-run.ts ${runId}`);
  process.exit(0);
})();
