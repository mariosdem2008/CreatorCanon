# Codex CLI Provider — Dev Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `codex-cli` `AgentProvider` that spawns the locally-installed Codex CLI as a subprocess so the pipeline's tool-less Author's Studio agents can run against the user's flat-rate ChatGPT/Codex plan instead of metered OpenAI/Gemini API quotas. **Development mode only.**

**Architecture:** A new `createCodexCliProvider()` conforms to the existing `AgentProvider` interface (`packages/pipeline/src/agents/providers/index.ts`). It spawns `codex exec` (Codex's non-interactive subcommand), pipes the system prompt + flattened user message in, captures stdout, and extracts a JSON block. A new `codex_dev` entry in `QUALITY_PRESETS` routes the 7 Author's Studio agents (strategist, 5 specialists, critic) — all of which have `allowedTools: []` and emit JSON-only — to this provider. Upstream tool-using agents keep their existing OpenAI/Gemini routing. The provider explicitly rejects any call with `tools.length > 0` so misuse is loud.

**Tech Stack:** Node.js `child_process.spawn`, TypeScript, existing `AgentProvider` interface, Codex CLI (`@openai/codex` npm package, ChatGPT-account-authenticated).

**Branch:** Continue work on `feat/hub-pipeline-workbench-v2` in worktree `C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2`. The work is small, additive, and orthogonal to the editorial polish plan already in flight.

**Hard constraint:** Do NOT modify `apps/web/src/styles/globals.css`. Do NOT touch the main workspace's working tree.

**Why this exists, in plain language:** Today's e2e re-run failed 4 times because both the OpenAI tier and Gemini's free tier returned 429 quota-exceeded. We're paying for ChatGPT (which includes generous Codex CLI usage) but the pipeline can't draw on it because the providers are API-keyed. This adds a third routing path: when `PIPELINE_QUALITY_MODE=codex_dev`, the Author's Studio's 7 LLM-heavy agents shell out to the user's local `codex` binary (signed into the user's ChatGPT account) for free under their plan.

**Scope discipline:**
- **In scope:** the 7 tool-less Author's Studio agents (`page_strategist`, `prose_author`, `roadmap_author`, `example_author`, `diagram_author`, `mistakes_author`, `critic`).
- **Out of scope:** every tool-using agent (`channel_profiler`, `video_analyst`, `canon_architect`, `page_brief_planner`, etc.). Those use OpenAI's function-calling protocol, which Codex CLI doesn't speak. Those stay on OpenAI/Gemini in `codex_dev` mode by inheriting their default REGISTRY entry — `codex_dev` simply doesn't override them.

