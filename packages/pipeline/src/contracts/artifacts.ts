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

