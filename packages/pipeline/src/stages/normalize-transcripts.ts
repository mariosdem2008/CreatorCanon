import { and, eq, getDb } from '@creatorcanon/db';
import { normalizedTranscriptVersion, transcriptAsset } from '@creatorcanon/db/schema';
import { createR2Client, artifactKey } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import type { TranscriptResult } from './ensure-transcripts';

export interface NormalizeTranscriptsInput {
  runId: string;
  workspaceId: string;
  transcripts: TranscriptResult[];
}

export interface NormalizedTranscript {
  videoId: string;
  normalizedVersionId: string;
  r2Key: string;
  sentenceCount: number;
}

export interface NormalizeTranscriptsOutput {
  normalizedTranscripts: NormalizedTranscript[];
}

function parseVtt(vtt: string): Array<{ startMs: number; endMs: number; text: string }> {
  const chunks: Array<{ startMs: number; endMs: number; text: string }> = [];
  const lines = vtt.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = (lines[i] ?? '').trim();
    if (line.includes('-->')) {
      const parts = line.split(' ');
      const startMs = parseTimestamp(parts[0] ?? '');
      const endMs = parseTimestamp(parts[2] ?? '');

      const textLines: string[] = [];
      i++;
      while (i < lines.length && (lines[i] ?? '').trim()) {
        const t = (lines[i] ?? '').trim();
        const clean = t.replace(/<[^>]+>/g, '').trim();
        if (clean) textLines.push(clean);
        i++;
      }

      const text = textLines.join(' ').trim();
      if (text && startMs >= 0 && endMs > startMs) {
        chunks.push({ startMs, endMs, text });
      }
    }
    i++;
  }

  return chunks;
}

function parseTimestamp(ts: string): number {
  const parts = ts.replace(',', '.').split(':');
  if (parts.length === 3) {
    return (
      parseInt(parts[0] ?? '0', 10) * 3600 +
      parseInt(parts[1] ?? '0', 10) * 60 +
      parseFloat(parts[2] ?? '0')
    ) * 1000;
  } else if (parts.length === 2) {
    return (parseInt(parts[0] ?? '0', 10) * 60 + parseFloat(parts[1] ?? '0')) * 1000;
  }
  return -1;
}

function mergeIntoSentences(
  chunks: Array<{ startMs: number; endMs: number; text: string }>,
): Array<{ startMs: number; endMs: number; text: string }> {
  if (chunks.length === 0) return [];

  const sentences: typeof chunks = [];
  let buffer: typeof chunks = [];

  for (const chunk of chunks) {
    buffer.push(chunk);
    const combined = buffer.map((c) => c.text).join(' ');
    const endsWithPunctuation = /[.!?](\s*["'])?$/.test(combined.trim());

    if (endsWithPunctuation || buffer.length >= 6) {
      const first = buffer[0];
      const last = buffer[buffer.length - 1];
      if (first && last) {
        sentences.push({ startMs: first.startMs, endMs: last.endMs, text: combined.trim() });
      }
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    const first = buffer[0];
    const last = buffer[buffer.length - 1];
    if (first && last) {
      sentences.push({
        startMs: first.startMs,
        endMs: last.endMs,
        text: buffer.map((c) => c.text).join(' ').trim(),
      });
    }
  }

  return sentences;
}

function cleanText(text: string): string {
  return text
    .replace(/\b(um+|uh+|er+|ah+|hmm+|like,?)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function normalizeTranscripts(
  input: NormalizeTranscriptsInput,
): Promise<NormalizeTranscriptsOutput> {
  const env = parseServerEnv(process.env);
  const db = getDb();
  const r2 = createR2Client(env);

  const results: NormalizedTranscript[] = [];

  for (const transcript of input.transcripts) {
    if (transcript.skipped || !transcript.r2Key) continue;

    const assetRows = await db
      .select({ id: transcriptAsset.id })
      .from(transcriptAsset)
      .where(and(
        eq(transcriptAsset.videoId, transcript.videoId),
        eq(transcriptAsset.r2Key, transcript.r2Key),
        eq(transcriptAsset.isCanonical, true),
      ))
      .limit(1);

    const assetId = assetRows[0]?.id;
    if (!assetId) continue;

    const existingNorm = await db
      .select()
      .from(normalizedTranscriptVersion)
      .where(eq(normalizedTranscriptVersion.transcriptAssetId, assetId))
      .limit(1);

    if (existingNorm[0]) {
      results.push({
        videoId: transcript.videoId,
        normalizedVersionId: existingNorm[0].id,
        r2Key: existingNorm[0].r2Key,
        sentenceCount: existingNorm[0].sentenceCount ?? 0,
      });
      continue;
    }

    const vttObj = await r2.getObject(transcript.r2Key);
    const vttText = new TextDecoder().decode(vttObj.body);

    const chunks = parseVtt(vttText);
    const sentences = mergeIntoSentences(chunks);
    const cleaned = sentences.map((s) => ({ ...s, text: cleanText(s.text) })).filter((s) => s.text);

    const normalizedJson = {
      videoId: transcript.videoId,
      language: transcript.language,
      sentences: cleaned,
    };

    const normVersionId = crypto.randomUUID();
    const r2Key = artifactKey({
      workspaceId: input.workspaceId,
      runId: input.runId,
      stage: 'normalize_transcripts',
      name: `${transcript.videoId}.json`,
    });

    await r2.putObject({
      key: r2Key,
      body: JSON.stringify(normalizedJson),
      contentType: 'application/json',
    });

    await db.insert(normalizedTranscriptVersion).values({
      id: normVersionId,
      workspaceId: input.workspaceId,
      videoId: transcript.videoId,
      transcriptAssetId: assetId,
      r2Key,
      version: 1,
      sentenceCount: cleaned.length,
    });

    results.push({
      videoId: transcript.videoId,
      normalizedVersionId: normVersionId,
      r2Key,
      sentenceCount: cleaned.length,
    });
  }

  return { normalizedTranscripts: results };
}
