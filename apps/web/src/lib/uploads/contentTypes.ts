/** Allowed upload MIME types per spec § 10. */
export const ALLOWED_CONTENT_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'audio/mpeg',
  'audio/wav',
  'audio/mp4',
] as const);

/** 2 GB cap per spec § 10. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;

export function isAllowedContentType(ct: string): boolean {
  return (ALLOWED_CONTENT_TYPES as Set<string>).has(ct);
}

export function isAllowedFileSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_FILE_BYTES;
}

/** Maps a content type to a canonical file extension for R2 key construction. */
export function fileExtFromContentType(ct: string): string {
  switch (ct) {
    case 'video/mp4':         return 'mp4';
    case 'video/webm':        return 'webm';
    case 'video/quicktime':   return 'mov';
    case 'video/x-matroska':  return 'mkv';
    case 'audio/mpeg':        return 'mp3';
    case 'audio/wav':         return 'wav';
    case 'audio/mp4':         return 'm4a';
    default:                  return 'bin';
  }
}

/**
 * True for video/* content types — controls whether audio extraction is needed.
 * PRECONDITION: caller MUST have already verified `isAllowedContentType(ct) === true`.
 * Do NOT call this directly on a client-supplied content-type string.
 */
export function isVideoContentType(ct: string): boolean {
  return ct.startsWith('video/');
}
