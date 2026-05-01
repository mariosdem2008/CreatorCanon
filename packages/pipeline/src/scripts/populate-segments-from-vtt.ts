/**
 * Operator one-off: read each video's canonical VTT from R2, parse it into
 * segments, and bulk-insert them into the `segment` table. Mirrors what the
 * dispatch pipeline's `segment_transcripts` stage does, but standalone — runs
 * after `transcribe-pending-uploads.ts` writes the VTT to R2 but before
 * `seed-audit-via-codex.ts` needs the segment table populated.
 *
 * Why this exists: seed-audit-via-codex.ts uses the offline audit path that
 * skips the dispatch's normalize-transcripts + segment-transcripts stages,
 * so it expects segments to already exist. Without them the audit silently
 * produces hallucinated content from channel_profile alone.
 *
 * Segment shape: VTT cues are merged into ~30s segments (target), bounded
 * 8-60s, to match the existing segment-transcripts logic.
 *
 * Usage:
 *   tsx ./src/scripts/populate-segments-from-vtt.ts <runId>
 */

import crypto from 'node:crypto';

import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { closeDb, eq, getDb, inArray } from '@creatorcanon/db';
import {
  generationRun,
  normalizedTranscriptVersion,
  segment,
  transcriptAsset,
  videoSetItem,
} from '@creatorcanon/db/schema';

import { loadDefaultEnvFiles } from '../env-files';

loadDefaultEnvFiles();

const TARGET_SEGMENT_MS = 30 * 1000;
const MIN_SEGMENT_MS = 8 * 1000;
const MAX_SEGMENT_MS = 60 * 1000;

interface VttCue {
  startMs: number;
  endMs: number;
  text: string;
}

/** Parse WebVTT timestamp `HH:MM:SS.mmm` → ms. */
function parseTs(ts: string): number {
  const match = ts.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})\.(\d{1,3})$/);
  if (!match) return 0;
  const h = parseInt(match[1]!, 10);
  const m = parseInt(match[2]!, 10);
  const s = parseInt(match[3]!, 10);
  const ms = parseInt(match[4]!.padEnd(3, '0').slice(0, 3), 10);
  return ((h * 60 + m) * 60 + s) * 1000 + ms;
}

function parseVtt(vtt: string): VttCue[] {
  const cues: VttCue[] = [];
  const lines = vtt.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!.trim();
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->').map((s) => s.trim());
      const startMs = parseTs(startStr!);
      const endMs = parseTs(endStr!);
      const textLines: string[] = [];
      i += 1;
      while (i < lines.length && lines[i]!.trim() !== '') {
        textLines.push(lines[i]!.trim());
        i += 1;
      }
      const text = textLines.join(' ').trim();
      if (text && endMs > startMs) {
        cues.push({ startMs, endMs, text });
      }
    }
    i += 1;
  }
  return cues;
}

