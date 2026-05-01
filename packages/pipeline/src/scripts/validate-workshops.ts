/**
 * Workshop validator (Phase 7 / Task 7.7).
 *
 * Scans every workshop_stage row in a run. For each stage, validates all clips.
 *
 * HARD FAILS (non-zero exit, surfaced in markdown report):
 * - `segmentId` not found in segments table for this run (unresolved reference)
 * - `_index_relevance_score < 80`
 * - `startSeconds`/`endSeconds` outside source segment span (with 5s buffer)
 *   - Effective startSeconds = clip.startSeconds ?? segment.startMs/1000
 *   - Effective endSeconds = clip.endSeconds ?? segment.endMs/1000
 *   - Hard-fail if effectiveStart < segment.startMs/1000 - 5
 *                   OR effectiveEnd > segment.endMs/1000 + 5
 *
 * SOFT WARNS (per-entity + aggregate stats):
 * - Clip count < 2 or > 4 for a stage
 * - Clip duration > 180 seconds
 * - Clip duration < 30 seconds
 *
 * Output: /tmp/workshops-<runId>.md plus stdout summary. Exit 2 on
 * any hard-fail per spec.
 *
 * Usage:
 *   tsx ./src/scripts/validate-workshops.ts <runId>
 */

import fs from 'node:fs';
import path from 'node:path';

import { closeDb, eq, getDb } from '@creatorcanon/db';
import { workshopStage, segment } from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';
import type { WorkshopStage, WorkshopClip } from './util/workshop-builder';

loadDefaultEnvFiles();

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

interface HardFail {
  /** Stage ID (wks_xxx). */
  stageId: string;
  /** Clip ID (wkc_xxx), or "N/A" if stage-level. */
  clipId: string;
  /** Issue description. */
  issue: string;
}

interface SoftWarn {
  /** Stage ID (wks_xxx). */
  stageId: string;
  /** Clip ID (wkc_xxx), or "N/A" if stage-level. */
  clipId: string;
  /** Warning description. */
  issue: string;
}

interface PerStageStats {
  stageId: string;
  stageTitle: string;
  phaseNumber: number;
  clipCount: number;
  avgRelevanceScore: number;
  avgDuration: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Main logic
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/validate-workshops.ts <runId>');

  const db = getDb();

  // ── Load all segments for this run into a lookup map ─────────────────────
  const segmentRows = await db
    .select({ id: segment.id, startMs: segment.startMs, endMs: segment.endMs })
    .from(segment)
    .where(eq(segment.runId, runId));

  const segmentById = new Map<string, { startMs: number; endMs: number }>();
  for (const s of segmentRows) {
    segmentById.set(s.id, { startMs: s.startMs, endMs: s.endMs });
  }

  // ── Load all workshop_stage rows for this run ────────────────────────────
  const workshopRows = await db
    .select({ id: workshopStage.id, payload: workshopStage.payload })
    .from(workshopStage)
    .where(eq(workshopStage.runId, runId));

  const hardFails: HardFail[] = [];
  const softWarns: SoftWarn[] = [];
  const perStageStats: PerStageStats[] = [];

  let totalClips = 0;
  let totalRelevanceScore = 0;
  let totalDuration = 0;
  let clipCountForAvg = 0;

  // ── Iterate all stages ────────────────────────────────────────────────────
  for (const row of workshopRows) {
    const stage = row.payload as Partial<WorkshopStage>;
    if (!stage.id || !stage.title || !Array.isArray(stage.clips)) {
      continue; // Skip malformed stages
    }

    const stageId = stage.id;
    const clips = stage.clips as WorkshopClip[];
    let stageRelevanceSum = 0;
    let stageDurationSum = 0;

    // ── Validate each clip ──────────────────────────────────────────────────
    for (const clip of clips) {
      const clipId = clip.id;

      // HARD-FAIL: segmentId not in segments table
      if (!segmentById.has(clip.segmentId)) {
        hardFails.push({
          stageId,
          clipId,
          issue: `segmentId "${clip.segmentId}" not found in segments table`,
        });
        continue;
      }

      // HARD-FAIL: relevance score < 80
      if (clip._index_relevance_score < 80) {
        hardFails.push({
          stageId,
          clipId,
          issue: `relevance score ${clip._index_relevance_score} < 80`,
        });
      }

      // HARD-FAIL: timestamps out of bounds (with 5s buffer)
      const seg = segmentById.get(clip.segmentId)!;
      const segStartSec = seg.startMs / 1000;
      const segEndSec = seg.endMs / 1000;

      const effectiveStart = clip.startSeconds ?? segStartSec;
      const effectiveEnd = clip.endSeconds ?? segEndSec;

      if (effectiveStart < segStartSec - 5) {
        hardFails.push({
          stageId,
          clipId,
          issue: `effectiveStart ${effectiveStart}s < segment.startMs/1000 - 5s (${segStartSec - 5}s)`,
        });
      }

      if (effectiveEnd > segEndSec + 5) {
        hardFails.push({
          stageId,
          clipId,
          issue: `effectiveEnd ${effectiveEnd}s > segment.endMs/1000 + 5s (${segEndSec + 5}s)`,
        });
      }

      // SOFT-WARN: clip duration
      const duration = effectiveEnd - effectiveStart;

      if (duration > 180) {
        softWarns.push({
          stageId,
          clipId,
          issue: `clip duration ${duration.toFixed(1)}s > 180s`,
        });
      }

      if (duration < 30) {
        softWarns.push({
          stageId,
          clipId,
          issue: `clip duration ${duration.toFixed(1)}s < 30s`,
        });
      }

      // Accumulate stats
      stageRelevanceSum += clip._index_relevance_score;
      stageDurationSum += duration;
      totalClips += 1;
      totalRelevanceScore += clip._index_relevance_score;
      totalDuration += duration;
      clipCountForAvg += 1;
    }

    // SOFT-WARN: clip count outside 2-4 range for stage
    if (clips.length < 2 || clips.length > 4) {
      softWarns.push({
        stageId,
        clipId: 'N/A',
        issue: `stage has ${clips.length} clips (target 2-4)`,
      });
    }

    // Per-stage stats
    const avgStageScore =
      clips.length > 0 ? stageRelevanceSum / clips.length : 0;
    const avgStageDuration =
      clips.length > 0 ? stageDurationSum / clips.length : 0;

    perStageStats.push({
      stageId,
      stageTitle: stage.title ?? '(Untitled)',
      phaseNumber: stage._index_source_phase_number ?? 0,
      clipCount: clips.length,
      avgRelevanceScore: avgStageScore,
      avgDuration: avgStageDuration,
    });
  }

