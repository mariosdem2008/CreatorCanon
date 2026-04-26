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
  usage: { inputTokens: number; outputTokens: number };
  /** Provider-assigned response ID for transcript correlation. */
  rawId: string;
}

export interface AgentProvider {
  name: ProviderName;
  chat(input: {
    modelId: string;
    messages: ChatTurn[];
    tools: ToolDef<any, any>[];
  }): Promise<ChatResponse>;
}
