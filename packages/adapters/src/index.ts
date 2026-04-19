// R2
export { createR2Client } from './r2/client';
export type {
  R2Client,
  R2PutObjectInput,
  R2GetObjectOutput,
  R2SignedUrlInput,
  R2HeadObjectOutput,
  R2ListObjectsOutput,
} from './r2/client';
export {
  artifactKey,
  visualAssetKey,
  releaseKey,
  transcriptKey,
} from './r2/keys';

// Redis
export { createRedisClient } from './redis/client';
export type { RedisClient } from './redis/client';
export { createRateLimiter } from './redis/rate-limit';
export type { RateLimiter, RateLimitResult } from './redis/rate-limit';

// OpenAI
export { createOpenAIClient } from './openai/client';
export type {
  OpenAIClient,
  ChatRequest,
  ChatCompletion,
  Transcript,
} from './openai/client';

// Gemini
export { createGeminiClient } from './gemini/client';
export type {
  GeminiClient,
  GeminiClientOptions,
  FrameObservation,
  AnalyzeVideoDirectInput,
  AnalyzeFramesSampledInput,
  SampledFrame,
} from './gemini/client';
export { frameObservationSchema } from './gemini/client';

// Stripe
export { createStripeClient } from './stripe/client';
export type {
  StripeAdapterClient,
  CreateCheckoutSessionParams,
  CheckoutSessionResult,
  WebhookHandleResult,
} from './stripe/client';

// YouTube
export { createYouTubeClient } from './youtube/client';
export type {
  YouTubeClient,
  YouTubeOAuthTokens,
  OwnChannelInfo,
  ListChannelVideosInput,
  ListChannelVideosResult,
  CaptionTrack,
  VideoDetails,
} from './youtube/client';

// Resend
export { createResendClient } from './resend/client';
export type {
  ResendAdapterClient,
  SendEmailInput,
  SendEmailResult,
  ReactEmailElement,
} from './resend/client';
