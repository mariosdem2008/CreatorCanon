import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentProvider, ChatResponse, ChatTurn } from './index';
import { extractJsonFromCodexOutput } from './codex-extract-json';

export interface CodexCliOptions {
  /**
   * Path or name of the Codex binary. Defaults: 'codex.cmd' on Windows,
   * 'codex' elsewhere. Override if your install puts the binary somewhere
   * the OS resolver can't find.
   */
  binary?: string;
  /**
   * Args inserted between the binary and the prompt. The prompt itself is
   * always the LAST positional arg. Defaults to:
   *   ['exec', '--skip-git-repo-check', '-o', '<tmpfile>']
   * The '<tmpfile>' placeholder is replaced per call with a fresh temp
   * file path, and the file's contents are read after the process exits.
   * If your Codex CLI version uses different flags, override this — but
   * keep '<tmpfile>' as the placeholder.
   */
  argsTemplate?: string[];
  /** Timeout in ms. Defaults to 5 minutes. */
  timeoutMs?: number;
}

const TMPFILE_PLACEHOLDER = '<tmpfile>';

/**
 * AgentProvider that spawns the Codex CLI as a subprocess. Intended for
 * development use ONLY: routes LLM calls through the developer's local
 * `codex` binary (signed into their ChatGPT account) so iteration doesn't
 * burn metered API credits.
 *
 * Codex CLI's `-o <tmpfile>` flag writes ONLY the agent's final message to
 * the file, so we get clean output without scraping banner / diagnostics
 * out of stdout.
 *
 * Limitations:
 *  - Tool calls NOT supported. Calls with `tools.length > 0` throw. Use
 *    only for tool-less agents (the Author's Studio specialists, all of
 *    which have allowedTools: []).
 *  - No token-usage reporting (Codex doesn't expose token counts on the
 *    flat-rate plan path). The harness records cost as 0 for these calls.
 *  - Each call spawns a subprocess: more overhead than the direct API
 *    providers. Fine for dev iteration, not for production throughput.
 */
export function createCodexCliProvider(opts: CodexCliOptions = {}): AgentProvider {
  const binary = opts.binary ?? (process.platform === 'win32' ? 'codex.cmd' : 'codex');
  const argsTemplate = opts.argsTemplate ?? ['exec', '--skip-git-repo-check', '-o', TMPFILE_PLACEHOLDER];
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;

  return {
    name: 'codex-cli',
    async chat(input) {
      if (input.tools && input.tools.length > 0) {
        throw new Error(
          `codex-cli provider does not support tool calls (got ${input.tools.length} tools). ` +
          `Use it only for tool-less agents (the Author's Studio specialists). ` +
          `For tool-using agents, route to openai or gemini.`,
        );
      }
      if (!input.messages || input.messages.length === 0) {
        throw new Error('codex-cli provider: messages array is empty');
      }

      const prompt = flattenMessagesForCodex(input.messages);
      const outputText = await runCodex(binary, argsTemplate, prompt, timeoutMs);
      const jsonText = extractJsonFromCodexOutput(outputText);

      const assistantTurn: ChatTurn = {
        role: 'assistant',
        content: jsonText,
        toolCalls: [],
      };

      const response: ChatResponse = {
        message: assistantTurn,
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 }, // Flat-rate plan; no per-call token report.
        rawId: `codex-${Date.now()}-${randomUUID().slice(0, 8)}`,
      };
      return response;
    },
  };
}

/**
 * Flatten the harness's message array into a single prompt string. Codex
 * has no system/user separation in non-interactive mode, so we label each
 * turn explicitly and end with a strict JSON-only instruction so Codex
 * doesn't decorate its answer with narrative.
 */
export function flattenMessagesForCodex(messages: ChatTurn[]): string {
  const parts: string[] = [];
  for (const turn of messages) {
    if (turn.role === 'system') {
      parts.push(`# SYSTEM\n${turn.content}`);
    } else if (turn.role === 'user') {
      parts.push(`# USER\n${turn.content}`);
    } else if (turn.role === 'assistant') {
      parts.push(`# ASSISTANT (previous turn)\n${turn.content}`);
    } else if (turn.role === 'tool') {
      parts.push(`# TOOL_RESULT\n${turn.content}`);
    }
  }
  parts.push(
    '# OUTPUT FORMAT\n' +
    'Respond with a single JSON object that satisfies the schema in the system message above. ' +
    'No preamble, no narrative, no markdown fences, no commentary — JSON only.',
  );
  return parts.join('\n\n');
}

async function runCodex(
  binary: string,
  argsTemplate: string[],
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  // Create a unique temp dir holding (a) the -o output file, (b) optionally
  // a prompt-input file. Cleaned up via the settle() finalizer.
  const tmpDir = mkdtempSync(join(tmpdir(), 'codex-cli-'));
  const tmpFile = join(tmpDir, 'out.txt');
  const args = argsTemplate.map((a) => (a === TMPFILE_PLACEHOLDER ? tmpFile : a));
  // IMPORTANT: do NOT pass the prompt as a positional arg. Windows has a
  // ~32KB command-line limit (`The command line is too long.`) and the
  // pipeline's Author's Studio prompts (channel profile + canon nodes +
  // brief + sibling briefs JSON-stringified) easily exceed that. Codex CLI
  // already supports stdin input ("Reading additional input from stdin..."
  // log line on its first call when no positional prompt is supplied).

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (cb: () => void) => {
      if (settled) return;
      settled = true;
      try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
      cb();
    };

    // shell:true on Windows so .cmd shims resolve.
    const proc = spawn(binary, args, {
      stdio: ['pipe', 'ignore', 'pipe'], // stdin: prompt; stdout: discarded; stderr: captured
      env: process.env,
      shell: process.platform === 'win32',
    });

    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    // Write the prompt to stdin and close it. Codex reads stdin until EOF.
    if (proc.stdin) {
      proc.stdin.on('error', (err) => {
        // EPIPE if Codex exits before reading all our input — non-fatal,
        // the close handler decides resolve vs reject from the exit code.
        if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
          // eslint-disable-next-line no-console
          console.warn(`[codex-cli] stdin write error: ${err.message}`);
        }
      });
      proc.stdin.write(prompt);
      proc.stdin.end();
    }

    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* ignore */ }
      settle(() => reject(new Error(`codex-cli: process timed out after ${timeoutMs}ms`)));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      settle(() => reject(new Error(`codex-cli: failed to spawn '${binary}': ${err.message}`)));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        settle(() => reject(new Error(
          `codex-cli: process exited with code ${code}. ` +
          `stderr: ${stderr.slice(-500)}`,
        )));
        return;
      }
      let content: string;
      try {
        content = readFileSync(tmpFile, 'utf8');
      } catch (err) {
        settle(() => reject(new Error(
          `codex-cli: process exited 0 but output file not readable (${(err as Error).message}). ` +
          `stderr: ${stderr.slice(-500)}`,
        )));
        return;
      }
      settle(() => resolve(content));
    });
  });
}
