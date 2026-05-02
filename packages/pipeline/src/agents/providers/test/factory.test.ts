import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createOpenAICompatibleProvider, resolveOpenAIProviderMode } from '../factory';

describe('OpenAI-compatible provider factory', () => {
  it('defaults to API-key OpenAI mode', () => {
    assert.equal(resolveOpenAIProviderMode({}), 'openai_api');
  });

  it('allows dev-only Codex CLI mode without an OpenAI API key', () => {
    const provider = createOpenAICompatibleProvider({
      NODE_ENV: 'development',
      PIPELINE_OPENAI_PROVIDER: 'codex_cli',
    });

    assert.equal(provider.name, 'openai');
  });

  it('rejects Codex CLI mode in production', () => {
    assert.throws(
      () =>
        createOpenAICompatibleProvider({
          NODE_ENV: 'production',
          PIPELINE_OPENAI_PROVIDER: 'codex_cli',
        }),
      /disabled in production/,
    );
  });
});
