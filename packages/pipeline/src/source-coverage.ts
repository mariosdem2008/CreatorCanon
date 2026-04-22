import { and, eq, getDb, inArray } from '@creatorcanon/db';
import { mediaAsset, transcriptAsset, video } from '@creatorcanon/db/schema';

import { ensureTranscripts } from './stages/ensure-transcripts';

export type EstimatedSourceQuality = 'strong' | 'partial' | 'limited';
export type SourceReadinessLabel =
  | 'source_ready'
  | 'auto_captions'
  | 'needs_transcription'
  | 'needs_transcript_check'
  | 'limited_source';

export interface SourceCoverageVideo {
  videoId: string;
  youtubeVideoId: string;
  title: string | null;
  captionStatus: 'available' | 'auto_only' | 'none' | 'unknown';
  hasCanonicalTranscript: boolean;
  hasAudioAsset: boolean;
  readinessLabel: SourceReadinessLabel;
}

export interface SourceCoverageSummary {
  selectedCount: number;
  readyCount: number;
  transcribableCount: number;
  unknownCount: number;
  unavailableCount: number;
  estimatedSourceQuality: EstimatedSourceQuality;
  videos: SourceCoverageVideo[];
}

function readinessFor(input: {
  captionStatus: SourceCoverageVideo['captionStatus'];
  hasCanonicalTranscript: boolean;
  hasAudioAsset: boolean;
}): SourceReadinessLabel {
  if (input.hasCanonicalTranscript || input.captionStatus === 'available') return 'source_ready';
  if (input.captionStatus === 'auto_only') return 'auto_captions';
  if (input.hasAudioAsset) return 'needs_transcription';
  if (input.captionStatus === 'none') return 'limited_source';
  return 'needs_transcript_check';
}

function isReady(label: SourceReadinessLabel): boolean {
  return label === 'source_ready' || label === 'auto_captions';
}

function qualityFor(selectedCount: number, readyCount: number, transcribableCount: number): EstimatedSourceQuality {
  const coveredCount = readyCount + transcribableCount;
  if (selectedCount === 0 || coveredCount === 0) return 'limited';
  if (readyCount === selectedCount) return 'strong';
  return 'partial';
}

export async function getSourceCoverage(input: {
  workspaceId: string;
  videoIds: string[];
}): Promise<SourceCoverageSummary> {
  const ids = [...new Set(input.videoIds.filter(Boolean))];
  if (ids.length === 0) {
    return {
      selectedCount: 0,
      readyCount: 0,
      transcribableCount: 0,
      unknownCount: 0,
      unavailableCount: 0,
      estimatedSourceQuality: 'limited',
      videos: [],
    };
  }

  const db = getDb();
  const videoRows = await db
    .select({
      id: video.id,
      youtubeVideoId: video.youtubeVideoId,
      title: video.title,
      captionStatus: video.captionStatus,
    })
    .from(video)
    .where(and(eq(video.workspaceId, input.workspaceId), inArray(video.id, ids)));

  if (videoRows.length === 0) {
    return {
      selectedCount: 0,
      readyCount: 0,
      transcribableCount: 0,
      unknownCount: 0,
      unavailableCount: 0,
      estimatedSourceQuality: 'limited',
      videos: [],
    };
  }

  const transcriptRows = await db
    .select({ videoId: transcriptAsset.videoId })
    .from(transcriptAsset)
    .where(
      and(
        eq(transcriptAsset.workspaceId, input.workspaceId),
        eq(transcriptAsset.isCanonical, true),
        inArray(transcriptAsset.videoId, videoRows.map((row) => row.id)),
      ),
    );

  const audioRows = await db
    .select({ videoId: mediaAsset.videoId })
    .from(mediaAsset)
    .where(
      and(
        eq(mediaAsset.workspaceId, input.workspaceId),
        eq(mediaAsset.type, 'audio_m4a'),
        inArray(mediaAsset.videoId, videoRows.map((row) => row.id)),
      ),
    );

  const canonicalVideoIds = new Set(transcriptRows.map((row) => row.videoId));
  const audioVideoIds = new Set(audioRows.map((row) => row.videoId));
  const videos = ids
    .map((id) => videoRows.find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => row != null)
    .map<SourceCoverageVideo>((row) => {
      const hasCanonicalTranscript = canonicalVideoIds.has(row.id);
      const hasAudioAsset = audioVideoIds.has(row.id);
      const readinessLabel = readinessFor({
        captionStatus: row.captionStatus,
        hasCanonicalTranscript,
        hasAudioAsset,
      });
      return {
        videoId: row.id,
        youtubeVideoId: row.youtubeVideoId,
        title: row.title,
        captionStatus: row.captionStatus,
        hasCanonicalTranscript,
        hasAudioAsset,
        readinessLabel,
      };
    });

  const readyCount = videos.filter((row) => isReady(row.readinessLabel)).length;
  const transcribableCount = videos.filter((row) => row.readinessLabel === 'needs_transcription').length;
  const unknownCount = videos.filter((row) => row.readinessLabel === 'needs_transcript_check').length;
  const unavailableCount = videos.filter((row) => row.readinessLabel === 'limited_source').length;

  return {
    selectedCount: videos.length,
    readyCount,
    transcribableCount,
    unknownCount,
    unavailableCount,
    estimatedSourceQuality: qualityFor(videos.length, readyCount, transcribableCount),
    videos,
  };
}

export async function preflightSourceCoverage(input: {
  workspaceId: string;
  videoIds: string[];
}): Promise<SourceCoverageSummary> {
  const before = await getSourceCoverage(input);
  const unknownIds = before.videos
    .filter((row) => row.readinessLabel === 'needs_transcript_check')
    .map((row) => row.videoId);

  if (unknownIds.length === 0) return before;

  await ensureTranscripts({
    runId: 'source-coverage-preflight',
    workspaceId: input.workspaceId,
    videos: before.videos
      .filter((row) => unknownIds.includes(row.videoId))
      .map((row) => ({
        id: row.videoId,
        youtubeVideoId: row.youtubeVideoId,
        title: row.title,
        durationSeconds: null,
      })),
  });

  return getSourceCoverage(input);
}