  // ── Compute aggregate stats ────────────────────────────────────────────────
  const avgClipsPerStage =
    perStageStats.length > 0 ? totalClips / perStageStats.length : 0;
  const avgRelevanceScore =
    clipCountForAvg > 0 ? totalRelevanceScore / clipCountForAvg : 0;
  const avgDuration = clipCountForAvg > 0 ? totalDuration / clipCountForAvg : 0;

  // ── Render markdown report ────────────────────────────────────────────────
  const md = renderMarkdown(runId, perStageStats, hardFails, softWarns, {
    stageCount: perStageStats.length,
    totalClips,
    avgClipsPerStage,
    avgRelevanceScore,
    avgDuration,
    hardFailCount: hardFails.length,
    softWarnCount: softWarns.length,
  });

  const outPath = path.join(
    process.env.TEMP || process.env.TMPDIR || '/tmp',
    `workshops-${runId}.md`,
  );
  fs.writeFileSync(outPath, md);

  // ── Stdout summary ──────────────────────────────────────────────────────
  console.info(`[workshops] runId=${runId}`);
  console.info(
    `[workshops]   stages: ${perStageStats.length} (target 3-5)`,
  );
  console.info(
    `[workshops]   total clips: ${totalClips} (avg ${avgClipsPerStage.toFixed(1)}/stage)`,
  );
  console.info(
    `[workshops]   avg relevance: ${avgRelevanceScore.toFixed(1)}`,
  );
  console.info(
    `[workshops]   avg duration: ${avgDuration.toFixed(1)} seconds`,
  );
  console.info(`[workshops]   hard-fail count: ${hardFails.length}`);
  console.info(`[workshops]   soft-warn count: ${softWarns.length}`);
  console.info(`[workshops] report written: ${outPath}`);

  await closeDb();
  if (hardFails.length > 0) process.exit(2);
}

function renderMarkdown(
  runId: string,
  perStageStats: PerStageStats[],
  hardFails: HardFail[],
  softWarns: SoftWarn[],
  stats: {
    stageCount: number;
    totalClips: number;
    avgClipsPerStage: number;
    avgRelevanceScore: number;
    avgDuration: number;
    hardFailCount: number;
    softWarnCount: number;
  },
): string {
  const lines: string[] = [];

  lines.push(`# Workshop Validation — \`${runId}\``);
  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push('');

  // ── Summary section ─────────────────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Stages: **${stats.stageCount}** (target 3-5)`);
  lines.push(`- Total clips: **${stats.totalClips}**`);
  lines.push(`- Average clips/stage: **${stats.avgClipsPerStage.toFixed(1)}**`);
  lines.push(
    `- Average relevance score: **${stats.avgRelevanceScore.toFixed(1)}**`,
  );
  lines.push(`- Average clip duration: **${stats.avgDuration.toFixed(1)}**s`);
  lines.push(`- Hard-fail count: **${stats.hardFailCount}**`);
  lines.push(`- Soft-warn count: **${stats.softWarnCount}**`);
  lines.push('');

  // ── Hard fails section ──────────────────────────────────────────────────
  if (hardFails.length === 0) {
    lines.push('✅ No hard fails. Workshops are structurally sound.');
  } else {
    lines.push('## Hard fails');
    lines.push('');
    lines.push('| Stage | Clip | Issue |');
    lines.push('|---|---|---|');
    for (const fail of hardFails) {
      const issue = fail.issue.replace(/\|/g, '\\|');
      lines.push(
        `| \`${fail.stageId}\` | \`${fail.clipId}\` | ${issue} |`,
      );
    }
    lines.push('');
  }

  // ── Soft warns section ──────────────────────────────────────────────────
  if (softWarns.length === 0) {
    lines.push('✅ No soft warns. Quality checks passed.');
  } else {
    lines.push('## Soft warns');
    lines.push('');
    lines.push('| Stage | Clip | Issue |');
    lines.push('|---|---|---|');
    for (const warn of softWarns) {
      const issue = warn.issue.replace(/\|/g, '\\|');
      lines.push(
        `| \`${warn.stageId}\` | \`${warn.clipId}\` | ${issue} |`,
      );
    }
    lines.push('');
  }

  // ── Per-stage details ───────────────────────────────────────────────────
  if (perStageStats.length > 0) {
    lines.push('## Per-stage details');
    lines.push('');
    lines.push('| Stage | Phase # | Clip count | Avg score | Avg duration |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const stats of perStageStats) {
      lines.push(
        `| \`${stats.stageId}\` (${stats.stageTitle}) | ${stats.phaseNumber} | ${stats.clipCount} | ${stats.avgRelevanceScore.toFixed(1)} | ${stats.avgDuration.toFixed(1)}s |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

main().catch(async (err) => {
  await closeDb();
  console.error('[workshops] FAILED', err);
  process.exit(1);
});
