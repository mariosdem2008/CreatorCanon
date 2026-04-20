import { and, eq, getDb } from '@creatorcanon/db';
import { normalizedTranscriptVersion, segment } from '@creatorcanon/db/schema';
import { createR2Client } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import type { NormalizedTranscript } from './normalize-transcripts';

export interface SegmentTranscriptsInput {
  runId: string;
  workspaceId: string;
  normalizedTranscripts: NormalizedTranscript[];
}

export interface SegmentOutput {
  videoId: string;
  segmentCount: number;
}

export interface SegmentTranscriptsOutput {
  segments: SegmentOutput[];
  totalSegments: number;
}

const TARGET_SEGMENT_MS = 5 * 60 * 1000; // 5 minutes
const MIN_SEGMENT_MS = 60 * 1000; // 1 minute minimum

interface Sentence {
  startMs: number;
  endMs: number;
  text: string;
}

interface NormalizedDoc {
  videoId: string;
  language: string;
  sentences: Sentence[];
}

function buildSegments(
  sentences: Sentence[],
): Array<{ startMs: number; endMs: number; text: string }> {
  const segs: Array<{ startMs: number; endMs: number; text: string }> = [];
  if (sentences.length === 0) return segs;

  let buffer: Sentence[] = [];
  let bufferStart = sentences[0]!.startMs;

  for (const sentence of sentences) {
    buffer.push(sentence);
    const duration = sentence.endMs - bufferStart;

    if (duration >= TARGET_SEGMENT_MS) {
      const text = buffer.map((s) => s.text).join(' ');
      segs.push({ startMs: bufferStart, endMs: sentence.endMs, text });
      buffer = [];
      bufferStart = sentence.endMs;
    }
  }

  if (buffer.length > 0) {
    const last = buffer[buffer.length - 1]!;
    const text = buffer.map((s) => s.text).join(' ');
    const duration = last.endMs - bufferStart;

    if (duration < MIN_SEGMENT_MS && segs.length > 0) {
      const prev = segs[segs.length - 1]!;
      segs[segs.length - 1] = {
        startMs: prev.startMs,
        endMs: last.endMs,
        text: prev.text + ' ' + text,
      };
    } else {
      segs.push({ startMs: bufferStart, endMs: last.endMs, text });
    }
  }

  return segs;
}

export async function segmentTranscripts(
  input: SegmentTranscriptsInput,
): Promise<SegmentTranscriptsOutput> {
  const env = parseServerEnv(process.env);
  const db = getDb();
  const r2 = createR2Client(env);

  const results: SegmentOutput[] = [];

  for (const norm of input.normalizedTranscripts) {
    const existingSegments = await db
      .select({ id: segment.id })
      .from(segment)
      .where(and(eq(segment.runId, input.runId), eq(segment.videoId, norm.videoId)));

    if (existingSegments.length > 0) {
      results.push({ videoId: norm.videoId, segmentCount: existingSegments.length });
      continue;
    }

    // Load the normalized transcript JSON from R2
    const obj = await r2.getObject(norm.r2Key);
    const doc = JSON.parse(new TextDecoder().decode(obj.body)) as NormalizedDoc;

    const builtSegments = buildSegments(doc.sentences);

    if (builtSegments.length === 0) {
      results.push({ videoId: norm.videoId, segmentCount: 0 });
      continue;
    }

    // Get the normalized_transcript_version ID for FK
    const normVersionRows = await db
      .select({ id: normalizedTranscriptVersion.id })
      .from(normalizedTranscriptVersion)
      .where(eq(normalizedTranscriptVersion.id, norm.normalizedVersionId))
      .limit(1);

    const normVersionId = normVersionRows[0]?.id;
    if (!normVersionId) {
      results.push({ videoId: norm.videoId, segmentCount: 0 });
      continue;
    }

    const rows = builtSegments.map((s) => ({
      id: crypto.randomUUID(),
      workspaceId: input.workspaceId,
      runId: input.runId,
      videoId: norm.videoId,
      normalizedTranscriptVersionId: normVersionId,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
    }));

    await db.insert(segment).values(rows);

    results.push({ videoId: norm.videoId, segmentCount: rows.length });
  }

  return {
    segments: results,
    totalSegments: results.reduce((s, r) => s + r.segmentCount, 0),
  };
}
