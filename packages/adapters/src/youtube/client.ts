import { google, type youtube_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { AtlasError } from '@atlas/core';
import { z } from 'zod';

/**
 * NOTE: The YouTube client is keyed on a per-workspace OAuth token set, not
 * on global env. The workspace's refresh-token is decrypted upstream in the
 * auth layer; we accept only the plaintext values here.
 */
export const youtubeOAuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  /** Epoch ms at which the access token expires. */
  expiresAt: z.number().int().positive().optional(),
  /** OAuth scope grant, space-separated as issued. */
  scope: z.string().optional(),
  tokenType: z.string().default('Bearer'),
});

export type YouTubeOAuthTokens = z.infer<typeof youtubeOAuthTokensSchema>;

export const listChannelVideosInputSchema = z.object({
  channelId: z.string().min(1),
  pageToken: z.string().optional(),
  maxResults: z.number().int().min(1).max(50).default(50),
});

export type ListChannelVideosInput = z.infer<
  typeof listChannelVideosInputSchema
>;

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
    captionStatus?: 'unknown' | 'available' | 'auto-only' | 'none';
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

  listChannelVideos(
    input: ListChannelVideosInput,
  ): Promise<ListChannelVideosResult>;
  getCaptions(videoId: string): Promise<CaptionTrack[]>;
  /** Downloads a caption track as VTT text. */
  downloadCaption(captionId: string): Promise<string>;
  getVideoDetails(ids: string[]): Promise<VideoDetails[]>;
}

const notImplemented = (op: string): AtlasError =>
  new AtlasError({
    code: 'not_implemented',
    category: 'internal',
    message: `YouTubeClient.${op} is not implemented yet (lands in Epic 5).`,
  });

/**
 * Build a workspace-scoped YouTube Data API v3 client. The `oauth2Tokens`
 * must already be decrypted. Token refresh (401 → retry) is the caller's
 * responsibility in MVP; the `OAuth2Client` is exposed so Epic 5 can wire
 * refresh directly via googleapis built-ins.
 */
export const createYouTubeClient = (
  oauth2Tokens: YouTubeOAuthTokens,
): YouTubeClient => {
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
    async listChannelVideos(input) {
      listChannelVideosInputSchema.parse(input);
      throw notImplemented('listChannelVideos');
    },
    async getCaptions(videoId) {
      z.string().min(1).parse(videoId);
      throw notImplemented('getCaptions');
    },
    async downloadCaption(captionId) {
      z.string().min(1).parse(captionId);
      throw notImplemented('downloadCaption');
    },
    async getVideoDetails(ids) {
      z.array(z.string().min(1)).min(1).max(50).parse(ids);
      throw notImplemented('getVideoDetails');
    },
  };
};
