// apps/web/src/lib/hub/chat/mockAnswers.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { lookupMockAnswer, MOCK_ANSWER_QUESTIONS } from './mockAnswers';
import { askResponseSchema } from './schema';

test('mock answers: every documented question returns a successful answer', () => {
  for (const q of MOCK_ANSWER_QUESTIONS) {
    const result = lookupMockAnswer(q);
    assert.ok(result, `no mock answer for: ${q}`);
    const parsed = askResponseSchema.safeParse(result);
    assert.equal(parsed.success, true, `mock for ${q} fails schema`);
    if ('answer' in result && result.answer) {
      assert.ok(result.answer.bullets.length >= 3, 'answers should have ≥3 bullets');
      for (const b of result.answer.bullets) {
        assert.ok(b.citationIds.length > 0, `bullet without citation: ${b.text}`);
      }
    }
  }
});

test('mock answers: unknown question returns unsupported response', () => {
  const result = lookupMockAnswer('What is the meaning of life?');
  assert.ok(result);
  assert.equal(askResponseSchema.safeParse(result).success, true);
  assert.equal('unsupported' in result && result.unsupported, true);
});

test('mock answers: case-insensitive trimmed match', () => {
  const result = lookupMockAnswer('  HOW does Ali Plan his Week?  ');
  assert.ok(result && 'answer' in result && result.answer);
});
