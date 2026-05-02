import type { PublicYouTubeChannel, PublicYouTubeVideo } from '@creatorcanon/adapters';

import type { PublicTranscriptSample } from './transcripts';
import type { AuditScores } from './types';

export interface AuditScoreInputs {
  videoCount: number;
  transcriptCount: number;
  transcriptWordCount: number;
  averageDurationSeconds: number;
  repeatedTitleTerms: number;
  channelDescriptionLength: number;
  medianViews: number;
}

export function buildScoreInputs(input: {
  channel: PublicYouTubeChannel;
  videos: PublicYouTubeVideo[];
  transcripts: PublicTranscriptSample[];
}): AuditScoreInputs {
  const durations = input.videos
    .map((video) => video.durationSeconds ?? 0)
    .filter((duration) => duration > 0);
  const views = input.videos
    .map((video) => video.viewCount ?? 0)
    .filter((viewCount) => viewCount > 0)
    .sort((a, b) => a - b);

  return {
    videoCount: input.videos.length,
    transcriptCount: input.transcripts.length,
    transcriptWordCount: input.transcripts.reduce(
      (sum, sample) => sum + countWords(sample.text),
      0,
    ),
    averageDurationSeconds:
      durations.length > 0
        ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
        : 0,
    repeatedTitleTerms: countRepeatedTitleTerms(input.videos),
    channelDescriptionLength: input.channel.description.length,
    medianViews: views.length > 0 ? (views[Math.floor(views.length / 2)] ?? 0) : 0,
  };
}

export function calculateAuditScores(input: AuditScoreInputs): AuditScores {
  const sourceDepth = clampScore(
    input.videoCount * 1.2 +
      input.transcriptCount * 5 +
      Math.min(input.averageDurationSeconds / 60, 30),
  );
  const knowledgeDensity = clampScore(
    input.transcriptWordCount / 800 +
      input.repeatedTitleTerms * 4 +
      Math.min(input.averageDurationSeconds / 90, 25),
  );
  const positioningClarity = clampScore(
    Math.min(input.channelDescriptionLength / 8, 35) + input.repeatedTitleTerms * 5,
  );
  const monetizationPotential = clampScore(
    sourceDepth * 0.35 +
      knowledgeDensity * 0.35 +
      positioningClarity * 0.2 +
      Math.min(input.medianViews / 100, 10),
  );
  const overall = Math.round(
    sourceDepth * 0.25 +
      knowledgeDensity * 0.3 +
      positioningClarity * 0.2 +
      monetizationPotential * 0.25,
  );

  return { overall, knowledgeDensity, sourceDepth, positioningClarity, monetizationPotential };
}

export function countRepeatedTitleTerms(videos: PublicYouTubeVideo[]): number {
  const counts = new Map<string, number>();
  for (const video of videos) {
    const terms = new Set(normalizeTerms(video.title));
    for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count >= 3).length;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function normalizeTerms(text: string): string[] {
  const stop = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'your',
    'you',
    'how',
    'why',
    'what',
    'when',
    'from',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !stop.has(term));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
