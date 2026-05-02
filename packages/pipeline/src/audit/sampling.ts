import type { PublicYouTubeVideo } from '@creatorcanon/adapters';

export function selectVideosForAudit(
  videos: PublicYouTubeVideo[],
  maxTranscripts: number,
): PublicYouTubeVideo[] {
  if (videos.length <= maxTranscripts) return [...videos];

  const byRecent = [...videos].sort(comparePublishedDesc).slice(0, Math.ceil(maxTranscripts * 0.3));
  const byViews = [...videos].sort(compareViewsDesc).slice(0, Math.ceil(maxTranscripts * 0.3));
  const byDuration = [...videos]
    .sort(compareDurationDesc)
    .slice(0, Math.ceil(maxTranscripts * 0.2));
  const byDiversity = selectTitleDiverseVideos(videos, Math.ceil(maxTranscripts * 0.2));

  const firstPass = dedupeVideos([...byRecent, ...byViews, ...byDuration, ...byDiversity]);
  if (firstPass.length >= maxTranscripts) return firstPass.slice(0, maxTranscripts);

  const backfill = [...videos].sort(comparePublishedDesc);
  return dedupeVideos([...firstPass, ...backfill]).slice(0, maxTranscripts);
}

export function dedupeVideos(videos: PublicYouTubeVideo[]): PublicYouTubeVideo[] {
  const seen = new Set<string>();
  const unique: PublicYouTubeVideo[] = [];

  for (const video of videos) {
    if (seen.has(video.id)) continue;
    seen.add(video.id);
    unique.push(video);
  }

  return unique;
}

function selectTitleDiverseVideos(
  videos: PublicYouTubeVideo[],
  count: number,
): PublicYouTubeVideo[] {
  const selected: PublicYouTubeVideo[] = [];
  const usedTerms = new Set<string>();
  const candidates = [...videos].sort(compareViewsDesc);

  for (const video of candidates) {
    if (selected.length >= count) break;
    const terms = titleTerms(video.title);
    const overlap = terms.filter((term) => usedTerms.has(term)).length;
    if (terms.length === 0 || overlap / Math.max(1, terms.length) <= 0.4) {
      selected.push(video);
      terms.forEach((term) => usedTerms.add(term));
    }
  }

  return selected;
}

function titleTerms(title: string): string[] {
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'your', 'you', 'how']);
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((term) => term.length > 2 && !stop.has(term));
}

function comparePublishedDesc(a: PublicYouTubeVideo, b: PublicYouTubeVideo): number {
  return Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? '');
}

function compareViewsDesc(a: PublicYouTubeVideo, b: PublicYouTubeVideo): number {
  return (b.viewCount ?? 0) - (a.viewCount ?? 0);
}

function compareDurationDesc(a: PublicYouTubeVideo, b: PublicYouTubeVideo): number {
  return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0);
}
