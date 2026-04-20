import { google, type youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { CanonError } from '@creatorcanon/core';
import { z } from 'zod';

export const youtubeOAuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  /** Epoch ms at which the access token expires. */
  expiresAt: z.number().int().positive().optional(),
  /** OAuth scope grant, space-separated as issued. */
  scope: z.string().optional(),
  tokenType: z.string().optional().default('Bearer'),
});

/** Input type — tokenType is optional (defaults to Bearer). */
export type YouTubeOAuthTokens = z.input<typeof youtubeOAuthTokensSchema>;

export const listChannelVideosInputSchema = z.object({
  /** The uploads playlist ID from the channel's contentDetails. */
  uploadsPlaylistId: z.string().min(1),
  pageToken: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).default(50),
});

export type ListChannelVideosInput = z.infer<typeof listChannelVideosInputSchema>;

export interface OwnChannelInfo {
  id: string;
  title: string;
  handle?: string;
  description?: string;
  subscriberCount?: number;
  videoCount?: number;
  uploadsPlaylistId: string;
  country?: string;
  avatarUrl?: string;
  bannerUrl?: string;
}

export interface ListChannelVideosResult {
  videos: Array<{
    id: string;
    title: string;
    publishedAt: string;
    durationIso8601?: string;
    viewCount?: number;
    /** `public` | `unlisted` | `private`. */
    privacyStatus?: string;
    isShort?: boolean;
    isLivestream?: boolean;
    captionStatus?: 'unknown' | 'available' | 'auto_only' | 'none';
  }>;
  nextPageToken?: string;
  totalResults?: number;
}

export interface CaptionTrack {
  id: string;
  language: string;
  name: string;
  trackKind: string;
  isAuto: boolean;
  isDraft?: boolean;
}

export interface VideoDetails {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  durationIso8601?: string;
  viewCount?: number;
  likeCount?: number;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  topicIds?: string[];
}

export interface YouTubeClient {
  readonly raw: youtube_v3.Youtube;
  readonly oauth: OAuth2Client;

  /** Returns the authenticated user's own YouTube channel. */
  listOwnChannel(): Promise<OwnChannelInfo>;
  listChannelVideos(input: ListChannelVideosInput): Promise<ListChannelVideosResult>;
  getCaptions(videoId: string): Promise<CaptionTrack[]>;
  /** Downloads a caption track as VTT text. */
  downloadCaption(captionId: string): Promise<string>;
  getVideoDetails(ids: string[]): Promise<VideoDetails[]>;
}

/** Parse ISO 8601 duration (e.g. PT4M13S) to seconds. */
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0', 10) * 3600)
    + (parseInt(m[2] ?? '0', 10) * 60)
    + parseInt(m[3] ?? '0', 10);
}

function notImplemented(op: string): CanonError {
  return new CanonError({
    code: 'not_implemented',
    category: 'internal',
    message: `YouTubeClient.${op} is not implemented yet.`,
  });
}

/**
 * Build a workspace-scoped YouTube Data API v3 client. The `oauth2Tokens`
 * must already be decrypted. Token refresh is handled automatically by the
 * googleapis OAuth2Client when a refresh_token is present.
 */
