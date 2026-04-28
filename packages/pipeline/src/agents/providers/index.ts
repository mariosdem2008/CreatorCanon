import type { ToolDef } from '../tools/types';

export type ProviderName = 'openai' | 'gemini';

/**
 * One turn in the agent's conversation. Mirrors OpenAI's chat-completion message
 * shape, with role='tool' for tool results and `toolCalls` on assistant turns.
 */
export interface ChatTurn {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** For role='tool': the tool call this is a response to. */
  toolCallId?: string;
  /** For role='assistant': the tool calls the model wants the harness to execute. */
  toolCalls?: ToolCallRequest[];
  /** For role='tool': the tool's name (Gemini requires this). */
  name?: string;
}

export interface ToolCallRequest {
  /** Provider-assigned call ID (used to match tool result back to the call). */
  id: string;
  name: string;
  /** Already-parsed JSON arguments. */
  arguments: unknown;
}

export interface ChatResponse {
  message: ChatTurn;
  /** Mirror of `message.toolCalls`; empty when the agent is done (no more tool calls). */
  toolCalls: ToolCallRequest[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    /**
     * Subset of inputTokens that hit the provider's prompt cache.
     * 0 (or undefined) when the call wasn't cached. Always <= inputTokens.
     * - OpenAI: surfaced from completion.usage.prompt_tokens_details.cached_tokens
     * - Gemini: surfaced from response.usageMetadata.cachedContentTokenCount
     */
    cachedInputTokens?: number;
  };
  /** Provider-assigned response ID for transcript correlation. */
  rawId: string;
}

export interface AgentProvider {
  name: ProviderName;
  chat(input: {
    modelId: string;
    messages: ChatTurn[];
    tools: ToolDef<any, any>[];
    /**
     * Optional Gemini context cache name (e.g. "cachedContents/abc123"). The
     * Gemini provider attaches it to the request; OpenAI ignores it (its
     * caching is automatic on prefix match — no explicit cache name needed).
     */
    cachedContent?: string;
  }): Promise<ChatResponse>;
}
