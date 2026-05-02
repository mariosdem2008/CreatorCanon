import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { createCodexCliProvider } from '../codex-cli';

describe('Codex CLI provider', () => {
  it('maps Codex JSON output into an agent chat response', async () => {
    const provider = createCodexCliProvider({
      runCodexExec: async (input) => {
        assert.equal(input.model, 'gpt-5.5');
        assert.match(input.prompt, /listVideos/);
        return {
          content: JSON.stringify({
            content: '',
            toolCalls: [
              {
                id: 'call_1',
                name: 'listVideos',
                arguments: { limit: 3 },
              },
            ],
          }),
        };
      },
    });

    const response = await provider.chat({
      modelId: 'gpt-5.5',
      messages: [{ role: 'user', content: 'List videos.' }],
      tools: [
        {
          name: 'listVideos',
          description: 'List source videos.',
          input: z.object({ limit: z.number().int().positive().optional() }),
          output: z.array(z.unknown()),
          handler: async () => [],
        },
      ],
    });

    assert.equal(provider.name, 'openai');
    assert.equal(response.toolCalls.length, 1);
    assert.deepEqual(response.toolCalls[0], {
      id: 'call_1',
      name: 'listVideos',
      arguments: { limit: 3 },
    });
    assert.equal(response.usage.inputTokens, 0);
    assert.match(response.rawId, /^codex-cli-/);
  });

  it('rejects non-json Codex output with a clear error', async () => {
    const provider = createCodexCliProvider({
      runCodexExec: async () => ({ content: 'not json' }),
    });

    await assert.rejects(
      provider.chat({
        modelId: 'gpt-5.5',
        messages: [{ role: 'user', content: 'Finish.' }],
        tools: [],
      }),
      /Codex CLI provider expected JSON/,
    );
  });
});
