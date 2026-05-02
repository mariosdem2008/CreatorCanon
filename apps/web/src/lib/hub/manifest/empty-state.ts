// apps/web/src/lib/hub/manifest/empty-state.ts
//
// Helpers that encode the renderer's empty-state contract. Used everywhere a
// citation, timestamp, or accent color may be missing or malformed.

export const ACCENT_COLORS = [
  'mint', 'peach', 'lilac', 'rose', 'blue', 'amber', 'sage', 'slate',
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

type CitationLike = {
  url?: string;
  timestampStart: number;
};

type SourceLike = {
  youtubeId?: string | null;
};

/**
 * Returns the citation's URL, or synthesizes a YouTube watch URL with a
 * timestamp anchor when `citation.url` is missing.
 */
export function citationUrl(citation: CitationLike, video: SourceLike): string {
  if (citation.url) return citation.url;
  const t = Math.floor(citation.timestampStart);
  return `https://www.youtube.com/watch?v=${video.youtubeId}&t=${t}s`;
}

export function safeCitationHref(citation: CitationLike, video: SourceLike): string | null {
  if (citation.url && !citation.url.includes('watch?v=null')) return citation.url;
  if (!video.youtubeId || video.youtubeId === 'null') return null;
  const t = Math.floor(citation.timestampStart);
  return `https://www.youtube.com/watch?v=${video.youtubeId}&t=${t}s`;
}

export function safeSourceTitle(rawTitle: string | null | undefined, ordinal: number): string {
  const title = (rawTitle ?? '').trim();
  if (!title || /^untitled(\s+(source|video))?$/i.test(title) || /^source(?:\s*(?:\u00b7|-)\s*\d+\s*min)?$/i.test(title)) {
    return `Source ${ordinal}`;
  }
  return title;
}

/**
 * Formats a duration in seconds as `mm:ss` or `h:mm:ss`.
 */
export function formatTimestampLabel(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/**
 * Validates an accent color against the documented palette.
 * Falls back to `slate` for any unknown value.
 */
export function resolveAccentColor(value: string | undefined): AccentColor {
  if (value && (ACCENT_COLORS as readonly string[]).includes(value)) {
    return value as AccentColor;
  }
  return 'slate';
}
