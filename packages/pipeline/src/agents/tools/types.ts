import type { z } from 'zod';
import type { getDb } from '@creatorcanon/db';
import type { createR2Client } from '@creatorcanon/adapters';

export interface ToolCtx {
  runId: string;
  workspaceId: string;
  agent: string;     // e.g. 'topic_spotter'
  model: string;     // e.g. 'gpt-5.5'
  db: ReturnType<typeof getDb>;
  r2: ReturnType<typeof createR2Client>;
}

export interface ToolDef<TInput, TOutput> {
  name: string;
  description: string;
  input: z.ZodType<TInput>;
  output: z.ZodType<TOutput>;
  handler: (input: TInput, ctx: ToolCtx) => Promise<TOutput>;
}

export type ToolResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };
