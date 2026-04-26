import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProvider, mapTurnsToGemini } from '../gemini';
import type { ChatTurn } from '../index';

describe('Gemini provider message mapping', () => {
  it('extracts system prompts into systemInstruction', () => {
    const turns: ChatTurn[] = [
      { role: 'system', content: 'You are an agent.' },
      { role: 'user', content: 'Hi' },
    ];
    const { systemInstruction, contents } = mapTurnsToGemini(turns);
    assert.equal(systemInstruction, 'You are an agent.');
    assert.equal(contents.length, 1);
    assert.equal(contents[0]?.role, 'user');
  });

  it('joins multiple system prompts with double newlines', () => {
    const turns: ChatTurn[] = [
      { role: 'system', content: 'You are X.' },
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Hi' },
    ];
    const { systemInstruction } = mapTurnsToGemini(turns);
    assert.equal(systemInstruction, 'You are X.\n\nBe terse.');
  });

  it('maps user turn to role=user with text part', () => {
    const { contents } = mapTurnsToGemini([{ role: 'user', content: 'Hello' }]);
    assert.equal(contents.length, 1);
    assert.equal(contents[0]?.role, 'user');
    assert.deepEqual(contents[0]?.parts, [{ text: 'Hello' }]);
  });

  it('maps plain assistant turn to role=model with text part', () => {
    const { contents } = mapTurnsToGemini([{ role: 'assistant', content: 'Reply' }]);
    assert.equal(contents[0]?.role, 'model');
    assert.deepEqual(contents[0]?.parts, [{ text: 'Reply' }]);
  });

  it('maps assistant tool calls to role=model with functionCall parts', () => {
    const { contents } = mapTurnsToGemini([{
      role: 'assistant',
      content: '',
      toolCalls: [{ id: 'gemini_call_1', name: 'listVideos', arguments: { topK: 5 } }],
    }]);
    assert.equal(contents[0]?.role, 'model');
    const part = contents[0]?.parts[0] as any;
    assert.equal(part.functionCall.name, 'listVideos');
    assert.deepEqual(part.functionCall.args, { topK: 5 });
  });

  it('maps tool turn to role=function with functionResponse', () => {
    const { contents } = mapTurnsToGemini([{
      role: 'tool',
      content: '{"ok": true}',
      toolCallId: 'gemini_call_1',
      name: 'listVideos',
    }]);
    assert.equal(contents[0]?.role, 'function');
    const part = contents[0]?.parts[0] as any;
    assert.equal(part.functionResponse.name, 'listVideos');
    assert.deepEqual(part.functionResponse.response, { content: '{"ok": true}' });
  });

  it('createGeminiProvider throws on empty apiKey', () => {
    assert.throws(() => createGeminiProvider(''));
  });
});
