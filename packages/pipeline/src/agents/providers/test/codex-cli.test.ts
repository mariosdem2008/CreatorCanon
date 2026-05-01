import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createCodexCliProvider, flattenMessagesForCodex } from '../codex-cli';
import type { ChatTurn } from '..';
import type { ToolDef } from '../../tools/types';

describe('flattenMessagesForCodex', () => {
  it('puts the system message first, then user', () => {
    const turns: ChatTurn[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];
    const out = flattenMessagesForCodex(turns);
    assert.match(out, /You are a helpful assistant\./);
    assert.match(out, /Hello!/);
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
    assert.match(out, /# SYSTEM/);
    assert.match(out, /# USER/);
    assert.match(out, /# ASSISTANT/);
  });

  it('appends a strict JSON-only instruction at the end', () => {
    const turns: ChatTurn[] = [
      { role: 'system', content: 'Sys.' },
      { role: 'user', content: 'U.' },
    ];
    const out = flattenMessagesForCodex(turns);
    assert.match(out, /JSON.*only/i);
    // Instruction should be at the end, not in the middle
    assert.ok(out.lastIndexOf('JSON') > out.indexOf('Sys.'));
  });

  it('handles empty messages array', () => {
    const out = flattenMessagesForCodex([]);
    // Should still include the JSON-only instruction
    assert.match(out, /JSON.*only/i);
  });
});

describe('createCodexCliProvider', () => {
  it('exposes name = "codex-cli"', () => {
    const provider = createCodexCliProvider();
    assert.equal(provider.name, 'codex-cli');
  });

  it('rejects calls with tools.length > 0', async () => {
    const provider = createCodexCliProvider();
    const fakeTool: ToolDef<unknown, unknown> = {
      name: 'fakeTool',
      description: 'd',
      input: { parse: () => ({}) } as never,
      output: { parse: () => ({}) } as never,
      handler: async () => ({ ok: true } as never),
    };
    await assert.rejects(
      () => provider.chat({
        modelId: 'codex',
        messages: [{ role: 'system', content: 'Sys.' }, { role: 'user', content: 'U.' }],
        tools: [fakeTool],
      }),
      /tool/i,
    );
  });

  it('rejects calls with empty messages', async () => {
    const provider = createCodexCliProvider();
    await assert.rejects(
      () => provider.chat({
        modelId: 'codex',
        messages: [],
        tools: [],
      }),
      /messages/i,
    );
  });
});
