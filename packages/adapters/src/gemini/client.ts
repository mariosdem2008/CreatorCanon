import { GoogleGenerativeAI } from '@google/generative-ai';
import { AtlasError } from '@atlas/core';
import type { ServerEnv } from '@atlas/core';
import { z } from 'zod';

/**
 * Maps a Gemini model-reported confidence score (0–1) to the DB enum used by
 * `frame_observation.confidence` ('strong' | 'moderate' | 'weak'). Call this
 * when writing FrameObservation.confidence to the database in Epic 5.
 */
export const confidenceBucket = (
  score: number,
): 'strong' | 'moderate' | 'weak' => {
  if (score >= 0.75) return 'strong';
  if (score >= 0.4) return 'moderate';
  return 'weak';
};

/**
 * Structured visual observation emitted by the Gemini visual lane.
 * Matches the contract pinned in plan/03-target-architecture.md (§ Gemini
 * visual lane — architectural notes) and plan/05-pipeline-plan.md (Stage 8).
 *
 * Note: `confidence` is a 0–1 float as emitted by the model. When writing to
 * the DB (`frame_observation.confidence` is a string enum), call
 * `confidenceBucket(observation.confidence)` to convert.
 *
 * Note: `entities` mirrors the DB `frame_observation.entities` jsonb shape.
 */
export const frameObservationSchema = z.object({
  /** Observation start timestamp inside the source video, in ms. */
  start_ms: z.number().int().nonnegative(),
  /** Observation end timestamp inside the source video, in ms. */
  end_ms: z.number().int().nonnegative(),
  observation_type: z.enum([
    'slide',
    'screen',
    'chart',
    'whiteboard',
    'code',
    'ui',
    'diagram',
    'infographic',
    'other',
  ]),
  /** Short human title (≤ 200 chars). */
  title: z.string().min(1).max(200),
  /** 1–3 sentence description of what the frame shows. */
  summary: z.string().min(1),
  /** OCR'd or directly-read on-screen text; empty string if none. */
  text_extracted: z.string(),
  /**
   * Salient named entities keyed by role. Mirrors `frame_observation.entities`
   * jsonb shape so callers can store without transformation.
   */
  entities: z
    .object({
      concepts: z.array(z.string()).optional(),
      numbers: z.array(z.union([z.string(), z.number()])).optional(),
      labels: z.array(z.string()).optional(),
    })
    .default({}),
  /** Model self-reported confidence in [0, 1]. Convert with `confidenceBucket` before DB insert. */
  confidence: z.number().min(0).max(1),
});

export type FrameObservation = z.infer<typeof frameObservationSchema>;

const frameObservationsEnvelopeSchema = z.object({
  observations: z.array(frameObservationSchema),
});

export type FrameObservationsEnvelope = z.infer<
  typeof frameObservationsEnvelopeSchema
>;

const analyzeVideoDirectSchema = z.object({
  /** File handle previously uploaded via the Gemini Files API. */
  videoFileHandle: z.object({
    /** `files/<id>` URI returned by the Files API. */
    uri: z.string().min(1),
    mimeType: z.string().min(1),
  }),
  /** Prompt driving structured observation extraction. */
  prompt: z.string().min(1),
  /** Optional transcript context fed to Gemini as grounding. */
  transcriptContext: z.string().optional(),
  /**
   * JSON schema the model must emit. Callers usually pass
   * `frameObservationsEnvelopeSchema` converted to JSON schema.
   */
  schema: z.record(z.unknown()),
  /** Per-video hard cap enforced by the cost ledger layer. */
  maxOutputTokens: z.number().int().positive().optional(),
});

export type AnalyzeVideoDirectInput = z.infer<typeof analyzeVideoDirectSchema>;

export const sampledFrameSchema = z.object({
  /** Timestamp of this frame inside the source video, in ms. */
  timestamp_ms: z.number().int().nonnegative(),
  /** JPEG bytes of the frame. */
  bytes: z.instanceof(Uint8Array),
  /** Optional frame-level hint (e.g. pre-OCR text). */
  hint: z.string().optional(),
});

export type SampledFrame = z.infer<typeof sampledFrameSchema>;

const analyzeFramesSampledSchema = z.object({
  frames: z.array(sampledFrameSchema).min(1),
  prompt: z.string().min(1),
  transcriptContext: z.string().optional(),
  schema: z.record(z.unknown()),
  maxOutputTokens: z.number().int().positive().optional(),
});

export type AnalyzeFramesSampledInput = z.infer<
  typeof analyzeFramesSampledSchema
>;

export interface GeminiClientOptions {
  /**
   * Multimodal model name. Defaults to `gemini-2.0-pro`; falls back to
   * `gemini-1.5-pro` when longer 1M-token context is needed. The adapter
   * never hard-codes this inside a method — callers pick per-video.
   */
  model?: string;
}

export interface GeminiClient {
  readonly raw: GoogleGenerativeAI;
  readonly defaultModel: string;

  /**
   * Direct-video mode: Gemini ingests a file uploaded via the Files API and
   * emits structured FrameObservation[]. Preferred for videos ≤ 30 min.
   */
  analyzeVideoDirect(
    input: AnalyzeVideoDirectInput,
  ): Promise<FrameObservation[]>;

  /**
   * Sampled-frames mode: caller ffmpeg-extracts keyframes at adaptive FPS
   * and hands Gemini an inline multimodal request. Used for longer content
   * or when direct upload hits size caps.
   */
  analyzeFramesSampled(
    input: AnalyzeFramesSampledInput,
  ): Promise<FrameObservation[]>;
}

const notImplemented = (op: string): AtlasError =>
  new AtlasError({
    code: 'not_implemented',
    category: 'internal',
    message: `GeminiClient.${op} is not implemented yet (lands in Epic 5).`,
  });

/**
 * Build a Gemini client exposing both input modes described in
 * plan/03-target-architecture.md (§ Gemini visual lane).
 *
 * The default model is `gemini-2.0-pro`; callers may override per-call by
 * binding a different model via `options.model`.
 */
export const createGeminiClient = (
  env: ServerEnv,
  options: GeminiClientOptions = {},
): GeminiClient => {
  const raw = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  const defaultModel = options.model ?? 'gemini-2.0-pro';

  return {
    raw,
    defaultModel,
    async analyzeVideoDirect(input) {
      analyzeVideoDirectSchema.parse(input);
      throw notImplemented('analyzeVideoDirect');
    },
    async analyzeFramesSampled(input) {
      analyzeFramesSampledSchema.parse(input);
      throw notImplemented('analyzeFramesSampled');
    },
  };
};
