import { sanitizeTranscriptText, DEFAULT_SUBSTITUTIONS } from '../../transcript/sanitize';

interface PageInput {
  id: string;
  evidenceSegmentIds: string[];
}

interface SegmentInput {
  id: string;
  videoId: string;
  startMs: number;
  endMs: number;
  text: string;
}

interface VideoInput {
  id: string;
  title: string | null;
  youtubeVideoId: string | null;
}

export interface ProjectedCitation {
  id: string;
  sourceVideoId: string;
  videoTitle: string;
  timestampStart: number;
  timestampEnd: number;
  timestampLabel: string;
  excerpt: string;
  url?: string;
}

function formatTimestampLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function buildPageCitations(input: {
  pages: PageInput[];
  segments: SegmentInput[];
  videos: VideoInput[];
}): Map<string, ProjectedCitation[]> {
  const segById = new Map(input.segments.map((s) => [s.id, s]));
  const videoById = new Map(input.videos.map((v) => [v.id, v]));

  const out = new Map<string, ProjectedCitation[]>();
  for (const p of input.pages) {
    const cites: ProjectedCitation[] = [];
    for (const segId of p.evidenceSegmentIds) {
      const seg = segById.get(segId);
      if (!seg) continue;
      const video = videoById.get(seg.videoId);
      if (!video) continue;
      const startSec = Math.floor(seg.startMs / 1000);
      const endSec = Math.floor(seg.endMs / 1000);
      const url = video.youtubeVideoId
        ? `https://www.youtube.com/watch?v=${video.youtubeVideoId}&t=${startSec}s`
        : undefined;
      cites.push({
        id: `cite_${seg.id}`,
        sourceVideoId: seg.videoId,
        videoTitle: video.title ?? 'Untitled',
        timestampStart: startSec,
        timestampEnd: endSec,
        timestampLabel: formatTimestampLabel(startSec),
        excerpt: sanitizeTranscriptText(seg.text, DEFAULT_SUBSTITUTIONS),
        url,
      });
    }
    out.set(p.id, cites);
  }
  return out;
}
