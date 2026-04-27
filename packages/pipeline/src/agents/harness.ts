import * as Sentry from '@sentry/node';
import { artifactKey, type R2Client } from '@creatorcanon/adapters';
import { getDb } from '@creatorcanon/db';
import type { AgentProvider, ChatTurn } from './providers';
import type { ToolDef, ToolCtx } from './tools/types';
import { listTools } from './tools/registry';
import { StopController, DEFAULT_STOP_CAPS, type StopCaps, type StopReason } from './stop-conditions';
import { tokenCostCents } from './cost-tracking';

const PII_EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PII_SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;

export function stripPiiText(s: string): string {
  return s.replace(PII_EMAIL_RE, '<email>').replace(PII_SSN_RE, '<id>');
}

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

/**
 * Detect transient provider errors that benefit from a short backoff retry.
 * Covers OpenAI / Gemini / Anthropic shapes — message-substring match is
 * coarse but works across SDK versions without coupling to error classes.
 */
function isTransientProviderError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b429\b/.test(msg) ||
    /\b5\d\d\b/.test(msg) ||
    /Service Unavailable/i.test(msg) ||
    /Too Many Requests/i.test(msg) ||
    /high demand/i.test(msg) ||
    /timed out/i.test(msg) ||
    /ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(msg)
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Wrap a provider.chat() call with bounded retry on transient errors.
 * Attempts 3x with 2s, 4s, 8s backoff (max 14s total per call). Non-transient
 * errors (auth, schema, malformed JSON) re-throw on the first attempt.
 */
async function chatWithRetry<T>(fn: () => Promise<T>, agent: string, modelId: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isTransientProviderError(err) || attempt === 3) throw err;
      const wait = 1000 * Math.pow(2, attempt); // 2s, 4s, 8s
      const reason = err instanceof Error ? err.message.slice(0, 120) : String(err).slice(0, 120);
      // eslint-disable-next-line no-console
      console.warn(`[harness] ${agent}/${modelId} transient error (attempt ${attempt}/3, sleeping ${wait}ms): ${reason}`);
      await sleep(wait);
    }
  }
  throw lastErr;
}


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

  const transcriptR2Key = artifactKey({
    workspaceId: input.workspaceId,
    runId: input.runId,
    stage: 'agents',
    name: `${input.agent}/transcript.json`,
  });

  let warnedSoftCap = false;
  let stopReason: RunAgentSummary['stopReason'];
  let findingCount = 0;
  let costCents = 0;
  // Count individual tool invocations dispatched (not provider calls).
  let toolCallCount = 0;

  try {
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

    const response = await chatWithRetry(
      () => input.provider.chat({ modelId: input.modelId, messages, tools }),
      input.agent,
      input.modelId,
    );
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
  } catch (err) {
    const rawTranscript = JSON.stringify(transcript);
    const sanitized = stripPiiText(rawTranscript);
    try {
      Sentry.captureException(err, {
        tags: { runId: input.runId, agent: input.agent },
        extra: {
          transcriptR2Key,
          transcriptPreview: sanitized.slice(0, 2000),
          modelId: input.modelId,
        },
      });
    } catch { /* Sentry not initialized — ignore */ }
    throw err;
  }
}
