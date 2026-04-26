import { z } from 'zod';

export const v0ReviewVideoSchema = z.object({
  videoId: z.string().min(1),
  youtubeVideoId: z.string().min(1).nullable(),
  title: z.string().nullable(),
  durationSeconds: z.number().int().nullable(),
  summary: z.string().min(1),
  segmentCount: z.number().int().min(0),
});

export type V0ReviewVideo = z.infer<typeof v0ReviewVideoSchema>;

export const v0ReviewArtifactSchema = z.object({
  runId: z.string().min(1),
  workspaceId: z.string().min(1),
  generatedAt: z.string().datetime(),
  videoCount: z.number().int().min(0),
  totalSegmentCount: z.number().int().min(0),
  archiveSummary: z.string().min(1),
  themes: z.array(z.string().min(1)).max(8),
  videos: z.array(v0ReviewVideoSchema),
});

export type V0ReviewArtifact = z.infer<typeof v0ReviewArtifactSchema>;

export const synthModeSchema = z.enum(['deterministic', 'llm']);
export type SynthMode = z.infer<typeof synthModeSchema>;

export const ensureTranscriptsStageOutputSchema = z.object({
  transcripts: z.array(z.object({
    videoId: z.string().min(1),
    youtubeVideoId: z.string().min(1).nullable(),
    r2Key: z.string(),
    provider: z.enum(['youtube_timedtext', 'gpt-4o-mini-transcribe', 'existing']),
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

export const v0ReviewStageOutputSchema = z.object({
  r2Key: z.string().min(1),
  videoCount: z.number().int().min(0),
  totalSegmentCount: z.number().int().min(0),
  archiveSummary: z.string().min(1),
  themes: z.array(z.string().min(1)).max(8),
  synthMode: synthModeSchema.optional(),
});

export type V0ReviewStageOutput = z.infer<typeof v0ReviewStageOutputSchema>;

export const sourceReferenceV0Schema = z.object({
  videoId: z.string().min(1),
  youtubeVideoId: z.string().min(1).nullable(),
  title: z.string().nullable(),
  segmentId: z.string().min(1),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  quote: z.string().min(1),
  url: z.string().url().nullable(),
});

export type SourceReferenceV0 = z.infer<typeof sourceReferenceV0Schema>;

export const draftPagesV0SectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string().min(1),
  sourceVideoIds: z.array(z.string().min(1)).min(1),
  sourceRefs: z.array(sourceReferenceV0Schema).optional(),
  anchorQuotes: z.array(z.string().min(1).max(300)).max(3).optional(),
});

export type DraftPagesV0Section = z.infer<typeof draftPagesV0SectionSchema>;

export const draftPagesV0PageSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  sections: z.array(draftPagesV0SectionSchema).min(1),
});

export type DraftPagesV0Page = z.infer<typeof draftPagesV0PageSchema>;

export const draftPagesV0ArtifactSchema = z.object({
  runId: z.string().min(1),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  generatedAt: z.string().datetime(),
  pageCount: z.number().int().min(1),
  pages: z.array(draftPagesV0PageSchema).min(1),
});

export type DraftPagesV0Artifact = z.infer<typeof draftPagesV0ArtifactSchema>;

export const draftPagesV0StageOutputSchema = z.object({
  r2Key: z.string().min(1),
  pageCount: z.number().int().min(1),
  pageIds: z.array(z.string().min(1)).min(1),
  synthMode: synthModeSchema.optional(),
  /**
   * Share of sections that had a source-ref resolved via an LLM anchor-quote
   * match (not the deterministic first-segment fallback). 0.0 - 1.0. Only
   * meaningful when synthMode === 'llm'. Null when synthMode === 'deterministic'.
   */
  groundingRatio: z.number().min(0).max(1).nullable().optional(),
});

export type DraftPagesV0StageOutput = z.infer<typeof draftPagesV0StageOutputSchema>;

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
