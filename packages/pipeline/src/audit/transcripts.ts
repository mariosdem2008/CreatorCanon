import type { PublicYouTubeVideo } from '@creatorcanon/adapters';

export interface PublicTranscriptSample {
  videoId: string;
  language?: string;
  source: 'timedtext' | 'watch_page';
  text: string;
}

export interface TranscriptFetchResult {
  samples: PublicTranscriptSample[];
  unavailableVideoIds: string[];
}

export interface TranscriptFetchOptions {
  maxCharsPerTranscript?: number;
}

const USER_AGENT = 'Mozilla/5.0 (compatible; CreatorCanonAudit/1.0)';
const DEFAULT_MAX_TRANSCRIPT_CHARS = 2_400;

export async function fetchTranscriptSamples(
  videos: PublicYouTubeVideo[],
  options: TranscriptFetchOptions = {},
): Promise<TranscriptFetchResult> {
  const samples: PublicTranscriptSample[] = [];
  const unavailableVideoIds: string[] = [];
  const maxCharsPerTranscript = options.maxCharsPerTranscript ?? DEFAULT_MAX_TRANSCRIPT_CHARS;

  for (const video of videos) {
    const sample = await fetchPublicTranscriptForAudit(video.id, { maxCharsPerTranscript });
    if (sample) samples.push(sample);
    else unavailableVideoIds.push(video.id);
  }

  return { samples, unavailableVideoIds };
}

export async function fetchPublicTranscriptForAudit(
  videoId: string,
  options: TranscriptFetchOptions = {},
): Promise<PublicTranscriptSample | null> {
  const maxCharsPerTranscript = options.maxCharsPerTranscript ?? DEFAULT_MAX_TRANSCRIPT_CHARS;
  const direct = await safeFetchTranscript(() =>
    fetchTimedtextTranscript(videoId, maxCharsPerTranscript),
  );
  if (direct) return direct;

  const fromWatchPage = await safeFetchTranscript(() =>
    fetchWatchPageTranscript(videoId, maxCharsPerTranscript),
  );
  return fromWatchPage ?? null;
}

async function safeFetchTranscript(
  fetcher: () => Promise<PublicTranscriptSample | null>,
): Promise<PublicTranscriptSample | null> {
  try {
    return await fetcher();
  } catch {
    return null;
  }
}

async function fetchTimedtextTranscript(
  videoId: string,
  maxCharsPerTranscript: number,
): Promise<PublicTranscriptSample | null> {
  const tracks = await listTimedtextTracks(videoId);
  const best = pickBestTrack(tracks);
  if (!best) return null;

  const vtt = await downloadVtt(videoId, best.lang, best.kind, best.name);
  if (!vtt) return null;

  const text = compactTranscriptText(vttToPlainText(vtt), maxCharsPerTranscript);
  return text ? { videoId, language: best.lang, source: 'timedtext', text } : null;
}

async function listTimedtextTracks(
  videoId: string,
): Promise<Array<{ lang: string; name: string; kind: string }>> {
  const url = `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&type=list`;
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const xml = await res.text();

  const tracks: Array<{ lang: string; name: string; kind: string }> = [];
  for (const match of xml.matchAll(/<track[^>]+>/g)) {
    const tag = match[0];
    const lang = tag.match(/lang_code="([^"]+)"/)?.[1];
    if (!lang) continue;
    tracks.push({
      lang,
      name: decodeXml(tag.match(/\bname="([^"]*)"/)?.[1] ?? ''),
      kind: tag.match(/\bkind="([^"]+)"/)?.[1] ?? 'standard',
    });
  }

  return tracks;
}

