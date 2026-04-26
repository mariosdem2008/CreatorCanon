import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIProvider, mapTurnToOpenAI } from '../openai';

describe('OpenAI provider message mapping', () => {
  it('maps system turn correctly', () => {
    const out = mapTurnToOpenAI({ role: 'system', content: 'You are helpful.' });
    assert.deepEqual(out, { role: 'system', content: 'You are helpful.' });
  });

  it('maps user turn correctly', () => {
    const out = mapTurnToOpenAI({ role: 'user', content: 'Hi' });
    assert.deepEqual(out, { role: 'user', content: 'Hi' });
  });

  it('maps assistant turn with no tool calls', () => {
    const out = mapTurnToOpenAI({ role: 'assistant', content: 'Hello' });
    assert.deepEqual(out, { role: 'assistant', content: 'Hello' });
  });

  it('maps assistant turn with tool calls', () => {
    const out = mapTurnToOpenAI({
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'call_1', name: 'listVideos', arguments: { foo: 'bar' } }],
    }) as { role: 'assistant'; tool_calls: any[] };
    assert.equal(out.role, 'assistant');
    assert.equal(out.tool_calls.length, 1);
    assert.equal(out.tool_calls[0].id, 'call_1');
    assert.equal(out.tool_calls[0].function.name, 'listVideos');
    assert.equal(out.tool_calls[0].function.arguments, '{"foo":"bar"}');
  });

  it('maps tool turn correctly', () => {
    const out = mapTurnToOpenAI({
      role: 'tool',
      content: '{"result": 42}',
      toolCallId: 'call_1',
    }) as { role: 'tool'; tool_call_id: string };
    assert.equal(out.role, 'tool');
    assert.equal(out.tool_call_id, 'call_1');
    assert.equal(out.content, '{"result": 42}');
  });

  it('throws if role=tool is missing toolCallId', () => {
    assert.throws(() => mapTurnToOpenAI({ role: 'tool', content: '{}' }));
  });
});

describe('createOpenAIProvider', () => {
  it('throws on empty apiKey', () => {
    assert.throws(() => createOpenAIProvider(''));
  });
});
