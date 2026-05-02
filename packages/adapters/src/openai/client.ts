import OpenAI from 'openai';
import type { ServerEnv } from '@creatorcanon/core';
import { z } from 'zod';

const chatMessageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  name: z.string().optional(),
});

export const chatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  jsonSchema: z
    .object({
      name: z.string().min(1),
      schema: z.record(z.unknown()),
      strict: z.boolean().optional(),
    })
    .optional(),
  userInteraction: z.string().optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const chatCompletionSchema = z.object({
  id: z.string(),
  model: z.string(),
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
  text: z.string(),
  language: z.string().optional(),
  durationSeconds: z.number().nonnegative().optional(),
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
  embed(texts: string[]): Promise<number[][]>;
  chat(req: ChatRequest): Promise<ChatCompletion>;
  transcribe(audio: {
    bytes: Uint8Array;
    filename: string;
    language?: string;
  }): Promise<Transcript>;
}

export const createOpenAIClient = (env: ServerEnv): OpenAIClient => {
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for OpenAI API client calls.');
  }
  const raw = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    raw,

    async embed(texts) {
      z.array(z.string()).min(1).parse(texts);
      const res = await raw.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
      });
      return res.data.map((d) => d.embedding);
    },

    async chat(req) {
      const parsed = chatRequestSchema.parse(req);
      const res = await raw.chat.completions.create({
        model: parsed.model,
        messages: parsed.messages.map((m) => ({
          role: m.role as 'system' | 'user' | 'assistant',
          content: m.content,
        })),
        temperature: parsed.temperature,
        max_tokens: parsed.maxTokens,
        ...(parsed.jsonSchema
          ? {
              response_format: {
                type: 'json_schema' as const,
                json_schema: {
                  name: parsed.jsonSchema.name,
                  schema: parsed.jsonSchema.schema,
                  strict: parsed.jsonSchema.strict ?? true,
                },
              },
            }
          : {}),
      });
      const choice = res.choices[0];
      return {
        id: res.id,
        model: res.model,
        content: choice?.message?.content ?? '',
        finishReason: choice?.finish_reason ?? undefined,
        usage: res.usage
          ? {
              promptTokens: res.usage.prompt_tokens,
              completionTokens: res.usage.completion_tokens,
              totalTokens: res.usage.total_tokens,
            }
          : undefined,
      };
    },

    async transcribe(audio) {
      z.object({
        bytes: z.instanceof(Uint8Array),
        filename: z.string().min(1),
        language: z.string().optional(),
      }).parse(audio);

      const file = new File([audio.bytes], audio.filename);
      const res = await raw.audio.transcriptions.create({
        model: 'whisper-1',
        file,
        language: audio.language,
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
      });

      const verboseRes = res as unknown as {
        text: string;
        language?: string;
        duration?: number;
        segments?: Array<{ start: number; end: number; text: string }>;
      };

      return {
        text: verboseRes.text,
        language: verboseRes.language,
        durationSeconds: verboseRes.duration,
        segments: verboseRes.segments?.map((s) => ({
          startMs: Math.round(s.start * 1000),
          endMs: Math.round(s.end * 1000),
          text: s.text.trim(),
        })),
      };
    },
  };
};
