import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHeroCritiquePrompt,
  buildHeroRewriteFromCritiquePrompt,
  scoreHeroLine,
} from './hero-rewrite';

const ctx = {
  creatorName: 'Alex Hormozi',
  niche: 'operator education',
  audience: 'agency owners',
  recurringPromise: 'turn attention into cash flow',
  preserveTerms: ['Grand Slam Offer'],
  voiceFingerprint: { profanityAllowed: true, tonePreset: 'blunt tactical' },
};

describe('scoreHeroLine', () => {
  test('penalizes stutter-like lines', () => {
    const score = scoreHeroLine("AI lead generation is, it's a service business");
    assert.ok(score.score < 7);
  });
});

describe('buildHeroCritiquePrompt', () => {
  test('asks for a line-by-line critique of all five hero candidates', () => {
    const prompt = buildHeroCritiquePrompt(
      ['Pain line', 'Aspiration line', 'Contrarian line', 'Number line', 'Curiosity line'],
      ctx,
    );
    assert.ok(prompt.includes('critique'));
    assert.ok(prompt.includes('tweet-worthy'));
    assert.ok(prompt.includes('Pain line'));
    assert.ok(prompt.includes('Curiosity line'));
    assert.ok(prompt.includes('EXACTLY 5'));
  });
});

describe('buildHeroRewriteFromCritiquePrompt', () => {
  test('uses the critique to request exactly five refined hero lines', () => {
    const prompt = buildHeroRewriteFromCritiquePrompt(
      ['Pain line', 'Aspiration line', 'Contrarian line', 'Number line', 'Curiosity line'],
      ['too generic', 'not specific', 'good', 'needs sharper number', 'unclear'],
      ctx,
    );
    assert.ok(prompt.includes('too generic'));
    assert.ok(prompt.includes('needs sharper number'));
    assert.ok(prompt.includes('"rewritten"'));
    assert.ok(prompt.includes('EXACTLY 5'));
  });
});
