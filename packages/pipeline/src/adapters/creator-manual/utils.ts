export function slugify(value: string, fallback = 'item'): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60)
    .replace(/(^-|-$)/g, '');

  return slug || fallback;
}

export function nonEmpty(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

export function excerpt(value: string, max = 220): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max - 1).trim()}...` : compact;
}

export function seconds(ms: number | null | undefined): number {
  return Math.max(0, Math.floor((ms ?? 0) / 1000));
}

export function youtubeUrl(youtubeId: string | null | undefined): string | undefined {
  return youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : undefined;
}

export function sourceThumbnail(input: {
  youtubeVideoId?: string | null;
  thumbnails?: { small?: string; medium?: string; large?: string; maxres?: string } | null;
}): string | undefined {
  return (
    input.thumbnails?.maxres ??
    input.thumbnails?.large ??
    input.thumbnails?.medium ??
    input.thumbnails?.small ??
    (input.youtubeVideoId ? `https://i.ytimg.com/vi/${input.youtubeVideoId}/hqdefault.jpg` : undefined)
  );
}
