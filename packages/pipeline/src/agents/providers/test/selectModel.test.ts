import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectModel } from '../selectModel';

describe('selectModel', () => {
  it('uses env override when set', () => {
    const out = selectModel('topic_spotter', { PIPELINE_MODEL_TOPIC_SPOTTER: 'gpt-5.5' });
    assert.equal(out.modelId, 'gpt-5.5');
    assert.equal(out.provider, 'openai');
  });

  it('falls back to default model when env unset', () => {
    const out = selectModel('topic_spotter', {});
    assert.equal(out.modelId, 'gemini-2.5-flash');
    assert.equal(out.provider, 'gemini');
  });

  it('returns ordered fallback chain for framework_extractor', () => {
    const out = selectModel('framework_extractor', {});
    assert.deepEqual(out.fallbackChain.map((f) => f.modelId), ['gpt-5.4', 'gemini-2.5-pro']);
  });

  it('throws on unknown agent', () => {
    assert.throws(() => selectModel('not_an_agent' as any, {}));
  });
});
