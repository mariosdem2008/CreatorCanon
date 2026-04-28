import {
  GoogleGenerativeAI,
  type FunctionDeclaration,
  type GenerateContentRequest,
  type Content,
  type Part,
} from '@google/generative-ai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentProvider, ChatResponse, ChatTurn, ToolCallRequest } from './index';
import type { ToolDef } from '../tools/types';

/**
 * Gemini's function-calling API rejects several standard JSON Schema fields
 * that zodToJsonSchema emits (notably `additionalProperties`, which `.strict()`
 * Zod objects produce). Recursively strip them to keep the schema portable.
 *
 * Documented Gemini-incompatible fields: additionalProperties, $schema,
 * patternProperties, allOf/anyOf/oneOf at root, exclusiveMinimum/Maximum,
 * minLength/maxLength on non-string types.
 *
 * We're conservative: strip only the fields known to crash, preserve the rest.
 */
function sanitizeForGemini(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeForGemini);
  if (schema === null || typeof schema !== 'object') return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    // Drop top-level meta + Gemini-rejected fields.
    if (k === 'additionalProperties' || k === '$schema' || k === 'patternProperties') continue;
    out[k] = sanitizeForGemini(v);
  }
  return out;
}

/**
 * Create a Gemini context cache containing the static prefix (system prompt
 * + cached user message). Returns the cache name (e.g. "cachedContents/abc123")
 * that subsequent generateContent calls can attach via the `cachedContent`
 * field. Cache lives for ttlSeconds (default 1h, well within a single run's
 * wall time).
 *
 * Use case: video_intelligence sends the same channel-profile prefix to ~20
 * separate per-video calls. Caching the prefix once cuts input cost for the
 * cached portion to 25% of fresh per the published Gemini pricing.
 *
 * Implemented via raw fetch because @google/generative-ai 0.21 doesn't
 * expose a typed cachedContents.create — the v1beta REST endpoint is used
 * directly. Cache create failures should be caught by the caller and treated
 * as non-fatal: callers can fall back to non-cached calls.
 */
export async function createGeminiCache(input: {
  apiKey: string;
  modelId: string;
  systemInstruction: string;
  cachedUserMessage: string;
  ttlSeconds?: number;
}): Promise<{ cacheName: string }> {
  if (!input.apiKey) throw new Error('createGeminiCache: apiKey required');
  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(input.apiKey)}`;
  const body = {
    model: `models/${input.modelId}`,
    systemInstruction: { role: 'system', parts: [{ text: input.systemInstruction }] },
    contents: [{ role: 'user', parts: [{ text: input.cachedUserMessage }] }],
    ttl: `${input.ttlSeconds ?? 3600}s`,
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`createGeminiCache failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { name?: string };
  if (!json.name) throw new Error('createGeminiCache returned no name');
  return { cacheName: json.name };
}

export function createGeminiProvider(apiKey: string): AgentProvider {
  if (!apiKey) {
    throw new Error('createGeminiProvider: apiKey is required (set GEMINI_API_KEY in env).');
  }
  const client = new GoogleGenerativeAI(apiKey);

  return {
    name: 'gemini',
    async chat({ modelId, messages, tools, cachedContent }) {
      const model = client.getGenerativeModel({ model: modelId });

      const functionDeclarations: FunctionDeclaration[] = tools.map((t: ToolDef<any, any>) => ({
        name: t.name,
        description: t.description,
        parameters: sanitizeForGemini(
          zodToJsonSchema(t.input, { target: 'openApi3', $refStrategy: 'none' }),
        ) as any,
      }));

      const { systemInstruction, contents } = mapTurnsToGemini(messages);

      const request: GenerateContentRequest = {
        contents,
        ...(systemInstruction ? { systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] } } : {}),
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
        // Attach a Gemini context cache when the caller created one upstream
        // (e.g. video_intelligence pre-creates a cache for the channel-profile
        // prefix and reuses it across all per-video calls).
        ...(cachedContent ? { cachedContent } : {}),
      };

      const result = await model.generateContent(request);
      const candidate = result.response.candidates?.[0];
      if (!candidate) throw new Error('Gemini returned no candidates');

      const toolCalls: ToolCallRequest[] = [];
      let textContent = '';
      let callCounter = 0;

      for (const part of candidate.content.parts) {
        if ('functionCall' in part && part.functionCall) {
          toolCalls.push({
            id: `gemini_call_${Date.now()}_${callCounter++}`,
            name: part.functionCall.name,
            arguments: part.functionCall.args ?? {},
          });
        } else if ('text' in part && part.text) {
          textContent += part.text;
        }
      }

      return {
        message: { role: 'assistant', content: textContent, toolCalls },
        toolCalls,
        usage: {
          inputTokens: result.response.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: result.response.usageMetadata?.candidatesTokenCount ?? 0,
          // Gemini context caching: subset of promptTokenCount that came
          // from the cache. 0 when no cache attached.
          cachedInputTokens:
            (result.response.usageMetadata as { cachedContentTokenCount?: number } | undefined)
              ?.cachedContentTokenCount ?? 0,
        },
        rawId: `gemini_${Date.now()}`,
      } satisfies ChatResponse;
    },
  };
}

/**
 * Maps our `ChatTurn[]` to Gemini's `contents` array. System prompts are
 * concatenated and returned separately (Gemini takes them via `systemInstruction`,
 * not as a content turn).
 */
export function mapTurnsToGemini(messages: ChatTurn[]): { systemInstruction: string; contents: Content[] } {
  const systemParts: string[] = [];
  const contents: Content[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === 'tool') {
      // Gemini uses role 'function' for tool results.
      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: m.name ?? 'unknown_tool',
            response: { content: m.content },
          },
        }],
      });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
      const parts: Part[] = m.toolCalls.map((tc) => ({
        functionCall: { name: tc.name, args: (tc.arguments as Record<string, unknown>) ?? {} },
      }));
      // Add any text content as an additional part if non-empty.
      if (m.content) parts.unshift({ text: m.content });
      contents.push({ role: 'model', parts });
      continue;
    }
    // Plain user or assistant text.
    contents.push({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    });
  }

  return { systemInstruction: systemParts.join('\n\n'), contents };
}
