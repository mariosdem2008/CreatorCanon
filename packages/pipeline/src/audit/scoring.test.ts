import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateAuditScores, countRepeatedTitleTerms } from './scoring';

test('calculateAuditScores returns bounded integer scores', () => {
  const scores = calculateAuditScores({
    videoCount: 48,
    transcriptCount: 8,
    transcriptWordCount: 64_000,
    averageDurationSeconds: 1400,
    repeatedTitleTerms: 7,
    channelDescriptionLength: 300,
    medianViews: 2500,
  });

  for (const score of Object.values(scores)) {
    assert.equal(Number.isInteger(score), true);
    assert.ok(score >= 0 && score <= 100);
  }
  assert.ok(scores.overall >= 60);
});

test('countRepeatedTitleTerms counts terms recurring across at least three videos', () => {
  assert.equal(
    countRepeatedTitleTerms([
      { id: '1', title: 'Pricing systems for consultants', description: '' },
      { id: '2', title: 'Pricing mistakes founders make', description: '' },
      { id: '3', title: 'Pricing offers that compound', description: '' },
      { id: '4', title: 'Hiring operators well', description: '' },
    ]),
    1,
  );
});
