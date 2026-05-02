import type { AgentProvider } from './index';
import { createCodexCliProvider } from './codex-cli';
import { createOpenAIProvider } from './openai';

export type OpenAICompatibleProviderMode = 'openai_api' | 'codex_cli';

export function resolveOpenAIProviderMode(
  env: Record<string, string | undefined>,
): OpenAICompatibleProviderMode {
  const raw = env.PIPELINE_OPENAI_PROVIDER;
  if (!raw || raw === 'openai_api') return 'openai_api';
  if (raw === 'codex_cli') return 'codex_cli';
  throw new Error(`Invalid PIPELINE_OPENAI_PROVIDER: ${raw}. Supported: openai_api | codex_cli.`);
}

export function createOpenAICompatibleProvider(
  env: Record<string, string | undefined>,
): AgentProvider {
  const mode = resolveOpenAIProviderMode(env);

  if (mode === 'codex_cli') {
    if (env.NODE_ENV === 'production') {
      throw new Error('PIPELINE_OPENAI_PROVIDER=codex_cli is disabled in production.');
    }
    return createCodexCliProvider({
      bin: env.CODEX_CLI_BIN,
      model: env.CODEX_CLI_MODEL,
      timeoutMs: parsePositiveInt(env.CODEX_CLI_TIMEOUT_MS),
    });
  }

  return createOpenAIProvider(env.OPENAI_API_KEY ?? '');
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('CODEX_CLI_TIMEOUT_MS must be a positive integer.');
  }
  return parsed;
}
