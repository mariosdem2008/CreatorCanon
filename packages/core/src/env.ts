import { z } from 'zod';

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  DATABASE_CONNECT_TIMEOUT: z.coerce.number().positive().optional(),
  ARTIFACT_STORAGE: z.enum(['r2', 'local']).default('r2'),
  LOCAL_ARTIFACT_DIR: z.string().min(1).default('.local/artifacts'),
  REDIS_URL: z
    .string()
    .url()
    .refine(
      (v) => {
        try {
          const proto = new URL(v).protocol;
          return proto === 'https:' || proto === 'http:';
        } catch {
          return false;
        }
      },
      { message: 'REDIS_URL must be an Upstash REST URL (https:// or http://)' },
    ),

  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_BASE_URL: z.string().url(),

  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),

  YOUTUBE_OAUTH_CLIENT_ID: z.string().min(1),
  YOUTUBE_OAUTH_CLIENT_SECRET: z.string().min(1),

  OPENAI_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),

  STRIPE_SECRET_KEY: z.string().min(1),
  STRIPE_WEBHOOK_SECRET: z.string().min(1),

  RESEND_API_KEY: z.string().min(1).optional(),
  SENTRY_DSN: z.string().url().optional(),

  TRIGGER_SECRET_KEY: z.string().min(1).optional(),
  TRIGGER_PROJECT_ID: z.string().min(1).optional(),
  TRIGGER_API_URL: z.string().url().optional(),

  AUDIO_EXTRACTION_YTDLP_BIN: z.string().min(1).optional(),
  AUDIO_EXTRACTION_FFMPEG_BIN: z.string().min(1).optional(),
  AUDIO_EXTRACTION_CHALLENGE_RUNTIME_BIN: z.string().min(1).optional(),

  PIPELINE_DISPATCH_MODE: z.enum(['inprocess', 'trigger', 'worker']).default('inprocess'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_HUB_ROOT_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const parseServerEnv = (raw: NodeJS.ProcessEnv): ServerEnv => {
  const parsed = serverEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid server env:\n${issues}`);
  }
  return parsed.data;
};

export const parsePublicEnv = (
  raw: Partial<Record<keyof PublicEnv, string | undefined>>,
): PublicEnv => {
  const parsed = publicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid public env:\n${issues}`);
  }
  return parsed.data;
};
