import { z } from 'zod';

export const synthModeSchema = z.enum(['deterministic', 'llm']);
export type SynthMode = z.infer<typeof synthModeSchema>;

export const ensureTranscriptsStageOutputSchema = z.object({
  transcripts: z.array(z.object({
    videoId: z.string().min(1),
    youtubeVideoId: z.string().min(1).nullable(),
    r2Key: z.string(),
    provider: z.enum(['youtube_captions', 'gpt-4o-mini-transcribe', 'existing']),
    wordCount: z.number().int().min(0),
    language: z.string().min(1),
    skipped: z.boolean(),
    skipReason: z.string().optional(),
  })),
  fetchedCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  providerCounts: z.record(z.string(), z.number().int().min(0)).optional(),
  audioFallback: z.object({
    usedCount: z.number().int().min(0),
    extractedCount: z.number().int().min(0),
    reusedCount: z.number().int().min(0),
    failedCount: z.number().int().min(0),
  }).optional(),
});

export type EnsureTranscriptsStageOutput = z.infer<typeof ensureTranscriptsStageOutputSchema>;

export const releaseManifestV0BlockSchema = z.object({
  type: z.string().min(1),
  id: z.string().min(1),
  content: z.unknown(),
  citations: z.array(z.string()).optional(),
});

export type ReleaseManifestV0Block = z.infer<typeof releaseManifestV0BlockSchema>;

export const releaseManifestV0PageSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().nullable(),
  position: z.number().int().min(0),
  blocks: z.array(releaseManifestV0BlockSchema),
});

export type ReleaseManifestV0Page = z.infer<typeof releaseManifestV0PageSchema>;

export const releaseManifestV0Schema = z.object({
  schemaVersion: z.literal('release_manifest_v0'),
  hubId: z.string().min(1),
  releaseId: z.string().min(1),
  projectId: z.string().min(1),
  runId: z.string().min(1),
  generatedAt: z.string().datetime(),
  title: z.string().min(1),
  subdomain: z.string().min(1),
  pages: z.array(releaseManifestV0PageSchema).min(1),
});

export type ReleaseManifestV0 = z.infer<typeof releaseManifestV0Schema>;
