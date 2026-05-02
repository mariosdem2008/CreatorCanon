import { buildCreatorManualIndex } from './content';
import type {
  CreatorManualEvidenceRef,
  CreatorManualManifest,
  CreatorManualSegment,
  CreatorManualSource,
} from './schema';

export type ResolvedCreatorManualEvidence = {
  ref: CreatorManualEvidenceRef;
  source: CreatorManualSource | null;
  segment: CreatorManualSegment | null;
  timestampLabel: string | null;
  url: string | null;
  missingReason: 'source' | 'segment' | null;
};

export const formatCreatorManualTimestamp = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const buildYouTubeTimestampUrl = (youtubeId: string, timestampStart = 0) =>
  `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}&t=${Math.max(0, Math.floor(timestampStart))}s`;

export const buildSourceTimestampUrl = (source: CreatorManualSource, timestampStart = 0) => {
  if (source.platform === 'youtube' && source.youtubeId) {
    return buildYouTubeTimestampUrl(source.youtubeId, timestampStart);
  }

  return source.url ?? null;
};

export const resolveEvidenceReferences = (
  manifest: CreatorManualManifest,
  refs: CreatorManualEvidenceRef[],
): ResolvedCreatorManualEvidence[] => {
  const index = buildCreatorManualIndex(manifest);

  return refs.map((ref) => {
    const source = index.sourcesById.get(ref.sourceId) ?? null;
    const segment = ref.segmentId ? index.segmentsById.get(ref.segmentId) ?? null : null;
    const timestampStart = ref.timestampStart ?? segment?.timestampStart ?? 0;

    return {
      ref,
      source,
      segment,
      timestampLabel: source ? formatCreatorManualTimestamp(timestampStart) : null,
      url: source ? buildSourceTimestampUrl(source, timestampStart) : null,
      missingReason: !source ? 'source' : ref.segmentId && !segment ? 'segment' : null,
    };
  });
};
