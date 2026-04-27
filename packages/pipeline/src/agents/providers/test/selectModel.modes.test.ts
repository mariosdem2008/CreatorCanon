import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectModel } from '../selectModel';

describe('selectModel — PIPELINE_MODEL_MODE', () => {
  it('hybrid (default): video_analyst → openai gpt-5.5', () => {
    const r = selectModel('video_analyst', {});
    assert.equal(r.provider, 'openai');
    assert.equal(r.modelId, 'gpt-5.5');
  });

  it('hybrid: visual_frame_analyst → gemini', () => {
    const r = selectModel('visual_frame_analyst', {});
    assert.equal(r.provider, 'gemini');
  });

  it('gemini_only: video_analyst → gemini fallback', () => {
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'gemini_only' });
    assert.equal(r.provider, 'gemini');
  });

  it('gemini_only: visual_frame_analyst stays gemini (unaffected)', () => {
    const r = selectModel('visual_frame_analyst', { PIPELINE_MODEL_MODE: 'gemini_only' });
    assert.equal(r.provider, 'gemini');
  });

  it('openai_only: visual_frame_analyst still gemini (vision exception)', () => {
    const r = selectModel('visual_frame_analyst', { PIPELINE_MODEL_MODE: 'openai_only' });
    assert.equal(r.provider, 'gemini');
  });

  it('openai_only: video_analyst → openai', () => {
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'openai_only' });
    assert.equal(r.provider, 'openai');
  });

  it('per-agent env override beats mode', () => {
    const r = selectModel('video_analyst', {
      PIPELINE_MODEL_MODE: 'gemini_only',
      PIPELINE_MODEL_VIDEO_ANALYST: 'gpt-5.5',
    });
    assert.equal(r.provider, 'openai');
    assert.equal(r.modelId, 'gpt-5.5');
  });

  it('unsupported mode throws', () => {
    assert.throws(
      () => selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'bogus' }),
      /Invalid PIPELINE_MODEL_MODE/,
    );
  });
});
