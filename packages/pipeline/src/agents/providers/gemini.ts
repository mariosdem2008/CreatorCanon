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

export function createGeminiProvider(apiKey: string): AgentProvider {
  if (!apiKey) {
    throw new Error('createGeminiProvider: apiKey is required (set GEMINI_API_KEY in env).');
  }
  const client = new GoogleGenerativeAI(apiKey);

  return {
    name: 'gemini',
    async chat({ modelId, messages, tools }) {
      const model = client.getGenerativeModel({ model: modelId });

      const functionDeclarations: FunctionDeclaration[] = tools.map((t: ToolDef<any, any>) => ({
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.input, { target: 'openApi3', $refStrategy: 'none' }) as any,
      }));

      const { systemInstruction, contents } = mapTurnsToGemini(messages);

      const request: GenerateContentRequest = {
        contents,
        ...(systemInstruction ? { systemInstruction: { role: 'system', parts: [{ text: systemInstruction }] } } : {}),
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
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
