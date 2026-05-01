# `codex_dev` Quality Mode

A development-only `PIPELINE_QUALITY_MODE` that routes the Author's Studio's
seven tool-less LLM agents to the local Codex CLI binary, billed against the
operator's ChatGPT plan instead of metered OpenAI / Gemini API quotas.

Useful when:

- You're iterating on Author's Studio prompts and don't want to burn
  per-token credits on each pipeline rerun.
- You hit OpenAI tier quotas mid-iteration and need to keep moving.
- You're testing the editorial output of `page_composition` on a corpus
  where throughput doesn't matter.

**Not for production.** Codex CLI is intended for human-in-the-loop coding;
running pipeline workloads through it skirts its design intent and is
significantly slower than direct API calls.

---

## Setup

### 1. Install Codex CLI

```bash
npm install -g @openai/codex
```

Verified working version: `codex-cli 0.125.0`. Future versions should remain
compatible as long as they keep `codex exec --skip-git-repo-check -o <file>`
and stdin input.

### 2. Confirm `codex` is on PATH

```bash
codex --version
```

On Windows the npm global install lands at
`~/AppData/Roaming/npm/codex.cmd` (plus `codex` and `codex.ps1` for
WSL/PowerShell). The provider's default binary is `codex.cmd` on Windows,
`codex` elsewhere.

### 3. Sign in with the ChatGPT account (NOT API key)

```bash
codex login
```

A browser window opens. **Choose "Sign in with ChatGPT"** in the dialog —
NOT "Use API key". API-key auth would bill against your OpenAI credits and
defeat the entire purpose of this mode.

### 4. Smoke test

```bash
codex exec --skip-git-repo-check "Respond with the JSON object {\"ping\":\"pong\"}. No prose."
```

Expected: stdout includes a banner with workdir/model/session info, then a
`codex` block containing `{"ping":"pong"}`, then a `tokens used` trailer.
The provider extracts only the agent's final message via `-o <tmpfile>`.

If the smoke prompt fails with `not signed in`, return to step 3.

---

## Usage

```bash
PIPELINE_QUALITY_MODE=codex_dev \
  ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts <runId>
```

This routes the seven tool-less Author's Studio agents
(`page_strategist`, `prose_author`, `roadmap_author`, `example_author`,
`diagram_author`, `mistakes_author`, `critic`) through the local `codex`
binary.

Tool-using upstream agents (`channel_profiler`, `video_analyst`,
`canon_architect`, `page_brief_planner`) intentionally **stay on
OpenAI/Gemini** in this mode — they use the function-calling protocol that
Codex CLI doesn't speak. Their stages typically cache-hit on re-runs anyway,
so this mode mainly affects the `page_composition` cycle.

---

## How it works

```
Author's Studio specialist call
        │
        ▼
  selectModel() → REGISTRY['page_strategist'] → preset 'codex_dev' → M('codex','codex-cli')
        │
        ▼
  page-composition.makeProvider('codex-cli')
        │
        ▼
  createCodexCliProvider().chat({ messages, tools: [] })
        │
        ▼
  spawn 'codex.cmd exec --skip-git-repo-check -o <tmpfile>'
        │
        │  prompt written to subprocess stdin (avoids Windows ~32KB cmdline limit)
        │
        ▼
  Codex CLI runs against the user's ChatGPT plan auth
        │
        ▼
  agent's final message written to <tmpfile> (clean — no banner / token trailer)
        │
        ▼
  read tmpfile, extract JSON via codex-extract-json helper, return as ChatResponse
```

---

## What you give up vs. `production_economy`

- **No token-usage reporting.** The pipeline records cost as 0 cents for
  every Codex call. Total cost figures are LOWER than reality in this mode.
  The flat-rate ChatGPT plan absorbs the work; there's nothing to bill per
  call.
- **Slower per call.** Each Codex call adds ~5–30 seconds of subprocess +
  Codex's reasoning loop. An 8-page run that takes 25 min on
  `production_economy` may take 40–60 min on `codex_dev`.
