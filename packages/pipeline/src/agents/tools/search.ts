import { z } from 'zod';
import { sql } from '@creatorcanon/db';
import type { ToolDef } from './types';

const matchSchema = z.object({
  segmentId: z.string(),
  videoId: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
  text: z.string(),
  score: z.number(),
});

const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','how',
  'i','if','in','into','is','it','its','of','on','or','that','the',
  'their','them','they','this','to','was','we','what','when','where',
  'which','who','why','will','with','you','your',
]);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]{2,}/g) ?? []).filter((t) => !STOP_WORDS.has(t));
}

export const searchSegmentsTool: ToolDef<
  { query: string; videoIds?: string[]; topK?: number },
  z.infer<typeof matchSchema>[]
> = {
  name: 'searchSegments',
  description:
    'Hybrid (BM25 today; vector search pending) full-text search over segments in this run. ' +
    'Returns up to topK (default 20, max 50) matches ranked by relevance.',
  input: z.object({
    query: z.string().min(2),
    videoIds: z.array(z.string()).optional(),
    topK: z.number().int().min(1).optional(),
  }).strict(),
  output: z.array(matchSchema),
  handler: async ({ query, videoIds, topK }, ctx) => {
    const k = Math.max(1, Math.min(topK ?? 20, 50));
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    // tsquery: every token as a prefix-match, AND-combined.
    // The `${tsQuery}` expression below produces a Drizzle bind parameter, not inline SQL.
    // The regex tokenizer is a quality filter, not a security boundary — DO NOT switch
    // to `sql.raw(tsQuery)` thinking the tokenizer is sufficient protection.
    const tsQuery = tokens.map((t) => `${t}:*`).join(' & ');

    const hasVideoFilter = videoIds && videoIds.length > 0;

    // Build optional video_id IN (...) clause. Using sql.join with individual
    // sql`${id}` fragments ensures each value is a separate bind parameter —
    // safe against injection and compatible with postgres-js.
    const videoFilterClause = hasVideoFilter
      ? sql`AND video_id IN (${sql.join(videoIds!.map((id) => sql`${id}`), sql`, `)})`
      : sql``;

    let result;
    try {
      result = await ctx.db.execute(sql`
        SELECT
          id,
          video_id,
          start_ms,
          end_ms,
          text,
          ts_rank(to_tsvector('english', text), to_tsquery('english', ${tsQuery})) AS score
        FROM segment
        WHERE run_id = ${ctx.runId}
          AND workspace_id = ${ctx.workspaceId}
          ${videoFilterClause}
          AND to_tsvector('english', text) @@ to_tsquery('english', ${tsQuery})
        ORDER BY score DESC
        LIMIT ${k}
      `);
    } catch (err) {
      // Postgres tsquery syntax errors should yield empty results, not crash the agent.
      // Codes: 22P02 invalid_text_representation, 42601 syntax_error.
      const code = (err as { code?: string }).code;
      if (code === '22P02' || code === '42601') {
        console.warn(`searchSegments: tsquery error (${code}) for query "${query}"; returning []`);
        return [];
      }
      throw err;
    }

    type Row = { id: string; video_id: string; start_ms: number; end_ms: number; text: string; score: number | string };
    // With postgres-js driver, db.execute returns the row array directly.
    // With node-postgres it returns { rows: [...] }. Handle both defensively.
    const rows = (result as { rows?: Row[] }).rows ?? (result as unknown as Row[]);
    return rows.map((r) => ({
      segmentId: r.id,
      videoId: r.video_id,
      startMs: typeof r.start_ms === 'string' ? Number(r.start_ms) : r.start_ms,
      endMs: typeof r.end_ms === 'string' ? Number(r.end_ms) : r.end_ms,
      text: r.text,
      score: typeof r.score === 'string' ? Number(r.score) : r.score,
    }));
  },
};
