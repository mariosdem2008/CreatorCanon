import { and, asc, eq, getDb } from '@creatorcanon/db';
import { segment } from '@creatorcanon/db/schema';
import { createR2Client, artifactKey } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import {
  type V0ReviewArtifact,
  type V0ReviewStageOutput,
  v0ReviewArtifactSchema,
} from '../contracts/artifacts';
import type { SelectionSnapshotOutput } from './import-selection-snapshot';

export interface SynthesizeV0ReviewInput {
  runId: string;
  workspaceId: string;
  videos: SelectionSnapshotOutput['videos'];
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the',
  'their', 'them', 'they', 'this', 'to', 'was', 'we', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'you', 'your',
]);

function toSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trimEnd()}...`;
}

function summarizeSegments(segmentTexts: string[]): string {
  if (segmentTexts.length === 0) return 'No usable transcript content was available for this video.';

  const sentences = segmentTexts.flatMap(toSentences);
  const unique: string[] = [];

  for (const sentence of sentences) {
    const normalized = sentence.toLowerCase();
    if (!unique.some((item) => item.toLowerCase() === normalized)) {
      unique.push(sentence);
    }
    if (unique.length >= 3) break;
  }

  if (unique.length === 0) {
    return truncate(segmentTexts.slice(0, 2).join(' '), 320);
  }

  return truncate(unique.join(' '), 320);
}

function extractThemes(segmentTexts: string[]): string[] {
  const counts = new Map<string, number>();

  for (const text of segmentTexts) {
    const seen = new Set<string>();
    const tokens = text.toLowerCase().match(/[a-z][a-z0-9'-]{2,}/g) ?? [];
    for (const token of tokens) {
      if (STOP_WORDS.has(token) || seen.has(token)) continue;
      seen.add(token);
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .slice(0, 6)
    .map(([token]) => token.replace(/(^\w)/, (c) => c.toUpperCase()));
}

function buildArchiveSummary(input: {
  videoCount: number;
  totalSegmentCount: number;
  videosWithTranscript: number;
  themes: string[];
}): string {
  if (input.totalSegmentCount === 0) {
    return `Atlas processed ${input.videoCount} selected video${input.videoCount === 1 ? '' : 's'}, but there was not enough transcript material to draft a meaningful archive summary yet.`;
  }

  const themeText = input.themes.length > 0
    ? ` The strongest repeated themes were ${input.themes.slice(0, 3).join(', ')}.`
    : '';

  return `Atlas synthesized ${input.totalSegmentCount} transcript segment${input.totalSegmentCount === 1 ? '' : 's'} across ${input.videoCount} selected video${input.videoCount === 1 ? '' : 's'}, with usable transcript material in ${input.videosWithTranscript} of them.${themeText}`;
}

export async function synthesizeV0Review(
  input: SynthesizeV0ReviewInput,
): Promise<V0ReviewStageOutput> {
  const env = parseServerEnv(process.env);
  const db = getDb();
  const r2 = createR2Client(env);

  const videos = await Promise.all(input.videos.map(async (video) => {
    const rows = await db
      .select({
        text: segment.text,
        startMs: segment.startMs,
      })
      .from(segment)
      .where(and(eq(segment.runId, input.runId), eq(segment.videoId, video.id)))
      .orderBy(asc(segment.startMs));

    const segmentTexts = rows.map((row) => row.text);
    return {
      videoId: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      durationSeconds: video.durationSeconds,
      summary: summarizeSegments(segmentTexts),
      segmentCount: rows.length,
      segmentTexts,
    };
  }));

  const allSegmentTexts = videos.flatMap((video) => video.segmentTexts);
  const themes = extractThemes(allSegmentTexts);
  const totalSegmentCount = videos.reduce((sum, video) => sum + video.segmentCount, 0);
  const videosWithTranscript = videos.filter((video) => video.segmentCount > 0).length;
  const archiveSummary = buildArchiveSummary({
    videoCount: videos.length,
    totalSegmentCount,
    videosWithTranscript,
    themes,
  });

  const artifact: V0ReviewArtifact = v0ReviewArtifactSchema.parse({
    runId: input.runId,
    workspaceId: input.workspaceId,
    generatedAt: new Date().toISOString(),
    videoCount: videos.length,
    totalSegmentCount,
    archiveSummary,
    themes,
    videos: videos.map(({ segmentTexts: _segmentTexts, ...video }) => video),
  });

  const r2Key = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'synthesize_v0_review',
    name: 'review.json',
  });

  await r2.putObject({
    key: r2Key,
    body: JSON.stringify(artifact, null, 2),
    contentType: 'application/json',
  });

  return {
    r2Key,
    videoCount: artifact.videoCount,
    totalSegmentCount: artifact.totalSegmentCount,
    archiveSummary: artifact.archiveSummary,
    themes: artifact.themes,
  };
}
