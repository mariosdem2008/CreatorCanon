import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildVoiceDriftRetryGuidance,
  cosineSimilarity,
  sampleTranscriptForVoice,
  scoreVoiceFingerprint,
} from './voice-fingerprint-score';

describe('cosineSimilarity', () => {
  test('returns 1 for identical vectors and 0 for orthogonal vectors', () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  test('throws for mismatched vector dimensions', () => {
    assert.throws(() => cosineSimilarity([1, 2], [1]));
  });
});

describe('sampleTranscriptForVoice', () => {
  test('samples early, middle, and late transcript material inside a character budget', () => {
    const sample = sampleTranscriptForVoice(
      [
        { text: 'early cadence and phrasing' },
        { text: 'middle proof and examples' },
        { text: 'late closing rhythm and vocabulary' },
      ],
      { maxChars: 80 },
    );

    assert.match(sample, /early cadence/);
    assert.match(sample, /middle proof/);
    assert.match(sample, /late closing/);
    assert.ok(sample.length <= 80);
  });
});

describe('scoreVoiceFingerprint', () => {
  test('flags voice drift when similarity is below threshold', async () => {
    const score = await scoreVoiceFingerprint({
      renderedBody: 'generic polished essay voice',
      sourceTranscript: 'blunt operator language',
      creatorName: 'Alex Hormozi',
      preserveTerms: ['Grand Slam Offer'],
      threshold: 0.6,
      embedder: {
        embed: async () => [[1, 0], [0, 1]],
      },
    });

    assert.equal(score.status, 'voice_drift');
    assert.equal(score.shouldRetry, true);
    assert.equal(score.similarity, 0);
    assert.match(score.retryGuidance, /Alex Hormozi/);
    assert.match(score.retryGuidance, /Grand Slam Offer/);
  });

  test('passes when body and transcript are similar enough', async () => {
    const score = await scoreVoiceFingerprint({
      renderedBody: 'same voice',
      sourceTranscript: 'same voice sample',
      threshold: 0.6,
      embedder: {
        embed: async () => [[1, 0], [0.8, 0.1]],
      },
    });

    assert.equal(score.status, 'ok');
    assert.equal(score.shouldRetry, false);
    assert.ok(score.similarity > 0.6);
  });
});

describe('buildVoiceDriftRetryGuidance', () => {
  test('returns stricter style guidance for a retry prompt', () => {
    const guidance = buildVoiceDriftRetryGuidance({
      creatorName: 'Derek Sivers',
      preserveTerms: ['hell yeah or no'],
      similarity: 0.42,
      threshold: 0.6,
    });

    assert.match(guidance, /voice fingerprint drift/i);
    assert.match(guidance, /Derek Sivers/);
    assert.match(guidance, /hell yeah or no/);
    assert.match(guidance, /0\.42/);
  });
});