export const createYouTubeClient = (oauth2Tokens: YouTubeOAuthTokens): YouTubeClient => {
  const tokens = youtubeOAuthTokensSchema.parse(oauth2Tokens);

  const oauth = new google.auth.OAuth2();
  oauth.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt,
    scope: tokens.scope,
    token_type: tokens.tokenType,
  });

  const raw = google.youtube({ version: 'v3', auth: oauth });

  return {
    raw,
    oauth,

    async listOwnChannel(): Promise<OwnChannelInfo> {
      const { data } = await raw.channels.list({
        part: ['snippet', 'contentDetails', 'statistics', 'brandingSettings'],
        mine: true,
      });

      const item = data.items?.[0];
      if (!item?.id) {
        throw new CanonError({
          code: 'not_found',
          category: 'provider_upstream',
          message: 'No YouTube channel found for this Google account.',
        });
      }

      const uploadsPlaylistId =
        item.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylistId) {
        throw new CanonError({
          code: 'not_found',
          category: 'provider_upstream',
          message: 'Could not determine uploads playlist for this channel.',
        });
      }

      return {
        id: item.id,
        title: item.snippet?.title ?? '',
        handle: item.snippet?.customUrl ?? undefined,
        description: item.snippet?.description ?? undefined,
        subscriberCount: item.statistics?.subscriberCount
          ? parseInt(item.statistics.subscriberCount, 10)
          : undefined,
        videoCount: item.statistics?.videoCount
          ? parseInt(item.statistics.videoCount, 10)
          : undefined,
        uploadsPlaylistId,
        country: item.snippet?.country ?? undefined,
        avatarUrl:
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.default?.url ??
          undefined,
        bannerUrl:
          item.brandingSettings?.image?.bannerExternalUrl ?? undefined,
      };
    },

    async listChannelVideos(input: ListChannelVideosInput): Promise<ListChannelVideosResult> {
      listChannelVideosInputSchema.parse(input);

      // Step 1: list playlist items to get video IDs.
      const { data: playlistData } = await raw.playlistItems.list({
        part: ['contentDetails', 'snippet'],
        playlistId: input.uploadsPlaylistId,
        maxResults: input.maxResults,
        pageToken: input.pageToken,
      });

      const items = playlistData.items ?? [];
      if (items.length === 0) {
        return { videos: [], nextPageToken: undefined, totalResults: 0 };
      }

      const videoIds = items
        .map((i) => i.contentDetails?.videoId)
        .filter((id): id is string => !!id);

      // Step 2: batch-fetch full details for these video IDs.
      const details = await this.getVideoDetails(videoIds);
      const detailMap = new Map(details.map((d) => [d.id, d]));

      const videos = items.flatMap((item) => {
        const videoId = item.contentDetails?.videoId;
        if (!videoId) return [];

        const detail = detailMap.get(videoId);
        const durationIso = detail?.durationIso8601;
        const durationSec = durationIso ? parseDuration(durationIso) : undefined;

        return [{
          id: videoId,
          title: detail?.title ?? item.snippet?.title ?? '',
          publishedAt:
            detail?.publishedAt ?? item.snippet?.publishedAt ?? new Date().toISOString(),
          durationIso8601: durationIso,
          viewCount: detail?.viewCount,
          privacyStatus: item.snippet?.title ? 'public' : 'unknown',
          isShort: durationSec !== undefined && durationSec <= 60,
          isLivestream: false,
          captionStatus: 'unknown' as const,
        }];
      });

      return {
        videos,
        nextPageToken: playlistData.nextPageToken ?? undefined,
        totalResults: playlistData.pageInfo?.totalResults ?? undefined,
      };
    },

    async getCaptions(videoId: string): Promise<CaptionTrack[]> {
      z.string().min(1).parse(videoId);

      const { data } = await raw.captions.list({
        part: ['snippet'],
        videoId,
      });

      return (data.items ?? []).map((item) => ({
        id: item.id ?? '',
        language: item.snippet?.language ?? '',
        name: item.snippet?.name ?? '',
        trackKind: item.snippet?.trackKind ?? 'standard',
        isAuto: item.snippet?.trackKind === 'asr',
        isDraft: item.snippet?.isDraft ?? false,
      }));
    },

    async downloadCaption(captionId: string): Promise<string> {
      z.string().min(1).parse(captionId);
      throw notImplemented('downloadCaption');
    },

    async getVideoDetails(ids: string[]): Promise<VideoDetails[]> {
      z.array(z.string().min(1)).min(1).max(50).parse(ids);

      const { data } = await raw.videos.list({
        part: ['snippet', 'contentDetails', 'statistics', 'topicDetails'],
        id: ids,
        maxResults: 50,
      });

      return (data.items ?? []).map((item) => ({
        id: item.id ?? '',
        title: item.snippet?.title ?? '',
        description: item.snippet?.description ?? '',
        publishedAt: item.snippet?.publishedAt ?? new Date().toISOString(),
        durationIso8601: item.contentDetails?.duration ?? undefined,
        viewCount: item.statistics?.viewCount
          ? parseInt(item.statistics.viewCount, 10)
          : undefined,
        likeCount: item.statistics?.likeCount
          ? parseInt(item.statistics.likeCount, 10)
          : undefined,
        tags: item.snippet?.tags ?? undefined,
        categoryId: item.snippet?.categoryId ?? undefined,
        defaultLanguage: item.snippet?.defaultLanguage ?? undefined,
        topicIds: item.topicDetails?.topicIds ?? undefined,
      }));
    },
  };
};
