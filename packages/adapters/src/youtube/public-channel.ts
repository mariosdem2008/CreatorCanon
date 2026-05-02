import { CanonError } from '@creatorcanon/core';
import { google, type youtube_v3 } from 'googleapis';
import { z } from 'zod';

export type PublicYouTubeChannelInput =
  | { kind: 'handle'; value: string }
  | { kind: 'channelId'; value: string }
  | { kind: 'username'; value: string };

export interface PublicYouTubeChannel {
  id: string;
  title: string;
  description: string;
  handle?: string;
  canonicalUrl: string;
  thumbnailUrl?: string;
  uploadsPlaylistId: string;
  statistics: {
    subscriberCount?: number;
    videoCount?: number;
    viewCount?: number;
  };
}

export interface PublicYouTubeVideo {
  id: string;
  title: string;
  description: string;
  publishedAt?: string;
  durationIso?: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
}

export interface PublicYouTubeClient {
  readonly raw: youtube_v3.Youtube;
  resolveChannel(input: PublicYouTubeChannelInput): Promise<PublicYouTubeChannel>;
  listPublicChannelVideos(input: {
    uploadsPlaylistId: string;
    maxResults: number;
  }): Promise<PublicYouTubeVideo[]>;
}

const publicChannelInputSchema = z.object({
  kind: z.enum(['handle', 'channelId', 'username']),
  value: z.string().min(1),
});

export function createPublicYouTubeClient(
  apiKey: string,
  rawOverride?: youtube_v3.Youtube,
): PublicYouTubeClient {
  z.string().min(1).parse(apiKey);
  const raw = rawOverride ?? google.youtube({ version: 'v3', auth: apiKey });

  return {
    raw,

    async resolveChannel(input) {
      const parsed = publicChannelInputSchema.parse(input);
      const channel = await resolveChannelResource(raw, parsed);
      return mapPublicChannelResource(channel);
    },

    async listPublicChannelVideos(input) {
      const maxResults = z.number().int().min(1).parse(input.maxResults);
      const playlistId = z.string().min(1).parse(input.uploadsPlaylistId);
      const items: youtube_v3.Schema$PlaylistItem[] = [];
      let pageToken: string | undefined;

      while (items.length < maxResults) {
        const remaining = maxResults - items.length;
        const { data } = await mapYouTubeError(() =>
          raw.playlistItems.list({
            part: ['contentDetails', 'snippet'],
            playlistId,
            maxResults: Math.min(50, remaining),
            pageToken,
          }),
        );

        items.push(...(data.items ?? []));
        pageToken = data.nextPageToken ?? undefined;
        if (!pageToken) break;
      }

      const ids = items
        .map((item) => item.contentDetails?.videoId)
        .filter((id): id is string => Boolean(id));
      if (ids.length === 0) return [];

      const details: PublicYouTubeVideo[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const { data } = await mapYouTubeError(() =>
          raw.videos.list({
            part: ['snippet', 'contentDetails', 'statistics'],
            id: ids.slice(i, i + 50),
            maxResults: 50,
          }),
        );
        details.push(...(data.items ?? []).map(mapPublicVideoResource));
      }

      const detailMap = new Map(details.map((video) => [video.id, video]));
      return ids.flatMap((id) => {
        const video = detailMap.get(id);
        return video ? [video] : [];
      });
    },
  };
}

async function resolveChannelResource(
  raw: youtube_v3.Youtube,
  input: PublicYouTubeChannelInput,
): Promise<youtube_v3.Schema$Channel> {
  const part = ['snippet', 'contentDetails', 'statistics', 'brandingSettings'];
  const attempts: Array<Record<string, string | string[]>> = [];

  if (input.kind === 'handle') attempts.push({ part, forHandle: normalizeHandle(input.value) });
  if (input.kind === 'channelId') attempts.push({ part, id: input.value });
  if (input.kind === 'username') attempts.push({ part, forUsername: input.value });

  for (const params of attempts) {
    const { data } = await mapYouTubeError(() =>
      raw.channels.list(params as youtube_v3.Params$Resource$Channels$List),
    );
    const item = data.items?.[0];
    if (item?.id) return item;
  }

  throw new CanonError({
    code: 'channel_not_found',
    category: 'not_found',
    message: 'Could not find that public YouTube channel.',
  });
}

export function mapPublicChannelResource(item: youtube_v3.Schema$Channel): PublicYouTubeChannel {
  const uploadsPlaylistId = item.contentDetails?.relatedPlaylists?.uploads;
  if (!item.id || !uploadsPlaylistId) {
    throw new CanonError({
      code: 'channel_not_found',
      category: 'not_found',
      message: 'Could not resolve the public YouTube channel uploads playlist.',
    });
  }

  const handle = normalizeApiHandle(item.snippet?.customUrl ?? undefined);
  return {
    id: item.id,
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? '',
    handle,
    canonicalUrl: handle
      ? `https://www.youtube.com/@${handle}`
      : `https://www.youtube.com/channel/${item.id}`,
    thumbnailUrl:
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      undefined,
    uploadsPlaylistId,
    statistics: {
      subscriberCount: parseOptionalNumber(item.statistics?.subscriberCount),
      videoCount: parseOptionalNumber(item.statistics?.videoCount),
      viewCount: parseOptionalNumber(item.statistics?.viewCount),
    },
  };
}

export function mapPublicVideoResource(item: youtube_v3.Schema$Video): PublicYouTubeVideo {
  const durationIso = item.contentDetails?.duration ?? undefined;
  return {
    id: item.id ?? '',
    title: item.snippet?.title ?? '',
    description: item.snippet?.description ?? '',
    publishedAt: item.snippet?.publishedAt ?? undefined,
    durationIso,
    durationSeconds: durationIso ? parseIsoDurationSeconds(durationIso) : undefined,
    thumbnailUrl:
      item.snippet?.thumbnails?.high?.url ??
      item.snippet?.thumbnails?.medium?.url ??
      item.snippet?.thumbnails?.default?.url ??
      undefined,
    viewCount: parseOptionalNumber(item.statistics?.viewCount),
    likeCount: parseOptionalNumber(item.statistics?.likeCount),
    commentCount: parseOptionalNumber(item.statistics?.commentCount),
  };
}

export function parseIsoDurationSeconds(iso: string): number {
  const match = iso.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  const days = Number.parseInt(match[1] ?? '0', 10);
  const hours = Number.parseInt(match[2] ?? '0', 10);
  const minutes = Number.parseInt(match[3] ?? '0', 10);
  const seconds = Number.parseInt(match[4] ?? '0', 10);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, '');
}

function normalizeApiHandle(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^@/, '');
  return normalized || undefined;
}

function parseOptionalNumber(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function mapYouTubeError<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const code = (error as { code?: number }).code;
    const errors = (error as { errors?: Array<{ reason?: string }> }).errors ?? [];
    const reasons = errors.map((e) => e.reason).filter(Boolean);

    if (code === 403 && reasons.some((reason) => reason?.toLowerCase().includes('quota'))) {
      throw new CanonError({
        code: 'youtube_quota_exceeded',
        category: 'quota_exhausted',
        message: 'YouTube Data API quota was exceeded.',
        retryable: true,
        cause: error,
      });
    }

    throw new CanonError({
      code: 'youtube_api_unavailable',
      category: 'provider_upstream',
      message: 'YouTube Data API request failed.',
      retryable: true,
      cause: error,
    });
  }
}
