import OpenAI from 'openai';
import { AtlasError } from '@atlas/core';
import type { ServerEnv } from '@atlas/core';
import { z } from 'zod';

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  name: z.string().optional(),
});

export const chatRequestSchema = z.object({
  /** Model ID, e.g. `gpt-5.4-mini`, `gpt-5.4-nano`, `gpt-5.4`. */
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  /** Optional JSON schema the model must emit (OpenAI `response_format`). */
  jsonSchema: z
    .object({
      name: z.string().min(1),
      schema: z.record(z.unknown()),
      strict: z.boolean().optional(),
    })
    .optional(),
  /** User-interaction tag fed to the cost ledger on the caller side. */
  userInteraction: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatCompletionSchema = z.object({
  id: z.string(),
  model: z.string(),
  /** Text content of the primary choice. JSON-mode callers parse this. */
  content: z.string(),
  finishReason: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
});

export type ChatCompletion = z.infer<typeof chatCompletionSchema>;

export const transcriptSchema = z.object({
  /** Full flat text. */
  text: z.string(),
  /** Detected language (ISO 639-1). */
  language: z.string().optional(),
  /** Duration in seconds as reported by the provider. */
  durationSeconds: z.number().nonnegative().optional(),
  /** Word- or segment-level timing, if the provider returned it. */
  segments: z
    .array(
      z.object({
        startMs: z.number().int().nonnegative(),
        endMs: z.number().int().nonnegative(),
        text: z.string(),
      }),
    )
    .optional(),
});

export type Transcript = z.infer<typeof transcriptSchema>;

export interface OpenAIClient {
  readonly raw: OpenAI;
  /** Batch embed text inputs with `text-embedding-3-small`. */
  embed(texts: string[]): Promise<number[][]>;
  chat(req: ChatRequest): Promise<ChatCompletion>;
  /** Whisper / gpt-4o-mini-transcribe depending on config. */
  transcribe(audio: {
    /** Raw audio bytes, or a File-like handle the SDK can stream. */
    bytes: Uint8Array;
    /** File name hint (drives mime + extension). */
    filename: string;
    /** Optional language hint (ISO 639-1). */
    language?: string;
  }): Promise<Transcript>;
}

const notImplemented = (op: string): AtlasError =>
  new AtlasError({
    code: 'not_implemented',
    category: 'internal',
    message: `OpenAIClient.${op} is not implemented yet (lands in Epic 5).`,
  });

export const createOpenAIClient = (env: ServerEnv): OpenAIClient => {
  const raw = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    raw,
    async embed(texts) {
      z.array(z.string()).min(1).parse(texts);
      throw notImplemented('embed');
    },
    async chat(req) {
      chatRequestSchema.parse(req);
      throw notImplemented('chat');
    },
    async transcribe(audio) {
      z.object({
        bytes: z.instanceof(Uint8Array),
        filename: z.string().min(1),
        language: z.string().optional(),
      }).parse(audio);
      throw notImplemented('transcribe');
    },
  };
};
