import { and, asc, eq, getDb } from '@creatorcanon/db';
import { segment } from '@creatorcanon/db/schema';
import { createOpenAIClient, createR2Client, artifactKey, type OpenAIClient } from '@creatorcanon/adapters';
import { parseServerEnv } from '@creatorcanon/core';
import { z } from 'zod';
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

const llmReviewSchema = z.object({
  archiveSummary: z.string().min(1).max(600),
  themes: z.array(z.string().min(1).max(60)).min(1).max(6),
});

type LlmReview = z.infer<typeof llmReviewSchema>;

const llmReviewJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['archiveSummary', 'themes'],
  properties: {
    archiveSummary: { type: 'string' },
    themes: {
      type: 'array',
      minItems: 1,
      maxItems: 6,
      items: { type: 'string' },
    },
  },
} as const;

interface LlmReviewVideoInput {
  title: string | null;
  segmentTexts: string[];
}

async function generateLlmReview(args: {
  videos: LlmReviewVideoInput[];
  openai: OpenAIClient;
}): Promise<LlmReview | null> {
  const corpus = args.videos
    .filter((v) => v.segmentTexts.length > 0)
    .map((video, idx) => {
      const body = video.segmentTexts.slice(0, 20).join(' ').replace(/\s+/g, ' ').trim();
      const truncated = body.length > 2400 ? `${body.slice(0, 2400)}...` : body;
      return `VIDEO ${idx + 1} title=${JSON.stringify(video.title ?? 'Untitled')}\n${truncated}`;
    })
    .join('\n\n');

  if (!corpus) return null;

  const system =
    'You read transcripts from a creator\'s video archive and identify the semantic shape of the collection. Return a concise archive summary and 3-6 recurring themes (short noun phrases, Title Case). Ground everything in the provided transcripts; do not invent topics.';

  const user = [
    'Transcripts (truncated where long):',
    corpus,
    '',
    'Write:',
    '- archiveSummary: 2-3 sentences (<=480 chars) describing what this archive covers as a whole. Use plain, present-tense prose. Mention what a reader will find; do not mention video counts or transcript stats.',
    '- themes: 3-6 short noun phrases (<=5 words each, Title Case) that name the recurring ideas across videos. No duplicates. Skip generic words like "Content" or "Videos".',
  ].join('\n');

  try {
    const completion = await args.openai.chat({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      maxTokens: 500,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      jsonSchema: {
        name: 'archive_review_v0',
        schema: llmReviewJsonSchema as unknown as Record<string, unknown>,
        strict: true,
      },
    });
    if (!completion.content) return null;
    const parsed = llmReviewSchema.safeParse(JSON.parse(completion.content));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    console.warn(
      '[synthesize_v0_review] LLM review failed, falling back to deterministic:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
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
  const totalSegmentCount = videos.reduce((sum, video) => sum + video.segmentCount, 0);
  const videosWithTranscript = videos.filter((video) => video.segmentCount > 0).length;

  const deterministicThemes = extractThemes(allSegmentTexts);
  const deterministicArchiveSummary = buildArchiveSummary({
    videoCount: videos.length,
    totalSegmentCount,
    videosWithTranscript,
    themes: deterministicThemes,
  });

  const useLlm = env.PIPELINE_REVIEW_SYNTH === 'llm' && totalSegmentCount > 0;
  let themes = deterministicThemes;
  let archiveSummary = deterministicArchiveSummary;

  if (useLlm) {
    const llmReview = await generateLlmReview({
      videos: videos.map((video) => ({
        title: video.title,
        segmentTexts: video.segmentTexts,
      })),
      openai: createOpenAIClient(env),
    });
    if (llmReview) {
      archiveSummary = llmReview.archiveSummary;
      themes = llmReview.themes.slice(0, 6);
    }
  }

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
