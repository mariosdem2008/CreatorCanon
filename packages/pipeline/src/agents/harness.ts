import { artifactKey, type R2Client } from '@creatorcanon/adapters';
import { getDb } from '@creatorcanon/db';
import type { AgentProvider, ChatTurn } from './providers';
import type { ToolDef, ToolCtx } from './tools/types';
import { listTools } from './tools/registry';
import { StopController, DEFAULT_STOP_CAPS, type StopCaps, type StopReason } from './stop-conditions';
import { tokenCostCents } from './cost-tracking';

export interface RunAgentInput {
  runId: string;
  workspaceId: string;
  agent: string;
  modelId: string;
  provider: AgentProvider;
  /** R2 client used to persist the transcript. Required. */
  r2: R2Client;
  /** Tool names the agent is allowed to call (subset of registered tools). */
  tools: string[];
  systemPrompt: string;
  userMessage: string;
  /** Override caps for this run; merged with `DEFAULT_STOP_CAPS`. */
  caps?: Partial<StopCaps>;
}

export interface RunAgentSummary {
  status: 'succeeded' | 'failed';
  stopReason?: StopReason | 'no_tool_calls' | 'tool_error';
  /** Number of individual tool invocations dispatched (not provider calls). */
  toolCallCount: number;
  findingCount: number;
  costCents: number;
  durationMs: number;
  transcriptR2Key: string;
}

const PROPOSE_TOOL_RESULT_HAS_FINDING_ID = (result: unknown): boolean =>
  typeof result === 'object' && result !== null
    && 'ok' in result && (result as { ok: unknown }).ok === true
    && 'findingId' in result;

export async function runAgent(input: RunAgentInput): Promise<RunAgentSummary> {
  const caps: StopCaps = { ...DEFAULT_STOP_CAPS, ...(input.caps ?? {}) };
  const stop = new StopController(caps);

  const tools = listTools(input.tools);
  const ctx: ToolCtx = {
    runId: input.runId,
    workspaceId: input.workspaceId,
    agent: input.agent,
    model: input.modelId,
    db: getDb(),
    r2: input.r2,
  };

  const messages: ChatTurn[] = [
    { role: 'system', content: input.systemPrompt },
    { role: 'user', content: input.userMessage },
  ];
  const transcript: ChatTurn[] = [...messages];

  let warnedSoftCap = false;
  let stopReason: RunAgentSummary['stopReason'];
  let findingCount = 0;
  let costCents = 0;
  // Count individual tool invocations dispatched (not provider calls).
  let toolCallCount = 0;

  while (true) {
    if (stop.shouldWarn() && !warnedSoftCap) {
      const snap = stop.snapshot();
      const remaining = caps.maxCalls - snap.calls;
      const budgetLeft = (caps.maxCostCents - snap.costCents) / 100;
      const warnTurn: ChatTurn = {
        role: 'system',
        content: `You have ${Math.max(0, remaining)} tool calls remaining and $${budgetLeft.toFixed(2)} budget left. Submit any final findings now.`,
      };
      messages.push(warnTurn);
      transcript.push(warnTurn);
      warnedSoftCap = true;
    }

    const response = await input.provider.chat({ modelId: input.modelId, messages, tools });
    const callCost = tokenCostCents(input.modelId, response.usage.inputTokens, response.usage.outputTokens);
    costCents += callCost;
    stop.recordCall(callCost);

    transcript.push(response.message);
    messages.push(response.message);

    if (response.toolCalls.length === 0) {
      stopReason = 'no_tool_calls';
      break;
    }

    for (const call of response.toolCalls) {
      toolCallCount += 1;

      const tool = tools.find((t) => t.name === call.name);
      if (!tool) {
        const errTurn: ChatTurn = {
          role: 'tool',
          content: JSON.stringify({ ok: false, error: `Unknown or disallowed tool: ${call.name}` }),
          toolCallId: call.id,
          name: call.name,
        };
        messages.push(errTurn);
        transcript.push(errTurn);
        continue;
      }

      const parsed = tool.input.safeParse(call.arguments);
      if (!parsed.success) {
        const errTurn: ChatTurn = {
          role: 'tool',
          content: JSON.stringify({ ok: false, error: `Invalid arguments: ${parsed.error.message}` }),
          toolCallId: call.id,
          name: call.name,
        };
        messages.push(errTurn);
        transcript.push(errTurn);
        continue;
      }

      try {
        const result = await tool.handler(parsed.data, ctx);
        if (PROPOSE_TOOL_RESULT_HAS_FINDING_ID(result)) {
          findingCount += 1;
        }
        const turn: ChatTurn = {
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: call.id,
          name: call.name,
        };
        messages.push(turn);
        transcript.push(turn);
      } catch (err) {
        const turn: ChatTurn = {
          role: 'tool',
          content: JSON.stringify({ ok: false, error: `Tool error: ${(err as Error).message}` }),
          toolCallId: call.id,
          name: call.name,
        };
        messages.push(turn);
        transcript.push(turn);
      }
    }

    const stopCheck = stop.shouldStop();
    if (stopCheck.stop) {
      stopReason = stopCheck.reason;
      break;
    }
  }

  // Persist transcript to R2.
  const transcriptR2Key = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'agents',
    name: `${input.agent}/transcript.json`,
  });
  await input.r2.putObject({
    key: transcriptR2Key,
    body: new TextEncoder().encode(JSON.stringify(transcript)),
    contentType: 'application/json',
  });

  return {
    status: 'succeeded',
    stopReason,
    toolCallCount,
    findingCount,
    costCents,
    durationMs: stop.snapshot().elapsedMs,
    transcriptR2Key,
  };
}