async function downloadVtt(
  videoId: string,
  lang: string,
  kind: string,
  name: string,
): Promise<string | null> {
  const params = new URLSearchParams({ v: videoId, lang, fmt: 'vtt' });
  if (kind === 'asr') params.set('kind', 'asr');
  if (name) params.set('name', name);

  const res = await fetch(`https://www.youtube.com/api/timedtext?${params.toString()}`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text.trim().startsWith('WEBVTT') ? text : null;
}

async function fetchWatchPageTranscript(
  videoId: string,
  maxCharsPerTranscript: number,
): Promise<PublicTranscriptSample | null> {
  const html = await fetchWatchPage(videoId);
  if (!html) return null;

  const match = html.match(
    /ytInitialPlayerResponse\s*=\s*(\{.+?\})(?:;\s*(?:var|const|let)\s|;\s*<\/script>)/s,
  );
  if (!match?.[1]) return null;

  let playerResponse: unknown;
  try {
    playerResponse = JSON.parse(match[1]);
  } catch {
    return null;
  }

  const best = pickWatchPageTrack(getWatchPageCaptionTracks(playerResponse));
  if (!best?.baseUrl) return null;

  const joiner = best.baseUrl.includes('?') ? '&' : '?';
  const res = await fetch(`${best.baseUrl}${joiner}fmt=vtt`, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return null;
  const vtt = await res.text();
  if (!vtt.trim().startsWith('WEBVTT')) return null;

  const text = compactTranscriptText(vttToPlainText(vtt), maxCharsPerTranscript);
  return text ? { videoId, language: best.languageCode ?? 'en', source: 'watch_page', text } : null;
}

async function fetchWatchPage(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': 'en-US,en;q=0.9',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    return res.ok ? res.text() : null;
  } catch {
    return null;
  }
}

type WatchPageCaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
};

function getWatchPageCaptionTracks(playerResponse: unknown): WatchPageCaptionTrack[] {
  const captions = (playerResponse as Record<string, unknown>)?.captions;
  if (!captions || typeof captions !== 'object') return [];
  const renderer = (captions as Record<string, unknown>).playerCaptionsTracklistRenderer;
  if (!renderer || typeof renderer !== 'object') return [];
  const tracks = (renderer as Record<string, unknown>).captionTracks;
  return Array.isArray(tracks) ? (tracks as WatchPageCaptionTrack[]) : [];
}

function pickWatchPageTrack(tracks: WatchPageCaptionTrack[]): WatchPageCaptionTrack | undefined {
  return (
    tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ??
    tracks.find((t) => t.languageCode === 'en') ??
    tracks.find((t) => t.kind !== 'asr') ??
    tracks[0]
  );
}

function pickBestTrack(
  tracks: Array<{ lang: string; name: string; kind: string }>,
): { lang: string; name: string; kind: string } | undefined {
  return (
    tracks.find((t) => t.lang === 'en' && t.kind !== 'asr') ??
    tracks.find((t) => t.lang === 'en') ??
    tracks.find((t) => t.kind !== 'asr') ??
    tracks[0]
  );
}

export function vttToPlainText(vtt: string): string {
  const seen = new Set<string>();
  const lines = vtt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line || line === 'WEBVTT' || line.includes('-->')) return false;
      if (/^\d+$/.test(line) || line.startsWith('NOTE')) return false;
      return true;
    })
    .map((line) => decodeXml(line.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()))
    .filter(Boolean);

  return lines
    .filter((line) => {
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactTranscriptText(text: string, maxChars: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxChars) return normalized;
  if (maxChars <= 0) return '';
  if (maxChars < 120) return normalized.slice(0, maxChars).trim();

  const marker = ' ... ';
  const headLength = Math.floor(maxChars * 0.5);
  const tailLength = Math.floor(maxChars * 0.25);
  const middleLength = Math.max(0, maxChars - headLength - tailLength - marker.length * 2);
  const middleStart = Math.max(headLength, Math.floor((normalized.length - middleLength) / 2));
  const tailStart = Math.max(middleStart + middleLength, normalized.length - tailLength);

  return [
    normalized.slice(0, headLength).trim(),
    normalized.slice(middleStart, middleStart + middleLength).trim(),
    normalized.slice(tailStart).trim(),
  ]
    .filter(Boolean)
    .join(marker)
    .slice(0, maxChars)
    .trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}
