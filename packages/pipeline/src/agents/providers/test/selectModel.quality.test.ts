import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { selectModel } from '../selectModel';

describe('selectModel — PIPELINE_QUALITY_MODE', () => {
  it('lean: every text agent → gemini-2.5-flash', () => {
    const env = { PIPELINE_QUALITY_MODE: 'lean' };
    assert.equal(selectModel('channel_profiler', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('video_analyst', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('canon_architect', env).modelId, 'gemini-2.5-pro');  // canon keeps Pro even in lean
    assert.equal(selectModel('page_brief_planner', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('page_writer', env).modelId, 'gemini-2.5-flash');
  });

  it('lean: visual_frame_analyst stays gemini-2.5-flash', () => {
    const r = selectModel('visual_frame_analyst', { PIPELINE_QUALITY_MODE: 'lean' });
    assert.equal(r.modelId, 'gemini-2.5-flash');
  });

  it('production_economy: optimal cost-quality split', () => {
    const env = { PIPELINE_QUALITY_MODE: 'production_economy' };
    assert.equal(selectModel('channel_profiler', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('video_analyst', env).modelId, 'gemini-2.5-pro');
    assert.equal(selectModel('canon_architect', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('page_brief_planner', env).modelId, 'gemini-2.5-flash');
    assert.equal(selectModel('page_writer', env).modelId, 'gemini-2.5-flash');
  });

  it('premium: every text agent → gpt-5.5', () => {
    const env = { PIPELINE_QUALITY_MODE: 'premium' };
    assert.equal(selectModel('channel_profiler', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('video_analyst', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('canon_architect', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('page_brief_planner', env).modelId, 'gpt-5.5');
    assert.equal(selectModel('page_writer', env).modelId, 'gpt-5.5');
  });

  it('PIPELINE_MODEL_<AGENT> env override beats quality mode', () => {
    const r = selectModel('video_analyst', {
      PIPELINE_QUALITY_MODE: 'lean',
      PIPELINE_MODEL_VIDEO_ANALYST: 'gpt-5.5',
    });
    assert.equal(r.modelId, 'gpt-5.5');
  });

  it('quality mode beats PIPELINE_MODEL_MODE (more specific wins)', () => {
    const r = selectModel('video_analyst', {
      PIPELINE_QUALITY_MODE: 'production_economy',
      PIPELINE_MODEL_MODE: 'openai_only',
    });
    assert.equal(r.modelId, 'gemini-2.5-pro');
  });

  it('no quality mode set: falls through to PIPELINE_MODEL_MODE behavior', () => {
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'gemini_only' });
    // Gemini-only routes to fallback chain's first Gemini model
    assert.equal(r.provider, 'gemini');
  });

  it('invalid quality mode throws', () => {
    assert.throws(
      () => selectModel('video_analyst', { PIPELINE_QUALITY_MODE: 'turbo' }),
      /Invalid PIPELINE_QUALITY_MODE/,
    );
  });

  it('Phase-1 agents fall through quality preset to REGISTRY default', () => {
    // framework_extractor is NOT in QUALITY_PRESETS — should ignore the
    // preset entirely and use its REGISTRY default (gpt-5.5).
    const r = selectModel('framework_extractor', { PIPELINE_QUALITY_MODE: 'lean' });
    assert.equal(r.modelId, 'gpt-5.5');
    assert.equal(r.provider, 'openai');
  });

  it('priority: PIPELINE_MODEL_<AGENT> beats PIPELINE_MODEL_MODE', () => {
    // env override should win even without a quality mode in the picture.
    const r = selectModel('video_analyst', {
      PIPELINE_MODEL_VIDEO_ANALYST: 'gemini-2.5-flash',
      PIPELINE_MODEL_MODE: 'openai_only',
    });
    assert.equal(r.modelId, 'gemini-2.5-flash');
    assert.equal(r.provider, 'gemini');
  });

  it('priority: PIPELINE_MODEL_<AGENT> beats REGISTRY default', () => {
    const r = selectModel('video_analyst', {
      PIPELINE_MODEL_VIDEO_ANALYST: 'gemini-2.5-pro',
    });
    assert.equal(r.modelId, 'gemini-2.5-pro');
  });

  it('priority: PIPELINE_QUALITY_MODE beats REGISTRY default', () => {
    // No PIPELINE_MODEL_MODE set — quality preset should still apply.
    const r = selectModel('video_analyst', { PIPELINE_QUALITY_MODE: 'lean' });
    assert.equal(r.modelId, 'gemini-2.5-flash');
  });

  it('priority: PIPELINE_MODEL_MODE beats REGISTRY default', () => {
    // gemini_only routes video_analyst to its first Gemini fallback (gemini-2.5-pro).
    const r = selectModel('video_analyst', { PIPELINE_MODEL_MODE: 'gemini_only' });
    assert.equal(r.modelId, 'gemini-2.5-pro');
  });
});
