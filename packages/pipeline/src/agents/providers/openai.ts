import OpenAI from 'openai';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AgentProvider, ChatResponse, ChatTurn, ToolCallRequest } from './index';
import type { ToolDef } from '../tools/types';

export function createOpenAIProvider(apiKey: string): AgentProvider {
  if (!apiKey) {
    throw new Error('createOpenAIProvider: apiKey is required (set OPENAI_API_KEY in env).');
  }
  const client = new OpenAI({ apiKey });

  return {
    name: 'openai',
    // OpenAI prompt caching is automatic when the prefix matches a recent
    // request — no `cachedContent` handle needed. We accept the param for
    // signature parity with Gemini and ignore it.
    async chat({ modelId, messages, tools, cachedContent: _cachedContent }) {
      const openaiTools = tools.map((t: ToolDef<any, any>) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: zodToJsonSchema(t.input, { target: 'openApi3', $refStrategy: 'none' }) as Record<string, unknown>,
        },
      }));

      const openaiMessages = messages.map((m) => mapTurnToOpenAI(m));

      const completion = await client.chat.completions.create({
        model: modelId,
        messages: openaiMessages,
        tools: openaiTools.length > 0 ? openaiTools : undefined,
        tool_choice: openaiTools.length > 0 ? 'auto' : undefined,
      });

      const choice = completion.choices[0];
      if (!choice) throw new Error('OpenAI returned no choices');

      const toolCalls: ToolCallRequest[] = (choice.message.tool_calls ?? []).map((tc) => {
        if (tc.type !== 'function') throw new Error(`Unexpected tool_call type: ${tc.type}`);
        return {
          id: tc.id,
          name: tc.function.name,
          arguments: parseArguments(tc.function.arguments),
        };
      });

      return {
        message: {
          role: 'assistant',
          content: choice.message.content ?? '',
          toolCalls,
        },
        toolCalls,
        usage: {
          inputTokens: completion.usage?.prompt_tokens ?? 0,
          outputTokens: completion.usage?.completion_tokens ?? 0,
          // OpenAI returns prompt_tokens_details.cached_tokens for cache hits
          // (50% off pricing). 0 when no cache hit.
          cachedInputTokens:
            (completion.usage as { prompt_tokens_details?: { cached_tokens?: number } } | undefined)
              ?.prompt_tokens_details?.cached_tokens ?? 0,
        },
        rawId: completion.id,
      } satisfies ChatResponse;
    },
  };
}

export function mapTurnToOpenAI(m: ChatTurn): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  if (m.role === 'tool') {
    if (!m.toolCallId) throw new Error('ChatTurn role=tool requires toolCallId');
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: m.content || null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    };
  }
  if (m.role === 'system') return { role: 'system', content: m.content };
  if (m.role === 'user') return { role: 'user', content: m.content };
  return { role: 'assistant', content: m.content };
}

function parseArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (err) {
    // OpenAI sometimes returns malformed JSON for tool args — surface a clear error.
    throw new Error(`OpenAI tool_call.arguments was not valid JSON: ${(err as Error).message}. Raw: ${raw.slice(0, 200)}`);
  }
}
