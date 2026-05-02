import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

import type { AgentProvider, ChatResponse, ChatTurn, ToolCallRequest } from './index';
import type { ToolDef } from '../tools/types';

const DEFAULT_CODEX_CLI_TIMEOUT_MS = 15 * 60 * 1000;

const codexCliToolCallSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  arguments: z.unknown().default({}),
});

const codexCliTurnSchema = z.object({
  content: z.string().default(''),
  toolCalls: z.array(codexCliToolCallSchema).default([]),
});

const codexCliOutputJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['content', 'toolCalls'],
  properties: {
    content: { type: 'string' },
    toolCalls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'arguments'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          arguments: { type: 'object' },
        },
      },
    },
  },
} satisfies Record<string, unknown>;

export interface CodexCliExecInput {
  bin: string;
  model: string;
  prompt: string;
  timeoutMs: number;
}

export interface CodexCliExecOutput {
  content: string;
  stderr?: string;
}

export type CodexCliRunner = (input: CodexCliExecInput) => Promise<CodexCliExecOutput>;

export interface CreateCodexCliProviderOptions {
  bin?: string;
  model?: string;
  timeoutMs?: number;
  runCodexExec?: CodexCliRunner;
}

export function createCodexCliProvider(options: CreateCodexCliProviderOptions = {}): AgentProvider {
  const runner = options.runCodexExec ?? runCodexExec;
  const bin = options.bin ?? 'codex';
  const timeoutMs = options.timeoutMs ?? DEFAULT_CODEX_CLI_TIMEOUT_MS;

  return {
    name: 'openai',
    async chat({ modelId, messages, tools }) {
      const model = options.model ?? modelId;
      const prompt = buildCodexCliProviderPrompt({ messages, tools });
      const output = await runner({ bin, model, prompt, timeoutMs });
      const parsed = parseCodexCliTurn(output.content);
      const toolCalls: ToolCallRequest[] = parsed.toolCalls.map((call) => ({
        id: call.id ?? `call_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        name: call.name,
        arguments: call.arguments,
      }));

      return {
        message: {
          role: 'assistant',
          content: parsed.content,
          toolCalls,
        },
        toolCalls,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
        },
        rawId: `codex-cli-${randomUUID()}`,
      } satisfies ChatResponse;
    },
  };
}

function buildCodexCliProviderPrompt(input: {
  messages: ChatTurn[];
  tools: ToolDef<any, any>[];
}): string {
  const tools = input.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: zodToJsonSchema(tool.input, {
      target: 'openApi3',
      $refStrategy: 'none',
    }),
  }));

  return [
    'You are an OpenAI-compatible chat provider inside CreatorCanon development tooling.',
    'Do not edit files, run commands, browse, or explain your reasoning.',
    'Read the conversation and choose the next assistant turn.',
    'Return ONLY JSON with this exact shape:',
    '{"content":"assistant text","toolCalls":[{"id":"call_1","name":"toolName","arguments":{}}]}',
    'Use toolCalls when a listed tool should run next. Use an empty toolCalls array when the agent is finished.',
    'Use only listed tools. Tool arguments must match the provided JSON schema. Do not wrap JSON in Markdown.',
    '',
    JSON.stringify(
      {
        messages: input.messages,
        tools,
      },
      null,
      2,
    ),
  ].join('\n');
}

function parseCodexCliTurn(content: string) {
  const value = parseJsonObject(content);
  return codexCliTurnSchema.parse(value);
}

function parseJsonObject(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        // fall through to the clear provider error below
      }
    }
    throw new Error(
      `Codex CLI provider expected JSON but received: ${trimmed.slice(0, 240) || '<empty>'}`,
    );
  }
}

async function runCodexExec(input: CodexCliExecInput): Promise<CodexCliExecOutput> {
  const tempDir = await mkdtemp(join(tmpdir(), 'creatorcanon-codex-cli-'));
  const outputPath = join(tempDir, 'last-message.json');
  const schemaPath = join(tempDir, 'output-schema.json');

  try {
    await writeFile(schemaPath, JSON.stringify(codexCliOutputJsonSchema), 'utf8');
    const args = [
      '--ask-for-approval',
      'never',
      'exec',
      '--ephemeral',
      '--skip-git-repo-check',
      '--ignore-rules',
      '--sandbox',
      'read-only',
      '--output-schema',
      schemaPath,
      '--output-last-message',
      outputPath,
      '--model',
      input.model,
      '-',
    ];

    const result = await spawnCodex(input.bin, args, input.prompt, input.timeoutMs);
    let content = result.stdout;
    try {
      content = await readFile(outputPath, 'utf8');
    } catch {
      // Older Codex CLI builds may not create the output file on failure.
    }

    if (result.exitCode !== 0) {
      throw new Error(`Codex CLI exited with ${result.exitCode}: ${result.stderr.slice(0, 800)}`);
    }

    return {
      content,
      stderr: result.stderr,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function spawnCodex(
  bin: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`Codex CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });

    child.stdin.end(stdin);
  });
}