**Honest caveats acknowledged up front:**
- Codex CLI's exact flags vary across versions. Task 1 (smoke test) is where the engineer verifies the actual command shape and adjusts the spawn args in Task 3 if the assumed flags don't match.
- Output extraction is best-effort: the JSON parser pulls a `{...}` block out of Codex's narrative response, with a markdown-fence fallback. If Codex is verbose it may need a tighter prompt prefix.
- ChatGPT Plus has a low Codex usage cap; this mode is comfortable on Pro/Team and tight on Plus.
- This is for development only. Don't ship to production — Codex CLI is intended for human-in-the-loop coding, not headless pipeline workloads.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `packages/pipeline/src/agents/providers/codex-extract-json.ts` | create | Pure helper: extract a single JSON object from Codex's narrative stdout. Strategy: prefer ```json fenced block, fall back to first `{...}` substring that parses. |
| `packages/pipeline/src/agents/providers/test/codex-extract-json.test.ts` | create | Unit tests for the extractor: fenced, bare, narrative preamble, narrative suffix, malformed. |
| `packages/pipeline/src/agents/providers/codex-cli.ts` | create | `createCodexCliProvider(opts)` that conforms to `AgentProvider`. Spawns `codex exec`, flattens messages into a single prompt, captures stdout, parses to `ChatResponse`. Throws if `tools.length > 0`. |
| `packages/pipeline/src/agents/providers/test/codex-cli.test.ts` | create | Unit tests for prompt flattening + the no-tools guard. (Subprocess spawn itself is tested in Task 6 end-to-end.) |
| `packages/pipeline/src/agents/providers/index.ts` | modify | Extend `ProviderName` union to include `'codex-cli'`. |
| `packages/pipeline/src/agents/providers/selectModel.ts` | modify | Add a `codex_dev` entry to `QualityMode` + `QUALITY_PRESETS` that maps the 7 Author's Studio agents to `M('codex','codex-cli')` and leaves upstream agents at REGISTRY default (which the harness then routes to OpenAI/Gemini per their existing fallback chains). |
| `packages/pipeline/src/stages/page-composition.ts` | modify | Extend the local `makeProvider` to handle the `'codex-cli'` provider name. |
| `docs/superpowers/notes/2026-04-29-codex-dev-mode.md` | create | User-facing notes: install, login, usage, limitations. |

---

## Pre-flight (verify before writing any code)

### Task 1: Smoke-test Codex CLI on this machine

**Files:** N/A (operator-side check)

This task verifies the user's environment can actually run Codex CLI non-interactively. The exact CLI flag shape varies across versions; what we observe here decides the spawn invocation in Task 3.

- [ ] **Step 1: Install Codex CLI globally**

```bash
npm install -g @openai/codex
```

Expected: install completes; `codex` is on PATH.

If the install fails because of npm permissions, run from an elevated shell or use `--prefix` to install into a user-writable location, then add that bin dir to PATH.

- [ ] **Step 2: Confirm `codex` is on PATH**

```bash
codex --version
```

Expected: a version string (e.g. `0.x.y`). Note the version — record it in the notes file in Task 7.

- [ ] **Step 3: Sign in via the ChatGPT account (NOT API key)**

```bash
codex login
```

Expected: a browser window opens; sign in with the ChatGPT account that has Pro/Team/Plus. The CLI confirms login. After this, `codex` calls bill against the ChatGPT plan, not against an API key.

If `codex login` opens an auth dialog with both "ChatGPT account" and "API key" options, **choose ChatGPT account.** API-key auth would defeat the purpose of this whole plan.

- [ ] **Step 4: Run a non-interactive smoke test**

```bash
codex exec --json "Respond with a single JSON object: {\"ping\":\"pong\"}. No prose, no preamble, no markdown fences."
```

Expected: the response, somewhere in stdout, contains `{"ping":"pong"}`.

If `--json` flag doesn't exist on this CLI version, try:

```bash
codex exec "Respond with a single JSON object: {\"ping\":\"pong\"}. No prose, no preamble, no markdown fences."
```

Or:

```bash
codex --no-interactive "Respond with a single JSON object: {\"ping\":\"pong\"}. No prose, no preamble, no markdown fences."
```

Whichever shape works, **record the working invocation** — Task 3 will need it. The most reliable invocation across recent versions is `codex exec "<prompt>"` (no flags). If your version uses different flags, just substitute them in Task 3's `spawn()` arguments.

- [ ] **Step 5: Confirm the response is JSON-extractable**

Run the smoke command again and pipe through Node:

```bash
codex exec "Respond with a single JSON object: {\"ping\":\"pong\"}. No prose." 2>/dev/null | node -e "
const text = require('fs').readFileSync(0, 'utf8');
const m = text.match(/\\{[^{}]*\\}/);
console.log(m ? JSON.parse(m[0]) : 'NO_JSON_FOUND');
"
```

Expected: `{ ping: 'pong' }` printed.

If you see `NO_JSON_FOUND`, Codex is decorating output more than expected. Adjust the prompt with stronger constraints in Task 3.

- [ ] **Step 6: Commit nothing**

This task produces no code, only a verified environment. If Steps 1–5 all worked, proceed to Task 2 with the working `codex exec` invocation in mind.

If they failed, STOP and surface to operator. Don't invent a workaround — the rest of the plan depends on Codex CLI being functional from this shell.

---

## Phase A — Pure helpers

### Task 2: JSON extraction helper + tests

**Files:**
- Create: `packages/pipeline/src/agents/providers/codex-extract-json.ts`
- Create: `packages/pipeline/src/agents/providers/test/codex-extract-json.test.ts`

The extractor takes Codex's stdout (which may include narrative preamble like *"Here's the JSON you asked for:"* and markdown fences) and returns the first valid JSON object as a string. The pipeline's downstream Zod parsers handle schema validation; this helper just isolates the JSON.

Strategy, in priority order:
1. Look for a ` ```json ` fenced block, parse its inner content.
2. Look for a generic ` ``` ` fenced block, parse its inner content.
3. Find the first `{` and the matching last `}`, parse that substring.
4. Throw `CodexJsonExtractError` if nothing parses.

- [ ] **Step 1: Write the failing tests (TDD)**

Create `packages/pipeline/src/agents/providers/test/codex-extract-json.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonFromCodexOutput, CodexJsonExtractError } from '../codex-extract-json';