- **No fallback to API providers.** If Codex CLI dies mid-call (auth
  expired, plan quota hit, network blip), the agent fails and the page
  errors. The harness's normal OpenAI→Gemini fallback chain doesn't apply
  to `codex-cli` (the fallbackChain in the REGISTRY only lists
  api-keyed providers).
- **ChatGPT plan rate limits.** Plus has a tight Codex usage cap that you
  may exceed during a full 8-page run. Pro/Team is much more generous.
  Watch for `quota` errors in the dispatch log.
- **Brittle to Codex CLI version changes.** If OpenAI updates the CLI's
  flags or output format, this provider may need a tweak. Tested on
  `codex-cli 0.125.0`.

---

## Switching back to production

Change the env var on the next dispatch:

```bash
PIPELINE_QUALITY_MODE=production_economy \
  ./node_modules/.bin/tsx ./src/dispatch-queued-run.ts <runId>
```

No DB or code change required.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `codex-cli: failed to spawn 'codex'` | Codex CLI not on PATH or not installed | `npm i -g @openai/codex`; verify `which codex` |
| `codex-cli: process exited with code 1, stderr: not authenticated` | Expired or missing login | `codex login` (choose ChatGPT account, not API key) |
| `codex-cli: process exited with code 1, stderr: The command line is too long.` | Pre-`7f6dd25` build (prompt was passed as positional arg, hit Windows ~32KB limit) | Pull latest — fix in commit `7f6dd25` switches to stdin pipe |
| `CodexJsonExtractError: Could not extract a JSON object` | Codex returned narrative without parseable JSON | Inspect raw stdout in the harness's R2 transcript; tighten the agent's system-prompt JSON-only instruction; or extend `codex-extract-json.ts` |
| `codex-cli: process timed out after 300000ms` | Codex hit a complex prompt and stalled | Re-run; if persistent, the agent's prompt may need shortening |
| All Codex calls fail rapidly with `quota` errors | ChatGPT plan's Codex usage window is exhausted | Wait for the next reset window, upgrade plan, or fall back to `production_economy` |
| `EPIPE` warnings in the dispatch log | Codex exited before reading all of our stdin (short responses) | Ignored as non-fatal; the close handler decides resolve vs reject from exit code |

---

## Why this exists

We pay for ChatGPT and have generous Codex CLI usage included. The pipeline,
however, is API-key billed: every Author's Studio agent call hits OpenAI's
or Gemini's metered API. When we hit OpenAI tier quotas during development
iteration, work stops cold even though the same calls would be free under
the ChatGPT plan.

`codex_dev` lets you iterate on the Author's Studio without burning metered
API credits. Production runs still use the api-keyed path.

The seven agents we route through Codex are all "tool-less" — they have
`allowedTools: []` and emit a single JSON blob — so they're a clean fit for
Codex CLI's non-interactive `exec` mode. Tool-using agents (which use
OpenAI function-calling) stay on the api-keyed providers, where their
function-call protocol is supported.

---

## Verified working configuration

- Date: 2026-04-29
- OS: Windows 10/11 (Git Bash shell)
- Node: v24.12.0
- Codex CLI: `codex-cli 0.125.0`
- ChatGPT plan: signed in via `codex login` (chose ChatGPT account)
- Smoke test: 7.4-second round-trip for a trivial JSON ping/pong prompt
- Pipeline integration: `PIPELINE_QUALITY_MODE=codex_dev` on run
  `97e8772c-07e3-4408-ba40-0a17450f33cf` produced editorial-grade
  Author's Studio output without consuming metered API credits

---

## Implementation references

- Provider: `packages/pipeline/src/agents/providers/codex-cli.ts`
- JSON extractor: `packages/pipeline/src/agents/providers/codex-extract-json.ts`
- Quality preset: `packages/pipeline/src/agents/providers/selectModel.ts`
  (search for `codex_dev:`)
- Page-composition wiring: `packages/pipeline/src/stages/page-composition.ts`
  (search for `createCodexCliProvider`)
- Provider union: `packages/pipeline/src/agents/providers/index.ts`
  (`ProviderName` type)
- Plan: `docs/superpowers/plans/2026-04-29-codex-cli-provider-dev-mode.md`
