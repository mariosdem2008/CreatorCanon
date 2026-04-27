const FALLBACK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice"><rect width="480" height="270" fill="#E5DECF"/><g fill="#3D352A"><rect x="200" y="105" width="80" height="60" rx="6" opacity="0.3"/><polygon points="225,120 225,150 255,135"/></g></svg>`;

const FALLBACK_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(FALLBACK_SVG).toString('base64')}`;

export function sourceThumbnail(input: {
  youtubeVideoId: string | null;
  thumbnails: { medium?: string; small?: string } | null;
}): string {
  if (input.thumbnails?.medium) return input.thumbnails.medium;
  if (input.thumbnails?.small) return input.thumbnails.small;
  if (input.youtubeVideoId) return `https://i.ytimg.com/vi/${input.youtubeVideoId}/hqdefault.jpg`;
  return FALLBACK_DATA_URL;
}