describe('extractJsonFromCodexOutput', () => {
  it('extracts JSON from a ```json fenced block', () => {
    const raw = 'Sure! Here is your output:\n\n```json\n{"kind":"cited_prose","paragraphs":[]}\n```\n\nLet me know if you need anything else.';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"kind":"cited_prose","paragraphs":[]}');
  });

  it('extracts JSON from a generic ``` fenced block', () => {
    const raw = '```\n{"kind":"diagram","mermaidSrc":"flowchart TD\\n A --> B"}\n```';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"kind":"diagram","mermaidSrc":"flowchart TD\\n A --> B"}');
  });

  it('extracts bare JSON with no fence', () => {
    const raw = '{"kind":"roadmap","steps":[]}';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"kind":"roadmap","steps":[]}');
  });

  it('extracts JSON when wrapped in narrative preamble', () => {
    const raw = 'Here is the page plan you requested:\n\n{"pageId":"pb_x","artifacts":[{"kind":"cited_prose"}]}\n\nThat covers the build path.';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"pageId":"pb_x","artifacts":[{"kind":"cited_prose"}]}');
  });

  it('handles nested braces correctly', () => {
    const raw = 'Output:\n{"outer":{"inner":{"deep":1}},"sibling":2}';
    const out = extractJsonFromCodexOutput(raw);
    const parsed = JSON.parse(out);
    assert.deepEqual(parsed, { outer: { inner: { deep: 1 } }, sibling: 2 });
  });

  it('prefers fenced block over later bare JSON when both are present', () => {
    const raw = '```json\n{"correct":true}\n```\n\nLater I might mention {"wrong":true} in passing.';
    const out = extractJsonFromCodexOutput(raw);
    assert.equal(out, '{"correct":true}');
  });

  it('throws CodexJsonExtractError when no JSON is present', () => {
    const raw = 'Sorry, I cannot help with that.';
    assert.throws(() => extractJsonFromCodexOutput(raw), CodexJsonExtractError);
  });

  it('throws CodexJsonExtractError on malformed JSON', () => {
    const raw = 'Output: { this is not valid json }';
    assert.throws(() => extractJsonFromCodexOutput(raw), CodexJsonExtractError);
  });

  it('throws on empty input', () => {
    assert.throws(() => extractJsonFromCodexOutput(''), CodexJsonExtractError);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/codex-extract-json.test.ts 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '../codex-extract-json'`.

- [ ] **Step 3: Implement the extractor**

Create `packages/pipeline/src/agents/providers/codex-extract-json.ts`:

```typescript
/**
 * Extract a single JSON object from Codex CLI's stdout.
 *
 * Codex tends to wrap structured output in narrative ("Here's the JSON you
 * asked for: ...") and sometimes uses ```json fenced blocks. This helper
 * isolates the JSON so downstream Zod parsers can validate it.
 *
 * Priority order:
 *  1. ```json … ``` fenced block
 *  2. Plain ``` … ``` fenced block (when content parses as JSON)
 *  3. First balanced {…} substring that parses
 *  4. Throw CodexJsonExtractError
 *
 * Returns the JSON as a string (not a parsed object) so the caller can pass
 * it through their existing JSON.parse + Zod chain unchanged.
 */
export class CodexJsonExtractError extends Error {
  constructor(message: string, public readonly rawOutput: string) {
    super(message);
    this.name = 'CodexJsonExtractError';
  }
}

const FENCE_JSON_RE = /```json\s*([\s\S]*?)\s*```/;
const FENCE_PLAIN_RE = /```\s*([\s\S]*?)\s*```/;

export function extractJsonFromCodexOutput(raw: string): string {
  if (!raw || raw.trim().length === 0) {
    throw new CodexJsonExtractError('Codex output is empty', raw);
  }

  // 1. ```json fenced block
  const fenceJson = raw.match(FENCE_JSON_RE);
  if (fenceJson?.[1]) {
    const candidate = fenceJson[1].trim();
    if (tryParse(candidate)) return candidate;
  }

  // 2. Plain ``` fenced block (only count if it parses as JSON)
  const fencePlain = raw.match(FENCE_PLAIN_RE);
  if (fencePlain?.[1]) {
    const candidate = fencePlain[1].trim();
    if (tryParse(candidate)) return candidate;
  }

  // 3. First balanced {…} substring that parses
  const balanced = findBalancedJson(raw);
  if (balanced && tryParse(balanced)) return balanced;

  throw new CodexJsonExtractError(
    `Could not extract a JSON object from Codex output (length=${raw.length})`,
    raw,
  );
}

function tryParse(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk the string from the first '{' and find the matching '}' that closes
 * the same depth. Tolerates strings (which may contain unbalanced braces).
 */
function findBalancedJson(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/codex-extract-json.test.ts 2>&1 | tail -10
```

Expected: 9/9 PASS.

- [ ] **Step 5: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/agents/providers/codex-extract-json.ts packages/pipeline/src/agents/providers/test/codex-extract-json.test.ts
git commit -m "feat(providers): codex JSON extractor for narrative-wrapped stdout"
```

---

## Phase B — Provider implementation

### Task 3: `createCodexCliProvider` + tests

**Files:**
- Create: `packages/pipeline/src/agents/providers/codex-cli.ts`
- Create: `packages/pipeline/src/agents/providers/test/codex-cli.test.ts`

The provider implements `AgentProvider.chat()`. It:
1. Rejects calls with `tools.length > 0` (we only support tool-less specialists).
2. Flattens the `messages: ChatTurn[]` array into a single prompt: system instructions on top, then each user/assistant turn labeled.
3. Spawns `codex exec` with the prompt as a CLI arg.
4. Captures stdout (and stderr for diagnostics).
5. Calls `extractJsonFromCodexOutput` to strip narrative.
6. Returns a `ChatResponse` with `usage.inputTokens=0, outputTokens=0` (Codex CLI doesn't expose token counts; flat-rate plan, so 0 is honest).
7. The `rawId` is set to `codex-${timestamp}-${randomShort}` since Codex doesn't return one.

Note about Windows: `codex` is installed as a `.cmd` shim on Windows. `child_process.spawn` requires `shell: true` to find `.cmd` shims by name on Windows. We set it unconditionally (it's harmless on macOS/Linux for a binary lookup) — using `shell: true` does mean we MUST single-quote-escape the prompt arg ourselves, so we use the `args` array with `shell: false` on POSIX and `shell: true` on Windows, choosing per-platform.

Actually simpler: spawn with the prompt as a single arg in the args array, and `shell: false`. On Windows, look up the `.cmd` shim path explicitly via `process.env.PATH` rather than relying on shell expansion. This is more code but avoids quote-escaping nightmares with prompts that contain JSON.

For this plan we go with the **simplest portable approach**: use `cross-spawn`-style logic — on Windows, prefer `codex.cmd` over `codex`; never use `shell: true` with user-provided prompts (security). The implementation below is self-contained.

- [ ] **Step 1: Write the failing tests**

Create `packages/pipeline/src/agents/providers/test/codex-cli.test.ts`:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCodexCliProvider, flattenMessagesForCodex } from '../codex-cli';
import type { ChatTurn } from '..';

describe('flattenMessagesForCodex', () => {
  it('puts the system message first, then user', () => {
    const turns: ChatTurn[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];
    const out = flattenMessagesForCodex(turns);
    assert.match(out, /You are a helpful assistant\./);
    assert.match(out, /Hello!/);
    // System should appear before user.
    assert.ok(out.indexOf('You are a helpful assistant') < out.indexOf('Hello!'));
  });

  it('labels assistant and tool turns', () => {
    const turns: ChatTurn[] = [
      { role: 'system', content: 'Sys.' },
      { role: 'user', content: 'U.' },
      { role: 'assistant', content: 'A.' },
      { role: 'user', content: 'U2.' },
    ];
    const out = flattenMessagesForCodex(turns);
    assert.match(out, /Sys\./);
    assert.match(out, /U\./);
    assert.match(out, /A\./);
    assert.match(out, /U2\./);
  });

  it('appends a strict JSON-only instruction at the end', () => {
    const turns: ChatTurn[] = [
      { role: 'system', content: 'Sys.' },
      { role: 'user', content: 'U.' },
    ];
    const out = flattenMessagesForCodex(turns);
    assert.match(out, /JSON.*only/i);
  });
});

describe('createCodexCliProvider', () => {
  it('rejects calls with tools.length > 0', async () => {
    const provider = createCodexCliProvider();
    await assert.rejects(
      () => provider.chat({
        modelId: 'codex',
        messages: [{ role: 'system', content: 'Sys.' }, { role: 'user', content: 'U.' }],
        tools: [{ name: 'fakeTool', description: 'd', parameters: { parse: () => ({}) }, handler: async () => ({}) } as never],
      }),
      /tool/i,
    );
  });

  it('exposes name = "codex-cli"', () => {
    const provider = createCodexCliProvider();
    assert.equal(provider.name, 'codex-cli');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/codex-cli.test.ts 2>&1 | tail -10
```

Expected: FAIL with `Cannot find module '../codex-cli'`.

- [ ] **Step 3: Implement the provider**

Create `packages/pipeline/src/agents/providers/codex-cli.ts`:

```typescript
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { AgentProvider, ChatResponse, ChatTurn } from './index';
import { extractJsonFromCodexOutput } from './codex-extract-json';

export interface CodexCliOptions {
  /**
   * Path or name of the Codex binary. Defaults to "codex" (resolved from PATH).
   * On Windows the npm global install creates `codex.cmd` — pass that name
   * if "codex" alone doesn't resolve.
   */
  binary?: string;
  /**
   * Subcommand and flags to pass before the prompt. Default: ["exec"].
   * If your Codex CLI version uses a different invocation (e.g.
   * ["--no-interactive"] or just []), set it here. Verified shape from
   * Task 1 should be set here.
   */
  args?: string[];
  /** Optional timeout in ms. Defaults to 5 minutes. */
  timeoutMs?: number;
}

/**
 * AgentProvider that spawns the Codex CLI as a subprocess. Intended for
 * development use ONLY: it routes LLM calls through the developer's local
 * `codex` binary (signed into their ChatGPT account), bypassing metered
 * OpenAI/Gemini API quotas. Production runs should use the api-key-based
 * providers.
 *
 * Limitations:
 *  - Tool calls are NOT supported. Calls with `tools.length > 0` throw.
 *    Use only for the Author's Studio agents (page_strategist, prose_author,
 *    roadmap_author, example_author, diagram_author, mistakes_author, critic),
 *    all of which have allowedTools: [] and emit JSON-only output.
 *  - No token-usage reporting. The harness will record cost as 0 for these
 *    calls — the ChatGPT plan absorbs the work as part of its flat rate.
 *  - Sequential by nature of the subprocess model. The harness's per-page
 *    parallel fan-out still works, but each parallel branch spawns its own
 *    codex process, so sustained throughput depends on the local machine
 *    and the ChatGPT plan's concurrency cap.
 */
export function createCodexCliProvider(opts: CodexCliOptions = {}): AgentProvider {
  const binary = opts.binary ?? (process.platform === 'win32' ? 'codex.cmd' : 'codex');
  const args = opts.args ?? ['exec'];
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

      const prompt = flattenMessagesForCodex(input.messages);
      const stdout = await runCodex(binary, args, prompt, timeoutMs);
      const jsonText = extractJsonFromCodexOutput(stdout);

      const assistantTurn: ChatTurn = {
        role: 'assistant',
        content: jsonText,
        toolCalls: [],
      };

      const response: ChatResponse = {
        message: assistantTurn,
        toolCalls: [],
        usage: { inputTokens: 0, outputTokens: 0 }, // Codex CLI does not expose token counts.
        rawId: `codex-${Date.now()}-${randomUUID().slice(0, 8)}`,
      };
      return response;
    },
  };
}

/**
 * Flatten the harness's message array into a single prompt string. Codex CLI
 * doesn't have a system/user message separation in non-interactive mode, so
 * we label each turn explicitly and end with a strict JSON-only instruction.
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
      // We don't support tools, but if a stray tool turn shows up just include it.
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

async function runCodex(binary: string, args: string[], prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, [...args, prompt], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    const stdoutChunks: Buffer[] = [];

    proc.stdout.on('data', (d: Buffer) => {
      stdoutChunks.push(d);
    });
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`codex-cli: process timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`codex-cli: failed to spawn '${binary}': ${err.message}`));
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      stdout = Buffer.concat(stdoutChunks).toString('utf8');
      if (code !== 0) {
        reject(new Error(
          `codex-cli: process exited with code ${code}. ` +
          `stderr: ${stderr.slice(0, 500)}`,
        ));
        return;
      }
      resolve(stdout);
    });
  });
}
```

**If Task 1's smoke test revealed a different invocation** (e.g. your Codex version uses `--no-interactive` instead of the `exec` subcommand), pass it via `opts.args`:

```typescript
createCodexCliProvider({ args: ['--no-interactive'] })
```

The default `['exec']` matches the most common recent versions.

- [ ] **Step 4: Run tests, verify they pass**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/codex-cli.test.ts 2>&1 | tail -10
```

Expected: 5/5 PASS (3 flatten + 2 provider).

- [ ] **Step 5: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

If you get an error like `Type '"codex-cli"' is not assignable to type 'ProviderName'`, that's expected — Task 4 fixes it.

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/agents/providers/codex-cli.ts packages/pipeline/src/agents/providers/test/codex-cli.test.ts
git commit -m "feat(providers): codex-cli provider — spawn local codex for tool-less agents"
```

---

## Phase C — Wire-up

### Task 4: Extend `ProviderName` union

**Files:**
- Modify: `packages/pipeline/src/agents/providers/index.ts`

The `ProviderName` type is currently `'openai' | 'gemini'`. Add `'codex-cli'` so TypeScript accepts it as a valid provider name.

- [ ] **Step 1: Modify the union**

In `packages/pipeline/src/agents/providers/index.ts`, find the line:

```typescript
export type ProviderName = 'openai' | 'gemini';
```

Replace with:

```typescript
export type ProviderName = 'openai' | 'gemini' | 'codex-cli';
```

- [ ] **Step 2: Typecheck — expect cascading typecheck errors at provider factory call sites**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -10
```

Expected: typecheck flags every `makeProvider` function (one per stage file) for non-exhaustive switch on `ProviderName`. Specifically, lines like:

```
src/stages/page-composition.ts:NN - Type '"openai" | "gemini"' has no property 'codex-cli'...
```

These are real and will be fixed in Task 5. They confirm the union is plumbed correctly.

If you see typecheck errors that are NOT about `'codex-cli'`, STOP and report — your union edit might be misplaced.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/agents/providers/index.ts
git commit -m "feat(providers): extend ProviderName union with codex-cli"
```

---

### Task 5: Wire codex-cli into the page-composition `makeProvider`

**Files:**
- Modify: `packages/pipeline/src/stages/page-composition.ts`

Page-composition is the only stage that runs the Author's Studio agents (which are the only tool-less agents we target). Its `makeProvider` currently only handles `'openai' | 'gemini'`. Extend it to handle `'codex-cli'`.

We deliberately do NOT modify the makeProvider in `canon.ts`, `video-intelligence.ts`, etc. — those run tool-using agents that codex-cli can't serve. Leaving them alone means typecheck still passes (their `makeProvider` parameter is typed as `'openai' | 'gemini'` and the codex preset never tries to invoke them).

- [ ] **Step 1: Locate `makeProvider` in page-composition.ts**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2" && grep -n "makeProvider" packages/pipeline/src/stages/page-composition.ts
```

Expected: the function declaration appears once (`const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => { ... }`).

- [ ] **Step 2: Modify the function signature + body**

In `packages/pipeline/src/stages/page-composition.ts`, find:

```typescript
  const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => {
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    return createGeminiProvider(env.GEMINI_API_KEY ?? '');
  };
```

Replace with:

```typescript
  const makeProvider = (name: 'openai' | 'gemini' | 'codex-cli'): AgentProvider => {
    if (name === 'openai') return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
    if (name === 'gemini') return createGeminiProvider(env.GEMINI_API_KEY ?? '');
    return createCodexCliProvider();
  };
```

Add this import at the top of the file (alongside the other provider imports):

```typescript
import { createCodexCliProvider } from '../agents/providers/codex-cli';
```

- [ ] **Step 3: Typecheck**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -5
```

Expected: clean. (The Task 4 errors about non-exhaustive switches now resolve, since this file's makeProvider handles all 3 cases.)

If other files still flag errors about `ProviderName`, those files run tool-using agents and should NOT route to codex-cli. The right move there is to keep their makeProvider parameter narrower:

```typescript
const makeProvider = (name: 'openai' | 'gemini'): AgentProvider => { ... };
```

Their `selectModel(...)` calls should never return `'codex-cli'` for those agents because `codex_dev` (Task 6) only sets the 7 Author's Studio agents.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/stages/page-composition.ts
git commit -m "feat(page-composition): route codex-cli provider for tool-less authors"
```

---

### Task 6: Add `codex_dev` quality preset

**Files:**
- Modify: `packages/pipeline/src/agents/providers/selectModel.ts`

Add `'codex_dev'` to the `QualityMode` union and a corresponding entry to `QUALITY_PRESETS` that maps the 7 Author's Studio agents to `codex-cli`. Other agents fall through to their REGISTRY default (which routes via OpenAI/Gemini per the existing fallback chains).

- [ ] **Step 1: Read existing QualityMode + QUALITY_PRESETS shape**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2" && grep -n "QualityMode\|QUALITY_PRESETS" packages/pipeline/src/agents/providers/selectModel.ts | head -10
```

Expected: locations of the type alias and the const declaration. Inspect the existing `lean | production_economy | premium` entries to confirm the shape (each maps `Partial<Record<AgentName, ModelChoice>>`).

- [ ] **Step 2: Extend the QualityMode type**

In `packages/pipeline/src/agents/providers/selectModel.ts`, find:

```typescript
type QualityMode = 'lean' | 'production_economy' | 'premium';
```

(or however it's currently declared — find the actual line.) Replace with:

```typescript
type QualityMode = 'lean' | 'production_economy' | 'premium' | 'codex_dev';
```

- [ ] **Step 3: Append the codex_dev preset**

Find the `QUALITY_PRESETS` const. Append a new entry inside the object:

```typescript
  codex_dev: {
    // Tool-less Author's Studio agents route to local codex CLI.
    // ChatGPT-plan-billed, no API key consumed. Dev-only.
    page_strategist:    M('codex', 'codex-cli'),
    prose_author:       M('codex', 'codex-cli'),
    roadmap_author:     M('codex', 'codex-cli'),
    example_author:     M('codex', 'codex-cli'),
    diagram_author:     M('codex', 'codex-cli'),
    mistakes_author:    M('codex', 'codex-cli'),
    critic:             M('codex', 'codex-cli'),
    // Upstream tool-using agents stay on api-keyed providers — codex CLI
    // doesn't speak OpenAI's function-calling protocol. Don't override
    // them here; they fall through to REGISTRY defaults (which the
    // selectModel resolver routes via the existing OpenAI/Gemini chains).
  },
```

- [ ] **Step 4: Confirm `M('codex', 'codex-cli')` typechecks**

The `M(modelId, provider)` helper should accept any string for `modelId` and the `ProviderName` union for `provider`. The string `'codex'` here is a placeholder modelId — Codex CLI doesn't have model variants, but the harness still records it in transcripts.

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && pnpm typecheck 2>&1 | tail -3
```

Expected: clean.

If `M(...)`'s signature pins `modelId` to a specific union, you'll need to extend it. Check the signature first:

```bash
grep -n "function M\|const M" packages/pipeline/src/agents/providers/selectModel.ts | head -3
```

If `M` has a typed model union, add `'codex'` to it. If it accepts any string, no change needed.

- [ ] **Step 5: Run regression tests for selectModel**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && NODE_ENV=test node --import ../../node_modules/.pnpm/tsx@4.19.1/node_modules/tsx/dist/loader.mjs --test src/agents/providers/test/selectModel.test.ts src/agents/providers/test/selectModel.modes.test.ts src/agents/providers/test/selectModel.quality.test.ts 2>&1 | tail -10
```

Expected: all existing selectModel tests still pass. (We didn't change behavior for `lean`/`production_economy`/`premium`; we only added a new preset.)

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add packages/pipeline/src/agents/providers/selectModel.ts
git commit -m "feat(quality): codex_dev preset routes Author's Studio agents to codex-cli"
```

---

## Phase D — End-to-end smoke + docs

### Task 7: End-to-end smoke (single page) with `codex_dev` mode

**Files:** N/A (operator verification)

Run a real Author's Studio call against the local Codex binary and confirm a valid page lands. We use a **partial reset** that processes only one page so the engineer doesn't burn 25 minutes per smoke test.

This task assumes the run `97e8772c-07e3-4408-ba40-0a17450f33cf` is the test fixture (it has 8 page_briefs, all upstream stages cached). If that's not your fixture, substitute your run id.

- [ ] **Step 1: Reset only the downstream stages (so page_composition re-runs)**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
const sql=require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1});
(async()=>{
  const RUN='97e8772c-07e3-4408-ba40-0a17450f33cf';
  await sql\`DELETE FROM page_quality_report WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page_version WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM page WHERE run_id = \${RUN}\`;
  await sql\`DELETE FROM generation_stage_run WHERE run_id = \${RUN} AND stage_name IN ('page_composition','page_quality','adapt')\`;
  await sql\`UPDATE generation_run SET status = 'queued', started_at = NULL, completed_at = NULL WHERE id = \${RUN}\`;
  console.log('reset complete');
  await sql.end();
})();
" 2>&1 | tail -3
```

Expected: `reset complete`.

- [ ] **Step 2: Dispatch with `codex_dev` mode**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/pipeline" && PIPELINE_CONTENT_ENGINE=canon_v1 PIPELINE_QUALITY_MODE=codex_dev ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts 97e8772c-07e3-4408-ba40-0a17450f33cf 2>&1 | tee /tmp/codex-dev-smoke.log
```

Expected: stage_runs progress through page_composition. Each Author's Studio LLM call spawns a `codex` subprocess that returns within ~30 seconds. Per-page cycle (Strategist + 5 Specialists + Critic + Revise) takes 3–6 min.

If Codex CLI fails authentication mid-run (you ran out of plan tokens / your login expired), you'll see `codex-cli: process exited with code N` errors. Surface these to the operator and resume after re-login.

If the JSON extractor throws `CodexJsonExtractError`, dump the raw stdout from `/tmp/codex-dev-smoke.log` to a file and inspect — Codex may be wrapping output in a shape the extractor doesn't handle. File a follow-up to extend the extractor.

- [ ] **Step 3: Verify a page persisted**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT count(*)::int AS n, avg(jsonb_array_length(block_tree_json->'blocks'))::int AS avg_blocks FROM page_version WHERE run_id = '97e8772c-07e3-4408-ba40-0a17450f33cf' AND is_current\`.then(r=>{console.log(r);process.exit(0)});
" 2>&1 | tail -5
```

Expected: at least 1 page_version row, with `avg_blocks` between 5 and 11 (matching what the Author's Studio normally produces).

If `n=0`, the dispatch failed before persisting. Inspect `/tmp/codex-dev-smoke.log` for the actual error.

- [ ] **Step 4: Spot-check the produced content**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2/packages/db" && node -e "
const fs=require('node:fs');for(const f of['../../../../.env']){try{for(const l of fs.readFileSync(f,'utf8').split(/\r?\n/)){const t=l.trim();if(!t||t.startsWith('#'))continue;const i=t.indexOf('=');if(i<=0)continue;const k=t.slice(0,i).trim();if(process.env[k]!==undefined)continue;let v=t.slice(i+1).trim();if((v.startsWith('\"')&&v.endsWith('\"'))||(v.startsWith(\"'\")&&v.endsWith(\"'\")))v=v.slice(1,-1);process.env[k]=v;}}catch{}}
require('postgres')(process.env.DATABASE_URL,{idle_timeout:5,max:1})\`SELECT title, summary FROM page_version WHERE run_id = '97e8772c-07e3-4408-ba40-0a17450f33cf' AND is_current LIMIT 3\`.then(r=>{for(const row of r){console.log('TITLE:',row.title);console.log('SUMMARY:',row.summary?.slice(0,200));console.log('---');}process.exit(0)});
" 2>&1 | tail -15
```

Expected: titles and summaries that look LLM-authored (not stock placeholders). If they're identical or look synthetic, Codex may have returned thin output — adjust the prompt prefix in the provider or the strategist's prompt.

- [ ] **Step 5: No commit needed**

This task is operator verification. The provider, preset, and wiring already shipped in Tasks 1–6.

If smoke fails in a way that points back to code (extractor too narrow, prompt flatten loses information, etc.), file a follow-up commit specifically describing what Codex returned that the code couldn't handle.

---

### Task 8: Documentation note for operators

**Files:**
- Create: `docs/superpowers/notes/2026-04-29-codex-dev-mode.md`

A standalone note explaining how to use `codex_dev` mode, what it covers, what it doesn't, and the limitations the operator needs to know.

- [ ] **Step 1: Create the note**

Create `docs/superpowers/notes/2026-04-29-codex-dev-mode.md`:

```markdown
# `codex_dev` Quality Mode

A development-only `PIPELINE_QUALITY_MODE` that routes the Author's Studio's
7 tool-less LLM agents to the local Codex CLI binary instead of metered
OpenAI / Gemini API calls. Useful when:

- You're iterating on Author's Studio prompts and don't want to burn
  per-token credits on each pipeline rerun.
- You hit OpenAI tier quotas mid-iteration and need to keep moving without
  topping up.
- You're testing the editorial output of `page_composition` and don't care
  about throughput.

NOT for production. Codex CLI is intended for human-in-the-loop coding;
running pipeline workloads through it skirts its design intent and is
much slower than direct API calls.

## Setup

1. Install Codex CLI globally:
   ```bash
   npm install -g @openai/codex
   ```
2. Verify it's on PATH:
   ```bash
   codex --version
   ```
3. Sign in with your ChatGPT account (NOT API key — choose ChatGPT account
   in the auth dialog so usage bills against your subscription, not your
   API balance):
   ```bash
   codex login
   ```
4. Smoke-test that non-interactive mode works:
   ```bash
   codex exec "Respond with the JSON {\"ping\":\"pong\"}. No prose."
   ```

If your version of Codex CLI uses a different non-interactive subcommand
(e.g. `--no-interactive` instead of `exec`), pass the alternative args via
the `args` option in `createCodexCliProvider({ args: [...] })`. The default
`['exec']` matches the most common recent versions of `@openai/codex`.

## Usage

```bash
PIPELINE_QUALITY_MODE=codex_dev \
  ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts <runId>
```

This routes `page_strategist`, `prose_author`, `roadmap_author`,
`example_author`, `diagram_author`, `mistakes_author`, and `critic` through
the local `codex` binary.

Upstream tool-using agents (channel_profiler, video_analyst, canon_architect,
page_brief_planner) **stay on OpenAI/Gemini** — they use the function-calling
protocol that Codex CLI doesn't speak. Their stages typically cache-hit on
re-runs anyway, so this mode mainly affects the page_composition cycle.

## What you give up vs. production_economy

- **No token-usage reporting.** The pipeline records cost as 0 cents for
  every Codex call. Total cost figures will be wrong (lower than reality)
  in this mode.
- **Slower.** Each Codex call adds ~5-30s of subprocess overhead and Codex's
  own reasoning loop. An 8-page run that takes 25 min on
  `production_economy` may take 40-60 min on `codex_dev`.
- **No fallback to API providers.** If Codex CLI dies mid-call (auth
  expired, plan ran out of capacity), the agent fails and the page errors.
  The harness's normal OpenAI→Gemini fallback chain is bypassed for these
  agents.
- **Plan rate limits.** ChatGPT Plus has a tight Codex usage cap that you
  may exceed during a full run. ChatGPT Pro/Team is more generous. Watch
  for `quota` errors in the dispatch log.
- **Brittle to Codex CLI version changes.** If OpenAI updates the CLI and
  changes flag names or output format, this provider may need a tweak. The
  default args in `createCodexCliProvider` were verified against
  `@openai/codex@<version>` — record what you have.

## Switching back to production

Just change the env var on the next dispatch:

```bash
PIPELINE_QUALITY_MODE=production_economy \
  ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts <runId>
```

No DB or code change required.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `codex-cli: failed to spawn 'codex'` | Codex CLI not on PATH or not installed | `npm i -g @openai/codex`; verify `which codex` |
| `codex-cli: process exited with code 1, stderr: not authenticated` | Expired or missing login | `codex login` |
| `CodexJsonExtractError: Could not extract a JSON object` | Codex returned narrative without parseable JSON | Inspect raw stdout; tighten the prompt's JSON-only instruction; or extend the extractor |
| `codex-cli: process timed out after 300000ms` | Codex hit a complex prompt and stalled | Re-run; if persistent, the agent's prompt may need shortening |
| All Codex calls fail rapidly with `quota` errors | ChatGPT plan's Codex window is exhausted | Wait for the next reset window, or upgrade plan, or fall back to `production_economy` |

## Why this exists

We pay for ChatGPT and have generous Codex CLI access included. The pipeline,
however, is api-key billed: every Author's Studio agent call hits OpenAI's
metered API. When we hit OpenAI tier quotas during development iteration,
work stops cold even though the same calls would be free under the
ChatGPT plan.

`codex_dev` lets you do dev iteration on the Author's Studio without burning
through metered API credits. Production runs still use the api-keyed path.
```

- [ ] **Step 2: Commit**

```bash
cd "C:/Users/mario/Desktop/CHANNEL ATLAS/SaaS/.worktrees/hub-pipeline-workbench-v2"
git add docs/superpowers/notes/2026-04-29-codex-dev-mode.md
git commit -m "docs(notes): codex_dev mode setup + limitations"
```

---

## Self-Review

**Spec coverage:**
- ✅ Smoke-test Codex CLI install + non-interactive mode → Task 1
- ✅ JSON extractor (handles fenced + bare + narrative) → Task 2
- ✅ `createCodexCliProvider` matching `AgentProvider` interface, no-tools guard → Task 3
- ✅ Extend `ProviderName` union → Task 4
- ✅ Wire codex-cli into page-composition's `makeProvider` → Task 5
- ✅ Add `codex_dev` quality preset for the 7 Author's Studio agents → Task 6
- ✅ End-to-end smoke that produces a real page via Codex → Task 7
- ✅ Operator-facing docs → Task 8

**Placeholder scan:** No "TBD"/"fill in"/"similar to". Each step has actual code or actual commands. Diagnostic branches in Task 1 explicitly enumerate alternative invocations to try (vs. handwaving).

**Type consistency:**
- `ProviderName` extension in Task 4 matches the `name: 'codex-cli'` returned from `createCodexCliProvider` in Task 3.
- `M('codex', 'codex-cli')` in Task 6 uses the same provider name.
- The `createCodexCliProvider` signature accepts `CodexCliOptions` and returns `AgentProvider` — both exist in Task 3.
- `extractJsonFromCodexOutput` (Task 2) is consumed by `runCodex` in Task 3 — names match.
- `flattenMessagesForCodex` (Task 3) is exported and tested separately — its signature matches the test expectations.

**Scope check:** This is a single concern (add a third provider). Half-day effort. No schema migrations, no API contract changes, no main-workspace impact. Properly sized.

**Risk:** The biggest risk is Codex CLI version drift — if OpenAI changes the `exec` subcommand, the provider needs updating. Mitigated by:
- Task 1 verifying the actual flags before any code.
- Default args being overridable via `CodexCliOptions.args`.
- The notes file (Task 8) recording the working invocation.

**One non-obvious choice:** The provider returns `usage: { inputTokens: 0, outputTokens: 0 }` rather than an estimate. The harness records cost as 0 in `codex_dev` mode. We accept this — flat-rate billing has no per-call cost to report, and faking estimates would make cost dashboards lie. The notes file (Task 8) calls this out.

---

**Plan estimated effort:** 4-6 hours of focused execution.

**Plan does not depend on the editorial-polish plan being complete** — it's orthogonal, and once shipped it actually unblocks editorial-polish E2E by giving you a non-API-keyed path to test Author's Studio output.