/** Merge cues into ~30s segments bounded 8-60s. */
function mergeCuesIntoSegments(cues: VttCue[]): VttCue[] {
  if (cues.length === 0) return [];
  const segments: VttCue[] = [];
  let buffer: VttCue[] = [];
  let bufferStart = cues[0]!.startMs;

  function flush(): void {
    if (buffer.length === 0) return;
    const startMs = buffer[0]!.startMs;
    const endMs = buffer[buffer.length - 1]!.endMs;
    const text = buffer.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim();
    if (text && endMs > startMs) {
      segments.push({ startMs, endMs, text });
    }
    buffer = [];
  }

  for (const cue of cues) {
    buffer.push(cue);
    const duration = cue.endMs - bufferStart;
    if (duration >= MAX_SEGMENT_MS) {
      flush();
      bufferStart = buffer[0]?.startMs ?? cue.endMs;
    } else if (duration >= TARGET_SEGMENT_MS) {
      flush();
      bufferStart = buffer[0]?.startMs ?? cue.endMs;
    }
  }
  // Final flush — only if it meets MIN duration, otherwise glue to previous.
  if (buffer.length > 0) {
    const last = buffer[buffer.length - 1]!;
    const start = buffer[0]!.startMs;
    if (last.endMs - start >= MIN_SEGMENT_MS || segments.length === 0) {
      flush();
    } else if (segments.length > 0) {
      // Append leftover to the last segment.
      const prev = segments[segments.length - 1]!;
      prev.endMs = last.endMs;
      prev.text = (prev.text + ' ' + buffer.map((c) => c.text).join(' ')).replace(/\s+/g, ' ').trim();
      buffer = [];
    }
  }

  return segments;
}

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error('Usage: tsx ./src/scripts/populate-segments-from-vtt.ts <runId>');

  const db = getDb();
  const env = parseServerEnv(process.env);
  const r2 = createR2Client(env);

  const runRows = await db.select().from(generationRun).where(eq(generationRun.id, runId)).limit(1);
  const run = runRows[0];
  if (!run) throw new Error(`Run ${runId} not found`);

  const items = await db
    .select({ videoId: videoSetItem.videoId })
    .from(videoSetItem)
    .where(eq(videoSetItem.videoSetId, run.videoSetId));
  const videoIds = items.map((i) => i.videoId);
  if (videoIds.length === 0) throw new Error('Run has no videos');

  // Load canonical VTT keys + transcript_asset.id for each video.
  const tas = await db
    .select({ id: transcriptAsset.id, videoId: transcriptAsset.videoId, r2Key: transcriptAsset.r2Key, isCanonical: transcriptAsset.isCanonical })
    .from(transcriptAsset)
    .where(inArray(transcriptAsset.videoId, videoIds));
  const canonicalByVideo = new Map<string, { id: string; r2Key: string }>();
  for (const ta of tas) {
    if (ta.isCanonical) canonicalByVideo.set(ta.videoId, { id: ta.id, r2Key: ta.r2Key });
  }
  // Fallback: if no canonical flagged, take any.
  for (const ta of tas) {
    if (!canonicalByVideo.has(ta.videoId)) canonicalByVideo.set(ta.videoId, { id: ta.id, r2Key: ta.r2Key });
  }

  let totalSegments = 0;
  for (const videoId of videoIds) {
    const ta = canonicalByVideo.get(videoId);
    if (!ta) {
      console.warn(`[populate-segments] ${videoId}: no transcript_asset; skipping`);
      continue;
    }
    // Check if segments already exist for THIS run.
    const existing = await db
      .select({ id: segment.id })
      .from(segment)
      .where(eq(segment.videoId, videoId))
      .limit(1);
    if (existing.length > 0) {
      console.info(`[populate-segments] ${videoId}: already has segments; skipping`);
      continue;
    }

    const obj = await r2.getObject(ta.r2Key);
    const vtt = new TextDecoder('utf-8').decode(obj.body);
    const cues = parseVtt(vtt);
    const segs = mergeCuesIntoSegments(cues);
    console.info(`[populate-segments] ${videoId}: ${cues.length} VTT cues → ${segs.length} segments`);

    if (segs.length === 0) continue;

    // Create a normalizedTranscriptVersion row that segments FK to.
    // We're not actually doing the full normalize step (that would clean
    // brand-name typos, sanitize, etc), so version=1 just satisfies the FK.
    const normVersionId = crypto.randomUUID();
    await db.insert(normalizedTranscriptVersion).values({
      id: normVersionId,
      workspaceId: run.workspaceId,
      videoId,
      transcriptAssetId: ta.id,
      r2Key: ta.r2Key, // re-use canonical VTT (no separate normalized blob)
      version: 1,
      sentenceCount: cues.length,
    }).onConflictDoNothing();

    // Bulk insert segments.
    const rows = segs.map((s) => ({
      id: crypto.randomUUID(),
      workspaceId: run.workspaceId,
      runId,
      videoId,
      normalizedTranscriptVersionId: normVersionId,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
    }));
    // Insert in chunks of 200 to avoid PostgreSQL parameter limits.
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await db.insert(segment).values(rows.slice(i, i + chunkSize));
    }
    totalSegments += segs.length;
  }

  console.info(`[populate-segments] DONE — ${totalSegments} segments inserted`);
  await closeDb();
}

main().catch(async (err) => {
  await closeDb();
  console.error('[populate-segments] FAILED', err);
  process.exit(1);
});
