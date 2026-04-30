/**
 * Operator one-off: convert legacy `[<startMs>ms-<endMs>ms]` citation tokens
 * into `[<segmentId>]` form across canon nodes + VICs for a given run.
 *
 * Why: ms-range citations cannot be linkified to YouTube URLs (the renderer
 * has no videoId binding), so they get rendered as plain text. The
 * citation-chain validator flags them as warnings. This script resolves each
 * ms-range to the closest segment in the same video and rewrites the token
 * in-place.
 *
 * Resolution rule:
 *   - For each token, scan segments belonging to the parent VIC's videoId
 *     (canon nodes are scanned per their sourceVideoIds[])
 *   - The segment whose [startMs, endMs) contains the token's startMs wins
 *   - Tie-breaker: closest segment center to the token's startMs
 *
 * Idempotent: re-running is a no-op if no ms-range tokens remain.
 *
 * Usage:
 *   tsx ./src/scripts/rewrite-ms-range-to-segment-id.ts <runId>
 */

import { closeDb, eq, getDb, asc } from '@creatorcanon/db';
import { canonNode, segment, videoIntelligenceCard } from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

interface SegRow {
  id: string;
  videoId: string;
  startMs: number;
  endMs: number;
}

const MS_RANGE_PATTERN = /\[(\d+)ms-(\d+)ms\]/g;

/**
 * Find the segmentId whose [startMs, endMs) contains the token's startMs.
 * Falls back to the segment with the closest center if nothing contains it
 * (rare — happens when the token's range straddles a transcript gap).
 */
function findSegmentForMs(segs: SegRow[], tokenStartMs: number): string | null {
  if (segs.length === 0) return null;
  for (const s of segs) {
    if (s.startMs <= tokenStartMs && tokenStartMs < s.endMs) return s.id;
  }
  // Closest-center fallback
  let best: SegRow | null = null;
  let bestDist = Infinity;
  for (const s of segs) {
    const center = (s.startMs + s.endMs) / 2;
    const d = Math.abs(center - tokenStartMs);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best?.id ?? null;
}

/** Rewrite ms-range tokens in a JSON-serialised payload. Returns null if no change. */
function rewritePayload(
  payloadJson: string,
  segsByVideo: Map<string, SegRow[]>,
  fallbackVideoId: string | null,
): { rewritten: string; changes: number } | null {
  let changes = 0;
  const out = payloadJson.replace(MS_RANGE_PATTERN, (whole, startMsStr: string) => {
    const startMs = parseInt(startMsStr, 10);
    if (!Number.isFinite(startMs)) return whole;
    // Try the fallback video's segments first (canon node from one video,
    // VIC bound to one video). If the token's startMs doesn't resolve there,
    // walk every video — operator's escape hatch.
    if (fallbackVideoId) {
      const segs = segsByVideo.get(fallbackVideoId) ?? [];
      const id = findSegmentForMs(segs, startMs);
      if (id) {
        changes += 1;
        return `[${id}]`;
      }
    }
    for (const segs of segsByVideo.values()) {
      const id = findSegmentForMs(segs, startMs);
      if (id) {
        changes += 1;
        return `[${id}]`;
      }
    }
    return whole; // unresolvable — leave as-is
  });
  return changes === 0 ? null : { rewritten: out, changes };
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/rewrite-ms-range-to-segment-id.ts <runId>');

  const db = getDb();

  // Build segments-by-video index
  const segs = await db
    .select({ id: segment.id, videoId: segment.videoId, startMs: segment.startMs, endMs: segment.endMs })
    .from(segment)
    .where(eq(segment.runId, runId))
    .orderBy(asc(segment.startMs));

  const segsByVideo = new Map<string, SegRow[]>();
  for (const s of segs) {
    const arr = segsByVideo.get(s.videoId) ?? [];
    arr.push(s);
    segsByVideo.set(s.videoId, arr);
  }
  console.info(`[ms-rewriter] indexed ${segs.length} segments across ${segsByVideo.size} videos`);

  // ── VICs ────────────────────────────────────────────────
  const vics = await db
    .select({ id: videoIntelligenceCard.id, videoId: videoIntelligenceCard.videoId, payload: videoIntelligenceCard.payload })
    .from(videoIntelligenceCard)
    .where(eq(videoIntelligenceCard.runId, runId));

  let vicChanges = 0;
  for (const v of vics) {
    const j = JSON.stringify(v.payload);
    const result = rewritePayload(j, segsByVideo, v.videoId);
    if (!result) continue;
    const newPayload = JSON.parse(result.rewritten);
    await db
      .update(videoIntelligenceCard)
      .set({ payload: newPayload })
      .where(eq(videoIntelligenceCard.id, v.id));
    vicChanges += result.changes;
    console.info(`[ms-rewriter] VIC ${v.videoId}: ${result.changes} ms-range tokens rewritten`);
  }

  // ── Canon nodes ─────────────────────────────────────────
  const canon = await db
    .select({ id: canonNode.id, payload: canonNode.payload })
    .from(canonNode)
    .where(eq(canonNode.runId, runId));

  let canonChanges = 0;
  for (const n of canon) {
    const p = n.payload as { sourceVideoIds?: string[] };
    const fallback = Array.isArray(p.sourceVideoIds) && p.sourceVideoIds.length > 0
      ? p.sourceVideoIds[0]!
      : null;
    const j = JSON.stringify(n.payload);
    const result = rewritePayload(j, segsByVideo, fallback);
    if (!result) continue;
    const newPayload = JSON.parse(result.rewritten);
    await db.update(canonNode).set({ payload: newPayload }).where(eq(canonNode.id, n.id));
    canonChanges += result.changes;
    console.info(`[ms-rewriter] canon ${n.id}: ${result.changes} ms-range tokens rewritten`);
  }

  console.info(`[ms-rewriter] DONE — VIC tokens rewritten: ${vicChanges} · canon tokens rewritten: ${canonChanges}`);

  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[ms-rewriter] FAILED', err);
  process.exit(1);
});
